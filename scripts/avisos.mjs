// A Nossa Casa — avisos do dia por notificação no telemóvel (corre no GitHub Actions, sem depender do PC)
// Segredos necessários (GitHub → Settings → Secrets and variables → Actions):
//   CASA_EMAIL, CASA_SENHA  → conta-robô da app (a mesma do n8n "Casa robô")
//   VAPID_PRIVADA          → chave privada criada em "Gerir dados → Configurar notificações"
import crypto from "node:crypto";

const SB = "https://uthotfdcfwrdyivhwkpw.supabase.co";
const KEY = "sb_publishable_1NO-glUWpi7oEzQUS2xX0A_7TS9qNpu";
const TZ = "Europe/Lisbon";
const MSG = (process.env.MSG_CORPO || "").trim() ? { titulo: (process.env.MSG_TITULO || "🏠 A Nossa Casa").trim(), corpo: process.env.MSG_CORPO.replace(/\\n/g, "\n").trim(), para: (process.env.MSG_PARA || "todos").trim().toLowerCase() } : null;
const TESTE = !MSG && process.env.TESTE === "sim";
const FORCAR = process.env.FORCAR === "sim";

// Só corre às 8h de Lisboa (o cron dispara às 7h e às 8h UTC por causa da hora de verão)
const horaLx = +new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date());
if (!TESTE && !FORCAR && horaLx !== 8) { console.log("Não são 8h em Lisboa (" + horaLx + "h) — nada a fazer."); process.exit(0); }

const precisa = (n) => { if (!process.env[n]) { console.error("Falta o segredo " + n); process.exit(1); } return process.env[n]; };
const email = precisa("CASA_EMAIL"), senha = precisa("CASA_SENHA"), jwk = JSON.parse(precisa("VAPID_PRIVADA"));

const pedir = async (url, opts = {}) => {
  const r = await fetch(url, opts);
  const t = await r.text();
  if (!r.ok) throw new Error(url + " → " + r.status + " " + t.slice(0, 300));
  return t ? JSON.parse(t) : null;
};
const login = await pedir(SB + "/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: senha }) });
const H = { apikey: KEY, Authorization: "Bearer " + login.access_token };

// ---------- datas ----------
const hojeIso = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const dia = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const diff = (s) => Math.round((dia(s) - dia(hojeIso)) / 86400000);
const fmt = (s) => s.slice(8, 10) + "/" + s.slice(5, 7);
const rel = (n) => (n === 0 ? "hoje" : n === 1 ? "amanhã" : n === -1 ? "ontem" : n > 0 ? "daqui a " + n + " dias" : "há " + -n + " dias");
const eur = (v) => (Math.round((+v || 0) * 100) / 100).toFixed(2).replace(".", ",") + " €";
const proxAnual = (s) => { const a = +hojeIso.slice(0, 4); let x = a + s.slice(4); if (diff(x) < 0) x = a + 1 + s.slice(4); return x; };

// ---------- dados ----------
const itens = await pedir(SB + "/rest/v1/itens?select=id,modulo,dados", { headers: H });
const docs = await pedir(SB + "/rest/v1/documentos?select=id,dados&id=in.(orcamento,push-config,horario-ema)", { headers: H });
const por = {}; itens.forEach((i) => (por[i.modulo] = por[i.modulo] || []).push(i.dados || {}));
const L = (m) => por[m] || [];

// ---------- avisos (mesmas regras dos avisos das 8h12) ----------
const avisos = [];
let EMA = false; // marca os avisos que também vão para o telemóvel da Ema
const add = (n, ico, txt) => avisos.push({ n, txt: ico + " " + txt, ema: EMA });
const prazo = (s, janela, ico, txt) => { if (!s) return; const n = diff(s); if (n <= janela) add(n, n < 0 ? "🔴" : ico, txt + ": " + fmt(s) + " (" + rel(n) + ")"); };
L("veiculos").forEach((v) => {
  prazo(v.inspecao, 30, "🚗", (v.nome || "Carro") + " — inspeção"); prazo(v.seguro, 30, "🚗", (v.nome || "Carro") + " — seguro");
  prazo(v.iuc, 30, "🚗", (v.nome || "Carro") + " — IUC"); prazo(v.revisao, 30, "🔧", (v.nome || "Carro") + " — revisão");
  if (v.km && v.revisao_km && v.revisao_km - v.km <= 1000) add(0, "🔧", (v.nome || "Carro") + " — revisão daqui a " + Math.max(0, v.revisao_km - v.km) + " km");
});
L("tarefas").forEach((t) => prazo(t.proxima, 7, "🏠", t.desc));
L("garantias").forEach((g) => { if (g.fim && diff(g.fim) >= 0) prazo(g.fim, 30, "🧾", "Garantia de " + g.aparelho + " acaba"); });
L("documentos").forEach((x) => prazo(x.validade, 60, "🪪", (x.doc || "Documento") + " de " + (x.pessoa || "") + " — renovar"));
EMA = true;
L("aniversarios").forEach((x) => { if (!x.nascimento) return; const s = proxAnual(x.nascimento), n = diff(s); if (n >= 0 && n <= 7) add(n, "🎂", (n === 0 ? "Hoje é o aniversário de " + x.nome : "Aniversário de " + x.nome + " " + rel(n)) + " — faz " + (+s.slice(0, 4) - +x.nascimento.slice(0, 4)) + " anos"); });
L("escola_testes").forEach((t) => { if (!t.data || t.nota) return; const n = diff(t.data); if (n >= 0 && n <= 3) add(n, "📝", "Ema — " + (t.tipo || "Teste") + " de " + t.disciplina + " " + rel(n)); });
L("escola_eventos").forEach((e) => { if (!e.data) return; const n = diff(e.data); if (n >= 0 && n <= 3) add(n, "🏫", "Escola — " + e.desc + " " + rel(n) + (e.hora ? " às " + e.hora : "")); });
// Calendário escolar (Agrupamento de Escolas Templários, 2026/27)
[["1.ª interrupção", "2026-10-26", "2026-10-30"], ["Natal", "2026-12-23", "2026-12-31"], ["3.ª interrupção", "2027-02-01", "2027-02-05"], ["Carnaval", "2027-02-08", "2027-02-10"], ["Feriado municipal de Tomar", "2027-03-01", "2027-03-01"], ["Páscoa", "2027-03-25", "2027-04-02"], ["Último dia de aulas", "2027-06-11", "2027-06-11"]]
  .forEach(([nome, a, b]) => { const n = diff(a); if (n >= 0 && n <= 3) add(n, "🎒", "Ema — " + nome + (a !== b ? " (" + fmt(a) + " a " + fmt(b) + ")" : "") + " " + rel(n)); });
// Atividades de hoje (Instituto, Trampolins) a partir do horário
{ const hor = ((docs.find((d) => d.id === "horario-ema") || {}).dados || {}); const wd = new Date(hojeIso + "T12:00:00Z").getUTCDay();
  if (hor.grelha && wd >= 1 && wd <= 5) (hor.grelha[wd - 1] || []).flat().filter((c) => c && (c.c === "INST" || c.c === "TRAMP")).forEach((c) => add(0, c.c === "TRAMP" ? "🤸" : "📚", "Hoje: " + c.t + " às " + c.s)); }
EMA = false;
L("datas").forEach((x) => { if (!x.data) return; const s = x.anual ? proxAnual(x.data) : x.data; const n = diff(s); if (n >= 0 && n <= 7) add(n, x.desc && /anivers/i.test(x.desc) ? "🎂" : "📅", x.desc + ": " + fmt(s) + " (" + rel(n) + ")"); });
L("ferias").forEach((x) => { if (!x.inicio) return; const n = diff(x.inicio); if (n >= 0 && n <= 7) add(n, "🌴", x.quem + " — " + (x.tipo || "Férias") + ": começam " + rel(n)); });
L("consultas").forEach((c) => { if (!c.data) return; const n = diff(c.data); if (n >= 0 && n <= 3) add(n, "🩺", (c.pessoa || "") + " — " + (c.esp || "consulta") + " " + rel(n) + (c.hora ? " às " + c.hora : "")); });
L("viagens").forEach((v) => { if (!v.ida || v.estado === "Feita") return; const n = diff(v.ida); if (n >= 0 && n <= 7) add(n, "✈️", "Viagem a " + v.destino + ": partida " + rel(n)); });
const orc = ((docs.find((d) => d.id === "orcamento") || {}).dados || {});
const mes = hojeIso.slice(0, 7), gasto = {};
L("despesas").filter((x) => String(x.data || "").startsWith(mes)).forEach((x) => { const c = x.cat || "Outros"; gasto[c] = (gasto[c] || 0) + (+x.valor || 0); });
Object.entries(orc.cat || {}).forEach(([c, lim]) => { const g = gasto[c] || 0; if (lim > 0 && g >= lim * 0.9) add(1, g > lim ? "💸" : "💶", "Orçamento de " + c + ": " + eur(g) + " de " + eur(lim)); });
avisos.sort((a, b) => a.n - b.n);

// ---------- notificação ----------
// Cada aparelho recebe a sua mensagem: a Ema só recebe o que é dela (escola, atividades, aniversários)
const mensagem = (quem) => {
  // mensagem personalizada (enviada à mão pelo GitHub Actions), só para a pessoa escolhida
  if (MSG) return MSG.para === "todos" || String(quem || "").trim().toLowerCase().startsWith(MSG.para) ? { titulo: MSG.titulo, corpo: MSG.corpo } : null;
  if (TESTE) return { titulo: "🔔 Teste da app", corpo: "As notificações de A Nossa Casa estão a funcionar (enviadas pelo GitHub)." };
  const lista = /^ema\b/i.test(String(quem || "").trim()) ? avisos.filter((a) => a.ema) : avisos;
  if (!lista.length) return null;
  return { titulo: "🏠 " + lista.length + (lista.length === 1 ? " aviso" : " avisos") + " para hoje",
    corpo: lista.slice(0, 6).map((a) => a.txt).join("\n") + (lista.length > 6 ? "\n+ " + (lista.length - 6) + " na app" : "") };
};
if (!MSG && !TESTE && !avisos.length) { console.log("Sem avisos hoje — não envio nada."); process.exit(0); }

// ---------- Web Push (RFC 8291 + VAPID), sem bibliotecas ----------
const b64u = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const ub64 = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");
const hmac = (k, d) => crypto.createHmac("sha256", k).update(d).digest();
const privada = crypto.createPrivateKey({ key: jwk, format: "jwk" });
const publica = b64u(Buffer.concat([Buffer.from([4]), ub64(jwk.x), ub64(jwk.y)]));
const cfg = ((docs.find((d) => d.id === "push-config") || {}).dados || {});
if (cfg.vapid && cfg.vapid !== publica) { console.error("A chave VAPID_PRIVADA não corresponde à chave pública da app. Volta a criá-la em Gerir dados."); process.exit(1); }
const jwt = (aud) => {
  const h = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const c = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:" + email.replace(/\+[^@]*/, "") }));
  return h + "." + c + "." + b64u(crypto.sign("sha256", Buffer.from(h + "." + c), { key: privada, dsaEncoding: "ieee-p1363" }));
};
const cifrar = (sub, texto) => {
  const uaPub = ub64(sub.keys.p256dh), auth = ub64(sub.keys.auth);
  const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
  const asPub = ecdh.getPublicKey();
  const ikm = hmac(hmac(auth, ecdh.computeSecret(uaPub)), Buffer.concat([Buffer.from("WebPush: info\0"), uaPub, asPub, Buffer.from([1])]));
  const salt = crypto.randomBytes(16), prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0"), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: nonce\0"), Buffer.from([1])])).subarray(0, 12);
  const c = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(texto, "utf8"), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, ct]);
};
const subs = itens.filter((i) => i.modulo === "push" && i.dados && i.dados.endpoint);
if (!subs.length) { console.log("Nenhum telemóvel com notificações ativadas."); process.exit(0); }
for (const s of subs) {
  const d = s.dados, aud = new URL(d.endpoint).origin;
  const m = mensagem(d.quem);
  if (!m) { console.log((d.quem || "?") + " · " + d.aparelho + ": nada para esta pessoa hoje"); continue; }
  const idMsg = "m" + Date.now();
  const msg = JSON.stringify(MSG ? { tipo: "mensagem", id: idMsg, titulo: m.titulo, corpo: m.corpo, url: "./", tag: "mensagem-" + idMsg } : { titulo: m.titulo, corpo: m.corpo, url: "./", tag: "avisos-" + hojeIso });
  const r = await fetch(d.endpoint, { method: "POST", body: cifrar(d, msg), headers: { Authorization: "vapid t=" + jwt(aud) + ", k=" + publica, "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "normal" } });
  if (r.status === 404 || r.status === 410) { await fetch(SB + "/rest/v1/itens?id=eq." + s.id, { method: "DELETE", headers: H }); console.log((d.quem || "?") + " · " + d.aparelho + ": registo antigo apagado"); }
  else console.log((d.quem || "?") + " · " + d.aparelho + ": " + r.status + (r.ok ? "" : " " + (await r.text()).slice(0, 200)));
}
if (MSG) { console.log("Mensagem personalizada para: " + MSG.para); process.exit(0); }
console.log(avisos.map((a) => (a.ema ? "[Ema] " : "") + a.txt).join("\n"));
