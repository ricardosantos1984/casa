// A Nossa Casa — acrescentar artigos à lista de compras pela Siri (Atalho do iPhone)
// Corre na Vercel. Variáveis de ambiente (Vercel → Settings → Environment Variables):
//   ATALHO_TOKEN            → código secreto que o Atalho envia
//   CASA_EMAIL, CASA_SENHA  → conta-robô da app (a mesma do GitHub Actions / n8n)
//
// Pedido:  POST /api/compras   cabeçalho  Authorization: Bearer <ATALHO_TOKEN>
//          corpo JSON  { "artigos": "leite, ovos e pão", "quem": "Ricardo" }
// Resposta: texto simples para a Siri dizer, ex.: "Acrescentei leite, ovos e pão."

const SB = "https://uthotfdcfwrdyivhwkpw.supabase.co";
const KEY = "sb_publishable_1NO-glUWpi7oEzQUS2xX0A_7TS9qNpu";
const INGREDIENTES_URL = "https://ricardosantos1984.github.io/casa/ingredientes.js";

const normTxt = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.,!?;:«»"'’]/g, "").replace(/\s+/g, " ").trim();
const maiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// "leite, ovos e pão de forma" → ["Leite", "Ovos", "Pão de forma"]
function separar(texto) {
  return String(texto || "")
    .replace(/^(acrescenta|adiciona|põe|poe|junta)\s+/i, "")
    .replace(/\s+(à|a|na)\s+lista(\s+de\s+compras)?\s*$/i, "")
    .split(/\s*(?:,|;|\n|\s+e\s+)\s*/i)
    .map((s) => s.replace(/[.!?]+$/, "").trim())
    .filter(Boolean)
    .map(maiuscula);
}

const juntar = (l) => (l.length <= 1 ? l.join("") : l.slice(0, -1).join(", ") + " e " + l[l.length - 1]);

async function seccoes() {
  try {
    const code = await (await fetch(INGREDIENTES_URL)).text();
    const w = {};
    new Function("window", code)(w);
    return w.SECCAO_DE || [];
  } catch { return []; }
}

async function pedir(url, opts = {}) {
  const r = await fetch(url, opts);
  const t = await r.text();
  if (!r.ok) throw new Error(r.status + " " + t.slice(0, 200));
  return t ? JSON.parse(t) : null;
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  if (req.method !== "POST") return res.status(405).send("Usa POST.");

  const token = process.env.ATALHO_TOKEN;
  const auth = String(req.headers.authorization || "");
  if (!token || auth !== "Bearer " + token) return res.status(401).send("Código do atalho inválido.");
  if (!process.env.CASA_EMAIL || !process.env.CASA_SENHA) return res.status(500).send("Falta configurar a conta-robô na Vercel.");

  let corpo = req.body;
  if (typeof corpo === "string") { try { corpo = JSON.parse(corpo); } catch { corpo = { artigos: corpo }; } }
  const artigos = separar(corpo?.artigos ?? corpo?.texto);
  if (!artigos.length) return res.status(400).send("Não percebi o que acrescentar.");
  const quem = String(corpo?.quem || "Siri").slice(0, 40);

  try {
    const login = await pedir(SB + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { apikey: KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: process.env.CASA_EMAIL, password: process.env.CASA_SENHA }),
    });
    const H = { apikey: KEY, Authorization: "Bearer " + login.access_token, "Content-Type": "application/json" };

    const [lista, mapa] = await Promise.all([
      pedir(SB + "/rest/v1/itens?select=dados&modulo=eq.compras", { headers: H }),
      seccoes(),
    ]);
    const naLista = new Set(lista.filter((i) => !i.dados?.comprado).map((i) => normTxt(i.dados?.nome)));
    const secaoDe = (nome) => { const n = nome.toLowerCase(); const m = mapa.find(([k]) => n.includes(k)); return m ? m[1] : "Mercearia"; };

    const novos = [], ja = [];
    for (const a of artigos) {
      const k = normTxt(a);
      if (naLista.has(k)) { ja.push(a); continue; }
      naLista.add(k);
      novos.push({ modulo: "compras", dados: { nome: a, qtd: "", cat: secaoDe(a), comprado: false, pedido_por: quem } });
    }
    if (novos.length) await pedir(SB + "/rest/v1/itens", { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(novos) });

    const partes = [];
    if (novos.length) partes.push("Acrescentei " + juntar(novos.map((n) => n.dados.nome.toLowerCase())) + " à lista.");
    if (ja.length) partes.push(maiuscula(juntar(ja.map((s) => s.toLowerCase()))) + (ja.length > 1 ? " já estavam" : " já estava") + " na lista.");
    return res.status(200).send(partes.join(" "));
  } catch (e) {
    console.error(e);
    return res.status(502).send("Não consegui falar com a app da casa. Tenta outra vez.");
  }
}
