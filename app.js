"use strict";
/* =====================================================================
   A Nossa Casa — ementas, compras, despesas, veículos, casa, família,
   médicos. Dados no Supabase (com login) ou, sem configuração, no browser.
   ===================================================================== */

const C = window.CONFIG || {};
const PESSOAS = C.PESSOAS || ["Ricardo", "Carolina", "Ema"];
let EU = "";          // nome de quem entrou
let sb = null;        // cliente Supabase
let store = null;     // camada de dados
let PAPEL = "adulto"; // "adulto" ou "crianca" (ver acessos.sql)
let SECOES_OK = [];   // secções que uma criança pode ver
const CRIANCA = () => PAPEL === "crianca";

/* ---------- utilitários ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pad = (n) => String(n).padStart(2, "0");
const isoDe = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const deIso = (s) => { const p = String(s).split("-").map(Number); return new Date(p[0], p[1] - 1, p[2] || 1); };
const hoje = () => isoDe(new Date());
const somaDias = (iso, n) => { const d = deIso(iso); d.setDate(d.getDate() + n); return isoDe(d); };
const somaMeses = (iso, n) => { const d = deIso(iso); d.setMonth(d.getMonth() + n); return isoDe(d); };
const fmtData = (iso) => (iso ? String(iso).split("-").reverse().join("/") : "");
const dm = (iso) => { const p = iso.split("-"); return p[2] + "/" + p[1]; };
const diasAte = (iso) => Math.round((deIso(iso) - deIso(hoje())) / 86400000);
const euro = (n) => (Number(n) || 0).toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const rel = (n) => n === 0 ? "hoje" : n === 1 ? "amanhã" : n === -1 ? "ontem" : n > 0 ? `daqui a ${n} dias` : `há ${-n} dias`;
const semId = (o) => { const { id, ...r } = o; return r; };

function aviso(t) {
  const a = $("#aviso"); a.textContent = t; a.classList.add("ver");
  clearTimeout(aviso.t); aviso.t = setTimeout(() => a.classList.remove("ver"), 2200);
}
function erro(e) { console.error(e); aviso("Erro: " + (e && e.message ? e.message : e)); }

function alertaData(iso, label, janela = 30) {
  if (!iso) return null;
  const n = diasAte(iso);
  if (n > janela) return null;
  return { nivel: n < 0 ? "vermelho" : n <= 7 ? "laranja" : "amarelo", dias: n, texto: `${label}: ${fmtData(iso)} · ${rel(n)}` };
}
function proximaAnual(iso) {
  const p = iso.split("-"); const a = new Date().getFullYear();
  let d = `${a}-${p[1]}-${p[2]}`;
  if (diasAte(d) < 0) d = `${a + 1}-${p[1]}-${p[2]}`;
  return d;
}

/* =====================================================================
   DADOS
   ===================================================================== */
function storeLocal() {
  const K = "casa-demo";
  const ler = () => { try { return JSON.parse(localStorage.getItem(K)) || { itens: [], docs: {} }; } catch (e) { return { itens: [], docs: {} }; } };
  const gravar = (d) => { try { localStorage.setItem(K, JSON.stringify(d)); } catch (e) {} };
  const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random());
  return {
    modo: "demo",
    async list(m) { return ler().itens.filter((i) => i.modulo === m).map((i) => ({ ...i.dados, id: i.id })); },
    async add(m, d) { const x = ler(); const id = novoId(); x.itens.push({ id, modulo: m, dados: d }); gravar(x); return id; },
    async update(id, d) { const x = ler(); const i = x.itens.find((y) => y.id === id); if (i) i.dados = d; gravar(x); },
    async remove(id) { const x = ler(); x.itens = x.itens.filter((y) => y.id !== id); gravar(x); },
    async getDoc(id) { return ler().docs[id] || null; },
    async setDoc(id, d) { const x = ler(); x.docs[id] = d; gravar(x); },
    async upload(caminho, file) {
      if (file.size > 3 * 1024 * 1024) throw new Error("No modo demonstração só cabem ficheiros até 3 MB");
      const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
      const x = ler(); x.ficheiros = x.ficheiros || {}; x.ficheiros[caminho] = url; gravar(x);
    },
    async listDocs() { return Object.entries(ler().docs || {}).map(([id, dados]) => ({ id, dados })); },
    async removeDoc(id) { const x = ler(); delete x.docs[id]; gravar(x); },
    async upsertItem(id, modulo, d) { const x = ler(); const i = x.itens.find((y) => y.id === id); if (i) { i.dados = d; i.modulo = modulo; } else x.itens.push({ id, modulo, dados: d }); gravar(x); },
    async urls(caminhos) { const x = ler().ficheiros || {}; return Object.fromEntries(caminhos.map((c) => [c, x[c] || ""])); },
    async apagarFicheiros(caminhos) { const x = ler(); caminhos.forEach((c) => { if (x.ficheiros) delete x.ficheiros[c]; }); gravar(x); },
  };
}
let ultimaEscrita = 0;
const marcarEscrita = () => { ultimaEscrita = Date.now(); };
function storeSupabase() {
  const ok = (r) => { if (r.error) throw r.error; return r.data; };
  return {
    modo: "online",
    async list(m) { return ok(await sb.from("itens").select("id,dados").eq("modulo", m)).map((r) => ({ ...r.dados, id: r.id })); },
    async add(m, d) { marcarEscrita(); return ok(await sb.from("itens").insert({ modulo: m, dados: d }).select("id").single()).id; },
    async update(id, d) { marcarEscrita(); ok(await sb.from("itens").update({ dados: d }).eq("id", id)); },
    async remove(id) { marcarEscrita(); ok(await sb.from("itens").delete().eq("id", id)); },
    async getDoc(id) { const r = ok(await sb.from("documentos").select("dados").eq("id", id).maybeSingle()); return r ? r.dados : null; },
    async setDoc(id, d) { marcarEscrita(); ok(await sb.from("documentos").upsert({ id, dados: d })); },
    async upload(caminho, file) {
      const r = await sb.storage.from("anexos").upload(caminho, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (r.error) throw new Error(/bucket not found/i.test(r.error.message) ? "Falta criar o espaço de ficheiros no Supabase (ver instruções)" : r.error.message);
    },
    async listDocs() { return ok(await sb.from("documentos").select("id,dados").not("id", "like", "foto-%")); },
    async upsertItem(id, modulo, d) { marcarEscrita(); ok(await sb.from("itens").upsert({ id, modulo, dados: d })); },
    async removeDoc(id) { marcarEscrita(); ok(await sb.from("documentos").delete().eq("id", id)); },
    async urls(caminhos) {
      if (!caminhos.length) return {};
      const r = await sb.storage.from("anexos").createSignedUrls(caminhos, 3600);
      if (r.error) throw r.error;
      return Object.fromEntries(r.data.map((x) => [x.path, x.signedUrl || ""]));
    },
    async apagarFicheiros(caminhos) { if (caminhos.length) { const r = await sb.storage.from("anexos").remove(caminhos); if (r.error) throw r.error; } },
  };
}

/* =====================================================================
   COLEÇÕES (o que se guarda em cada secção)
   ===================================================================== */
const CAT_DESP = ["Supermercado", "Casa", "Contas (luz, água, gás, net)", "Carro", "Combustível", "Saúde", "Escola", "Roupa", "Lazer", "Restaurantes", "Presentes", "Outros"];
const CAT_COMP = ["Frutas e legumes", "Talho e peixaria", "Padaria", "Laticínios e ovos", "Mercearia", "Congelados", "Bebidas", "Limpeza", "Higiene", "Outros"];
const REPETIR = { "Não repete": 0, "Mensal": 1, "Trimestral": 3, "Semestral": 6, "Anual": 12 };
const PERIODO = { "Mensal": 1, "Bimestral": 2, "Trimestral": 3, "Semestral": 6, "Anual": 12 };
const junta = (...p) => p.filter(Boolean).map(esc).join(" · ");

const CAT_ICO = { "Supermercado": "compras", "Casa": "inicio", "Contas (luz, água, gás, net)": "raio", "Carro": "veiculos", "Combustível": "combustivel", "Saúde": "medicos", "Escola": "escola", "Roupa": "roupa", "Lazer": "lazer", "Restaurantes": "ementas", "Presentes": "presente" };
const UNID = { "Luz": "kWh", "Água": "m³", "Gás": "m³" };
const CAT_KIT = ["Água e comida", "Primeiros socorros e medicamentos", "Luz, energia e comunicação", "Documentos e dinheiro", "Higiene", "Roupa e abrigo", "Ferramentas e outros"];
// lista recomendada para 3 pessoas e 72 horas (recomendações da Proteção Civil / MAI); [artigo, grupo, quantidade, tem validade]
const KIT_BASE = [
  ["Água engarrafada", 0, "cerca de 20 litros (≈ 2 L por pessoa por dia, 3 dias)", 1],
  ["Comida enlatada (atum, salsichas, feijão, grão)", 0, "9 a 12 latas", 1],
  ["Bolachas, tostas e cereais", 0, "para 3 dias", 1],
  ["Frutos secos e barras de cereais", 0, "", 1],
  ["Leite UHT e sumos pequenos", 0, "", 1],
  ["Abre-latas manual", 0, "1", 0],
  ["Pratos, copos e talheres descartáveis", 0, "", 0],
  ["Estojo de primeiros socorros (pensos, compressas, ligaduras, desinfetante)", 1, "1", 0],
  ["Medicamentos habituais da família", 1, "para 1 semana", 1],
  ["Paracetamol e ibuprofeno", 1, "", 1],
  ["Termómetro", 1, "1", 0],
  ["Máscaras e luvas descartáveis", 1, "", 0],
  ["Rádio a pilhas ou de manivela", 2, "1", 0],
  ["Lanternas", 2, "1 por pessoa", 0],
  ["Pilhas de reserva", 2, "para o rádio e as lanternas", 1],
  ["Powerbank carregado e cabos", 2, "1", 0],
  ["Velas e fósforos ou isqueiro", 2, "", 0],
  ["Apito", 2, "1", 0],
  ["Cópias dos documentos (CC, cartões de saúde, seguros) em saco estanque", 3, "", 0],
  ["Dinheiro em notas e moedas", 3, "", 0],
  ["Contactos de emergência em papel (112, família, médico)", 3, "", 0],
  ["Chaves suplentes de casa e do carro", 3, "", 0],
  ["Mapa da zona em papel", 3, "", 0],
  ["Toalhitas e gel desinfetante", 4, "", 1],
  ["Papel higiénico", 4, "", 0],
  ["Sacos do lixo", 4, "", 0],
  ["Escovas e pasta de dentes", 4, "", 0],
  ["Produtos de higiene feminina", 4, "", 0],
  ["Muda de roupa e roupa interior", 5, "1 por pessoa", 0],
  ["Calçado resistente", 5, "1 par por pessoa", 0],
  ["Mantas ou mantas térmicas", 5, "1 por pessoa", 0],
  ["Impermeáveis ou capas de chuva", 5, "1 por pessoa", 0],
  ["Canivete multiusos", 6, "1", 0],
  ["Fita adesiva resistente", 6, "1", 0],
  ["Mochila para levar o essencial", 6, "1", 0],
  ["Jogo de cartas ou livro para passar o tempo", 6, "", 0],
];
const COLS = {
  compras: {
    ico: "compras",
    id: "compras", nome: "Compras", item: "artigo",
    campos: [
      { k: "nome", l: "Artigo", t: "text", req: 1 },
      { k: "qtd", l: "Quantidade", t: "text" },
      { k: "cat", l: "Secção", t: "select", o: CAT_COMP },
      { k: "comprado", l: "Já comprado", t: "check" },
    ],
    titulo: (d) => d.nome,
  },
  despesas: {
    ico: (d) => CAT_ICO[d.cat] || "euro",
    id: "despesas", nome: "Despesas do mês", item: "despesa",
    campos: [
      { k: "data", l: "Data", t: "date", req: 1, def: hoje },
      { k: "desc", l: "Descrição", t: "text", req: 1 },
      { k: "cat", l: "Categoria", t: "select", o: CAT_DESP },
      { k: "valor", l: "Valor (€)", t: "money", req: 1 },
      { k: "quem", l: "Pago por", t: "select", o: () => PESSOAS, def: () => EU },
      { k: "fixa", l: "🔁 Despesa fixa: repetir todos os meses, no mesmo dia", t: "check" },
      { k: "fimContrato", l: "📄 Fim do contrato, fidelização ou desconto (avisa 2 meses antes)", t: "date" },
      { k: "fimTipo", l: "O que acaba nessa data", t: "select", o: ["Contrato", "Fidelização", "Desconto"] },
      { k: "notas", l: "Notas", t: "textarea" },
    ],
    titulo: (d) => d.desc || d.cat,
    detalhe: (d) => junta(fmtData(d.data), d.cat, d.quem, d.fixa ? "🔁 fixa (todos os meses)" : d.auto ? "🔁 conta fixa" : "", d.fimContrato ? "📄 " + (d.fimTipo || "Contrato").toLowerCase() + " até " + fmtData(d.fimContrato) : ""),
    valor: (d) => euro(d.valor),
    ordem: (a, b) => String(b.data).localeCompare(String(a.data)),
    vazio: "Sem despesas neste mês.",
  },
  veiculos: {
    ico: "veiculos",
    id: "veiculos", nome: "Veículos", item: "veículo",
    campos: [
      { k: "nome", l: "Nome (ex: Carro do Ricardo)", t: "text", req: 1 },
      { k: "matricula", l: "Matrícula", t: "text" },
      { k: "modelo", l: "Marca e modelo", t: "text" },
      { k: "ano", l: "Ano", t: "number" },
      { k: "km", l: "Quilómetros atuais", t: "number" },
      { k: "inspecao", l: "Próxima inspeção", t: "date" },
      { k: "seguro", l: "Seguro paga-se a", t: "date" },
      { k: "iuc", l: "IUC paga-se a", t: "date" },
      { k: "revisao", l: "Próxima revisão (data)", t: "date" },
      { k: "revisao_km", l: "Próxima revisão (km)", t: "number" },
      { k: "notas", l: "Notas", t: "textarea" },
    ],
    titulo: (d) => d.nome,
    detalhe: (d) => junta(d.matricula, d.modelo, d.ano, d.km ? Number(d.km).toLocaleString("pt-PT") + " km" : "", d.revisao_km ? "revisão aos " + Number(d.revisao_km).toLocaleString("pt-PT") + " km" : ""),
    alertas: (d) => [alertaData(d.inspecao, "Inspeção"), alertaData(d.seguro, "Seguro"), alertaData(d.iuc, "IUC"), alertaData(d.revisao, "Revisão"),
      d.km && d.revisao_km && d.revisao_km - d.km <= 1000 ? { nivel: d.revisao_km - d.km < 0 ? "vermelho" : "laranja", dias: 0, texto: `Revisão: faltam ${Math.max(0, d.revisao_km - d.km)} km` } : null].filter(Boolean),
    vazio: "Ainda não há veículos. Adiciona o primeiro.",
  },
  manutencoes: {
    ico: "casa",
    id: "manutencoes", nome: "Manutenções e reparações", item: "manutenção",
    campos: [
      { k: "veiculo", l: "Veículo", t: "select", o: async () => (await store.list("veiculos")).map((v) => v.nome) },
      { k: "data", l: "Data", t: "date", def: hoje },
      { k: "km", l: "Quilómetros", t: "number" },
      { k: "desc", l: "O que se fez", t: "text", req: 1 },
      { k: "oficina", l: "Oficina", t: "text" },
      { k: "custo", l: "Custo (€)", t: "money" },
    ],
    titulo: (d) => d.desc,
    detalhe: (d) => junta(d.veiculo, fmtData(d.data), d.km ? Number(d.km).toLocaleString("pt-PT") + " km" : "", d.oficina),
    valor: (d) => (d.custo ? euro(d.custo) : ""),
    ordem: (a, b) => String(b.data).localeCompare(String(a.data)),
  },
  contas: {
    ico: "raio",
    id: "contas", nome: "Contas fixas", item: "conta",
    campos: [
      { k: "nome", l: "Conta (ex: Luz, Internet)", t: "text", req: 1 },
      { k: "valor", l: "Valor (€)", t: "money" },
      { k: "periodo", l: "Periodicidade", t: "select", o: Object.keys(PERIODO), def: "Mensal" },
      { k: "dia", l: "Dia de pagamento", t: "number" },
      { k: "debito", l: "Débito direto", t: "check" },
      { k: "lancar", l: "Lançar sozinha nas despesas quando chega o dia", t: "check", def: true },
      { k: "inicio", l: "Mês do primeiro pagamento (para bimestrais, trimestrais, anuais…)", t: "month", def: () => hoje().slice(0, 7) },
      { k: "quem", l: "Quem paga", t: "select", o: () => PESSOAS },
      { k: "notas", l: "Notas (fornecedor, contrato…)", t: "textarea" },
    ],
    titulo: (d) => d.nome,
    detalhe: (d) => junta(d.periodo, d.dia ? "dia " + d.dia : "", d.debito ? "débito direto" : "", d.lancar !== false && d.valor ? "lança-se sozinha 🔁" : ""),
    valor: (d) => (d.valor ? euro(d.valor) : ""),
    ordem: (a, b) => String(a.nome).localeCompare(String(b.nome)),
  },
  tarefas: {
    ico: "casa",
    id: "tarefas", nome: "Manutenção da casa", item: "tarefa",
    campos: [
      { k: "desc", l: "Tarefa (ex: limpar filtros do ar condicionado)", t: "text", req: 1 },
      { k: "proxima", l: "Próxima vez", t: "date" },
      { k: "repetir", l: "Repetir", t: "select", o: Object.keys(REPETIR), def: "Não repete" },
      { k: "notas", l: "Notas", t: "textarea" },
    ],
    titulo: (d) => d.desc,
    detalhe: (d) => junta(d.proxima ? fmtData(d.proxima) : "sem data", d.repetir),
    alertas: (d) => [alertaData(d.proxima, "Fazer", 14)].filter(Boolean),
    ordem: (a, b) => String(a.proxima || "9").localeCompare(String(b.proxima || "9")),
    acao: {
      l: "Feito ✓",
      fn: async (d) => {
        const m = REPETIR[d.repetir] || 0;
        if (!m) { if (confirm("Tarefa sem repetição. Apagar da lista?")) await store.remove(d.id); return; }
        let n = somaMeses(d.proxima || hoje(), m);
        while (diasAte(n) < 0) n = somaMeses(n, m);
        await store.update(d.id, { ...semId(d), proxima: n });
        aviso("Próxima vez: " + fmtData(n));
      },
    },
  },
  garantias: {
    ico: "escudo",
    id: "garantias", nome: "Garantias e eletrodomésticos", item: "garantia",
    campos: [
      { k: "aparelho", l: "Aparelho", t: "text", req: 1 },
      { k: "loja", l: "Loja", t: "text" },
      { k: "compra", l: "Data de compra", t: "date" },
      { k: "fim", l: "Garantia até", t: "date" },
      { k: "notas", l: "Notas (onde está a fatura…)", t: "textarea" },
    ],
    titulo: (d) => d.aparelho,
    detalhe: (d) => junta(d.loja, d.compra ? "comprado " + fmtData(d.compra) : "", d.fim ? "garantia até " + fmtData(d.fim) : ""),
    alertas: (d) => { const a = alertaData(d.fim, "Garantia acaba", 60); return a && a.dias >= -30 ? [a] : []; },
    ordem: (a, b) => String(b.fim || "").localeCompare(String(a.fim || "")),
  },
  datas: {
    ico: (d) => (/anivers/i.test(d.desc || "") ? "bolo" : "calendario"),
    id: "datas", nome: "Datas importantes", item: "data",
    campos: [
      { k: "desc", l: "O quê (ex: Aniversário da Ema, reunião da escola)", t: "text", req: 1 },
      { k: "pessoa", l: "Pessoa", t: "select", o: () => [...PESSOAS, "Família"] },
      { k: "data", l: "Data", t: "date", req: 1 },
      { k: "anual", l: "Repete todos os anos", t: "check" },
      { k: "notas", l: "Notas", t: "textarea" },
    ],
    titulo: (d) => d.desc,
    detalhe: (d) => junta(d.pessoa, fmtData(d.data), d.anual ? "todos os anos" : ""),
    alertas: (d) => { if (!d.data) return []; const x = d.anual ? proximaAnual(d.data) : d.data; const n = diasAte(x); return n >= 0 && n <= 21 ? [{ nivel: "azul", dias: n, texto: `${fmtData(x)} · ${rel(n)}` }] : []; },
    ordem: (a, b) => { const f = (d) => (d.data ? (d.anual ? proximaAnual(d.data) : d.data) : "9"); return f(a).localeCompare(f(b)); },
  },
  documentos: {
    ico: "doc",
    id: "documentos", nome: "Validade de documentos", item: "documento",
    campos: [
      { k: "pessoa", l: "Pessoa", t: "select", o: () => PESSOAS, req: 1 },
      { k: "doc", l: "Documento", t: "select", o: ["Cartão de Cidadão", "Passaporte", "Carta de condução", "Cartão Europeu de Seguro de Doença", "Seguro de saúde", "Outro"], req: 1 },
      { k: "validade", l: "Válido até", t: "date" },
      { k: "notas", l: "Notas", t: "textarea" },
    ],
    titulo: (d) => `${d.doc} — ${d.pessoa}`,
    detalhe: (d) => (d.validade ? "válido até " + esc(fmtData(d.validade)) : "sem data"),
    alertas: (d) => [alertaData(d.validade, "Renovar", 90)].filter(Boolean),
    ordem: (a, b) => String(a.validade || "9").localeCompare(String(b.validade || "9")),
  },
  consultas: {
    ico: "medicos",
    id: "consultas", nome: "Consultas", item: "consulta",
    campos: [
      { k: "pessoa", l: "Pessoa", t: "select", o: () => PESSOAS, req: 1 },
      { k: "data", l: "Data", t: "date", req: 1 },
      { k: "hora", l: "Hora", t: "time" },
      { k: "esp", l: "Especialidade / motivo", t: "text" },
      { k: "medico", l: "Médico", t: "text" },
      { k: "local", l: "Local", t: "text" },
      { k: "notas", l: "Notas (levar exames, perguntas…)", t: "textarea" },
    ],
    titulo: (d) => `${d.pessoa} — ${d.esp || "consulta"}`,
    detalhe: (d) => junta(fmtData(d.data) + (d.hora ? " às " + d.hora : ""), d.medico, d.local),
    alertas: (d) => { const n = d.data ? diasAte(d.data) : -1; return n >= 0 && n <= 14 ? [{ nivel: n <= 1 ? "laranja" : "azul", dias: n, texto: rel(n) + (d.hora ? " às " + d.hora : "") }] : []; },
    ordem: (a, b) => { const fa = diasAte(a.data) >= 0, fb = diasAte(b.data) >= 0; if (fa !== fb) return fa ? -1 : 1; return fa ? String(a.data + a.hora).localeCompare(String(b.data + b.hora)) : String(b.data).localeCompare(String(a.data)); },
    vazio: "Sem consultas marcadas.",
  },
  contactos: {
    ico: "tel",
    id: "contactos", nome: "Médicos e contactos", item: "contacto",
    campos: [
      { k: "nome", l: "Nome", t: "text", req: 1 },
      { k: "esp", l: "Especialidade", t: "text" },
      { k: "tel", l: "Telefone", t: "tel" },
      { k: "local", l: "Local / clínica", t: "text" },
      { k: "quem", l: "Para quem", t: "select", o: () => [...PESSOAS, "Todos"] },
      { k: "notas", l: "Notas", t: "textarea" },
    ],
    titulo: (d) => d.nome,
    detalhe: (d) => [junta(d.esp, d.local, d.quem), d.tel ? `<a href="tel:${esc(d.tel.replace(/\s/g, ""))}">📞 ${esc(d.tel)}</a>` : ""].filter(Boolean).join(" · "),
    ordem: (a, b) => String(a.nome).localeCompare(String(b.nome)),
  },
  escola_testes: {
    ico: (d) => (d.tipo === "Teste" ? "doc" : "escola"),
    id: "escola_testes", nome: "Testes e trabalhos", item: "teste / trabalho",
    campos: [
      { k: "disciplina", l: "Disciplina", t: "text", req: 1 },
      { k: "tipo", l: "Tipo", t: "select", o: ["Teste", "Trabalho", "TPC", "Ficha", "Apresentação", "Outro"], def: "Teste" },
      { k: "data", l: "Data", t: "date", req: 1 },
      { k: "materia", l: "Matéria", t: "text" },
      { k: "nota", l: "Nota / resultado", t: "text" },
      { k: "notas", l: "Notas", t: "textarea" },
    ],
    titulo: (d) => `${d.tipo || "Teste"} de ${d.disciplina}`,
    detalhe: (d) => junta(fmtData(d.data), d.materia, d.nota ? "nota: " + d.nota : ""),
    alertas: (d) => { if (!d.data || d.nota) return []; const n = diasAte(d.data); return n >= 0 && n <= 14 ? [{ nivel: n <= 2 ? "laranja" : "azul", dias: n, texto: rel(n) }] : []; },
    ordem: (a, b) => { const fa = diasAte(a.data) >= 0, fb = diasAte(b.data) >= 0; if (fa !== fb) return fa ? -1 : 1; return fa ? String(a.data).localeCompare(String(b.data)) : String(b.data).localeCompare(String(a.data)); },
    vazio: "Sem testes ou trabalhos registados.",
  },
  escola_eventos: {
    ico: "calendario",
    id: "escola_eventos", nome: "Reuniões, visitas e férias", item: "evento da escola",
    campos: [
      { k: "desc", l: "O quê (ex: reunião de pais, visita de estudo)", t: "text", req: 1 },
      { k: "tipo", l: "Tipo", t: "select", o: ["Reunião", "Visita de estudo", "Festa", "Férias / interrupção", "Pagamento", "Outro"] },
      { k: "data", l: "Data", t: "date", req: 1 },
      { k: "fim", l: "Até (se durar vários dias)", t: "date" },
      { k: "hora", l: "Hora", t: "time" },
      { k: "notas", l: "Notas (levar, pagar, autorizar…)", t: "textarea" },
    ],
    titulo: (d) => d.desc,
    detalhe: (d) => junta(d.tipo, fmtData(d.data) + (d.fim ? " a " + fmtData(d.fim) : "") + (d.hora ? " às " + d.hora : "")),
    alertas: (d) => { if (!d.data) return []; const n = diasAte(d.data); return n >= 0 && n <= 14 ? [{ nivel: n <= 2 ? "laranja" : "azul", dias: n, texto: rel(n) }] : []; },
    ordem: (a, b) => { const fa = diasAte(a.fim || a.data) >= 0, fb = diasAte(b.fim || b.data) >= 0; if (fa !== fb) return fa ? -1 : 1; return fa ? String(a.data).localeCompare(String(b.data)) : String(b.data).localeCompare(String(a.data)); },
  },
  escola_atividades: {
    ico: "lazer",
    id: "escola_atividades", nome: "Horário e atividades", item: "atividade",
    campos: [
      { k: "nome", l: "Atividade ou aula (ex: Natação, Inglês)", t: "text", req: 1 },
      { k: "dias", l: "Dias (ex: terça e quinta)", t: "text" },
      { k: "hora", l: "Hora", t: "text" },
      { k: "local", l: "Local", t: "text" },
      { k: "quem_leva", l: "Quem leva / vai buscar", t: "text" },
      { k: "notas", l: "Notas (material, mensalidade…)", t: "textarea" },
    ],
    titulo: (d) => d.nome,
    detalhe: (d) => junta(d.dias, d.hora, d.local, d.quem_leva ? "leva: " + d.quem_leva : ""),
    ordem: (a, b) => String(a.nome).localeCompare(String(b.nome)),
  },
  escola_contactos: {
    ico: "tel",
    id: "escola_contactos", nome: "Professores e contactos", item: "contacto",
    campos: [
      { k: "nome", l: "Nome", t: "text", req: 1 },
      { k: "papel", l: "Função (ex: diretora de turma, professor de Matemática)", t: "text" },
      { k: "tel", l: "Telefone", t: "tel" },
      { k: "email", l: "Email", t: "email" },
      { k: "notas", l: "Notas (horário de atendimento…)", t: "textarea" },
    ],
    titulo: (d) => d.nome,
    detalhe: (d) => [junta(d.papel), d.tel ? `<a href="tel:${esc(d.tel.replace(/\s/g, ""))}">📞 ${esc(d.tel)}</a>` : "", d.email ? `<a href="mailto:${esc(d.email)}">✉️ ${esc(d.email)}</a>` : ""].filter(Boolean).join(" · "),
    ordem: (a, b) => String(a.nome).localeCompare(String(b.nome)),
  },
  viagens: {
    ico: "viagens",
    id: "viagens", nome: "Viagens", item: "viagem",
    campos: [
      { k: "destino", l: "Destino", t: "text", req: 1 },
      { k: "estado", l: "Estado", t: "select", o: ["Ideia", "A planear", "Reservada", "Feita"], def: "Ideia" },
      { k: "ida", l: "Ida", t: "date" },
      { k: "volta", l: "Volta", t: "date" },
      { k: "quem", l: "Quem vai", t: "text", def: () => PESSOAS.join(", ") },
      { k: "transporte", l: "Transporte (avião, carro…)", t: "text" },
      { k: "alojamento", l: "Alojamento", t: "text" },
      { k: "orcamento", l: "Orçamento (€)", t: "money" },
      { k: "notas", l: "Notas e ideias (o que ver, onde comer…)", t: "textarea" },
    ],
    titulo: (d) => d.destino,
    detalhe: (d) => junta(d.estado, d.ida ? fmtData(d.ida) + (d.volta ? " a " + fmtData(d.volta) : "") : "", d.transporte, d.alojamento),
    valor: (d) => (d.orcamento ? euro(d.orcamento) : ""),
    alertas: (d) => { if (!d.ida || d.estado === "Feita") return []; const n = diasAte(d.ida); if (n < 0) return d.volta && diasAte(d.volta) >= 0 ? [{ nivel: "azul", dias: 0, texto: "Boa viagem! 🌍" }] : []; return n <= 30 ? [{ nivel: n <= 3 ? "laranja" : "azul", dias: n, texto: "Partida " + rel(n) }] : []; },
    ordem: (a, b) => { const f = (d) => (d.estado === "Feita" ? "z" : "a") + (d.ida || "9"); return f(a).localeCompare(f(b)); },
    vazio: "Ainda não há viagens. Adiciona um destino, mesmo que seja só uma ideia.",
  },
  reservas: {
    ico: (d) => ({ "Voo": "viagens", "Alojamento": "inicio", "Carro": "veiculos", "Seguro": "escudo" })[d.tipo] || "doc",
    id: "reservas", nome: "Reservas e bilhetes", item: "reserva",
    campos: [
      { k: "viagem", l: "Viagem", t: "select", o: async () => (await store.list("viagens")).map((v) => v.destino) },
      { k: "tipo", l: "Tipo", t: "select", o: ["Voo", "Alojamento", "Carro", "Comboio / autocarro", "Bilhetes", "Seguro", "Outro"] },
      { k: "desc", l: "Descrição (ex: TAP Lisboa → Paris)", t: "text", req: 1 },
      { k: "data", l: "Data", t: "date" },
      { k: "hora", l: "Hora", t: "time" },
      { k: "ref", l: "Referência da reserva", t: "text" },
      { k: "valor", l: "Valor (€)", t: "money" },
      { k: "pago", l: "Já pago", t: "check" },
      { k: "notas", l: "Notas", t: "textarea" },
    ],
    titulo: (d) => d.desc,
    detalhe: (d) => junta(d.viagem, d.tipo, d.data ? fmtData(d.data) + (d.hora ? " " + d.hora : "") : "", d.ref ? "ref. " + d.ref : "", d.valor ? (d.pago ? "pago" : "por pagar") : ""),
    valor: (d) => (d.valor ? euro(d.valor) : ""),
    ordem: (a, b) => String(a.data || "9").localeCompare(String(b.data || "9")),
  },
  mala: {
    ico: (d) => (d.levado ? "escudo" : "viagens"),
    id: "mala", nome: "Lista para a mala", item: "artigo da mala",
    campos: [
      { k: "item", l: "Artigo", t: "text", req: 1 },
      { k: "viagem", l: "Viagem", t: "select", o: async () => (await store.list("viagens")).map((v) => v.destino) },
      { k: "pessoa", l: "De quem", t: "select", o: () => [...PESSOAS, "Todos"] },
      { k: "levado", l: "Já está na mala", t: "check" },
    ],
    titulo: (d) => (d.levado ? "✓ " : "") + d.item,
    detalhe: (d) => junta(d.viagem, d.pessoa),
    ordem: (a, b) => (a.levado === b.levado ? String(a.item).localeCompare(String(b.item)) : a.levado ? 1 : -1),
    acao: { l: (d) => (d.levado ? "Tirar" : "Na mala ✓"), fn: async (d) => { await store.update(d.id, { ...semId(d), levado: !d.levado }); } },
  },
  aniversarios: {
    ico: "bolo",
    id: "aniversarios", nome: "Aniversários", item: "aniversário",
    campos: [
      { k: "nome", l: "Nome", t: "text", req: 1 },
      { k: "nascimento", l: "Data de nascimento (se não souberes o ano, põe um aproximado)", t: "date", req: 1 },
      { k: "relacao", l: "Quem é", t: "select", o: ["Família", "Amigo/a", "Colega", "Amigo/a da Ema", "Outro"] },
      { k: "presente", l: "Ideias de presente", t: "text" },
      { k: "notas", l: "Notas", t: "textarea" },
    ],
    titulo: (d) => d.nome,
    detalhe: (d) => { if (!d.nascimento) return ""; const p = proximaAnual(d.nascimento), anos = +p.slice(0, 4) - +d.nascimento.slice(0, 4);
      return junta(`faz ${anos} anos a ${dm(p)} (${deIso(p).toLocaleDateString("pt-PT", { weekday: "long" })})`, d.relacao, d.presente ? "🎁 " + d.presente : ""); },
    alertas: (d) => { if (!d.nascimento) return []; const p = proximaAnual(d.nascimento), n = diasAte(p); return n <= 21 ? [{ nivel: n <= 3 ? "laranja" : "azul", dias: n, texto: n === 0 ? "É hoje! 🎉" : rel(n) }] : []; },
    ordem: (a, b) => String(proximaAnual(a.nascimento || "2000-12-31")).localeCompare(String(proximaAnual(b.nascimento || "2000-12-31"))),
    vazio: "Ainda não há aniversários. Começa pelos da família!",
  },
  ferias: {
    ico: (d) => (d.tipo === "Férias escolares" ? "escola" : "ferias"),
    id: "ferias", nome: "Férias e folgas", item: "período de férias",
    campos: [
      { k: "quem", l: "Quem", t: "select", o: () => [...PESSOAS, "Família"], req: 1, def: () => EU },
      { k: "tipo", l: "Tipo", t: "select", o: ["Férias", "Folga / ponte", "Férias do ano anterior", "Bónus (½ dia)", "Férias escolares", "Outro"], def: "Férias" },
      { k: "inicio", l: "Primeiro dia", t: "date", req: 1 },
      { k: "fim", l: "Último dia", t: "date", req: 1 },
      { k: "destino", l: "Onde / planos", t: "text" },
      { k: "aprovado", l: "Já aprovado no trabalho", t: "check" },
      { k: "notas", l: "Notas", t: "textarea" },
    ],
    titulo: (d) => `${d.quem} — ${d.tipo || "Férias"}${d.destino ? " · " + d.destino : ""}`,
    detalhe: (d) => junta(d.inicio ? fmtData(d.inicio) + (d.fim && d.fim !== d.inicio ? " a " + fmtData(d.fim) : "") : "", d.tipo === "Bónus (½ dia)" ? "½ dia de bónus · não conta como férias" : d.inicio && d.fim ? (() => { const n = diasUteis(d.inicio, d.fim); return n + (n === 1 ? " dia útil" : " dias úteis"); })() : "", d.tipo === "Férias do ano anterior" ? "dias que sobraram do ano anterior" : "", ["Férias", "Folga / ponte", "Férias do ano anterior"].includes(d.tipo) ? (d.aprovado ? "aprovado ✓" : "por aprovar") : ""),
    alertas: (d) => { if (!d.inicio) return []; const a = diasAte(d.inicio), b = diasAte(d.fim || d.inicio);
      if (b < 0) return []; if (a <= 0) return [{ nivel: "azul", dias: 0, texto: "A decorrer, até " + dm(d.fim || d.inicio) + " 🌴" }];
      return a <= 14 ? [{ nivel: a <= 3 ? "laranja" : "azul", dias: a, texto: "Começam " + rel(a) }] : []; },
    ordem: (a, b) => String(a.inicio || "").localeCompare(String(b.inicio || "")), // por data, da mais antiga para a mais recente
    vazio: "Sem férias marcadas.",
  },
  fichas_carregadas: {
    ico: (d) => (d.feita ? "escudo" : "doc"),
    id: "fichas_carregadas", nome: "Fichas carregadas", item: "ficha",
    campos: [
      { k: "titulo", l: "Nome da ficha (ex: Ficha de frações — professora)", t: "text", req: 1 },
      { k: "disc", l: "Disciplina", t: "select", o: () => [...DISC().map((d) => d.nome), "Outra"], req: 1 },
      { k: "data", l: "Para fazer até", t: "date" },
      { k: "feita", l: "Já está feita", t: "check" },
      { k: "nota", l: "Nota / resultado", t: "text" },
      { k: "notas", l: "Notas", t: "textarea" },
    ],
    titulo: (d) => d.titulo,
    detalhe: (d) => junta(d.disc, d.data ? "até " + fmtData(d.data) : "", d.feita ? "feita ✓" + (d.nota ? " · " + d.nota : "") : "por fazer", d.anexos && d.anexos.length ? "" : "⚠️ sem ficheiro — junta o PDF ou a foto"),
    alertas: (d) => { if (d.feita || !d.data) return []; const n = diasAte(d.data); return n <= 3 ? [{ nivel: n < 0 ? "vermelho" : "laranja", dias: n, texto: "Entregar " + rel(n) }] : []; },
    ordem: (a, b) => (!!a.feita === !!b.feita ? String(a.data || "9").localeCompare(String(b.data || "9")) : a.feita ? 1 : -1),
    acao: { l: (d) => (d.feita ? "Por fazer" : "Feita ✓"), fn: async (d) => { await store.update(d.id, { ...semId(d), feita: !d.feita }); } },
    vazio: "Carrega aqui fichas da escola ou da internet (PDF, foto ou Word) para a Ema fazer.",
  },
  tarefas_familia: {
    ico: "tarefas",
    id: "tarefas_familia", nome: "Lista de tarefas", item: "tarefa",
    campos: [
      { k: "tarefa", l: "Tarefa (ex: pôr a mesa, arrumar o quarto)", t: "text", req: 1 },
      { k: "quem", l: "Quem", t: "select", o: () => [...PESSOAS, "Todos"], req: 1, def: "Ema" },
      { k: "freq", l: "Quando", t: "select", o: ["Todos os dias", "Dias úteis (seg–sex)", "Fins de semana", "Uma vez por semana"], def: "Todos os dias" },
      { k: "pontos", l: "Pontos de cada vez", t: "number", def: 1 },
      { k: "notas", l: "Notas", t: "textarea" },
    ],
    titulo: (d) => d.tarefa,
    detalhe: (d) => junta(d.quem, d.freq, (d.pontos || 1) + ((d.pontos || 1) === 1 ? " ponto" : " pontos")),
    ordem: (a, b) => String(a.quem + a.tarefa).localeCompare(String(b.quem + b.tarefa)),
    vazio: "Ainda não há tarefas. Acrescenta as tarefas de cada um.",
  },
  mealheiro: {
    ico: (d) => (["Gastou", "Depositou no banco"].includes(d.tipo) ? "euro" : "presente"),
    id: "mealheiro", nome: "Mealheiro da Ema", item: "movimento",
    campos: [
      { k: "data", l: "Data", t: "date", def: hoje, req: 1 },
      { k: "tipo", l: "Tipo", t: "select", o: ["Mesada", "Prémio", "Prenda", "Gastou", "Depositou no banco"], req: 1, def: "Prémio" },
      { k: "valor", l: "Valor (€)", t: "money", req: 1 },
      { k: "desc", l: "Descrição", t: "text" },
    ],
    titulo: (d) => d.desc || d.tipo,
    detalhe: (d) => junta(d.tipo, fmtData(d.data)),
    valor: (d) => (["Gastou", "Depositou no banco"].includes(d.tipo) ? "− " : "+ ") + euro(d.valor),
    ordem: (a, b) => String(b.data).localeCompare(String(a.data)),
    vazio: "Ainda sem movimentos.",
  },
  despensa: {
    ico: (d) => (d.local === "Congelador" ? "neve" : "despensa"),
    id: "despensa", nome: "Despensa", item: "artigo",
    campos: [
      { k: "artigo", l: "Artigo", t: "text", req: 1 },
      { k: "local", l: "Onde está", t: "select", o: ["Despensa", "Frigorífico", "Congelador"], def: "Despensa", req: 1 },
      { k: "qtd", l: "Quantidade", t: "number", def: 1 },
      { k: "unid", l: "Unidade (ex: pacotes, kg, latas)", t: "text" },
      { k: "minimo", l: "Avisar quando tiver só (ex: 1)", t: "number" },
      { k: "validade", l: "Validade / congelado em", t: "date" },
      { k: "cat", l: "Secção do supermercado", t: "select", o: CAT_COMP },
      { k: "notas", l: "Notas", t: "textarea" },
    ],
    titulo: (d) => d.artigo,
    detalhe: (d) => junta(`${d.qtd ?? 0} ${d.unid || ""}`.trim(), d.local, d.validade ? (d.local === "Congelador" ? "data: " : "validade: ") + fmtData(d.validade) : ""),
    alertas: (d) => { const a = [];
      if (d.validade && d.local !== "Congelador") { const n = diasAte(d.validade); if (n <= 5) a.push({ nivel: n < 0 ? "vermelho" : "laranja", dias: n, texto: n < 0 ? "Fora de validade" : "Validade " + rel(n) }); }
      if (d.validade && d.local === "Congelador") { const n = -diasAte(d.validade); if (n >= 90) a.push({ nivel: "amarelo", dias: 5, texto: `Congelado há ${Math.round(n / 30)} meses` }); }
      if (d.minimo != null && d.minimo !== "" && (+d.qtd || 0) <= +d.minimo) a.push({ nivel: (+d.qtd || 0) <= 0 ? "vermelho" : "amarelo", dias: 6, texto: (+d.qtd || 0) <= 0 ? "Acabou" : "Está a acabar" });
      return a; },
    ordem: (a, b) => String(a.artigo).localeCompare(String(b.artigo)),
    acao: { l: (d) => "Gastei 1", fn: async (d) => { const q = Math.max(0, (+d.qtd || 0) - 1); await store.update(d.id, { ...semId(d), qtd: q }); aviso(`${d.artigo}: ficam ${q}`); } },
    vazio: "Nada registado aqui.",
  },
  contactos_uteis: {
    ico: "tel",
    id: "contactos_uteis", nome: "Contactos da casa", item: "contacto",
    campos: [
      { k: "nome", l: "Nome / empresa", t: "text", req: 1 },
      { k: "cat", l: "Categoria", t: "select", o: ["Canalizador", "Eletricista", "Gás / caldeira", "Condomínio / senhorio", "Seguradora", "Oficina", "Escola", "Saúde", "Vizinhos", "Limpezas", "Internet / TV", "Água / luz / gás (empresa)", "Outro"], req: 1 },
      { k: "tel", l: "Telefone", t: "tel" },
      { k: "email", l: "Email", t: "email" },
      { k: "morada", l: "Morada", t: "text" },
      { k: "notas", l: "Notas (n.º de cliente, apólice, horário…)", t: "textarea" },
    ],
    titulo: (d) => d.nome,
    detalhe: (d) => [junta(d.cat, d.morada), d.tel ? `<a href="tel:${esc(d.tel.replace(/\s/g, ""))}">📞 ${esc(d.tel)}</a>` : "", d.email ? `<a href="mailto:${esc(d.email)}">✉️ ${esc(d.email)}</a>` : ""].filter(Boolean).join(" · "),
    ordem: (a, b) => String(a.cat + a.nome).localeCompare(String(b.cat + b.nome)),
    vazio: "Acrescenta o canalizador, o eletricista, a seguradora…",
  },
  emergencia: {
    ico: "kit",
    id: "emergencia", nome: "Artigos do kit", item: "artigo",
    campos: [
      { k: "nome", l: "Artigo", t: "text", req: 1 },
      { k: "cat", l: "Grupo", t: "select", o: CAT_KIT },
      { k: "qtd", l: "Quantidade", t: "text" },
      { k: "tenho", l: "✅ Já está no kit", t: "check" },
      { k: "validade", l: "Validade (água, comida, medicamentos, pilhas)", t: "date" },
      { k: "notas", l: "Notas (onde está guardado…)", t: "textarea" },
    ],
    titulo: (d) => d.nome,
    detalhe: (d) => junta(d.cat, d.qtd, d.validade ? "validade " + fmtData(d.validade) : ""),
    alertas: (d) => {
      if (!d.tenho || !d.validade) return [];
      const a = alertaData(d.validade, "Validade", 30);
      return a ? [{ ...a, texto: a.dias < 0 ? `Fora da validade desde ${fmtData(d.validade)} — trocar` : `${a.texto} — trocar` }] : [];
    },
    ordem: (a, b) => (CAT_KIT.indexOf(a.cat) - CAT_KIT.indexOf(b.cat)) || String(a.nome).localeCompare(String(b.nome)),
    acao: { l: (d) => (d.tenho ? "✅ Tenho" : "❌ Falta"), fn: async (d) => { await store.update(d.id, { ...semId(d), tenho: !d.tenho }); } },
    vazio: "Ainda não há artigos. Carrega a lista recomendada acima.",
  },
  leituras: {
    ico: (d) => ({ "Luz": "raio", "Água": "gota", "Gás": "chama" })[d.contador] || "contadores",
    id: "leituras", nome: "Leituras", item: "leitura",
    campos: [
      { k: "contador", l: "Contador", t: "select", o: ["Luz", "Água", "Gás"], req: 1 },
      { k: "data", l: "Data", t: "date", def: hoje, req: 1 },
      { k: "vazio", l: "Vazio (kWh) — o registo das horas mais baratas", t: "number", se: { k: "contador", v: "Luz" } },
      { k: "ponta", l: "Ponta (kWh) — o registo das horas mais caras", t: "number", se: { k: "contador", v: "Luz" } },
      { k: "cheias", l: "Cheias (kWh) — o resto do dia", t: "number", se: { k: "contador", v: "Luz" } },
      { k: "leitura", l: "Leitura total (na luz, se puseres os 3 registos fica a soma)", t: "number", req: 1 },
      { k: "notas", l: "Notas", t: "textarea" },
    ],
    preparar: (d) => { if (d.contador === "Luz" && ["vazio", "ponta", "cheias"].every((k) => d[k] !== "" && d[k] != null && !isNaN(+d[k]))) d.leitura = Math.round((+d.vazio + +d.ponta + +d.cheias) * 1000) / 1000; },
    titulo: (d) => d.leitura == null || d.leitura === "" ? `${d.contador}: ${d.porLer ? "⏳ a IA está a ler a foto…" : d.erroIA ? "⚠️ " + d.erroIA : "sem número"}` : `${d.contador}: ${Number(d.leitura).toLocaleString("pt-PT")} ${UNID[d.contador] || ""}${d.lidoPorIA ? " 📷" : ""}`,
    detalhe: (d) => junta(fmtData(d.data), d.contador === "Luz" && d.vazio != null && d.vazio !== "" ? `vazio ${d.vazio} · ponta ${d.ponta} · cheias ${d.cheias}` : ""),
    ordem: (a, b) => String(b.data).localeCompare(String(a.data)),
    vazio: "Ainda sem leituras.",
  },
  saude: {
    ico: "pilula",
    id: "saude", nome: "Vacinas, análises e medicação", item: "registo",
    campos: [
      { k: "pessoa", l: "Pessoa", t: "select", o: () => PESSOAS, req: 1 },
      { k: "data", l: "Data", t: "date", def: hoje },
      { k: "tipo", l: "Tipo", t: "select", o: ["Vacina", "Análises", "Exame", "Medicação", "Outro"] },
      { k: "desc", l: "Descrição", t: "text", req: 1 },
      { k: "notas", l: "Notas", t: "textarea" },
    ],
    titulo: (d) => `${d.tipo ? d.tipo + ": " : ""}${d.desc}`,
    detalhe: (d) => junta(d.pessoa, fmtData(d.data)),
    ordem: (a, b) => String(b.data).localeCompare(String(a.data)),
  },
};

/* =====================================================================
   COMPONENTES GENÉRICOS (lista + formulário)
   ===================================================================== */
function cartao(col, it) {
  const al = col.alertas ? col.alertas(it) : [];
  const nv = ["vermelho", "laranja", "amarelo", "azul"].find((n) => al.some((a) => a.nivel === n)) || "";
  const ico = typeof col.ico === "function" ? col.ico(it) : col.ico;
  return `<div class="cartao ${nv}" data-id="${esc(it.id)}" tabindex="0" role="button" aria-label="Editar ${esc(col.titulo(it))}">
    ${ico ? `<span class="bolha ${nv}">${svg(ico)}</span>` : ""}
    <div class="ct"><div class="tit">${esc(col.titulo(it))}</div>${col.detalhe ? `<div class="det">${col.detalhe(it)}</div>` : ""}
    ${al.map((a) => `<span class="al ${a.nivel}">${esc(a.texto)}</span>`).join("")}${it.anexos && it.anexos.length ? `<span class="al anx-n">📎 ${it.anexos.length} ${it.anexos.length === 1 ? "anexo" : "anexos"}</span>` : ""}</div>
    ${col.valor ? `<div class="val">${esc(col.valor(it))}</div>` : ""}
    ${col.acao ? `<button class="sec peq" data-acao="${esc(it.id)}">${typeof col.acao.l === "function" ? col.acao.l(it) : col.acao.l}</button>` : ""}
  </div>`;
}

async function seccao(el, col, { filtro, topo, titulo } = {}) {
  const itens = await store.list(col.id);
  if (col.ordem) itens.sort(col.ordem);
  const box = document.createElement("section");
  box.className = "seccao";
  box.innerHTML = `<div class="sec-cab"><h2>${esc(titulo || col.nome)}</h2>
    <input type="search" placeholder="Procurar…" aria-label="Procurar em ${esc(col.nome)}">
    ${CRIANCA() ? "" : `<button class="pri">+ Adicionar</button>`}</div><div class="topo"></div><div class="lista"></div>`;
  el.appendChild(box);
  const q = $("input", box), lista = $(".lista", box);
  const desenhar = () => {
    let vis = filtro ? itens.filter(filtro) : itens;
    const t = q.value.trim().toLowerCase();
    if (t) vis = vis.filter((it) => JSON.stringify(semId(it)).toLowerCase().includes(t));
    $(".topo", box).innerHTML = topo ? topo(vis) : "";
    lista.innerHTML = vis.length ? vis.map((it) => cartao(col, it)).join("") : `<p class="vazio">${col.vazio || "Ainda não há nada aqui."}</p>`;
  };
  desenhar();
  q.oninput = desenhar;
  if (!CRIANCA()) $(".pri", box).onclick = () => abrirForm(col, null);
  const abrir = async (e) => {
    if (CRIANCA()) return;
    const a = e.target.closest("[data-acao]");
    if (a) { e.stopPropagation(); try { await col.acao.fn(itens.find((x) => x.id === a.dataset.acao)); render(); } catch (err) { erro(err); } return; }
    if (e.target.closest("a")) return;
    const c = e.target.closest(".cartao");
    if (c) abrirForm(col, itens.find((x) => x.id === c.dataset.id));
  };
  lista.onclick = abrir;
  lista.onkeydown = (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("cartao")) { e.preventDefault(); abrir(e); } };
}

function campoHtml(c, v) {
  const id = "f_" + c.k;
  if (c.t === "check") return `<label class="chk"><input type="checkbox" name="${c.k}" ${v ? "checked" : ""}> ${esc(c.l)}</label>`;
  let inp;
  if (c.t === "select") {
    const opts = [...(c.o || [])];
    if (v && !opts.includes(v)) opts.push(v);
    inp = `<select id="${id}" name="${c.k}" ${c.req ? "required" : ""}><option value="">—</option>${opts.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  } else if (c.t === "textarea") {
    inp = `<textarea id="${id}" name="${c.k}" rows="3">${esc(v)}</textarea>`;
  } else {
    const num = c.t === "money" || c.t === "number";
    const val = num && v != null && v !== "" ? String(v).replace(".", ",") : v;
    inp = `<input id="${id}" name="${c.k}" type="${num ? "text" : c.t}" ${num ? 'inputmode="decimal"' : ""} value="${esc(val ?? "")}" ${c.req ? "required" : ""}>`;
  }
  return `<label class="campo" for="${id}"><span>${esc(c.l)}${c.req ? " *" : ""}</span>${inp}</label>`;
}

function lerForm(f, campos) {
  const d = {};
  campos.forEach((c) => {
    const el = f.elements.namedItem(c.k);
    if (c.t === "check") d[c.k] = el.checked;
    else if (c.t === "money" || c.t === "number") { const v = el.value.trim().replace(/\s/g, "").replace(",", "."); d[c.k] = v === "" || isNaN(+v) ? null : +v; }
    else d[c.k] = el.value.trim();
  });
  return d;
}


/* ---------- anexos (ficheiros) ---------- */
const novoUid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const nomeSeguro = (n) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80);
const tamanho = (b) => (b > 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
function icoFicheiro(a) {
  const n = (a.nome || "").toLowerCase(), t = a.tipo || "";
  if (t.startsWith("image/")) return "🖼️";
  if (t === "application/pdf" || n.endsWith(".pdf")) return "📄";
  if (/\.(xlsx?|csv|ods|numbers)$/.test(n)) return "📊";
  if (/\.(docx?|odt|pages|txt)$/.test(n)) return "📝";
  return "📎";
}

async function abrirForm(col, it) {
  const dlg = $("#dlg"); dlg.oncancel = null;
  const campos = await Promise.all(col.campos.map(async (c) => ({ ...c, o: typeof c.o === "function" ? await c.o() : c.o })));
  const val = (c) => (it ? it[c.k] : typeof c.def === "function" ? c.def() : c.def ?? "");
  const pasta = (it && it.pasta) || `${col.id}/${novoUid()}`;
  let anexos = [...((it && it.anexos) || [])];
  const novos = [], removidos = [];
  dlg.innerHTML = `<form class="form" novalidate>
    <h2>${it ? "Editar" : "Novo(a)"} ${esc(col.item)}</h2>
    ${campos.map((c) => campoHtml(c, val(c))).join("")}
    <div class="anexos"><div class="anx-cab"><span>Anexos</span><label class="sec peq anx-add">📎 Juntar ficheiro<input type="file" multiple hidden></label></div>
      <div class="anx-lista"></div><p class="det anx-dica">Vouchers, bilhetes, faturas, fotos, PDF, Excel, Word… (até 50 MB cada)</p></div>
    <p class="msg" role="alert"></p>
    <div class="acoes">${it ? `<button type="button" class="perigo" data-a="apagar">Apagar</button>` : ""}<span class="esp"></span>
    <button type="button" class="sec" data-a="fechar">Cancelar</button><button type="submit" class="pri">Gravar</button></div></form>`;
  const f = $("form", dlg);
  const lista = $(".anx-lista", f);
  // campos que só aparecem com certa escolha (ex: registos da luz)
  const dep = campos.filter((c) => c.se);
  const ajustarDep = () => dep.forEach((c) => { const el = f.elements.namedItem(c.k), ctl = f.elements.namedItem(c.se.k); const w = el && (el.closest(".campo") || el.closest("label")); if (w && ctl) w.hidden = ctl.value !== c.se.v; });
  if (dep.length) { [...new Set(dep.map((c) => c.se.k))].forEach((k) => { const ctl = f.elements.namedItem(k); if (ctl) ctl.addEventListener("change", ajustarDep); }); ajustarDep(); }
  const desenharAnexos = async () => {
    if (!anexos.length) { lista.innerHTML = ""; return; }
    lista.innerHTML = anexos.map((a, i) => `<div class="anx" data-i="${i}"><span class="anx-ico">${icoFicheiro(a)}</span>
      <a class="anx-nome" target="_blank" rel="noopener" data-c="${esc(a.caminho)}">${esc(a.nome)}</a><span class="det">${a.a_carregar ? "a carregar…" : tamanho(a.tamanho || 0)}</span>
      <button type="button" class="anx-x" data-x="${i}" aria-label="Retirar ${esc(a.nome)}">✕</button></div>`).join("");
    try {
      const u = await store.urls(anexos.filter((a) => !a.a_carregar).map((a) => a.caminho));
      $$(".anx-nome", lista).forEach((l) => { const url = u[l.dataset.c]; if (url) { l.href = url; l.setAttribute("download", l.textContent); } });
    } catch (err) { console.error(err); }
  };
  desenharAnexos();
  $(".anx-add input", f).onchange = async (e) => {
    const fs = [...(e.target.files || [])]; e.target.value = "";
    for (const file of fs) {
      if (file.size > 50 * 1024 * 1024) { aviso(`${file.name} tem mais de 50 MB`); continue; }
      const a = { nome: file.name, caminho: `${pasta}/${Date.now()}-${nomeSeguro(file.name)}`, tipo: file.type, tamanho: file.size, a_carregar: true };
      anexos.push(a); desenharAnexos();
      try { await store.upload(a.caminho, file); delete a.a_carregar; novos.push(a.caminho); aviso("Ficheiro carregado"); }
      catch (err) { anexos = anexos.filter((x) => x !== a); $(".msg", f).textContent = "Não foi possível carregar " + file.name + ": " + (err.message || err); }
      desenharAnexos();
    }
  };
  lista.onclick = (e) => {
    const x = e.target.closest("[data-x]"); if (!x) return;
    const a = anexos[+x.dataset.x]; if (!a || a.a_carregar) return;
    if (!confirm(`Retirar "${a.nome}"?`)) return;
    anexos.splice(+x.dataset.x, 1); removidos.push(a.caminho); desenharAnexos();
  };
  const fechar = async () => {
    dlg.close();
    if (novos.length) { try { await store.apagarFicheiros(novos); } catch (err) { console.error(err); } }
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (anexos.some((a) => a.a_carregar)) { $(".msg", f).textContent = "Espera que os ficheiros acabem de carregar."; return; }
    const d = lerForm(f, campos);
    d.anexos = anexos.map(({ a_carregar, ...a }) => a); d.pasta = pasta;
    if (col.preparar) col.preparar(d);
    const falta = campos.find((c) => c.req && (d[c.k] === "" || d[c.k] == null));
    if (falta) { $(".msg", f).textContent = `Preenche "${falta.l}".`; f.elements.namedItem(falta.k).focus(); return; }
    try {
      if (it) await store.update(it.id, { ...semId(it), ...d }); else await store.add(col.id, d);
      novos.length = 0;
      if (removidos.length) { try { await store.apagarFicheiros(removidos); } catch (err) { console.error(err); } }
      dlg.close(); aviso("Gravado"); render();
    } catch (err) { $(".msg", f).textContent = "Não foi possível gravar: " + (err.message || err); }
  };
  $("[data-a=fechar]", f).onclick = fechar;
  dlg.oncancel = (e) => { e.preventDefault(); fechar(); };
  const ap = $("[data-a=apagar]", f);
  if (ap) ap.onclick = async () => {
    if (!confirm("Apagar este registo" + (anexos.length ? " e os seus anexos" : "") + "?")) return;
    try {
      await store.remove(it.id);
      const todos = [...new Set([...anexos.map((a) => a.caminho), ...removidos, ...novos])];
      if (todos.length) { try { await store.apagarFicheiros(todos); } catch (err) { console.error(err); } }
      dlg.close(); aviso("Apagado"); render();
    } catch (err) { erro(err); }
  };
  dlg.showModal();
  const p = $("input:not([type=checkbox]),select,textarea", f); if (p) p.focus();
}

const cab = (titulo, sub) => `<div class="cab"><div><h1>${titulo}</h1>${sub ? `<div class="sub2">${sub}</div>` : ""}</div></div>`;

/* =====================================================================
   INÍCIO
   ===================================================================== */
const ROTA_DE = { emergencia: "emergencia", veiculos: "veiculos", tarefas: "casa", garantias: "casa", datas: "familia", documentos: "familia", escola_testes: "escola", escola_eventos: "escola", fichas_carregadas: "estudo", viagens: "viagens", ferias: "ferias", aniversarios: "ferias", despensa: "despensa", consultas: "medicos" };

let FOTO;
const chaveFoto = () => "foto-" + (EU || "eu").toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
async function fotoFamilia() {
  if (FOTO === undefined) {
    let d = await store.getDoc(chaveFoto());
    if (!d || !d.img) d = await store.getDoc("foto-familia");
    FOTO = d && d.img ? { x: 50, y: 35, z: 1, ...d } : null;
  }
  return FOTO;
}
const estiloFoto = (f) => `object-position:${f.x}% ${f.y}%;transform:scale(${f.z});transform-origin:${f.x}% ${f.y}%`;
const avatarHtml = (f, cls = "") => f ? `<span class="avatar ${cls}"><img alt="Foto de perfil" src="${f.img}" style="${estiloFoto(f)}" draggable="false"></span>` : "";
function atualizarLogo() {
  const m = $(".marca-ico");
  if (!m) return;
  m.innerHTML = FOTO ? avatarHtml(FOTO, "mini") : "⌂";
  m.classList.toggle("com-foto", !!FOTO);
}
async function novaFoto(file) {
  aviso("A guardar a foto…");
  const img = await reduzirImagem(file, 900);
  const nova = { img, x: 50, y: 35, z: 1 };
  await store.setDoc(chaveFoto(), nova);
  FOTO = nova; atualizarLogo(); aviso("Foto guardada");
}
function ajustarFoto() {
  const f = { ...FOTO };
  const dlg = $("#dlg"); dlg.oncancel = null;
  dlg.innerHTML = `<div class="form"><div class="pega" aria-hidden="true"></div><h2>A tua foto de perfil</h2>
    <div class="prev-av"><div class="avatar prev">${avatarHtml(f).replace(/^<span class="avatar ">|<\/span>$/g, "")}</div></div>
    <p class="det" style="margin:0;text-align:center">Arrasta a foto com o dedo para a centrar no círculo.</p>
    <label class="campo"><span>Zoom</span><input type="range" id="f-zoom" min="1" max="3" step="0.05" value="${f.z}"></label>
    <div style="text-align:center"><label class="sec peq trocar">${svg("camara")} Escolher outra foto<input type="file" accept="image/*" id="f-nova" hidden></label></div>
    <div class="acoes"><span class="esp"></span>
      <button type="button" class="sec" data-a="fechar">Cancelar</button><button type="button" class="pri" data-a="guardar">Guardar</button></div></div>`;
  const prev = $(".prev", dlg), zoom = $("#f-zoom", dlg);
  const aplicar = () => { const img = $("img", prev); img.src = f.img; img.style.cssText = estiloFoto(f); };
  const lim = (v) => Math.max(0, Math.min(100, v));
  let ini = null;
  prev.onpointerdown = (e) => { ini = { px: e.clientX, py: e.clientY, x: f.x, y: f.y }; prev.setPointerCapture(e.pointerId); };
  prev.onpointermove = (e) => {
    if (!ini) return;
    const r = prev.getBoundingClientRect(), k = 120 / f.z;
    f.x = lim(ini.x - ((e.clientX - ini.px) / r.width) * k);
    f.y = lim(ini.y - ((e.clientY - ini.py) / r.height) * k);
    aplicar();
  };
  prev.onpointerup = prev.onpointercancel = () => { ini = null; };
  zoom.oninput = () => { f.z = +zoom.value; aplicar(); };
  $("#f-nova", dlg).onchange = async (e) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    try { f.img = await reduzirImagem(file, 900); f.x = 50; f.y = 35; f.z = 1; zoom.value = 1; aplicar(); } catch (err) { erro(err); }
  };
  $("[data-a=fechar]", dlg).onclick = () => dlg.close();
  $("[data-a=guardar]", dlg).onclick = async () => {
    try { await store.setDoc(chaveFoto(), { img: f.img, x: Math.round(f.x), y: Math.round(f.y), z: f.z }); FOTO = f; dlg.close(); atualizarLogo(); aviso("Foto guardada"); render(); }
    catch (err) { erro(err); }
  };
  aplicar();
  dlg.showModal();
}
function reduzirImagem(file, max = 1400) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => rej(new Error("Não foi possível abrir esta imagem"));
    img.src = URL.createObjectURL(file);
  });
}


/* ---------- notificações no telemóvel (Web Push) ---------- */
const b64uParaBytes = (s) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
const pushSuportado = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const instalada = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
async function estadoPush() {
  if (!pushSuportado()) return ehIOS() && !instalada() ? "instalar" : "nao";
  if (Notification.permission === "denied") return "negado";
  try { const reg = await navigator.serviceWorker.ready; const s = await reg.pushManager.getSubscription(); return s ? "ativo" : "desligado"; } catch (e) { return "desligado"; }
}
async function ativarPush() {
  const cfg = await store.getDoc("push-config");
  if (!cfg || !cfg.vapid) throw new Error("As notificações ainda não estão configuradas no n8n.");
  if ((await Notification.requestPermission()) !== "granted") throw new Error("Não deste permissão para notificações.");
  const reg = await navigator.serviceWorker.ready;
  let s = await reg.pushManager.getSubscription();
  if (!s) s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uParaBytes(cfg.vapid) });
  const j = s.toJSON();
  const ja = (await store.list("push")).find((x) => x.endpoint === j.endpoint);
  const d = { endpoint: j.endpoint, keys: j.keys, quem: EU || "", aparelho: ehIOS() ? "iPhone/iPad" : /android/i.test(navigator.userAgent) ? "Android" : "Computador", desde: hoje() };
  if (ja) await store.update(ja.id, { ...ja, ...d, id: undefined }); else await store.add("push", d);
}
async function desativarPush() {
  const reg = await navigator.serviceWorker.ready; const s = await reg.pushManager.getSubscription();
  if (!s) return;
  const ja = (await store.list("push")).find((x) => x.endpoint === s.endpoint);
  await s.unsubscribe(); if (ja) await store.remove(ja.id);
}
async function configurarPush(el) {
  const cfg = await store.getDoc("push-config");
  if (cfg && cfg.vapid) return true;
  el.insertAdjacentHTML("beforeend", `<section class="seccao" id="push-setup"><div class="sec-cab"><h2>🔔 Configurar notificações (uma vez)</h2></div>
    <p class="det" style="margin:0">Cria as chaves das notificações. A chave pública fica na app; a chave privada só aparece aqui, para a colares nos <b>Secrets</b> do GitHub (não a envies a ninguém).</p>
    <div><button type="button" class="pri" id="push-gerar">Criar chaves</button></div><div id="push-res"></div></section>`);
  $("#push-gerar", el).onclick = async () => {
    try {
      const k = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
      const priv = await crypto.subtle.exportKey("jwk", k.privateKey);
      const raw = new Uint8Array(await crypto.subtle.exportKey("raw", k.publicKey));
      const pub = btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const segredo = JSON.stringify({ kty: priv.kty, crv: priv.crv, x: priv.x, y: priv.y, d: priv.d });
      await store.setDoc("push-config", { vapid: pub, desde: hoje() });
      $("#push-gerar", el).remove();
      $("#push-res", el).innerHTML = `<ol class="det" style="margin:0;padding-left:20px">
        <li>Copia a chave privada abaixo.</li>
        <li>Abre <a href="https://github.com/ricardosantos1984/casa/settings/secrets/actions/new" target="_blank" rel="noopener">GitHub → casa → Secrets → New secret</a>, nome <b>VAPID_PRIVADA</b>, cola e grava.</li>
        <li>Volta à página inicial e carrega em “Ativar notificações”.</li></ol>
        <textarea readonly rows="4" id="push-chave" style="font-family:monospace;font-size:13px;min-height:90px;padding:10px">${esc(segredo)}</textarea>
        <div><button type="button" class="sec" id="push-copiar">Copiar chave privada</button></div>`;
      $("#push-copiar", el).onclick = async () => { try { await navigator.clipboard.writeText(segredo); aviso("Copiada"); } catch (e) { $("#push-chave", el).select(); } };
    } catch (e) { erro(e); }
  };
  return false;
}
async function cartaoPush(el, gerir) {
  if (gerir) { if (!(await configurarPush(el))) return; }
  else { const cfg = await store.getDoc("push-config"); if (!cfg || !cfg.vapid) return; }
  const st = await estadoPush();
  if (st === "nao") return;
  const txt = { instalar: "Para receberes notificações no iPhone, instala a app: Partilhar → Adicionar ao ecrã principal, e abre-a pelo ícone.", negado: "As notificações estão bloqueadas. Ativa-as nas definições do telemóvel para esta app.", desligado: "Recebe no telemóvel os avisos do dia: testes da Ema, consultas, aniversários, carro e orçamento.", ativo: "Notificações ligadas neste aparelho. ✅" }[st];
  const bt = st === "desligado" ? `<button type="button" class="pri" id="push-on">🔔 Ativar notificações</button>` : st === "ativo" ? `<button type="button" class="sec" id="push-off">Desligar</button>` : "";
  el.insertAdjacentHTML("beforeend", `<section class="seccao push-cartao"><div class="sec-cab"><h2>🔔 Notificações</h2>${bt}</div><p class="det" style="margin:0">${txt}</p></section>`);
  const on = $("#push-on", el), off = $("#push-off", el);
  if (on) on.onclick = async () => { on.disabled = true; try { await ativarPush(); aviso("Notificações ligadas 🔔"); await render(); } catch (e) { on.disabled = false; erro(e); } };
  if (off) off.onclick = async () => { try { await desativarPush(); aviso("Notificações desligadas"); await render(); } catch (e) { erro(e); } };
}

/* ---------- página inicial das crianças (só o que os pais deixaram ver) ---------- */
async function vInicioCrianca(el) {
  const ok = (r) => podeVer(r);
  const ini = sabadoDe(hoje()), idx = Math.round((deIso(hoje()) - deIso(ini)) / 86400000), seg = segundaDe(hoje());
  const nada = () => Promise.resolve(null), vazio = () => Promise.resolve([]);
  const [foto, docE, hor, testes, anos, compras, tarefas, docT] = await Promise.all([
    fotoFamilia(), ok("ementas") ? store.getDoc("ementa-" + ini) : nada(), ok("escola") ? store.getDoc("horario-ema") : nada(),
    ok("escola") ? store.list("escola_testes") : vazio(), ok("ferias") ? store.list("aniversarios") : vazio(),
    ok("compras") ? store.list("compras") : vazio(), ok("tarefas") ? store.list("tarefas_familia") : vazio(), ok("tarefas") ? store.getDoc("tarefas-" + seg) : nada()]);
  const sel = (docE && docE.sel) || {}, v = (k) => sel[idx + k];
  const dataLonga = new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
  const linha = (lbl, t) => `<div class="ref-linha"><span class="ref-l">${lbl}</span><span class="ref-t">${t ? esc(t) : `<span class="vazio">—</span>`}</span></div>`;
  // aulas de hoje (ou do próximo dia de escola)
  let aulas = "";
  if (hor && hor.tempos) {
    const dw = new Date().getDay(), d = dw >= 1 && dw <= 5 ? dw - 1 : 0, quando = dw >= 1 && dw <= 5 ? "Hoje" : "Segunda-feira";
    const l = hor.tempos.map((t, r) => { const c = (hor.grelha[d] || [])[r]; const xs = Array.isArray(c) ? c : c ? [c] : [];
      return xs.length ? `<div class="ref-linha"><span class="ref-l">${esc(t[0])}</span><span class="ref-t">${celulaHor(xs)}</span></div>` : ""; }).join("");
    aulas = `<a class="hoje" href="#escola"><div class="hoje-cab"><span class="bolha">${svg("escola")}</span><h2>${quando} na escola</h2><span class="seta">›</span></div>${l || `<p class="vazio">Sem aulas.</p>`}</a>`;
  }
  const prox = testes.filter((t) => t.data && diasAte(t.data) >= 0 && !t.nota).sort((a, b) => String(a.data).localeCompare(String(b.data))).slice(0, 4);
  const niver = anos.filter((a) => a.nascimento && diasAte(proximaAnual(a.nascimento)) <= 30).sort(COLS.aniversarios.ordem).slice(0, 4);
  const feitas = (docT && docT.feitas) || {}, hojeT = Math.round((deIso(hoje()) - deIso(seg)) / 86400000);
  const minhas = tarefas.filter((t) => t.quem === EU || t.quem === "Todos").filter((t) => diasDaTarefa(t).some((d) => d === hojeT || d === "s"));
  const porFazer = minhas.filter((t) => !diasDaTarefa(t).filter((d) => d === hojeT || d === "s").every((d) => feitas[t.id + "|" + d + (t.quem === "Todos" ? "|" + EU : "")]));
  const falta = compras.filter((c) => !c.comprado);
  el.innerHTML = `<div class="perfil">
    ${foto ? `<button type="button" class="av-btn" id="foto-aj" aria-label="Mudar ou ajustar a tua foto de perfil">${avatarHtml(foto, "grande")}<span class="av-edit">${svg("camara")}</span></button>`
      : `<label class="av-btn vazio-av" aria-label="Pôr a tua foto de perfil"><span class="avatar grande">${svg("camara")}</span><input type="file" accept="image/*" id="foto-inp" hidden></label>`}
    <div><h1>Olá, ${esc(EU)}! 👋</h1><div class="sub2">${esc(cap(dataLonga))}</div></div></div>
  ${aulas}
  ${ok("ementas") ? `<a class="hoje" href="#ementas"><div class="hoje-cab"><span class="bolha">${svg("ementas")}</span><h2>Hoje para comer</h2><span class="seta">›</span></div>
    ${linha("Pequeno-almoço", v("P"))}${linha("Meio da manhã", v("E"))}${linha("Almoço", v("A"))}${linha("Lanche", v("TE"))}${linha("Jantar", v("J"))}</a>` : ""}
  ${ok("tarefas") ? `<section class="seccao"><div class="sec-cab"><h2>As minhas tarefas de hoje</h2><a class="ver" href="#tarefas">Abrir</a></div>
    ${minhas.length ? (porFazer.length ? `<p class="chips">${porFazer.map((t) => `<span class="chip">${esc(t.tarefa)}</span>`).join("")}</p>` : `<p class="vazio">Já fizeste tudo hoje! 🌟</p>`) : `<p class="vazio">Não tens tarefas para hoje.</p>`}</section>` : ""}
  ${ok("escola") ? `<section class="seccao"><div class="sec-cab"><h2>Próximos testes e trabalhos</h2><a class="ver" href="#escola">Ver todos</a></div>
    ${prox.length ? prox.map((t) => { const n = diasAte(t.data); return `<a class="linha-l" href="#escola"><span class="bolha ${n <= 2 ? "laranja" : "azul"}">${svg(t.tipo === "Teste" ? "doc" : "escola")}</span><span class="ct"><b>${esc(COLS.escola_testes.titulo(t))}</b><span class="det">${junta(fmtData(t.data), t.materia)}</span></span><span class="tag ${n <= 2 ? "laranja" : ""}">${esc(rel(n))}</span></a>`; }).join("") : `<p class="vazio">Nada marcado. 👍</p>`}</section>` : ""}
  ${ok("ferias") && niver.length ? `<section class="seccao"><div class="sec-cab"><h2>Aniversários a chegar</h2><a class="ver" href="#ferias">Ver</a></div>
    ${niver.map((a) => { const n = diasAte(proximaAnual(a.nascimento)); return `<a class="linha-l" href="#ferias"><span class="bolha ${n <= 3 ? "laranja" : "azul"}">${svg("bolo")}</span><span class="ct"><b>${esc(a.nome)}</b><span class="det">${COLS.aniversarios.detalhe(a)}</span></span><span class="tag">${esc(n === 0 ? "hoje 🎉" : rel(n))}</span></a>`; }).join("")}</section>` : ""}
  ${ok("compras") ? `<section class="seccao"><div class="sec-cab"><h2>Lista de compras</h2><a class="ver" href="#compras">Abrir</a></div>
    <p class="det" style="margin:0">Falta alguma coisa em casa? Acrescenta à lista.</p>
    <form class="rapido" id="rapido-c"><input name="nome" placeholder="Ex: iogurtes" aria-label="Artigo" autocomplete="off"><button class="pri">Adicionar</button></form>
    ${falta.length ? `<p class="chips">${falta.slice(0, 12).map((c) => `<span class="chip">${esc(c.nome)}</span>`).join("")}${falta.length > 12 ? `<span class="chip">+${falta.length - 12}</span>` : ""}</p>` : ""}</section>` : ""}`;
  const inp = $("#foto-inp", el);
  if (inp) inp.onchange = async (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; try { await novaFoto(f); await render(); ajustarFoto(); } catch (err) { erro(err); } };
  const aj = $("#foto-aj", el); if (aj) aj.onclick = ajustarFoto;
  const fc = $("#rapido-c", el);
  if (fc) fc.onsubmit = async (e) => {
    e.preventDefault(); const nome = fc.nome.value.trim(); if (!nome) return fc.nome.focus();
    try { await store.add("compras", { nome, qtd: "", cat: "", comprado: false, pedido_por: EU }); aviso(`«${nome}» está na lista 🛒`); render(); } catch (err) { erro(err); }
  };
  const stp = await estadoPush().catch(() => "nao");
  if (stp !== "ativo" && stp !== "nao") await cartaoPush(el);
}

async function vInicio(el) {
  if (CRIANCA()) return vInicioCrianca(el);
  const ini = sabadoDe(hoje()), idx = Math.round((deIso(hoje()) - deIso(ini)) / 86400000);
  const ids = Object.keys(ROTA_DE);
  const [docOrc, foto, docE, compras, despesas, ...listas] = await Promise.all([store.getDoc("orcamento"), fotoFamilia(), store.getDoc("ementa-" + ini), store.list("compras"), store.list("despesas"), ...ids.map((i) => store.list(i))]);
  const sel = (docE && docE.sel) || {};
  const totOrc = Object.values((docOrc && docOrc.cat) || {}).reduce((a, v) => a + (+v || 0), 0);
  const alertas = [];
  ids.forEach((cid, n) => { if (cid === "consultas") return; listas[n].forEach((it) => (COLS[cid].alertas(it) || []).forEach((a) => alertas.push({ ...a, rota: ROTA_DE[cid], tit: COLS[cid].titulo(it), ico: typeof COLS[cid].ico === "function" ? COLS[cid].ico(it) : COLS[cid].ico }))); });
  alertas.push(...alertasEscolares(), ...alertasContratos(despesas));
  try { const k = await store.getDoc("kit-emergencia"); if (k && k.revisto) { const p = somaMeses(k.revisto, 6), n = diasAte(p); if (n <= 7) alertas.push({ nivel: n < 0 ? "laranja" : "amarelo", dias: n, texto: `Rever o kit (validades, pilhas, powerbank) · ${rel(n)}`, rota: "emergencia", tit: "Kit de emergência", ico: "kit" }); } } catch (e) {}
  try { alertas.push(...alertasContadores(await store.list("leituras"))); } catch (e) {}
  alertas.sort((a, b) => a.dias - b.dias);
  const consultas = listas[ids.indexOf("consultas")].filter((c) => c.data && diasAte(c.data) >= 0 && diasAte(c.data) <= 60)
    .sort((a, b) => String(a.data + (a.hora || "")).localeCompare(String(b.data + (b.hora || "")))).slice(0, 4);
  const falta = compras.filter((c) => !c.comprado);
  const mes = hoje().slice(0, 7), segunda = somaDias(hoje(), -((new Date().getDay() + 6) % 7));
  const soma = (f) => despesas.filter(f).reduce((s, d) => s + (+d.valor || 0), 0);
  const totMes = soma((d) => String(d.data || "").startsWith(mes)), totSem = soma((d) => d.data && d.data >= segunda && d.data <= hoje());
  const dataLonga = new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });

  const v = (k) => sel[idx + k];
  const pv = (t) => (t ? esc(t) : `<span class="vazio">—</span>`);
  const pessoas = (ix) => { const l = WHO.filter((w) => v(w[ix])); return l.length ? l.map((w) => `<span class="quem">${w[0]}</span> ${esc(v(w[ix]))}`).join("<br>") : `<span class="vazio">—</span>`; };
  const refeicao = (lbl, html, sal) => `<div class="ref-linha"><span class="ref-l">${lbl}</span><span class="ref-t">${html}${sal ? ` <span class="tag">+ salada</span>` : ""}</span></div>`;
  const nada = !Object.keys(sel).some((k) => k.startsWith(String(idx)) && sel[k]);

  el.innerHTML = `<div class="perfil">
    ${foto ? `<button type="button" class="av-btn" id="foto-aj" aria-label="Mudar ou ajustar a tua foto de perfil">${avatarHtml(foto, "grande")}<span class="av-edit">${svg("camara")}</span></button>`
      : `<label class="av-btn vazio-av" aria-label="Pôr a tua foto de perfil"><span class="avatar grande">${svg("camara")}</span><input type="file" accept="image/*" id="foto-inp" hidden></label>`}
    <div><h1>${EU ? "Olá, " + esc(EU) : "Olá!"}</h1><div class="sub2">${esc(cap(dataLonga))}</div>${foto ? "" : `<div class="det">Toca no círculo para pores a tua foto.</div>`}</div>
  </div>
  <a class="hoje" href="#ementas">
    <div class="hoje-cab"><span class="bolha">${svg("ementas")}</span><h2>Hoje na ementa</h2><span class="seta">›</span></div>
    ${nada ? `<p class="vazio">Ainda não há nada escolhido para hoje. Toca para escolher.</p>` :
      refeicao("Pequeno-almoço", pv(v("P"))) + refeicao("Meio da manhã", pessoas(1)) + refeicao("Almoço", pv(v("A")), v("AS")) + refeicao("Meio da tarde", pessoas(2)) + refeicao("Jantar", pv(v("J")), v("JS"))}
  </a>
  <div class="grelha">
    <a class="mini" href="#compras"><span class="bolha">${svg("compras")}</span><span class="num">${falta.length}</span><span class="rot">por comprar</span></a>
    <a class="mini" href="#despesas"><span class="bolha">${svg("euro")}</span><span class="num">${euro(totSem)}</span><span class="rot">gasto esta semana</span></a>
    <a class="mini" href="#despesas"><span class="bolha">${svg("calendario")}</span><span class="num">${euro(totMes)}</span><span class="rot">gasto este mês${totOrc ? ` de ${euro(totOrc)}` : ""}</span>${totOrc ? `<span class="orc-b"><i class="${totMes > totOrc ? "vermelho" : totMes >= totOrc * 0.8 ? "laranja" : "verde"}" style="width:${Math.min(100, (totMes / totOrc) * 100)}%"></i></span>` : ""}</a>
  </div>
  <section class="seccao"><div class="sec-cab"><h2>Próximas consultas</h2><a class="ver" href="#medicos">Ver todas</a></div>
    ${consultas.length ? consultas.map((c) => { const n = diasAte(c.data); return `<a class="linha-l" href="#medicos"><span class="bolha ${n <= 1 ? "laranja" : "azul"}">${svg("medicos")}</span><span class="ct"><b>${esc(c.pessoa)} — ${esc(c.esp || "consulta")}</b><span class="det">${esc(fmtData(c.data))}${c.hora ? " às " + esc(c.hora) : ""}${c.local ? " · " + esc(c.local) : ""}</span></span><span class="tag ${n <= 1 ? "laranja" : ""}">${esc(rel(n))}</span></a>`; }).join("") : `<p class="vazio">Sem consultas nos próximos 60 dias.</p>`}
  </section>
  <section class="seccao"><h2>Avisos</h2>
    ${alertas.length ? alertas.map((a) => `<a class="linha-l" href="#${a.rota}"><span class="bolha ${a.nivel}">${svg(a.ico || "calendario")}</span><span class="ct"><b>${esc(a.tit)}</b><span class="det">${esc(a.texto)}</span></span></a>`).join("") : `<p class="vazio">Nada urgente. 👍</p>`}
  </section>
  ${falta.length ? `<section class="seccao"><div class="sec-cab"><h2>Lista de compras</h2><a class="ver" href="#compras">Abrir</a></div><p class="chips">${falta.slice(0, 12).map((c) => `<span class="chip">${esc(c.nome)}</span>`).join("")}${falta.length > 12 ? `<span class="chip">+${falta.length - 12}</span>` : ""}</p></section>` : ""}`;
  const inp = $("#foto-inp", el);
  if (inp) inp.onchange = async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try { await novaFoto(f); await render(); ajustarFoto(); } catch (err) { erro(err); }
  };
  const aj = $("#foto-aj", el); if (aj) aj.onclick = ajustarFoto;
  const stp = await estadoPush().catch(() => "nao");
  if (stp !== "ativo" && stp !== "nao") await cartaoPush(el);
}

/* =====================================================================
   EMENTAS
   ===================================================================== */
const O = {"P": ["Cevada com pão de centeio e queijo fatiado", "Cevada com pão de centeio e presunto", "Cevada com pão de centeio e fiambre de aves", "Iogurte com pão de centeio e fiambre de aves", "Iogurte sólido com fruta e cereais", "Iogurte grego com mirtilos e cereais", "Iogurte com pão com manteiga", "Iogurte com tortitas e manteiga de amendoim", "Cereais com leite", "Leite e torrada"], "A": ["Resto do dia anterior", "Costeletas com salada", "Omelete de queijo e fiambre com salada", "Sandes de hambúrguer com tomate e alface", "Espetadas de peru com arroz e salada", "Lombinhos de pescada com alho e coentros · Cookidoo", "Salada de frango · Cookidoo", "Penne com atum e salada · Cookidoo", "Mini pizzas com batata frita e uvas", "Almoçar fora"], "J": ["Arroz de lulas · Cookidoo", "Caldeirada de lulas · Cookidoo", "Tagliatelle com frango e ervilhas · Cookidoo", "Lombo de salmão em papelote com puré de espinafres · Cookidoo", "Pescada com molho de tomate fresco · Cookidoo", "Linguine com molho de cogumelos e peru · Cookidoo", "Penne com frango e béchamel · Cookidoo", "Empadão de atum com salada · Cookidoo", "Empadão de carne com salada · Cookidoo", "Empadão de arroz com cogumelos e frango · Cookidoo", "Gratinado de salmão e legumes · Cookidoo", "Esparguete preto com camarão · Cookidoo", "Esparguete à carbonara com salada · Cookidoo", "Esparguete de açafrão com peixe · Cookidoo", "Esparguete de frutos do mar · Cookidoo", "Salada de massa e grão · Cookidoo", "Salada russa · Cookidoo", "Massada de peixe · Cookidoo", "Cuscuz com limão, frango e mel · Cookidoo", "Arroz de frango com ervilhas · Cookidoo", "Caril de frango com arroz · Cookidoo", "Sopa e frango com arroz · Cookidoo", "Carne estufada com puré de batata e cenoura · Cookidoo", "Peru estufado com feijão preto · Cookidoo", "Frango com cerveja e arroz no micro-ondas · Cookidoo", "Salmão ao vapor com puré de cenoura · Cookidoo", "Papelotes de salmão com cuscuz e tomate seco · Cookidoo", "Risoto de frango, espinafres e alho-francês · Cookidoo", "Douradinhos com arroz de cenoura · Cookidoo", "Bifes de frango com arroz de manteiga e salada", "Bifinhos de frango com massinhas e salada", "Bifes de frango com esparguete e salada", "Bifes de peru com batata cozida, ovo e grão", "Bifes de peru com esparguete cor de laranja e salada", "Pernas de frango com arroz basmati e salada", "Espetadas com arroz de manteiga e salada", "Rolo de carne com arroz basmati e salada", "Peixe-espada com arroz de tomate e brócolos", "Robalo com batata cozida, feijão-verde e ovo", "Linguado grelhado com batata cozida e ovo", "Salmão assado no forno com batata e grelos", "Massa de atum com salada", "Omelete de queijo e fiambre com salada", "Polvo à lagareiro"], "MA": ["Amêndoas (10 g) + clementina", "Amêndoas (10 g) + kiwi", "Amêndoas (10 g) + maçã", "Amêndoas (10 g) + banana", "Ovo cozido + amêndoas (10 g)", "1 gelatina + amêndoas", "2 tostas extra finas + Babybel", "Marinheiras (2) com Babybel", "Vaca que ri com palitos", "Banana com frutos secos", "Clementina com nozes (10 g)"], "ME": ["Sumo de fruta + Babybel", "Sumo de fruta + amêndoas", "Sumo de fruta + 2 marinheiras", "Sumo de fruta + nozes (10 g)", "Banana com nozes (10 g)", "Amêndoas (10 g) + clementina", "1 gelatina + amêndoas", "Marinheiras (2) com Babybel", "Ovo cozido + amêndoas (10 g)", "Clementina com nozes (10 g)", "Vaca que ri com palitos"], "TA": ["Uvas + nozes (10 g)", "Banana com nozes (10 g)", "Iogurte líquido, maçã e nozes", "Iogurte líquido, maçã, Babybel", "Iogurte líquido + crackers", "Iogurte + 2 tostas e Babybel", "Iogurte líquido + tosta queijo", "Tortitas com manteiga amendoim", "Iogurte, 2 marinheiras, Babybel"], "TE": ["Iogurte sólido, banana e nozes", "Iogurte sólido + tosta queijo", "Iogurte, uvas e gressinos", "Iogurte, maçã e Babybel", "Iogurte, pêra, 2 marinheiras", "Iogurte líquido, 4 marinheiras", "Banana com nozes (10 g)", "Iogurte líquido + crackers", "Compal com bolachas belgas"]};
const LKM = { P: "P", R: "MA", C: "MA", E: "ME", A: "A", TR: "TA", TC: "TA", TE: "TE", J: "J" };
const DIAS = ["sábado", "domingo", "segunda", "terça", "quarta", "quinta", "sexta"];
const WHO = [["Ricardo", "R", "TR"], ["Carolina", "C", "TC"], ["Ema", "E", "TE"]];
const FRUTA = "banana · pera · pêssego · laranja · tangerinas · kiwis · frutos vermelhos · maçã";
const sabadoDe = (iso) => somaDias(iso, -((deIso(iso).getDay() + 1) % 7));
const proxSabado = () => somaDias(hoje(), (6 - new Date().getDay() + 7) % 7);
const E = { ini: null, dia: null, sel: {}, ideias: {} };

async function vEmenta(el) {
  if (!E.ini) { const a = await store.getDoc("ementa-atual"); E.ini = (a && a.inicio) || proxSabado(); }
  if (E.dia == null) { const n = Math.round((deIso(hoje()) - deIso(E.ini)) / 86400000); E.dia = n >= 0 && n < 7 ? n : 0; }
  const [s, i] = await Promise.all([store.getDoc("ementa-" + E.ini), store.getDoc("ementa-ideias")]);
  E.sel = (s && s.sel) || {};
  E.ideias = (i && i.ideias) || {};
  desenharEmenta(el);
}

function slotHtml(k, label, pessoa) {
  const lk = LKM[k], key = E.dia + k, v = E.sel[key] || "";
  const lista = O[lk].concat(E.ideias[lk] || []);
  const opts = (v && !lista.includes(v) ? [v] : []).concat(lista);
  return `<div class="slot"><div class="${pessoa ? "pessoa" : "ref"}">${label}</div>
    <select data-k="${k}" aria-label="${label}"><option value="">Escolher…</option>${opts.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>
    <div class="linha"><input data-ideia="${k}" placeholder="ou escrever a minha ideia" aria-label="Escrever a minha ideia para ${label}"><button class="pri" data-usar="${k}">Usar</button></div>
    ${k === "A" || k === "J" ? `<label class="chk"><input type="checkbox" data-sal="${k}" ${E.sel[E.dia + k + "S"] ? "checked" : ""}> Fazer salada</label>` : ""}</div>`;
}

function ementaLeitura(el) {
  const v = (k) => E.sel[E.dia + k];
  const pv = (t) => (t ? esc(t) : `<span class="vazio">—</span>`);
  const linha = (lbl, html) => `<div class="ref-linha"><span class="ref-l">${lbl}</span><span class="ref-t">${html}</span></div>`;
  const lanche = (ix) => { const l = WHO.filter((w) => v(w[ix])); return l.length ? l.map((w) => `<span class="quem">${w[0]}</span> ${esc(v(w[ix]))}`).join("<br>") : `<span class="vazio">—</span>`; };
  el.innerHTML = `<div class="cab"><div><h1>Ementa semanal</h1><div class="sub2">${dm(E.ini)} a ${dm(somaDias(E.ini, 6))}</div></div>
    <div class="semana"><button class="sec peq" data-sem="-7" aria-label="Semana anterior">◀</button><button class="sec peq" data-sem="7" aria-label="Semana seguinte">▶</button>
    <button class="sec" id="imprimir">Imprimir semana</button></div></div>
  <div class="dias" role="tablist">${DIAS.map((d, i) => `<button role="tab" aria-selected="${i === E.dia}" data-dia="${i}">${cap(d).slice(0, 3)} ${deIso(somaDias(E.ini, i)).getDate()}</button>`).join("")}</div>
  <section class="hoje"><h2 class="dia-tit">${DIAS[E.dia]} · ${dm(somaDias(E.ini, E.dia))}</h2>
    ${linha("Pequeno-almoço", pv(v("P")))}${linha("Meio da manhã", lanche(1))}${linha("Almoço", pv(v("A")) + (v("AS") ? ` <span class="tag">+ salada</span>` : ""))}${linha("Meio da tarde", lanche(2))}${linha("Jantar", pv(v("J")) + (v("JS") ? ` <span class="tag">+ salada</span>` : ""))}
  </section>`;
  el.onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.dia != null) { E.dia = +b.dataset.dia; return ementaLeitura(el); }
    if (b.dataset.sem != null) { E.ini = somaDias(E.ini, +b.dataset.sem); E.dia = 0; return render(); }
    if (b.id === "imprimir") imprimirEmenta();
  };
}

function desenharEmenta(el) {
  if (CRIANCA()) return ementaLeitura(el);
  const feitas = Object.entries(E.sel).filter(([k, v]) => v && !/S$/.test(k)).length;
  el.innerHTML = `<div class="cab"><div><h1>Ementa semanal</h1><div class="sub2">${dm(E.ini)} a ${dm(somaDias(E.ini, 6))} · ${feitas} de 63 escolhas feitas</div></div>
    <div class="semana">
      <button class="sec peq" data-sem="-7" aria-label="Semana anterior">◀</button>
      <label class="mes">Sábado <input type="date" id="ini" value="${E.ini}" aria-label="Início da semana (sábado)"></label>
      <button class="sec peq" data-sem="7" aria-label="Semana seguinte">▶</button>
      <button class="sec" id="copiar">Copiar semana anterior</button>
      <button class="sec" id="imprimir">Imprimir semana</button>
      <button class="pri" id="gerar-compras">🛒 Lista de compras da semana</button>
    </div></div>
  <div class="dias" role="tablist">${DIAS.map((d, i) => `<button role="tab" aria-selected="${i === E.dia}" data-dia="${i}">${cap(d).slice(0, 3)} ${deIso(somaDias(E.ini, i)).getDate()}</button>`).join("")}</div>
  <h2 class="dia-tit">${DIAS[E.dia]} · ${dm(somaDias(E.ini, E.dia))}</h2>
  <div class="ementa">
    <div class="col">${slotHtml("P", "Pequeno-almoço")}${slotHtml("A", "Almoço")}${slotHtml("J", "Jantar")}<div class="fruta"><b>Fruta permitida:</b> ${FRUTA}.</div></div>
    <div class="col"><div class="ref">Meio da manhã</div>${WHO.map((w) => slotHtml(w[1], w[0], 1)).join("")}</div>
    <div class="col"><div class="ref">Meio da tarde</div>${WHO.map((w) => slotHtml(w[2], w[0], 1)).join("")}</div>
  </div>
  <details class="seccao"><summary>Importar da página antiga do menu</summary>
    <p>Na página antiga, abre "Cópia de segurança", copia o texto e cola-o aqui.</p>
    <textarea id="imp" aria-label="Texto da cópia de segurança"></textarea>
    <div><button class="pri" id="importar">Importar</button></div>
  </details>`;

  // grava só as escolhas que mudaram, por cima do que está guardado (não apaga o que outra pessoa mudou entretanto)
  const gravarSel = async (chaves) => {
    try {
      marcarEscrita();
      if (chaves) {
        const atual = ((await store.getDoc("ementa-" + E.ini)) || {}).sel || {};
        chaves.forEach((k) => { atual[k] = E.sel[k]; });
        E.sel = atual;
      }
      await store.setDoc("ementa-" + E.ini, { sel: E.sel }); aviso("Gravado");
    } catch (e) { erro(e); }
  };
  const mudarSemana = async (ini) => {
    E.ini = sabadoDe(ini);
    try { await store.setDoc("ementa-atual", { inicio: E.ini }); } catch (e) {}
    vEmenta(el);
  };
  const usar = async (k) => {
    const inp = $(`[data-ideia="${k}"]`, el), t = inp.value.trim();
    if (!t) return inp.focus();
    const lk = LKM[k], l = E.ideias[lk] || [];
    if (!O[lk].includes(t) && !l.includes(t)) {
      try {
        const atual = ((await store.getDoc("ementa-ideias")) || {}).ideias || {};
        atual[lk] = [...new Set([...(atual[lk] || []), ...l, t])];
        E.ideias = atual; marcarEscrita();
        await store.setDoc("ementa-ideias", { ideias: E.ideias });
      } catch (e) { erro(e); }
    }
    E.sel[E.dia + k] = t;
    await gravarSel([E.dia + k]);
    desenharEmenta(el);
  };

  el.onchange = (e) => {
    const t = e.target;
    if (t.dataset.k) { const k = E.dia + t.dataset.k; E.sel[k] = t.value; gravarSel([k]).then(() => desenharEmenta(el)); desenharEmenta(el); }
    else if (t.dataset.sal) { const k = E.dia + t.dataset.sal + "S"; E.sel[k] = t.checked ? "1" : ""; gravarSel([k]); }
    else if (t.id === "ini" && t.value) mudarSemana(t.value);
  };
  el.onclick = async (e) => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.dia) { E.dia = +t.dataset.dia; desenharEmenta(el); }
    else if (t.dataset.sem) mudarSemana(somaDias(E.ini, +t.dataset.sem));
    else if (t.dataset.usar) usar(t.dataset.usar);
    else if (t.id === "imprimir") imprimirEmenta();
    else if (t.id === "gerar-compras") comprasDaEmenta();
    else if (t.id === "copiar") {
      const ant = await store.getDoc("ementa-" + somaDias(E.ini, -7));
      if (!ant || !ant.sel || !Object.values(ant.sel).some(Boolean)) return aviso("A semana anterior está vazia");
      if (Object.values(E.sel).some(Boolean) && !confirm("Substituir as escolhas desta semana pelas da semana anterior?")) return;
      E.sel = { ...ant.sel }; await gravarSel(); desenharEmenta(el);
    } else if (t.id === "importar") {
      try {
        const d = JSON.parse($("#imp", el).value);
        const ideias = { ...E.ideias };
        Object.keys(d.ideas || {}).forEach((k) => { ideias[k] = [...new Set([...(ideias[k] || []), ...d.ideas[k]])]; });
        E.ideias = ideias;
        await store.setDoc("ementa-ideias", { ideias });
        if (d.sel && d.inicio) { await store.setDoc("ementa-" + d.inicio, { sel: d.sel }); E.ini = null; await store.setDoc("ementa-atual", { inicio: d.inicio }); }
        aviso("Importado"); E.dia = null; vEmenta(el);
      } catch (err) { aviso("O texto colado não é válido"); }
    }
  };
  el.onkeydown = (e) => { if (e.key === "Enter" && e.target.dataset.ideia) { e.preventDefault(); usar(e.target.dataset.ideia); } };
}


// Encolhe a letra da folha da ementa até tudo caber numa página A4 deitada
function ajustarFolha() {
  const caixa = $("#folha"), f = $(".folha", caixa);
  if (!f) return;
  const antes = caixa.getAttribute("style") || "";
  caixa.setAttribute("style", "display:block;position:absolute;left:-10000px;top:0");
  const tab = $("table", f), tit = $(".ftit", f);
  let fs = 9.5;
  f.style.setProperty("--fs", fs + "pt");
  while (fs > 6 && tab.scrollHeight + tit.offsetHeight > f.clientHeight + 1) { fs -= 0.25; f.style.setProperty("--fs", fs + "pt"); }
  caixa.setAttribute("style", antes);
}
function imprimir(html, orientacao) {
  $("#folha").innerHTML = html;
  let st = $("#pag-css");
  if (!st) { st = document.createElement("style"); st.id = "pag-css"; document.head.appendChild(st); }
  st.textContent = orientacao === "retrato" ? "@page{size:A4 portrait;margin:12mm 14mm}" : "@page{size:A4 landscape;margin:8mm}";
  if (orientacao !== "retrato") ajustarFolha();
  window.print();
}
const LETRAS = "abcdefgh";
function htmlFichaPapel(d, f) {
  const linhas = (n) => Array.from({ length: n }, () => `<div class="fp-linha"></div>`).join("");
  const q = f.q.map((x) => `<li><p>${esc(x.p)}</p>${
    x.t === "mc" ? `<div class="fp-ops">${x.o.map((o, j) => `<div class="fp-op"><span class="fp-cx"></span>${LETRAS[j]}) ${esc(o)}</div>`).join("")}</div>`
    : x.t === "num" && d.id === "mat" ? `<div class="fp-calcrow"><div class="fp-calc">Cálculos:</div><div class="fp-resp">Resposta:<span class="fp-linha"></span></div></div>`
    : linhas(x.t === "txt" && x.p.length > 60 ? 2 : 1)}</li>`).join("");
  return `<section class="fp">
    <header class="fp-cab"><div><div class="fp-disc" style="color:${d.cor}">${esc(d.nome)} · 5.º ano</div><h2 class="fp-tit">${esc(f.titulo)}</h2><div class="fp-sub">${esc(f.sub)}</div></div>
      <div class="fp-nota">Nota<br><b>____ / ${f.q.length}</b></div></header>
    <div class="fp-dados"><span>Nome: <i class="fp-linha curta larga"></i></span><span>Data: ____/____/______</span></div>
    ${f.texto ? `<div class="fp-texto">${f.texto.split("\n\n").map((p) => `<p>${esc(p)}</p>`).join("")}</div>` : ""}
    <ol class="fp-q">${q}</ol>
    <footer class="fp-pe">A Nossa Casa · Fichas de estudo da Ema</footer></section>`;
}
function htmlSolucoes(lista) {
  return `<section class="fp quebra"><header class="fp-cab"><div><div class="fp-disc">Para os pais</div><h2 class="fp-tit">Soluções</h2></div></header>
    ${lista.map(([d, f]) => `<div class="fp-sol"><h3>${esc(d.nome)} — ${esc(f.titulo)}</h3><ol>${f.q.map((x) => `<li>${x.t === "mc" ? LETRAS[x.c] + ") " : ""}${esc(textoCerto(x))}</li>`).join("")}</ol></div>`).join("")}</section>`;
}
function imprimirFichas(lista, solucoes) {
  imprimir(lista.map(([d, f], i) => htmlFichaPapel(d, f).replace('<section class="fp">', i ? '<section class="fp quebra">' : '<section class="fp">')).join("") + (solucoes ? htmlSolucoes(lista) : ""), "retrato");
}
window.imprimirFichas = imprimirFichas;


/* ---------- lista de compras a partir da ementa ---------- */
const secaoDe = (nome) => { const n = nome.toLowerCase(); const m = (window.SECCAO_DE || []).find(([k]) => n.includes(k)); return m ? m[1] : "Mercearia"; };
function ingredientesBase(prato, extra) {
  if (extra[prato]) return extra[prato];
  const base = (window.INGREDIENTES || {})[prato];
  if (base) return base;
  const n = prato.toLowerCase(), l = [];
  (window.INGREDIENTES_LANCHE || []).forEach(([k, v]) => { if (n.includes(k) && !l.includes(v)) l.push(v); });
  if (n.includes("iogurte") && !l.some((x) => /iogurte/i.test(x))) l.push("Iogurtes");
  return l.length ? l : null;
}
async function comprasDaEmenta() {
  const [docI, compras] = await Promise.all([store.getDoc("ingredientes"), store.list("compras")]);
  let extra = (docI && docI.pratos) || {};
  const pratos = {};
  Object.entries(E.sel).forEach(([k, v]) => { if (v && !/S$/.test(k)) pratos[v] = (pratos[v] || 0) + 1; });
  if (!Object.keys(pratos).length) return aviso("Escolhe primeiro os pratos da semana");
  const jaNaLista = new Set(compras.filter((c) => !c.comprado).map((c) => normTxt(c.nome)));
  const dlg = $("#dlg"); dlg.oncancel = null;
  const desenhar = () => {
    const ing = {}, sem = [];
    Object.keys(pratos).forEach((p) => { const l = ingredientesBase(p, extra); if (l === null) sem.push(p); else l.forEach((i) => { ing[i] = (ing[i] || 0) + pratos[p]; }); });
    const porSec = {}; Object.keys(ing).forEach((i) => { const s2 = secaoDe(i); (porSec[s2] = porSec[s2] || []).push(i); });
    dlg.innerHTML = `<div class="form"><div class="pega" aria-hidden="true"></div><h2>Lista de compras da semana</h2>
      <p class="det" style="margin:0">${dm(E.ini)} a ${dm(somaDias(E.ini, 6))} · desmarca o que já tens em casa.</p>
      ${sem.length ? `<div class="sem-ing"><b>Pratos sem ingredientes definidos</b>${sem.map((p) => `<div class="ing-prato"><span>${esc(p)}</span><button type="button" class="sec peq" data-ed="${esc(p)}">✏️ Definir</button></div>`).join("")}</div>` : ""}
      ${CAT_COMP.filter((c) => porSec[c]).map((c) => `<div class="grupo"><h3>${c}</h3>${porSec[c].sort().map((i) => { const ja = jaNaLista.has(normTxt(i));
        return `<label class="artigo"><input type="checkbox" data-ing="${esc(i)}" ${ja ? "" : "checked"}><span>${esc(i)}</span><span class="q">${ja ? "já está na lista" : ing[i] > 1 ? "×" + ing[i] : ""}</span></label>`; }).join("")}</div>`).join("")}
      <details class="seccao"><summary>Ver e editar os ingredientes de cada prato</summary>
        ${Object.keys(pratos).map((p) => { const l = ingredientesBase(p, extra) || [];
          return `<div class="ing-prato"><span><b>${esc(p)}</b><br><span class="det">${l.length ? esc(l.join(", ")) : "sem ingredientes"}</span></span><button type="button" class="sec peq" data-ed="${esc(p)}">✏️</button></div>`; }).join("")}
      </details>
      <div class="acoes"><span class="esp"></span><button type="button" class="sec" data-a="fechar">Cancelar</button><button type="button" class="pri" data-a="juntar">Juntar à lista</button></div></div>`;
    const atual = () => $$("[data-ing]:checked", dlg).length;
    const bJ = $("[data-a=juntar]", dlg);
    const rot = () => { bJ.textContent = `Juntar ${atual()} à lista`; bJ.disabled = !atual(); };
    rot(); dlg.onchange = rot;
    $("[data-a=fechar]", dlg).onclick = () => dlg.close();
    $$("[data-ed]", dlg).forEach((b) => (b.onclick = () => editarIngredientes(b.dataset.ed)));
    bJ.onclick = async () => {
      const escolhidos = $$("[data-ing]:checked", dlg).map((x) => x.dataset.ing);
      bJ.disabled = true; bJ.textContent = "A juntar…";
      try {
        for (const i of escolhidos) await store.add("compras", { nome: i, qtd: ing[i] > 1 ? "×" + ing[i] : "", cat: secaoDe(i), comprado: false });
        dlg.close(); aviso(`${escolhidos.length} ${escolhidos.length === 1 ? "artigo junto" : "artigos juntos"} à lista de compras`);
        location.hash = "#compras";
      } catch (err) { erro(err); rot(); }
    };
  };
  const editarIngredientes = (prato) => {
    const atual = ingredientesBase(prato, extra) || [];
    dlg.innerHTML = `<div class="form"><h2>Ingredientes</h2><p style="margin:0"><b>${esc(prato)}</b></p>
      <label class="campo"><span>Um ingrediente por linha</span><textarea rows="8" id="ing-txt">${esc(atual.join("\n"))}</textarea></label>
      <p class="det" style="margin:0">Fica guardado para as próximas semanas.</p>
      <div class="acoes"><span class="esp"></span><button type="button" class="sec" data-a="voltar">Voltar</button><button type="button" class="pri" data-a="ok">Guardar</button></div></div>`;
    $("[data-a=voltar]", dlg).onclick = desenhar;
    $("[data-a=ok]", dlg).onclick = async () => {
      extra = { ...extra, [prato]: $("#ing-txt", dlg).value.split("\n").map((x) => x.trim()).filter(Boolean) };
      try { await store.setDoc("ingredientes", { pratos: extra }); aviso("Ingredientes guardados"); } catch (err) { erro(err); }
      desenhar();
    };
    $("#ing-txt", dlg).focus();
  };
  desenhar();
  dlg.showModal();
}

function imprimirEmenta() {
  const sel = E.sel, ini = E.ini;
  const pess = (i, ix) => WHO.filter((w) => sel[i + w[ix]]).map((w) => `<div><b>${w[0]}:</b> ${esc(sel[i + w[ix]])}</div>`).join("");
  const ref = (i, k) => esc(sel[i + k] || "") + (sel[i + k + "S"] ? `<div class="sal">(fazer salada)</div>` : "");
  const linhas = DIAS.map((d, i) => `<tr><th>${cap(d)}<br>${dm(somaDias(ini, i))}</th><td>${esc(sel[i + "P"] || "")}</td><td>${pess(i, 1)}</td><td>${ref(i, "A")}</td><td>${pess(i, 2)}</td><td>${ref(i, "J")}</td></tr>`).join("");
  const html = `<div class="folha"><div class="ftit">Menu Semanal - ${dm(ini)} a ${dm(somaDias(ini, 6))}</div>
    <table><colgroup><col style="width:21mm"><col style="width:16%"><col style="width:21%"><col style="width:13%"><col style="width:23%"><col></colgroup>
    <thead><tr><th></th><th>Pequeno-Almoço</th><th>Meio da manhã</th><th>Almoço</th><th>Meio da tarde</th><th>Jantar</th></tr></thead>
    <tbody>${linhas}</tbody></table></div>`;
  imprimir(html, "paisagem");
}

/* =====================================================================
   COMPRAS
   ===================================================================== */
let ultimaCat = "";
/* ---------- comparação de preços (documento "precos-compras", escrito pelo n8n) ---------- */
const NOME_LOJA = { continente: "Continente", pingodoce: "Pingo Doce", lidl: "Lidl" };
function blocoPrecos(doc, falta) {
  const cabec = `<div class="sec-cab"><h2>💶 Onde fica mais barato</h2></div>`;
  if (!doc || !doc.artigos) return `<section class="seccao precos">${cabec}<p class="vazio">Os preços aparecem aqui uns minutos depois de mudares a lista (o PC com o n8n tem de estar ligado).</p></section>`;
  const lojas = doc.lojas || Object.keys(NOME_LOJA);
  const nomes = falta.map((i) => String(i.nome).trim()).filter((n) => doc.artigos[n]);
  const faltam = falta.length - nomes.length;
  if (!nomes.length) return `<section class="seccao precos">${cabec}<p class="vazio">A calcular os preços da lista… volta daqui a uns minutos.</p></section>`;
  const P = (n, l) => doc.artigos[n].lojas[l];
  const min = (n) => { const ps = lojas.map((l) => P(n, l)).filter(Boolean).map((p) => p.preco); return ps.length ? Math.min(...ps) : null; };
  const soma = (l, lista) => lista.reduce((s, n) => s + (P(n, l) ? P(n, l).preco : 0), 0);
  // 1) comparação justa: só os artigos que as 3 lojas têm
  const comuns = nomes.filter((n) => lojas.every((l) => P(n, l)));
  const tc = Object.fromEntries(lojas.map((l) => [l, soma(l, comuns)]));
  const ordem = [...lojas].sort((a, b) => tc[a] - tc[b]);
  const melhor = comuns.length ? ordem[0] : null;
  // 2) o plano mais barato: cada artigo na loja onde está mais barato
  const plano = Object.fromEntries(lojas.map((l) => [l, []])), semPreco = [];
  nomes.forEach((n) => { const m = min(n); if (m === null) return semPreco.push(n); const l = lojas.find((x) => P(n, x) && P(n, x).preco === m); plano[l].push(n); });
  const totPlano = lojas.reduce((s, l) => s + soma(l, plano[l]), 0);
  const chip = (n, l) => `<span class="chip">${esc(n)} <b>${euro(P(n, l).preco)}</b></span>`;
  // 3) tabela artigo a artigo
  const cel = (n, l) => { const p = P(n, l); if (!p) return `<td class="nada">—</td>`;
    const tit = [p.marca, p.nome, p.qtd, p.unit].filter(Boolean).join(" · ") + (p.plus ? " · preço com Lidl Plus" : "");
    return `<td class="${p.preco === min(n) ? "barato" : ""}"><a href="${esc(p.url)}" target="_blank" rel="noopener" title="${esc(tit)}">${euro(p.preco)}${p.plus ? "*" : ""}</a><span class="det">${esc(p.qtd || "")}</span></td>`; };
  const quando = doc.atualizado ? Math.round((Date.now() - Date.parse(doc.atualizado)) / 60000) : null;
  return `<section class="seccao precos">${cabec}
    ${melhor ? `<div class="veredito"><span class="trofeu">🏆</span><div><b>O ${NOME_LOJA[melhor]} é o mais barato.</b>
      <span class="det">Comparando os mesmos ${comuns.length} ${comuns.length === 1 ? "artigo" : "artigos"} que há nas 3 lojas: ${ordem.map((l, k) => `${NOME_LOJA[l]} <b>${euro(tc[l])}</b>${k ? ` (+${euro(tc[l] - tc[melhor])})` : ""}`).join(" · ")}.</span></div></div>`
      : `<p class="det">Ainda não há artigos que existam nas 3 lojas para dizer qual é a mais barata.</p>`}
    <details class="plano-d"><summary><span>🔀 Para poupar ao máximo: <b>${euro(totPlano)}</b> em ${lojas.filter((l) => plano[l].length).length} ${lojas.filter((l) => plano[l].length).length === 1 ? "loja" : "lojas"}</span><span class="det">ver o que comprar em cada loja</span></summary>
    <div class="plano">${lojas.filter((l) => plano[l].length).map((l) => `<div class="plano-l"><div class="plano-cab"><b>${NOME_LOJA[l]}</b><span>${plano[l].length} ${plano[l].length === 1 ? "artigo" : "artigos"} · <b>${euro(soma(l, plano[l]))}</b></span></div><p class="chips">${plano[l].map((n) => chip(n, l)).join("")}</p></div>`).join("")}
      <div class="plano-tot">Total: <b>${euro(totPlano)}</b> por ${nomes.length - semPreco.length} artigos</div>
      ${semPreco.length ? `<p class="det">Sem preço em nenhuma loja (${semPreco.length}): ${semPreco.map(esc).join(", ")}.</p>` : ""}</div></details>
    <details><summary>Ver todos os preços, artigo a artigo</summary><div class="tab-precos"><table><thead><tr><th>Artigo</th>${lojas.map((l) => `<th>${NOME_LOJA[l]}</th>`).join("")}</tr></thead>
      <tbody>${nomes.map((n) => `<tr><th>${esc(n)}${doc.artigos[n].nota ? `<span class="det">${esc(doc.artigos[n].nota)}</span>` : ""}</th>${lojas.map((l) => cel(n, l)).join("")}</tr>`).join("")}</tbody></table></div>
      <p class="det">✓ verde = mais barato. Toca num preço para ver o produto no site da loja. * preço com Lidl Plus. Preços das lojas online (no Lidl, os da loja desta semana); em Tomar podem variar. ${(doc.fora || []).map(esc).join(" · ")}.</p></details>
    <p class="det" style="margin:0">${quando === null ? "" : quando < 2 ? "Atualizado agora" : quando < 120 ? `Atualizado há ${quando} min` : `Atualizado ${fmtData(doc.atualizado.slice(0, 10))}`}${faltam ? ` · ${faltam} ${faltam === 1 ? "artigo novo ainda" : "artigos novos ainda"} a calcular` : ""}</p>
  </section>`;
}

async function vCompras(el) {
  const col = COLS.compras;
  const itens = (await store.list("compras")).sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
  const falta = itens.filter((i) => !i.comprado), feitos = itens.filter((i) => i.comprado);
  const so = CRIANCA();
  const linha = (i) => so ? `<div class="artigo ${i.comprado ? "feito" : ""}"><label><span>${i.comprado ? "✓ " : "• "}${esc(i.nome)}</span>${i.qtd ? `<span class="q">${esc(i.qtd)}</span>` : ""}</label></div>`
    : `<div class="artigo ${i.comprado ? "feito" : ""}"><label><input type="checkbox" data-t="${esc(i.id)}" ${i.comprado ? "checked" : ""}><span>${esc(i.nome)}</span>${i.qtd ? `<span class="q">${esc(i.qtd)}</span>` : ""}</label><button class="sec peq" data-e="${esc(i.id)}" aria-label="Editar ${esc(i.nome)}">Editar</button></div>`;
  const grupos = [...CAT_COMP, ""].map((c) => { const g = falta.filter((i) => (i.cat || "") === c || (c === "Outros" && i.cat && !CAT_COMP.includes(i.cat))); return g.length ? `<div class="grupo"><h3>${esc(c || "Sem secção")}</h3>${g.map(linha).join("")}</div>` : ""; }).join("");
  el.innerHTML = `${cab("Lista de compras", `${falta.length} por comprar`)}
    <form class="rapido" id="rapido"><input name="nome" placeholder="Adicionar artigo (ex: leite)" aria-label="Artigo" autocomplete="off">
      <input name="qtd" class="qtd" placeholder="Qtd." aria-label="Quantidade">
      <select name="cat" aria-label="Secção"><option value="">Secção…</option>${CAT_COMP.map((c) => `<option ${c === ultimaCat ? "selected" : ""}>${c}</option>`).join("")}</select>
      <button class="pri">Adicionar</button></form>
    <section class="seccao">${grupos || `<p class="vazio">A lista está vazia.</p>`}
      ${feitos.length && !so ? `<div class="grupo"><h3>Já no carrinho</h3>${feitos.map(linha).join("")}</div><div><button class="sec" id="limpar">Limpar comprados (${feitos.length})</button></div>` : ""}
    </section>`;
  const f = $("#rapido", el);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const nome = f.nome.value.trim(); if (!nome) return f.nome.focus();
    ultimaCat = f.cat.value;
    try { await store.add("compras", { nome, qtd: f.qtd.value.trim(), cat: f.cat.value, comprado: false }); await render(); $("#rapido input[name=nome]")?.focus(); } catch (err) { erro(err); }
  };
  if (so) return;
  if (falta.length) el.insertAdjacentHTML("beforeend", blocoPrecos(await store.getDoc("precos-compras").catch(() => null), falta));
  el.onchange = async (e) => {
    const id = e.target.dataset.t; if (!id) return;
    const it = itens.find((x) => x.id === id);
    try { await store.update(id, { ...semId(it), comprado: e.target.checked }); render(); } catch (err) { erro(err); }
  };
  el.onclick = async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.e) abrirForm(col, itens.find((x) => x.id === b.dataset.e));
    if (b.id === "limpar") { try { await Promise.all(feitos.map((i) => store.remove(i.id))); aviso("Lista limpa"); render(); } catch (err) { erro(err); } }
  };
}


/* ---------- feriados e dias úteis ---------- */
const FERIADOS = {
  "2026-01-01": "Ano Novo", "2026-04-03": "Sexta-feira Santa", "2026-04-05": "Páscoa", "2026-04-25": "Dia da Liberdade", "2026-05-01": "Dia do Trabalhador",
  "2026-06-04": "Corpo de Deus", "2026-06-10": "Dia de Portugal", "2026-08-15": "Assunção de Nossa Senhora", "2026-10-05": "Implantação da República",
  "2026-11-01": "Todos os Santos", "2026-12-01": "Restauração da Independência", "2026-12-08": "Imaculada Conceição", "2026-12-25": "Natal",
  "2027-01-01": "Ano Novo", "2027-03-01": "Feriado municipal de Tomar", "2027-03-26": "Sexta-feira Santa", "2027-03-28": "Páscoa", "2027-04-25": "Dia da Liberdade",
  "2027-05-01": "Dia do Trabalhador", "2027-05-27": "Corpo de Deus", "2027-06-10": "Dia de Portugal", "2027-08-15": "Assunção de Nossa Senhora",
  "2027-10-05": "Implantação da República", "2027-11-01": "Todos os Santos", "2027-12-01": "Restauração da Independência", "2027-12-08": "Imaculada Conceição", "2027-12-25": "Natal",
};
function diasUteis(a, b) {
  if (!a || !b || b < a) return 0;
  let n = 0;
  for (let d = a; d <= b; d = somaDias(d, 1)) { const w = deIso(d).getDay(); if (w !== 0 && w !== 6 && !FERIADOS[d]) n++; }
  return n;
}
const DIAS_FERIAS = 22;

/* =====================================================================
   DESPESAS, VEÍCULOS, CASA, FAMÍLIA, MÉDICOS
   ===================================================================== */

/* ---------- contas fixas lançadas automaticamente nas despesas ---------- */
const contaDevida = (c, mes) => {
  const p = PERIODO[c.periodo] || 1, ini = c.inicio;
  if (!ini) return p === 1;
  const dif = (+mes.slice(0, 4) - +ini.slice(0, 4)) * 12 + (+mes.slice(5, 7) - +ini.slice(5, 7));
  return dif >= 0 && dif % p === 0;
};
/* ---------- despesas marcadas como fixas: copiam-se sozinhas para o mês atual ---------- */
// fim dos contratos/fidelizações das despesas (ex: Vodafone): avisa 2 meses antes.
// As despesas fixas repetem-se todos os meses; conta só a mais recente de cada série.
function alertasContratos(despesas) {
  const ult = {};
  despesas.filter((d) => d.fimContrato).forEach((d) => { const k = d.serie || d.id; if (!ult[k] || String(d.data) > String(ult[k].data)) ult[k] = d; });
  return Object.values(ult).map((d) => {
    const tipo = d.fimTipo || "Contrato", fem = tipo === "Fidelização";
    const a = alertaData(d.fimContrato, "Fim " + (fem ? "da " : "do ") + tipo.toLowerCase(), 60);
    if (!a || a.dias < -30) return null;
    const dica = tipo === "Desconto" ? "pedir novo desconto ou comparar operadoras" : "altura de negociar ou mudar";
    return { ...a, texto: a.dias < 0 ? `${tipo} acabou a ${fmtData(d.fimContrato)} · ${rel(a.dias)} — ${tipo === "Desconto" ? "a fatura pode subir" : "rever o tarifário"}` : `${a.texto} — ${dica}`, rota: "despesas", tit: d.desc || d.cat, ico: CAT_ICO[d.cat] || "euro" };
  }).filter(Boolean);
}

async function lancarDespesasFixas() {
  const desp = await store.list("despesas");
  const series = {};
  desp.forEach((d) => { if (!d.fixa && !d.serie) return; const k = d.serie || d.id; (series[k] = series[k] || []).push(d); });
  const mes = hoje().slice(0, 7);
  let n = 0;
  for (const [serie, l] of Object.entries(series)) {
    l.sort((a, b) => String(a.data).localeCompare(String(b.data)));
    const ult = l[l.length - 1];
    if (!ult.fixa || !ult.data || ult.data.slice(0, 7) >= mes) continue; // desmarcada, ou já lançada este mês
    const ultimoDia = new Date(+mes.slice(0, 4), +mes.slice(5, 7), 0).getDate();
    const data = `${mes}-${pad(Math.min(+ult.data.slice(8, 10) || 1, ultimoDia))}`;
    if (data > hoje()) continue; // só no dia certo
    const { id, anexos, pasta, ...resto } = ult;
    await store.add("despesas", { ...resto, data, fixa: true, serie, auto: true, notas: resto.notas || "" });
    n++;
  }
  if (n) { aviso(`${n} ${n === 1 ? "despesa fixa lançada" : "despesas fixas lançadas"} este mês`); render(); }
}

async function lancarContas() {
  const contas = (await store.list("contas")).filter((c) => c.lancar !== false && +c.valor > 0);
  if (!contas.length) return;
  const mes = hoje().slice(0, 7);
  const desp = await store.list("despesas");
  const ja = new Set(desp.filter((d) => d.conta_id).map((d) => d.conta_id + "|" + String(d.data || "").slice(0, 7)));
  let n = 0;
  for (const c of contas) {
    if (!contaDevida(c, mes)) continue;
    const ultimoDia = new Date(+mes.slice(0, 4), +mes.slice(5, 7), 0).getDate();
    const dia = Math.min(Math.max(1, +c.dia || 1), ultimoDia);
    const data = `${mes}-${pad(dia)}`;
    if (data > hoje() || ja.has(c.id + "|" + mes)) continue;
    await store.add("despesas", { data, desc: c.nome, cat: "Contas (luz, água, gás, net)", valor: +c.valor, quem: c.quem || "", notas: "Lançada automaticamente a partir das contas fixas", conta_id: c.id, auto: true });
    n++;
  }
  if (n) { aviso(`${n} ${n === 1 ? "conta fixa lançada" : "contas fixas lançadas"} nas despesas`); render(); }
}

let mesDesp = hoje().slice(0, 7);
const mesSeguinte = (m) => somaMeses(m + "-01", 1).slice(0, 7);
const nomeDoMes = (m) => cap(deIso(m + "-01").toLocaleDateString("pt-PT", { month: "long", year: "numeric" }));
function resumoDespesas(vis) {
  if (!vis.length) return "";
  const tot = vis.reduce((s, d) => s + (+d.valor || 0), 0);
  const porCat = {}; vis.forEach((d) => { const c = d.cat || "Sem categoria"; porCat[c] = (porCat[c] || 0) + (+d.valor || 0); });
  const porQuem = {}; vis.forEach((d) => { if (d.quem) porQuem[d.quem] = (porQuem[d.quem] || 0) + (+d.valor || 0); });
  const max = Math.max(...Object.values(porCat), 1);
  return `<div class="resumo"><div class="total">Total: ${euro(tot)}</div>
    ${Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<div class="barra"><span>${esc(c)}</span><span class="b"><i style="width:${(v / max) * 100}%"></i></span><b>${euro(v)}</b></div>`).join("")}
    ${Object.keys(porQuem).length ? `<div class="det">${Object.entries(porQuem).map(([q, v]) => `${esc(q)}: ${euro(v)}`).join(" · ")}</div>` : ""}</div>`;
}

function blocoOrcamento(todas, orc, mes) {
  const doMes = todas.filter((d) => String(d.data || "").startsWith(mes));
  const gasto = {}; doMes.forEach((d) => { const c = d.cat || "Outros"; gasto[c] = (gasto[c] || 0) + (+d.valor || 0); });
  const cats = CAT_DESP.filter((c) => orc[c] > 0 || gasto[c]);
  const totO = Object.values(orc).reduce((s, v) => s + (+v || 0), 0), totG = doMes.reduce((s, d) => s + (+d.valor || 0), 0);
  const cor = (p) => (p > 1 ? "vermelho" : p >= 0.8 ? "laranja" : "verde");
  const linha = (c) => {
    const g = gasto[c] || 0, o = +orc[c] || 0;
    if (!o) return `<div class="orc-l"><div class="orc-t"><span>${esc(c)}</span><span class="det">${euro(g)} · sem orçamento</span></div></div>`;
    const p = g / o;
    return `<div class="orc-l"><div class="orc-t"><span>${esc(c)}</span><span class="det"><b>${euro(g)}</b> de ${euro(o)}${p > 1 ? ` · <span class="txt-v">+${euro(g - o)}</span>` : ` · faltam ${euro(o - g)}`}</span></div>
      <div class="orc-b"><i class="${cor(p)}" style="width:${Math.min(100, p * 100)}%"></i></div></div>`;
  };
  // últimos 6 meses
  const meses = Array.from({ length: 6 }, (_, i) => somaMeses(mes + "-01", i - 5).slice(0, 7));
  const tot = meses.map((m) => todas.filter((d) => String(d.data || "").startsWith(m)).reduce((s, d) => s + (+d.valor || 0), 0));
  const max = Math.max(...tot, totO, 1);
  const abrev = (m) => deIso(m + "-01").toLocaleDateString("pt-PT", { month: "short" }).replace(".", "");
  return `<section class="seccao"><div class="sec-cab"><h2>Orçamento · ${nomeDoMes(mes)}</h2><button type="button" class="sec peq" id="orc-def">${totO ? "Alterar" : "Definir orçamento"}</button></div>
    ${totO ? `<div class="orc-tot"><div><span class="total">${euro(totG)}</span> <span class="det">de ${euro(totO)}</span></div><div class="orc-b g"><i class="${cor(totG / totO)}" style="width:${Math.min(100, (totG / totO) * 100)}%"></i></div></div>`
      : `<p class="det" style="margin:0">Define quanto querem gastar por mês em cada categoria e a app avisa quando estiverem perto do limite.</p>`}
    ${cats.length ? cats.map(linha).join("") : ""}
    <div class="hist"><div class="det">Últimos 6 meses</div><div class="hist-b">${meses.map((m, i) => `<div class="hb ${m === mes ? "atual" : ""}" title="${nomeDoMes(m)}: ${euro(tot[i])}"><span class="hv">${tot[i] ? Math.round(tot[i]) + "€" : ""}</span><i style="height:${(tot[i] / max) * 100}%"></i><span class="hm">${abrev(m)}</span></div>`).join("")}</div>
    ${totO ? `<div class="det">Linha do orçamento: ${euro(totO)}</div>` : ""}</div></section>`;
}
function definirOrcamento(orc) {
  const dlg = $("#dlg"); dlg.oncancel = null;
  dlg.innerHTML = `<form class="form"><div class="pega" aria-hidden="true"></div><h2>Orçamento mensal</h2>
    <p class="det" style="margin:0">Quanto querem gastar, no máximo, por mês em cada categoria. Deixa em branco as que não interessam.</p>
    <div class="orc-grid">${CAT_DESP.map((c) => `<label class="campo"><span>${esc(c)}</span><input inputmode="decimal" name="${esc(c)}" value="${orc[c] ? String(orc[c]).replace(".", ",") : ""}" placeholder="—"></label>`).join("")}</div>
    <div class="acoes"><span class="esp"></span><button type="button" class="sec" data-a="fechar">Cancelar</button><button class="pri">Guardar</button></div></form>`;
  const f = $("form", dlg);
  $("[data-a=fechar]", f).onclick = () => dlg.close();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const cat = {}; CAT_DESP.forEach((c) => { const n = lerNum(f.elements.namedItem(c).value); if (n) cat[c] = n; });
    try { await store.setDoc("orcamento", { cat }); dlg.close(); aviso("Orçamento guardado"); render(); } catch (err) { erro(err); }
  };
  dlg.showModal();
}

async function vDespesas(el) {
  const m1 = mesDesp, m2 = mesSeguinte(m1), atual = m1 === hoje().slice(0, 7);
  el.innerHTML = `<div class="cab"><div><h1>Despesas</h1><div class="sub2">${nomeDoMes(m1)} e ${nomeDoMes(m2).toLowerCase()}</div></div>
    <div class="semana"><button class="sec peq" data-m="-1" aria-label="Mês anterior">◀</button>
      <label class="mes"><input type="month" id="mes" value="${m1}" aria-label="Primeiro mês"></label>
      <button class="sec peq" data-m="1" aria-label="Mês seguinte">▶</button>
      ${atual ? "" : `<button class="sec peq" data-m="0">Este mês</button>`}</div></div>`;
  $("#mes", el).onchange = (e) => { mesDesp = e.target.value || hoje().slice(0, 7); render(); };
  el.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => { const n = +b.dataset.m; mesDesp = n === 0 ? hoje().slice(0, 7) : somaMeses(mesDesp + "-01", n).slice(0, 7); render(); }));
  const colMes = (m) => ({
    ...COLS.despesas,
    nome: nomeDoMes(m),
    vazio: m > hoje().slice(0, 7) ? "Ainda sem despesas previstas para este mês." : "Sem despesas neste mês.",
    campos: COLS.despesas.campos.map((c) => (c.k === "data" ? { ...c, def: () => (m === hoje().slice(0, 7) ? hoje() : m + "-01") } : c)),
  });
  const [todas, docO] = await Promise.all([store.list("despesas"), store.getDoc("orcamento")]);
  const orc = (docO && docO.cat) || {};
  el.insertAdjacentHTML("beforeend", blocoOrcamento(todas, orc, m1));
  $("#orc-def", el).onclick = () => definirOrcamento(orc);
  await seccao(el, colMes(m1), { titulo: (atual ? "Este mês · " : "") + nomeDoMes(m1), filtro: (d) => String(d.data || "").startsWith(m1), topo: resumoDespesas });
  await seccao(el, colMes(m2), { titulo: (atual ? "Próximo mês · " : "") + nomeDoMes(m2), filtro: (d) => String(d.data || "").startsWith(m2), topo: resumoDespesas });
}

async function vVeiculos(el) {
  el.innerHTML = cab("Veículos", "Inspeção, seguro, IUC, revisões e reparações. Avisa 30 dias antes.");
  await seccao(el, COLS.veiculos);
  await seccao(el, COLS.manutencoes);
}

async function vCasa(el) {
  el.innerHTML = cab("Casa", "Contas fixas, manutenção e garantias.");
  await seccao(el, COLS.contas, {
    topo: (vis) => { const m = vis.reduce((s, d) => s + (+d.valor || 0) / (PERIODO[d.periodo] || 1), 0); return vis.length ? `<div class="resumo"><div class="total">≈ ${euro(m)} por mês</div><div class="det">Média mensal de todas as contas fixas</div></div>` : ""; },
  });
  await seccao(el, COLS.tarefas);
  await seccao(el, COLS.garantias);
}

async function vFamilia(el) {
  el.innerHTML = cab("Família", "Aniversários, datas da escola e validade de documentos.");
  await seccao(el, COLS.datas);
  await seccao(el, COLS.documentos);
}


/* ---------- calendário escolar da Ema (Agrupamento de Escolas Templários, 2026/27) ---------- */
const CAL_ESCOLAR = [
  { desc: "Início do 1.º semestre", ini: "2026-09-11", tipo: "marco" },
  { desc: "1.ª interrupção", ini: "2026-10-26", fim: "2026-10-30", tipo: "pausa" },
  { desc: "2.ª interrupção (Natal)", ini: "2026-12-23", fim: "2026-12-31", tipo: "pausa" },
  { desc: "Fim do 1.º semestre", ini: "2027-01-29", tipo: "marco" },
  { desc: "3.ª interrupção", ini: "2027-02-01", fim: "2027-02-05", tipo: "pausa" },
  { desc: "4.ª interrupção (Carnaval)", ini: "2027-02-08", fim: "2027-02-10", tipo: "pausa" },
  { desc: "Início do 2.º semestre", ini: "2027-02-11", tipo: "marco" },
  { desc: "Feriado municipal de Tomar", ini: "2027-03-01", tipo: "feriado" },
  { desc: "5.ª interrupção (Páscoa)", ini: "2027-03-25", fim: "2027-04-02", tipo: "pausa" },
  { desc: "Último dia de aulas (5.º ano)", ini: "2027-06-11", tipo: "fim" },
];
function estadoCal(e) {
  const a = diasAte(e.ini), b = diasAte(e.fim || e.ini);
  if (b < 0) return { passou: true };
  if (a <= 0) return { agora: true, texto: e.fim ? `a decorrer, até ${dm(e.fim)}` : "hoje" };
  return { dias: a, texto: rel(a) };
}
function alertasEscolares() {
  return CAL_ESCOLAR.filter((e) => e.tipo === "pausa" || e.tipo === "feriado").map((e) => {
    const st = estadoCal(e);
    if (st.passou) return null;
    if (st.agora) return { nivel: "azul", dias: 0, texto: "Sem aulas, " + st.texto, rota: "escola", tit: "Ema — " + e.desc, ico: "escola" };
    if (st.dias <= 21) return { nivel: st.dias <= 7 ? "laranja" : "azul", dias: st.dias, texto: `${fmtData(e.ini)}${e.fim ? " a " + fmtData(e.fim) : ""} · ${st.texto}`, rota: "escola", tit: "Ema — " + e.desc, ico: "escola" };
    return null;
  }).filter(Boolean);
}
function blocoCalendario() {
  const prox = CAL_ESCOLAR.find((e) => !estadoCal(e).passou);
  const linha = (e) => {
    const st = estadoCal(e);
    const cls = st.passou ? "passou" : e === prox ? "prox" : "";
    const ico = e.tipo === "pausa" ? "lazer" : e.tipo === "feriado" ? "calendario" : e.tipo === "fim" ? "escudo" : "escola";
    return `<div class="cal-l ${cls}"><span class="bolha ${e.tipo === "pausa" && !st.passou ? "azul" : ""}">${svg(ico)}</span>
      <span class="ct"><b>${esc(e.desc)}</b><span class="det">${fmtData(e.ini)}${e.fim ? " a " + fmtData(e.fim) : ""}</span></span>
      ${st.passou ? `<span class="det">já passou</span>` : `<span class="tag ${st.agora ? "" : st.dias <= 7 ? "laranja" : ""}">${esc(st.agora ? "agora" : st.texto)}</span>`}</div>`;
  };
  return `<section class="seccao"><div class="sec-cab"><h2>Calendário escolar 2026/27</h2></div>
    <p class="det" style="margin:0">Agrupamento de Escolas Templários · 5.º ano · regime semestral</p>
    ${CAL_ESCOLAR.map(linha).join("")}</section>`;
}


/* ---------- horário semanal da Ema (documento "horario-ema") ---------- */
const COR_HOR = { PORT: "#4C9BFF", MAT: "#F2994A", ING: "#B07CFF", HGP: "#2FB673", CN: "#2DC5D9", EMUS: "#FF6B8A", EV: "#E8C547", ET: "#C77DFF", CD: "#7FD1F5", TIC: "#6FCF97", EF: "#20A86B", AEST: "#9AA6BD", INST: "#FFB45E", TRAMP: "#FF7AC6" };
const DIAS_UTEIS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
const celulaHor = (c) => (Array.isArray(c) ? c : c ? [c] : []).map((x) => `<div class="hc" style="--c:${COR_HOR[x.c] || "#9AA6BD"}"><b>${esc(x.t)}</b>${x.s ? `<span>${esc(x.s)}</span>` : ""}</div>`).join("");
function tabelaHorario(h, hoje) {
  const cab = `<thead><tr><th></th>${DIAS_UTEIS.map((d, i) => `<th class="${i === hoje ? "hj" : ""}">${d}</th>`).join("")}</tr></thead>`;
  const linhas = h.tempos.map((t, r) => `<tr><th>${esc(t[0])}<br>${esc(t[1])}</th>${DIAS_UTEIS.map((_, d) => `<td class="${d === hoje ? "hj" : ""}">${celulaHor((h.grelha[d] || [])[r])}</td>`).join("")}</tr>`).join("");
  return `<table class="hor">${cab}<tbody>${linhas}</tbody></table>`;
}
function blocoHorario(h) {
  if (!h || !h.tempos) return "";
  const dw = new Date().getDay(), hoje = dw >= 1 && dw <= 5 ? dw - 1 : -1;
  return `<section class="seccao" id="horario"><div class="sec-cab"><h2>Horário da Ema</h2><button type="button" class="sec" id="hor-imp">${svg("impressora")} Imprimir</button></div>
    <div class="hor-tabs" role="tablist">${DIAS_UTEIS.map((d, i) => `<button type="button" role="tab" data-hd="${i}" aria-selected="${i === Math.max(hoje, 0)}">${d.slice(0, 3)}</button>`).join("")}<button type="button" role="tab" data-hd="all" aria-selected="false">Semana</button></div>
    <div class="hor-wrap" data-d="${Math.max(hoje, 0)}">${tabelaHorario(h, hoje)}</div>
    ${h.nota ? `<p class="det" style="margin:0">${esc(h.nota)}</p>` : ""}</section>`;
}
function imprimirHorario(h) {
  imprimir(`<div class="folha fhor"><div class="ftit">${esc(h.titulo || "Horário da Ema")}</div>${tabelaHorario(h, -1)}</div>`, "paisagem");
}

async function vEscola(el) {
  el.innerHTML = cab("Escola Ema", "Calendário, estudo, testes, trabalhos, reuniões, atividades e contactos da escola.") + `<a class="estudo-cta" href="#estudo"><span class="bolha">${svg("estudo")}</span><span class="ct"><b>Estudo · fichas do 5.º ano</b><span class="det">Para imprimir ou fazer na app · Português, Matemática, Ciências, HGP e Inglês</span></span><span class="seta">›</span></a>` + blocoCalendario();
  const hor = await store.getDoc("horario-ema");
  if (hor && hor.tempos) {
    el.insertAdjacentHTML("beforeend", blocoHorario(hor));
    $("#hor-imp", el).onclick = () => imprimirHorario(hor);
    $(".hor-tabs", el).onclick = (ev) => {
      const b = ev.target.closest("[data-hd]"); if (!b) return;
      $(".hor-wrap", el).dataset.d = b.dataset.hd;
      $(".hor-tabs", el).querySelectorAll("[data-hd]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    };
  }
  await seccao(el, COLS.escola_testes);
  await seccao(el, COLS.escola_eventos);
  await seccao(el, COLS.escola_atividades);
  await seccao(el, COLS.escola_contactos);
}


/* =====================================================================
   ESTUDO — fichas do 5.º ano (conteúdo em fichas.js)
   ===================================================================== */
const DISC = () => window.FICHAS || [];
const chaveEstudo = () => "estudo-" + (EU || "eu").toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
const normTxt = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.,!?;:«»"'’]/g, "").replace(/\s+/g, " ").trim();
const lerNum = (s) => { const v = String(s ?? "").replace(/\s/g, "").replace("%", "").replace(",", "."); return v === "" || isNaN(+v) ? null : +v; };
function respostaCerta(q, v) {
  if (q.t === "mc") return v !== null && v !== undefined && +v === q.c;
  if (q.t === "num") { const n = lerNum(v); return n !== null && Math.abs(n - q.r) < 1e-6; }
  const t = normTxt(v); return !!t && q.r.some((r) => normTxt(r) === t);
}
const textoCerto = (q) => (q.t === "mc" ? q.o[q.c] : q.t === "num" ? String(q.r).replace(".", ",") : q.r[0]);
const msgNota = (c, t) => { const p = c / t; return p === 1 ? "Excelente! 🌟" : p >= 0.8 ? "Muito bem! 👏" : p >= 0.5 ? "Bom trabalho, continua! 💪" : "Vamos rever e tentar outra vez 🙂"; };
const badge = (d, cls = "") => `<span class="sigla ${cls}" style="--c:${d.cor}">${esc(d.sigla)}</span>`;

const barraImprimir = (rotulo) => `<div class="imp-barra"><button type="button" class="pri" data-imp>${svg("impressora")} ${rotulo}</button>
  <label class="chk"><input type="checkbox" data-sol checked> Juntar folha com as soluções</label></div>`;
function ligarImprimir(el, lista) {
  const b = $("[data-imp]", el); if (!b) return;
  b.onclick = () => imprimirFichas(lista, $("[data-sol]", el).checked);
}

async function vEstudo(el) {
  const [idD, idF] = ROTA_ARGS;
  const [docP, docO, carregadas] = await Promise.all([store.getDoc(chaveEstudo()), store.getDoc("estudo-ocultas"), store.list("fichas_carregadas")]);
  const prog = (docP || {}).res || {};
  const ocultas = new Set(((docO || {}).ids) || []);
  const vis = (d) => d.fichas.filter((f) => !ocultas.has(f.id));
  const disc = DISC().find((d) => d.id === idD);
  const ficha = disc && disc.fichas.find((f) => f.id === idF);
  const minhas = (d) => carregadas.filter((c) => c.disc === d.nome);
  const guardarOcultas = async (ids) => { await store.setDoc("estudo-ocultas", { ids: [...ids] }); render(); };

  if (!disc) {
    const total = DISC().reduce((s, d) => s + vis(d).length, 0), feitas = DISC().reduce((s, d) => s + vis(d).filter((f) => prog[f.id]).length, 0);
    el.innerHTML = `${cab("Estudo", `Fichas do 5.º ano · ${feitas} de ${total} feitas${carregadas.length ? ` · ${carregadas.length} carregadas por vocês` : ""}`)}
      <div class="disc-grelha">${DISC().map((d) => { const v = vis(d), n = v.filter((f) => prog[f.id]).length, m = minhas(d).length;
        return `<a class="disc" href="#estudo/${d.id}">${badge(d)}<b>${esc(d.nome)}</b><span class="det">${n} de ${v.length} fichas feitas${m ? ` · ${m} carregada${m > 1 ? "s" : ""}` : ""}</span>
          <span class="prog"><i style="width:${v.length ? (n / v.length) * 100 : 0}%;background:${d.cor}"></i></span></a>`; }).join("")}</div>
      <section class="seccao"><h2>Fichas para imprimir</h2><p class="det" style="margin:0">Folhas A4 para a Ema fazer à mão. Também podes imprimir por disciplina ou ficha a ficha.</p>${barraImprimir(`Imprimir todas (${total})`)}</section>`;
    ligarImprimir(el, DISC().flatMap((d) => vis(d).map((f) => [d, f])));
    await seccao(el, COLS.fichas_carregadas, { titulo: "📤 Fichas carregadas por vocês" });
    return;
  }
  if (!ficha) {
    const v = vis(disc), escondidas = disc.fichas.filter((f) => ocultas.has(f.id));
    el.innerHTML = `<a class="voltar" href="#estudo">‹ Estudo</a>
      <div class="cab"><div style="display:flex;gap:14px;align-items:center">${badge(disc, "g")}<div><h1>${esc(disc.nome)}</h1><div class="sub2">5.º ano · ${v.length} fichas da app${minhas(disc).length ? ` · ${minhas(disc).length} carregadas` : ""}</div></div></div></div>
      <section class="seccao"><h2>Fichas da app</h2>${v.length ? v.map((f, i) => { const r = prog[f.id];
        return `<div class="linha-l"><a class="linha-l sem-borda" href="#estudo/${disc.id}/${f.id}"><span class="num-f" style="--c:${disc.cor}">${i + 1}</span>
          <span class="ct"><b>${esc(f.titulo)}</b><span class="det">${esc(f.sub)} · ${f.q.length} perguntas</span></span>
          ${r ? `<span class="tag ${r.melhor === r.total ? "ok" : ""}">${r.melhor}/${r.total}</span>` : `<span class="tag">Fazer</span>`}</a>
          <button type="button" class="anx-x" data-ocultar="${f.id}" aria-label="Apagar a ficha ${esc(f.titulo)}" title="Apagar ficha">🗑</button></div>`; }).join("") : `<p class="vazio">Todas as fichas da app desta disciplina estão apagadas.</p>`}
        ${escondidas.length ? `<details><summary>Fichas apagadas (${escondidas.length})</summary>${escondidas.map((f) => `<div class="ing-prato"><span>${esc(f.titulo)}</span><button type="button" class="sec peq" data-repor="${f.id}">Repor</button></div>`).join("")}</details>` : ""}
      </section>
      ${v.length ? `<section class="seccao"><h2>Imprimir</h2>${barraImprimir(`Imprimir as ${v.length} fichas de ${esc(disc.nome)}`)}</section>` : ""}`;
    ligarImprimir(el, v.map((f) => [disc, f]));
    el.addEventListener("click", async (e) => {
      const o = e.target.closest("[data-ocultar]"), r = e.target.closest("[data-repor]");
      if (o) { const f = disc.fichas.find((x) => x.id === o.dataset.ocultar); if (!confirm(`Apagar a ficha "${f.titulo}"?\n(Podes repô-la mais tarde em "Fichas apagadas".)`)) return; ocultas.add(f.id); await guardarOcultas(ocultas); aviso("Ficha apagada"); }
      if (r) { ocultas.delete(r.dataset.repor); await guardarOcultas(ocultas); aviso("Ficha reposta"); }
    });
    const colD = { ...COLS.fichas_carregadas, campos: COLS.fichas_carregadas.campos.map((c) => (c.k === "disc" ? { ...c, def: disc.nome } : c)) };
    await seccao(el, colD, { titulo: "📤 Fichas carregadas por vocês", filtro: (c) => c.disc === disc.nome });
    return;
  }
  const r = prog[ficha.id];
  el.innerHTML = `<a class="voltar" href="#estudo/${disc.id}">‹ ${esc(disc.nome)}</a>
    <div class="cab"><div style="display:flex;gap:14px;align-items:center">${badge(disc, "g")}<div><h1>${esc(ficha.titulo)}</h1><div class="sub2">${esc(ficha.sub)}${r ? ` · melhor nota ${r.melhor}/${r.total}` : ""}</div></div></div></div>
    <section class="seccao">${barraImprimir("Imprimir esta ficha")}<p class="det" style="margin:0">Ou responde aqui na app e toca em Corrigir no fim.</p></section>
    ${ficha.texto ? `<section class="seccao texto-ficha"><h2>📖 Lê o texto</h2>${ficha.texto.split("\n\n").map((p) => `<p>${esc(p)}</p>`).join("")}</section>` : ""}
    <form class="ficha" id="ficha" autocomplete="off">
      ${ficha.q.map((q, i) => `<section class="perg" data-i="${i}"><div class="perg-n" style="--c:${disc.cor}">${i + 1}</div><div class="perg-c">
        <p class="perg-p">${esc(q.p)}</p>
        ${q.t === "mc" ? `<div class="opcoes">${q.o.map((o, j) => `<label class="opcao"><input type="radio" name="q${i}" value="${j}"><span>${esc(o)}</span></label>`).join("")}</div>`
          : `<input name="q${i}" ${q.t === "num" ? 'inputmode="decimal"' : 'autocapitalize="off" spellcheck="false"'} placeholder="A tua resposta" aria-label="Resposta à pergunta ${i + 1}">`}
        <div class="expl" hidden></div></div></section>`).join("")}
      <div class="nota" id="nota" hidden></div>
      <div class="acoes"><button type="submit" class="pri grande">Corrigir</button></div>
    </form>`;
  ligarImprimir(el, [[disc, ficha]]);
  const f = $("#ficha", el);
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (f.dataset.feito) { render(); window.scrollTo(0, 0); return; }
    let certas = 0;
    ficha.q.forEach((q, i) => {
      const box = $(`.perg[data-i="${i}"]`, f);
      const v = q.t === "mc" ? (f.querySelector(`input[name=q${i}]:checked`) || {}).value : f.elements.namedItem("q" + i).value;
      const ok = respostaCerta(q, v);
      if (ok) certas++;
      box.classList.add(ok ? "certa" : "errada");
      if (q.t === "mc") $$(".opcao", box).forEach((l, j) => { if (j === q.c) l.classList.add("e-certa"); });
      const ex = $(".expl", box); ex.hidden = false;
      ex.innerHTML = ok ? `<b>✓ Certo!</b> ${esc(q.e)}` : `<b>✗ Resposta certa: ${esc(textoCerto(q))}</b><br>${esc(q.e)}`;
      $$("input", box).forEach((x) => (x.disabled = true));
    });
    const t = ficha.q.length, nota = $("#nota", f);
    nota.hidden = false;
    nota.innerHTML = `<div class="nota-n">${certas}/${t}</div><div>${msgNota(certas, t)}</div>`;
    f.dataset.feito = "1";
    $("button[type=submit]", f).textContent = "Tentar outra vez";
    nota.scrollIntoView({ behavior: "smooth", block: "center" });
    try {
      const doc = (await store.getDoc(chaveEstudo())) || { res: {} };
      const ant = (doc.res || {})[ficha.id];
      doc.res = { ...(doc.res || {}), [ficha.id]: { certas, total: t, melhor: Math.max(certas, ant ? ant.melhor : 0), vezes: (ant ? ant.vezes : 0) + 1, data: hoje() } };
      await store.setDoc(chaveEstudo(), doc);
    } catch (err) { erro(err); }
  };
}

async function vViagens(el) {
  el.innerHTML = cab("Viagens", "Ideias, viagens marcadas, reservas e a lista para a mala.");
  await seccao(el, COLS.viagens);
  await seccao(el, COLS.reservas);
  await seccao(el, COLS.mala);
}


async function vFerias(el) {
  const ano = hoje().slice(0, 4);
  const ferias = await store.list("ferias");
  const resumo = PESSOAS.filter((p) => p !== "Ema").map((p) => {
    const doAno = ferias.filter((f) => f.quem === p && String(f.inicio || "").startsWith(ano));
    const dias = (tipo) => doAno.filter((f) => f.tipo === tipo).reduce((s, f) => s + diasUteis(f.inicio, f.fim), 0);
    const usados = dias("Férias"), pontes = dias("Folga / ponte"), anterior = dias("Férias do ano anterior"), bonus = doAno.filter((f) => f.tipo === "Bónus (½ dia)").length;
    const extra = [pontes ? `${pontes} ${pontes === 1 ? "dia" : "dias"} de ponte` : "", anterior ? `${anterior} ${anterior === 1 ? "dia" : "dias"} do ano anterior` : "", bonus ? `${bonus} ${bonus === 1 ? "bónus" : "bónus"} de ½ dia` : ""].filter(Boolean).join(" · ");
    return `<div class="orc-l"><div class="orc-t"><span>${esc(p)}</span><span class="det"><b>${usados}</b> de ${DIAS_FERIAS} dias de férias de ${ano}${usados <= DIAS_FERIAS ? ` · faltam ${DIAS_FERIAS - usados}` : ` · passou ${usados - DIAS_FERIAS}`}${extra ? `<br>Além disso: ${extra}` : ""}</span></div>
      <div class="orc-b"><i class="${usados > DIAS_FERIAS ? "vermelho" : "verde"}" style="width:${Math.min(100, (usados / DIAS_FERIAS) * 100)}%"></i></div></div>`;
  }).join("");
  const prox = Object.entries(FERIADOS).filter(([d]) => diasAte(d) >= 0).slice(0, 8);
  el.innerHTML = `${cab("Férias e aniversários", "Férias de cada um, feriados e os anos de quem gostamos.")}
    <section class="seccao"><h2>Dias de férias em ${ano}</h2>${resumo}
      <details><summary>Próximos feriados</summary>${prox.map(([d, n]) => { const w = deIso(d).toLocaleDateString("pt-PT", { weekday: "long" });
        return `<div class="ing-prato"><span><b>${esc(n)}</b><br><span class="det">${fmtData(d)} · ${w}${/segunda|sexta/.test(w) ? " · fim de semana prolongado 🎉" : /terça|quinta/.test(w) ? " · dá para fazer ponte" : ""}</span></span><span class="tag">${rel(diasAte(d))}</span></div>`; }).join("")}</details>
    </section>`;
  await seccao(el, COLS.ferias);
  await seccao(el, COLS.aniversarios);
}

async function vMedicos(el) {
  el.innerHTML = cab("Médicos", "Consultas, contactos e registos de saúde de cada pessoa.");
  await seccao(el, COLS.consultas);
  await seccao(el, COLS.contactos);
  await seccao(el, COLS.saude);
}



/* ---------- cópia de segurança (Excel) ---------- */
async function exportarExcel() {
  aviso("A preparar a cópia de segurança…");
  try {
    if (!window.XLSX) await carregarScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js");
    const X = window.XLSX, wb = X.utils.book_new(), usados = new Set();
    const folha = (nome, linhas) => {
      if (!linhas.length) return;
      let n = nome.replace(/[\[\]:*?\/\\]/g, "").slice(0, 31), k = 2;
      while (usados.has(n)) n = nome.slice(0, 28) + " " + k++;
      usados.add(n);
      const ws = X.utils.json_to_sheet(linhas);
      ws["!cols"] = Object.keys(linhas[0]).map((h) => ({ wch: Math.min(50, Math.max(h.length, ...linhas.map((l) => String(l[h] ?? "").length)) + 2) }));
      X.utils.book_append_sheet(wb, ws, n);
    };
    // resumo
    const resumo = [];
    for (const col of Object.values(COLS)) {
      const itens = await store.list(col.id);
      if (col.ordem) itens.sort(col.ordem);
      resumo.push({ "Secção": col.id === "despesas" ? "Despesas" : col.nome, "Registos": itens.length });
      folha(col.id === "despesas" ? "Despesas" : col.nome, itens.map((it) => {
        const o = {};
        col.campos.forEach((c) => { let v = it[c.k]; if (c.t === "check") v = v ? "Sim" : ""; else if (c.t === "date" && v) v = fmtData(v); o[c.l] = v ?? ""; });
        if (it.anexos && it.anexos.length) o["Anexos"] = it.anexos.map((a) => a.nome).join(", ");
        return o;
      }));
    }
    const docs = await store.listDocs();
    // ementas
    const linhasE = [];
    docs.filter((d) => /^ementa-\d{4}-\d{2}-\d{2}$/.test(d.id)).sort((a, b) => a.id.localeCompare(b.id)).forEach((d) => {
      const ini = d.id.slice(7), sel = (d.dados && d.dados.sel) || {};
      if (!Object.values(sel).some(Boolean)) return;
      DIAS.forEach((dia, i) => {
        const v = (k) => sel[i + k] || "";
        linhasE.push({ "Semana (sábado)": fmtData(ini), "Dia": cap(dia), "Data": fmtData(somaDias(ini, i)), "Pequeno-almoço": v("P"),
          "Meio da manhã – Ricardo": v("R"), "Meio da manhã – Carolina": v("C"), "Meio da manhã – Ema": v("E"),
          "Almoço": v("A") + (sel[i + "AS"] ? " (+ salada)" : ""), "Meio da tarde – Ricardo": v("TR"), "Meio da tarde – Carolina": v("TC"), "Meio da tarde – Ema": v("TE"),
          "Jantar": v("J") + (sel[i + "JS"] ? " (+ salada)" : "") });
      });
    });
    folha("Ementas", linhasE);
    resumo.push({ "Secção": "Ementas (dias)", "Registos": linhasE.length });
    const orc = (docs.find((d) => d.id === "orcamento") || {}).dados;
    if (orc && orc.cat) folha("Orçamento", Object.entries(orc.cat).map(([c, v]) => ({ "Categoria": c, "Limite mensal (€)": v })));
    const ing = (docs.find((d) => d.id === "ingredientes") || {}).dados;
    if (ing && ing.pratos) folha("Ingredientes dos pratos", Object.entries(ing.pratos).map(([p, l]) => ({ "Prato": p, "Ingredientes": l.join(", ") })));
    const est = docs.filter((d) => d.id.startsWith("estudo-"));
    const nomeF = {}; DISC().forEach((dd) => dd.fichas.forEach((f) => (nomeF[f.id] = dd.nome + " — " + f.titulo)));
    folha("Estudo (notas)", est.flatMap((d) => Object.entries((d.dados && d.dados.res) || {}).map(([fid, r]) => ({ "Conta": d.id.slice(7), "Ficha": nomeF[fid] || fid, "Melhor nota": `${r.melhor}/${r.total}`, "Vezes": r.vezes, "Última vez": fmtData(r.data) }))));
    // folha de resumo no início
    const wsR = X.utils.json_to_sheet([{ "Secção": "Cópia de segurança de A Nossa Casa", "Registos": fmtData(hoje()) }, ...resumo]);
    wsR["!cols"] = [{ wch: 40 }, { wch: 14 }];
    X.utils.book_append_sheet(wb, wsR, "Resumo");
    wb.SheetNames.unshift(wb.SheetNames.pop());
    X.writeFile(wb, `A-Nossa-Casa-copia-${hoje()}.xlsx`);
    // cópia completa em JSON (para restaurar, se for preciso)
    const tudo = { versao: 1, data: hoje(), itens: {}, documentos: docs };
    for (const col of Object.values(COLS)) tudo.itens[col.id] = await store.list(col.id);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(tudo, null, 1)], { type: "application/json" }));
    a.download = `A-Nossa-Casa-copia-${hoje()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    aviso("Cópia de segurança descarregada");
  } catch (err) { erro(err); }
}

/* ---------- menu (ícones) ---------- */
const ICO = {
  kit: '<rect x="3.5" y="7" width="17" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M12 10.5v6M9 13.5h6"/>',
  emergencia: '<rect x="3.5" y="7" width="17" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M12 10.5v6M9 13.5h6"/>',
  inicio: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  ementas: '<path d="M6 3v7a2 2 0 0 0 4 0V3M8 12v9M17 21V3c-2 1-3 3-3 7s1 4 3 4"/>',
  compras: '<path d="M3 4h2.5l2.2 11h10.6L21 7.5H6.4"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
  despesas: '<path d="M17.5 6.5A7 7 0 1 0 17.5 17.5"/><path d="M4 10.5h9M4 13.5h9"/>',
  veiculos: '<path d="M4 13.5l1.8-5.5A2 2 0 0 1 7.7 6.5h8.6a2 2 0 0 1 1.9 1.5L20 13.5v4.5H4z"/><path d="M4 13.5h16"/><circle cx="8" cy="16" r=".8"/><circle cx="16" cy="16" r=".8"/><path d="M6 18v2M18 18v2"/>',
  casa: '<path d="M14.5 5.5a4 4 0 0 0 5 5l-8.8 8.8a2.1 2.1 0 0 1-3-3l8.8-8.8z"/><path d="M14.5 5.5l2-2 4 4-2 2"/>',
  familia: '<circle cx="9" cy="8" r="3"/><path d="M3.5 20c0-3.2 2.5-5.5 5.5-5.5s5.5 2.3 5.5 5.5"/><circle cx="17" cy="9.5" r="2.3"/><path d="M16.5 14.6c2.6.2 4.4 2.3 4.4 5.4"/>',
  medicos: '<path d="M12 20.5s-8-4.8-8-10.8A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.7c0 6-8 10.8-8 10.8z"/><path d="M8 12h2l1.2-2 1.6 4 1.2-2h2"/>',
  mover: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
  ferias: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  dados: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v6.5c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V5.5M4.5 12v6.5c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V12"/>',
  tarefas: '<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M7.5 9l1.5 1.5 3-3M7.5 15l1.5 1.5 3-3M14.5 9h2.5M14.5 15h2.5"/>',
  despensa: '<path d="M7.5 3.5h9v3h-9z"/><path d="M6 6.5h12v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M6 11.5h12"/>',
  neve: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5"/>',
  contadores: '<path d="M4 15.5a8 8 0 1 1 16 0"/><path d="M12 15.5l3.5-4"/><circle cx="12" cy="15.5" r="1.2"/><path d="M4 19.5h16"/>',
  gota: '<path d="M12 3.5s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  chama: '<path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-4-9-1 2-2 3-3.5 3.5C9 7 8 5.5 8 4c-2 2-2 6-2 8a6 6 0 0 0 6 9z"/>',
  camara: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.5-2.5h5.6L16.3 7h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.8" r="3.3"/>',
  impressora: '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>',
  estudo: '<path d="M4 19V5.5A2.5 2.5 0 0 1 6.5 3H20v14H6.5A2.5 2.5 0 0 0 4 19.5 2.5 2.5 0 0 0 6.5 22H20v-5"/><path d="M8.5 7.5h7M8.5 11h5"/>',
  viagens: '<rect x="3.5" y="7" width="17" height="13" rx="2.5"/><path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M8 7v13M16 7v13"/>',
  calendario: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
  contactos: '<rect x="4.5" y="3" width="15" height="18" rx="2.5"/><circle cx="12" cy="10" r="2.8"/><path d="M7.5 17.5c.8-2.2 2.5-3.3 4.5-3.3s3.7 1.1 4.5 3.3M2.5 7.5h2M2.5 12h2M2.5 16.5h2"/>',
  tel: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  pilula: '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M9.5 9.5l5 5"/>',
  escudo: '<path d="M12 3l7.5 3v6c0 4.5-3.2 7.8-7.5 9-4.3-1.2-7.5-4.5-7.5-9V6z"/><path d="M9 12l2 2 4-4"/>',
  raio: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
  bolo: '<path d="M4 20h16v-6.5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z"/><path d="M4 15.5c2.5 1.5 5 1.5 8 0s5.5-1.5 8 0M12 11.5V8"/><path d="M12 3.5c1 1 1 2.3 0 3-1-.7-1-2 0-3z"/>',
  combustivel: '<path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M4 21h12M5 10h10"/><path d="M15 8l3 2v8a1.5 1.5 0 0 0 3 0v-7l-2-3"/>',
  presente: '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8.5h14V12M12 8v12.5M12 8C10 4 6.5 4.5 7.5 7c.5 1 4.5 1 4.5 1s4-0 4.5-1c1-2.5-2.5-3-4.5 1z"/>',
  escola: '<path d="M2.5 9L12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v5c3 2.5 8 2.5 11 0v-5M21.5 9v5"/>',
  roupa: '<path d="M8 3.5L3.5 6.5l2 4 2-1V20.5h9V9.5l2 1 2-4L16 3.5c-.5 1.7-2 2.7-4 2.7s-3.5-1-4-2.7z"/>',
  lazer: '<circle cx="12" cy="12" r="8.5"/><path d="M9.5 9h.01M14.5 9h.01M8.5 13.5c2 2.5 5 2.5 7 0"/>',
  euro: '<circle cx="12" cy="12" r="8.5"/><path d="M15 8.8a4 4 0 1 0 0 6.4M7.5 11h6M7.5 13.5h6"/>',
  mais: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
};
const SECOES = [["inicio", "Início"], ["ementas", "Ementas"], ["compras", "Compras"], ["despesas", "Despesas"], ["veiculos", "Veículos"], ["casa", "Casa"], ["familia", "Família"], ["escola", "Escola Ema"], ["estudo", "Estudo"], ["viagens", "Viagens"], ["ferias", "Férias e aniversários"], ["medicos", "Médicos"], ["tarefas", "Tarefas e mesada"], ["despensa", "Despensa"], ["contactos", "Contactos úteis"], ["contadores", "Contadores"], ["emergencia", "Kit de emergência"], ["dados", "Gerir dados"]];
const svg = (k) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[k]}</svg>`;
let NA_BARRA = ["inicio", "ementas", "compras", "despesas"];
// secções que quem entrou pode ver (as crianças só veem as escolhidas pelos pais)
const podeVer = (r) => !CRIANCA() || r === "inicio" || (SECOES_OK.includes(r) && r !== "dados");
const secoesVisiveis = () => SECOES.filter(([r]) => podeVer(r));
function montarMenus() {
  NA_BARRA = CRIANCA() ? secoesVisiveis().slice(0, 4).map(([r]) => r) : ["inicio", "ementas", "compras", "despesas"];
  document.body.classList.toggle("crianca", CRIANCA());
  $("#nav").innerHTML = secoesVisiveis().map(([r, l]) => `<a href="#${r}" data-r="${r}">${svg(r)}<span>${l}</span></a>`).join("");
  $("#tabbar").innerHTML = secoesVisiveis().filter(([r]) => NA_BARRA.includes(r)).map(([r, l]) => `<a href="#${r}" data-r="${r}">${svg(r)}<span>${l}</span></a>`).join("")
    + `<button type="button" id="btn-mais" data-r="mais">${svg("mais")}<span>Mais</span></button>`;
  $("#btn-mais").onclick = abrirMais;
}
function abrirMais() {
  const dlg = $("#dlg"); dlg.oncancel = null;
  const online = store && store.modo === "online";
  dlg.innerHTML = `<div class="form folha-mais"><div class="pega" aria-hidden="true"></div><h2>Mais</h2>
    <div class="mosaico">${secoesVisiveis().filter(([r]) => !NA_BARRA.includes(r)).map(([r, l]) => `<a href="#${r}" class="tile">${svg(r)}<span>${l}</span></a>`).join("")}</div>
    ${CRIANCA() ? "" : `<button type="button" class="sec grande" data-a="copia">💾 Cópia de segurança (Excel)</button>`}
    ${online ? `<div class="acoes"><button type="button" class="sec" data-a="senha">Mudar senha</button><button type="button" class="sec" data-a="sair">Sair</button></div>` : ""}
    <button type="button" class="sec grande" data-a="fechar">Fechar</button></div>`;
  dlg.onclick = (e) => {
    if (e.target === dlg || e.target.closest("[data-a=fechar]") || e.target.closest("a.tile")) dlg.close();
    if (e.target.closest("[data-a=senha]")) { dlg.close(); dialogoSenha("Mudar senha"); }
    if (e.target.closest("[data-a=copia]")) { dlg.close(); exportarExcel(); }
    if (e.target.closest("[data-a=sair]")) { dlg.close(); sb.auth.signOut(); }
  };
  dlg.classList.add("de-baixo");
  dlg.addEventListener("close", () => { dlg.onclick = null; dlg.classList.remove("de-baixo"); }, { once: true });
  dlg.showModal();
}



/* =====================================================================
   TAREFAS E MESADA
   ===================================================================== */
const segundaDe = (iso) => somaDias(iso, -((deIso(iso).getDay() + 6) % 7));
let semanaT = null;
const DIAS_SEG = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const diasDaTarefa = (t) => t.freq === "Uma vez por semana" ? ["s"] : t.freq === "Dias úteis (seg–sex)" ? [0, 1, 2, 3, 4] : t.freq === "Fins de semana" ? [5, 6] : [0, 1, 2, 3, 4, 5, 6];
async function vTarefas(el) {
  if (!semanaT) semanaT = segundaDe(hoje());
  const [tarefas, docS, docM, mov] = await Promise.all([store.list("tarefas_familia"), store.getDoc("tarefas-" + semanaT), store.getDoc("mesada"), store.list("mealheiro")]);
  const feitas = (docS && docS.feitas) || {};
  const cfg = { eurosPonto: 0.25, base: 0, ...((docM) || {}) };
  const hojeIdx = Math.round((deIso(hoje()) - deIso(semanaT)) / 86400000);
  const pontos = {}; const possiveis = {};
  tarefas.forEach((t) => diasDaTarefa(t).forEach((d) => {
    const quem = t.quem === "Todos" ? PESSOAS : [t.quem];
    quem.forEach((q) => { possiveis[q] = (possiveis[q] || 0) + (+t.pontos || 1); if (feitas[t.id + "|" + d + (t.quem === "Todos" ? "|" + q : "")]) pontos[q] = (pontos[q] || 0) + (+t.pontos || 1); });
  }));
  const emaP = pontos["Ema"] || 0, mesada = Math.round(((+cfg.base || 0) + emaP * (+cfg.eurosPonto || 0)) * 100) / 100;
  const jaGuardada = mov.some((m) => m.semana === semanaT);
  const saldo = mov.reduce((s, m) => s + (["Gastou", "Depositou no banco"].includes(m.tipo) ? -1 : 1) * (+m.valor || 0), 0);
  const linhaTarefa = (t) => {
    const ds = diasDaTarefa(t), quem = t.quem === "Todos" ? PESSOAS : [t.quem];
    return quem.map((q) => { const suf = t.quem === "Todos" ? "|" + q : "";
      return `<div class="tar"><div class="tar-n"><b>${esc(t.tarefa)}</b><span class="det">${esc(q)} · ${+t.pontos || 1} pt</span></div>
        <div class="tar-d">${ds.map((d) => { const k = t.id + "|" + d + suf, on = !!feitas[k];
          return `<button type="button" class="dia-chk ${on ? "on" : ""} ${d === hojeIdx ? "hoje" : ""}" data-t="${esc(k)}" aria-pressed="${on}" aria-label="${esc(t.tarefa)} ${d === "s" ? "esta semana" : DIAS_SEG[d]}">${d === "s" ? (on ? "✓ Feito" : "Fazer") : DIAS_SEG[d]}</button>`; }).join("")}</div></div>`; }).join("");
  };
  const grupos = [...PESSOAS, "Todos"].map((q) => { const l = tarefas.filter((t) => t.quem === q); return l.length ? `<div class="grupo"><h3>${esc(q === "Todos" ? "Todos" : q)}</h3>${l.map(linhaTarefa).join("")}</div>` : ""; }).join("");
  el.innerHTML = `<div class="cab"><div><h1>Tarefas e mesada</h1><div class="sub2">Semana de ${fmtData(semanaT)} a ${fmtData(somaDias(semanaT, 6))}</div></div>
      <div class="semana"><button class="sec peq" data-sem="-7" aria-label="Semana anterior">◀</button><button class="sec peq" data-sem="0">Esta semana</button><button class="sec peq" data-sem="7" aria-label="Semana seguinte">▶</button></div></div>
    <div class="grelha">${PESSOAS.map((q) => `<div class="mini"><span class="rot">${esc(q)}</span><span class="num">${pontos[q] || 0}<small style="font-size:16px;color:var(--suave)"> / ${possiveis[q] || 0} pt</small></span>
      <span class="orc-b"><i class="verde" style="width:${possiveis[q] ? Math.min(100, ((pontos[q] || 0) / possiveis[q]) * 100) : 0}%"></i></span></div>`).join("")}</div>
    <section class="seccao"><h2>Tarefas da semana</h2>${grupos || `<p class="vazio">Ainda não há tarefas. Acrescenta-as em baixo, na Lista de tarefas.</p>`}</section>
    <section class="seccao"><div class="sec-cab"><h2>💰 Mesada da Ema</h2>${CRIANCA() ? "" : `<button type="button" class="sec peq" id="cfg-mesada">Regras</button>`}</div>
      <div class="orc-tot"><div><span class="total">${euro(mesada)}</span> <span class="det">esta semana · ${emaP} pontos × ${euro(cfg.eurosPonto)}${+cfg.base ? " + " + euro(cfg.base) + " base" : ""}</span></div></div>
      <div class="acoes">${CRIANCA() ? "" : `<button type="button" class="pri" id="guardar-mesada" ${jaGuardada || !mesada ? "disabled" : ""}>${jaGuardada ? "✓ Já está no mealheiro" : "Pôr no mealheiro"}</button>`}
      <span class="det">Mealheiro: <b style="color:var(--texto)">${euro(saldo)}</b></span></div></section>`;
  el.onclick = async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.sem != null) { const n = +b.dataset.sem; semanaT = n === 0 ? segundaDe(hoje()) : somaDias(semanaT, n); return render(); }
    if (b.dataset.t) {
      const k = b.dataset.t, on = !b.classList.contains("on");
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", on);
      try { marcarEscrita(); const atual = ((await store.getDoc("tarefas-" + semanaT)) || {}).feitas || {}; if (on) atual[k] = true; else delete atual[k]; await store.setDoc("tarefas-" + semanaT, { feitas: atual }); render(); } catch (err) { erro(err); }
      return;
    }
    if (b.id === "guardar-mesada") { try { await store.add("mealheiro", { data: hoje(), tipo: "Mesada", valor: mesada, desc: `Mesada da semana de ${fmtData(semanaT)}`, semana: semanaT }); aviso("Mesada guardada no mealheiro 🐷"); render(); } catch (err) { erro(err); } return; }
    if (b.id === "cfg-mesada") {
      const dlg = $("#dlg"); dlg.oncancel = null;
      dlg.innerHTML = `<form class="form"><h2>Regras da mesada</h2><p class="det" style="margin:0">A mesada da Ema = valor base + pontos da semana × euros por ponto.</p>
        <label class="campo"><span>Euros por ponto</span><input name="ep" inputmode="decimal" value="${String(cfg.eurosPonto).replace(".", ",")}"></label>
        <label class="campo"><span>Valor base por semana (opcional)</span><input name="base" inputmode="decimal" value="${String(cfg.base || "").replace(".", ",")}"></label>
        <div class="acoes"><span class="esp"></span><button type="button" class="sec" data-a="fechar">Cancelar</button><button class="pri">Guardar</button></div></form>`;
      const f = $("form", dlg); $("[data-a=fechar]", f).onclick = () => dlg.close();
      f.onsubmit = async (ev) => { ev.preventDefault(); try { await store.setDoc("mesada", { eurosPonto: lerNum(f.ep.value) || 0, base: lerNum(f.base.value) || 0 }); dlg.close(); render(); } catch (err) { erro(err); } };
      dlg.showModal();
    }
  };
  await seccao(el, COLS.tarefas_familia);
  await seccao(el, COLS.mealheiro, { topo: () => `<div class="resumo"><div class="total">Saldo: ${euro(saldo)}</div></div>` });
}

/* =====================================================================
   DESPENSA E CONGELADOR
   ===================================================================== */
async function vDespensa(el) {
  const itens = await store.list("despensa");
  const acabar = itens.filter((d) => d.minimo != null && d.minimo !== "" && (+d.qtd || 0) <= +d.minimo);
  const validade = itens.filter((d) => d.validade && d.local !== "Congelador" && diasAte(d.validade) <= 5);
  el.innerHTML = `${cab("Despensa e congelador", "O que há em casa, o que está a acabar e o que está a passar de validade.")}
    <div class="grelha">
      <div class="mini"><span class="bolha">${svg("despensa")}</span><span class="num">${itens.length}</span><span class="rot">artigos registados</span></div>
      <div class="mini"><span class="bolha amarelo">${svg("compras")}</span><span class="num">${acabar.length}</span><span class="rot">a acabar</span></div>
      <div class="mini"><span class="bolha vermelho">${svg("calendario")}</span><span class="num">${validade.length}</span><span class="rot">validade a terminar</span></div>
    </div>
    ${acabar.length ? `<section class="seccao"><h2>🛒 A acabar</h2><p class="chips">${acabar.map((d) => `<span class="chip">${esc(d.artigo)}</span>`).join("")}</p><div><button type="button" class="pri" id="para-compras">Juntar à lista de compras</button></div></section>` : ""}`;
  const b = $("#para-compras", el);
  if (b) b.onclick = async () => {
    const naLista = new Set((await store.list("compras")).filter((c) => !c.comprado).map((c) => normTxt(c.nome)));
    let n = 0;
    for (const d of acabar) if (!naLista.has(normTxt(d.artigo))) { await store.add("compras", { nome: d.artigo, qtd: "", cat: d.cat || secaoDe(d.artigo), comprado: false }); n++; }
    aviso(n ? `${n} ${n === 1 ? "artigo junto" : "artigos juntos"} à lista de compras` : "Já estavam todos na lista"); 
  };
  for (const local of ["Despensa", "Frigorífico", "Congelador"]) {
    const col = { ...COLS.despensa, nome: local === "Congelador" ? "❄️ Congelador" : local === "Frigorífico" ? "🧊 Frigorífico" : "🥫 Despensa",
      campos: COLS.despensa.campos.map((c) => (c.k === "local" ? { ...c, def: local } : c.k === "validade" && local === "Congelador" ? { ...c, l: "Congelado em", def: hoje } : c)) };
    await seccao(el, col, { filtro: (d) => (d.local || "Despensa") === local });
  }
}

/* =====================================================================
   CONTACTOS ÚTEIS
   ===================================================================== */
const EMERGENCIA = [["Emergência (INEM, bombeiros, polícia)", "112"], ["SNS 24 — aconselhamento de saúde", "808 24 24 24"], ["Centro de Informação Antivenenos", "800 250 250"]];
async function vContactos(el) {
  el.innerHTML = `${cab("Contactos úteis", "Os contactos da casa num só sítio. Toca no número para ligar.")}
    <section class="seccao"><h2>🚨 Emergência</h2>${EMERGENCIA.map(([n, t]) => `<a class="linha-l" href="tel:${t.replace(/\s/g, "")}"><span class="bolha vermelho">${svg("tel")}</span><span class="ct"><b>${esc(n)}</b><span class="det">${esc(t)}</span></span></a>`).join("")}</section>`;
  await seccao(el, COLS.contactos_uteis);
}

/* =====================================================================
   LEITURAS DOS CONTADORES
   ===================================================================== */
async function vContadores(el) {
  const leituras = await store.list("leituras");
  const blocos = ["Luz", "Água", "Gás"].map((c) => {
    const l = leituras.filter((x) => x.contador === c && x.data && x.leitura != null).sort((a, b) => a.data.localeCompare(b.data));
    if (!l.length) return "";
    const ult = l[l.length - 1], u = UNID[c];
    const inter = l.slice(1).map((x, i) => { const dias = Math.max(1, Math.round((deIso(x.data) - deIso(l[i].data)) / 86400000)); return { ate: x.data, cons: x.leitura - l[i].leitura, dias, porDia: (x.leitura - l[i].leitura) / dias }; }).slice(-6);
    const media = inter.length ? inter.reduce((s, x) => s + x.porDia, 0) / inter.length : null;
    const semLeitura = -diasAte(ult.data);
    const max = Math.max(...inter.map((x) => x.porDia), 0.0001);
    const f = (n, d = 1) => Number(n).toLocaleString("pt-PT", { maximumFractionDigits: d });
    return `<section class="seccao"><div class="sec-cab"><span class="bolha">${svg(COLS.leituras.ico({ contador: c }))}</span><h2>${c}</h2><span class="tag ${semLeitura > 35 ? "laranja" : ""}">última: ${fmtData(ult.data)}</span></div>
      <div class="orc-tot"><div><span class="total">${f(ult.leitura, 3)} ${u}</span></div>
      ${media != null ? `<div class="det">Média: <b>${f(media, 2)} ${u}/dia</b> · ≈ ${f(media * 30, 1)} ${u} por mês${inter.length ? ` · último período: ${f(inter[inter.length - 1].cons, 2)} ${u} em ${inter[inter.length - 1].dias} dias` : ""}</div>` : `<div class="det">Faz mais uma leitura para veres o consumo.</div>`}</div>
      ${semLeitura > 35 ? `<span class="al laranja">Já passaram ${semLeitura} dias desde a última leitura</span>` : ""}
      ${inter.length > 1 ? `<div class="hist"><div class="det">Consumo por dia em cada período</div><div class="hist-b">${inter.map((x, i) => `<div class="hb ${i === inter.length - 1 ? "atual" : ""}"><span class="hv">${f(x.porDia, 1)}</span><i style="height:${(x.porDia / max) * 100}%"></i><span class="hm">${dm(x.ate)}</span></div>`).join("")}</div></div>` : ""}
      ${(() => { // comparação com o período anterior
        if (inter.length < 2) return "";
        const ul = inter[inter.length - 1], an = inter[inter.length - 2];
        if (!an.porDia) return "";
        const d = ((ul.porDia - an.porDia) / an.porDia) * 100;
        return `<p class="comp-ant ${d > 15 ? "pior" : d < -5 ? "melhor" : ""}">${d > 15 ? "⚠️" : d < -5 ? "✅" : "➖"} No último período gastaste <b>${f(ul.porDia, 2)} ${u}/dia</b>, ${Math.abs(d) < 1 ? "o mesmo" : `<b>${d > 0 ? "+" : "−"}${f(Math.abs(d), 0)}%</b>`} do que no período anterior (${f(an.porDia, 2)} ${u}/dia).</p>`;
      })()}
      ${c === "Luz" ? blocoHorariosLuz(l, f) : ""}
    </section>`;
  }).join("");
  el.innerHTML = `${cab("Contadores", "Leituras da luz, água e gás. Uma leitura por mês chega para veres os consumos e apanhares faturas estranhas.")}
    ${CRIANCA() ? "" : `<section class="seccao foto-cont"><h2>📷 Ler o contador por foto</h2>
      <p class="det" style="margin:0">Tira uma foto ao contador e a IA escreve a leitura por ti, em 1 a 5 minutos (com o PC ligado). Na luz podes juntar até 3 fotos, uma de cada horário que o contador mostra (vazio, ponta e cheias).</p>
      <div class="foto-bts">${["Luz", "Água", "Gás"].map((c) => `<label class="pri foto-bt">${svg(COLS.leituras.ico({ contador: c }))} ${c}<input type="file" accept="image/*" ${c === "Luz" ? "multiple" : ""} data-foto="${c}" hidden></label>`).join("")}</div></section>`}
    ${blocos || ""}`;
  el.querySelectorAll("[data-foto]").forEach((inp) => { inp.onchange = async (e) => { const fs = [...(e.target.files || [])].slice(0, 3); e.target.value = ""; if (fs.length) await leituraPorFoto(inp.dataset.foto, fs); }; });
  if (!CRIANCA()) await blocoTarifasLuz(el);
  await seccao(el, COLS.leituras);
}
/* ---------- leitura por foto: a app guarda a foto e o n8n (Gemini) preenche os números ---------- */
async function reduzirFoto(file, max = 1600) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const esc = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  return await new Promise((res) => c.toBlob(res, "image/jpeg", 0.85));
}
async function leituraPorFoto(contador, files) {
  aviso("A enviar a foto…");
  try {
    const pasta = `leituras/${novoUid()}`, anexos = [];
    for (const [i, f] of files.entries()) {
      const blob = await reduzirFoto(f);
      const nome = `contador-${contador.toLowerCase()}-${hoje()}-${i + 1}.jpg`.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const caminho = `${pasta}/${Date.now()}-${nome}`;
      await store.upload(caminho, new File([blob], nome, { type: "image/jpeg" }));
      anexos.push({ nome, caminho, tipo: "image/jpeg", tamanho: blob.size });
    }
    await store.add("leituras", { contador, data: hoje(), leitura: null, porLer: true, anexos, pasta, notas: "" });
    aviso("Foto enviada — a IA vai ler os números daqui a pouco");
    render();
  } catch (err) { erro(err); }
}

/* ---------- luz: consumo por horário (vazio, ponta, cheias) ---------- */
const HOR_LUZ = [["vazio", "Vazio", "#4C9BFF"], ["cheias", "Cheias", "#F2C94C"], ["ponta", "Ponta", "#FF6B6B"]];
const temRegistos = (x) => HOR_LUZ.every(([k]) => x[k] != null && x[k] !== "" && !isNaN(+x[k]));
function periodosLuz(l) {
  const r = l.filter(temRegistos), out = [];
  for (let i = 1; i < r.length; i++) {
    const dias = Math.max(1, Math.round((deIso(r[i].data) - deIso(r[i - 1].data)) / 86400000));
    const c = Object.fromEntries(HOR_LUZ.map(([k]) => [k, Math.max(0, +r[i][k] - +r[i - 1][k])]));
    out.push({ ate: r[i].data, dias, ...c, total: HOR_LUZ.reduce((s, [k]) => s + c[k], 0) });
  }
  return out;
}
function blocoHorariosLuz(l, f) {
  const ps = periodosLuz(l);
  if (!ps.length) return `<p class="det">Para veres em que horário gastas mais, regista os 3 números do contador (vazio, ponta e cheias) em cada leitura. Precisas de pelo menos 2 leituras assim.</p>`;
  const p = ps[ps.length - 1], tot = p.total || 1;
  const barra = `<div class="luz-barra">${HOR_LUZ.map(([k, n, cor]) => `<i style="width:${(p[k] / tot) * 100}%;background:${cor}" title="${n}"></i>`).join("")}</div>`;
  const maior = HOR_LUZ.reduce((a, b) => (p[b[0]] > p[a[0]] ? b : a));
  return `<div class="luz-hor"><div class="det">Em que horário gastas (último período, ${p.dias} dias)</div>${barra}
    <div class="luz-leg">${HOR_LUZ.map(([k, n, cor]) => `<span><i style="background:${cor}"></i>${n}: <b>${f(p[k], 1)} kWh</b> (${f((p[k] / tot) * 100, 0)}%)</span>`).join("")}</div>
    <p class="det">Gastas mais em <b>${maior[1].toLowerCase()}</b>.${p.vazio / tot >= 0.4 ? " Com tanto consumo em vazio, uma tarifa bi-horária pode compensar." : ""}</p></div>`;
}

/* ---------- luz: que operadora fica mais barata (documento "tarifas-luz", calculado pelo n8n com os dados da ERSE) ---------- */
const POTENCIAS = ["1,15", "2,3", "3,45", "4,6", "5,75", "6,9", "10,35", "13,8", "17,25", "20,7"];
async function blocoTarifasLuz(el) {
  const [t, cfg] = await Promise.all([store.getDoc("tarifas-luz"), store.getDoc("luz-config")]);
  const c = cfg || {};
  const box = document.createElement("section"); box.className = "seccao tarifas";
  const linhaOf = (o, destaque) => o ? `<div class="tar-of ${destaque ? "melhor" : ""}"><div><b>${esc(o.comNome)}</b> — ${esc(o.nome)}<span class="det">${esc(o.cicloNome)}${o.fidelizacao ? " · com fidelização" : ""}${o.novos ? " · só novos clientes" : ""}${o.link ? ` · <a href="${esc(/^https?:/.test(o.link) ? o.link : "https://" + o.link)}" target="_blank" rel="noopener">ver oferta</a>` : ""}</span></div><span class="tar-v">${euro(o.ano)}<small>/ano</small></span></div>` : "";
  let corpo = "";
  if (!t) corpo = `<p class="vazio">A lista de tarifários aparece aqui depois da próxima atualização (todos os dias às 9h10, com o PC ligado).</p>`;
  else {
    const poupa = t.atual && t.melhor ? t.atual.ano - t.melhor.ano : null;
    corpo = `${!c.proposta ? `<p class="al amarelo">Escolhe em baixo o vosso tarifário atual para eu calcular quanto poupavam.</p>` : ""}
      ${t.atual ? `<div class="det" style="margin-top:6px">O vosso tarifário agora</div>${linhaOf(t.atual)}` : c.proposta ? `<p class="det">Não encontrei o vosso tarifário para ${esc(t.potencia)} kVA na lista da ERSE. Confirma a potência e o ciclo.</p>` : ""}
      ${poupa != null ? `<div class="veredito ${poupa > 30 ? "" : "neutro"}"><span class="trofeu">${poupa > 30 ? "💡" : "👍"}</span><div><b>${poupa > 30 ? `Podiam poupar cerca de ${euro(poupa)} por ano` : "O vosso tarifário já está entre os mais baratos"}</b><span class="det">${poupa > 30 ? `mudando para ${esc(t.melhor.comNome)} — ${esc(t.melhor.nome)} (${esc(t.melhor.cicloNome)}).` : poupa > 0 ? `A melhor alternativa só poupa ${euro(poupa)} por ano.` : ""}</span></div></div>` : ""}
      <div class="det" style="margin-top:10px">As mais baratas para o vosso consumo</div>
      ${(t.top || []).slice(0, 5).map((o, i) => linhaOf(o, i === 0)).join("")}
      <details><summary>Melhor de cada ciclo (simples, bi e tri-horário)</summary>${["1", "2", "3"].map((k) => linhaOf((t.porCiclo || {})[k])).join("")}
        <p class="det">O bi-horário e o tri-horário compensam quando gastam muito em vazio (noite e fim de semana). O vosso contador já regista os 3 horários.</p></details>
      <p class="det">Contas com ${Number(t.kwhAno).toLocaleString("pt-PT")} kWh/ano (${esc(t.fonte)}), ${esc(t.potencia)} kVA, horários: vazio ${Math.round(t.rep.vazio * 100)}% · cheias ${Math.round(t.rep.cheias * 100)}% · ponta ${Math.round(t.rep.ponta * 100)}% (${esc(t.repFonte)}). Valores sem IVA nem taxas, a partir das ${t.totalOfertas} ofertas da ERSE; deixei de fora as indexadas ao mercado e as que obrigam a outros serviços. Atualizado ${fmtData(String(t.atualizado).slice(0, 10))}.</p>`;
  }
  const lista = (t && t.lista) || [];
  const coms = [...new Map(lista.map((o) => [o.com, o.comNome])).entries()];
  const g = t && t.gas, cb = t && t.combinado;
  const gasHtml = g ? `<h3 class="tar-sub">🔥 Gás natural</h3>
      ${g.atual ? `<div class="det">O vosso agora</div>${linhaOf(g.atual)}` : ""}
      ${g.poupa != null ? `<div class="veredito ${g.poupa > 20 ? "" : "neutro"}"><span class="trofeu">${g.poupa > 20 ? "💡" : "👍"}</span><div><b>${g.poupa > 20 ? `No gás podiam poupar cerca de ${euro(g.poupa)} por ano` : "No gás, o vosso já está entre os mais baratos"}</b><span class="det">${g.poupa > 20 ? `mudando para ${esc(g.melhor.comNome)} — ${esc(g.melhor.nome)}.` : g.poupa > 0 ? `A melhor alternativa só poupa ${euro(g.poupa)} por ano.` : ""}</span></div></div>` : ""}
      <details><summary>As mais baratas de gás (${g.total} ofertas na vossa zona)</summary>${(g.top || []).map((o, i) => linhaOf(o, i === 0)).join("")}</details>
      <p class="det">Contas com ${Number(g.kwhAno).toLocaleString("pt-PT")} kWh/ano (${esc(g.fonte)}), escalão ${esc(g.escalao)}, rede ${g.ord === "TAG" ? "Tagusgás" : esc(g.ord)}.</p>` : "";
  const combHtml = cb && cb.atual ? (() => {
    const opcoes = [cb.separado && { tit: "Cada um na operadora mais barata", det: `luz: ${cb.separado.luz.comNome} · gás: ${cb.separado.gas.comNome}`, ano: cb.separado.ano }, cb.dual && { tit: "Luz e gás juntos na mesma operadora", det: `${cb.dual.comNome} — ${cb.dual.nome} (${cb.dual.cicloNome})`, ano: cb.dual.ano, link: cb.dual.link }].filter(Boolean).sort((a, b) => a.ano - b.ano);
    return `<h3 class="tar-sub">🤝 Luz + gás: juntar compensa?</h3>
      <div class="tar-of"><div><b>O que pagam agora</b><span class="det">luz EDP + gás regulado</span></div><span class="tar-v">${euro(cb.atual)}<small>/ano</small></span></div>
      ${opcoes.map((o, i) => `<div class="tar-of ${i === 0 && o.ano < cb.atual ? "melhor" : ""}"><div><b>${esc(o.tit)}</b><span class="det">${esc(o.det)}${o.link ? ` · <a href="${esc(/^https?:/.test(o.link) ? o.link : "https://" + o.link)}" target="_blank" rel="noopener">ver oferta</a>` : ""}</span></div><span class="tar-v">${euro(o.ano)}<small>/ano</small></span></div>`).join("")}
      <p class="det">${cb.poupa != null && cb.poupa > 0 ? `A melhor opção poupa ${euro(cb.poupa)} por ano face ao que pagam agora.` : "O que têm agora já é o mais barato no total."}${cb.dual ? "" : " Não há ofertas de luz e gás juntos para a vossa zona."}</p>`;
  })() : "";
  box.innerHTML = `<div class="sec-cab"><h2>⚡🔥 Luz e gás: que operadora fica mais barata</h2></div><h3 class="tar-sub">⚡ Eletricidade</h3>${corpo}${gasHtml}${combHtml}
    <details ${c.proposta ? "" : "open"}><summary>O nosso contrato de luz</summary><form class="form tar-cfg">
      <label class="campo"><span>Operadora</span><select name="com"><option value="">—</option>${coms.map(([k, n]) => `<option value="${esc(k)}" ${k === c.com ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
      <label class="campo"><span>Tarifário</span><select name="proposta"></select></label>
      <label class="campo"><span>Ciclo</span><select name="ciclo">${[["1", "Simples"], ["2", "Bi-horário"], ["3", "Tri-horário"]].map(([v, n]) => `<option value="${v}" ${String(c.ciclo || "1") === v ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label class="campo"><span>Potência contratada (vem na fatura)</span><select name="potencia">${POTENCIAS.map((v) => `<option ${v === (c.potencia || (t && t.potencia) || "6,9") ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <p class="det">Não encontras o vosso? Na fatura vem o nome do comercializador e do tarifário. As contas são refeitas na próxima atualização diária (9h10).</p>
      <div class="acoes"><span class="esp"></span><button class="pri">Guardar</button></div></form></details>`;
  el.appendChild(box);
  const f = $(".tar-cfg", box);
  const encherPropostas = () => { const ps = lista.filter((o) => o.com === f.com.value); f.proposta.innerHTML = `<option value="">—</option>` + ps.map((o) => `<option value="${esc(o.cod)}" ${o.cod === c.proposta ? "selected" : ""}>${esc(o.nome)}</option>`).join(""); };
  encherPropostas(); f.com.onchange = encherPropostas;
  f.onsubmit = async (e) => {
    e.preventDefault();
    try { await store.setDoc("luz-config", { com: f.com.value, proposta: f.proposta.value, ciclo: f.ciclo.value, potencia: f.potencia.value }); aviso("Guardado — as contas ficam prontas na próxima atualização"); render(); } catch (err) { erro(err); }
  };
}

/* =====================================================================
   KIT DE EMERGÊNCIA (72 horas)
   ===================================================================== */
async function vEmergencia(el) {
  el.innerHTML = cab("Kit de emergência", "O que a família precisa para aguentar 72 horas sem luz, sem água ou sem sair de casa.");
  const [itens, rev, compras] = await Promise.all([store.list("emergencia"), store.getDoc("kit-emergencia"), store.list("compras")]);
  const box = document.createElement("section");
  box.className = "seccao kit";
  const n = itens.filter((i) => i.tenho).length, tot = itens.length, falta = itens.filter((i) => !i.tenho);
  const proxRev = rev && rev.revisto ? somaMeses(rev.revisto, 6) : null;
  box.innerHTML = tot ? `<div class="resumo">
      <div class="total">${n} de ${tot} prontos</div>
      <div class="barra kit-b"><span>Kit</span><span class="b"><i style="width:${tot ? (n / tot) * 100 : 0}%"></i></span><b>${Math.round((n / (tot || 1)) * 100)}%</b></div>
      <div class="det">${falta.length ? `Faltam ${falta.length}: ${esc(falta.slice(0, 4).map((i) => i.nome.split(" (")[0]).join(" · "))}${falta.length > 4 ? "…" : ""}` : "Está tudo no kit. 👏"}</div>
      <div class="det">${rev && rev.revisto ? `Última revisão: ${fmtData(rev.revisto)} · próxima: ${fmtData(proxRev)}` : "Ainda não foi revisto. Revê-lo de 6 em 6 meses (validades, pilhas, powerbank)."}</div>
      <div class="acoes">${falta.length ? `<button class="sec" data-k="compras">🛒 Pôr o que falta na lista de compras</button>` : ""}<button class="sec" data-k="rever">✅ Revi o kit hoje</button></div>
    </div>` : `<div class="resumo"><div class="total">Montar o kit</div><div class="det">Carrega a lista recomendada para 3 pessoas e 72 horas (${KIT_BASE.length} artigos) e depois vai marcando o que já têm.</div><div class="acoes"><button class="pri" data-k="carregar">Carregar a lista recomendada</button></div></div>`;
  box.insertAdjacentHTML("beforeend", `<details class="kit-dicas"><summary>Dicas</summary><ul>
    <li>Guardem o kit num sítio fácil de apanhar à saída (ex: perto da porta ou na despensa), numa mochila ou caixa.</li>
    <li>Água: contem cerca de 2 litros por pessoa por dia; para os 3, 3 dias ≈ 20 litros.</li>
    <li>Se houver um apagão ou mau tempo, sigam as indicações da Proteção Civil na rádio. Em perigo, liguem 112.</li>
    <li>Marquem a validade da água, da comida, dos medicamentos e das pilhas: a app avisa 1 mês antes.</li>
    <li>Combinem um ponto de encontro da família, caso não estejam juntos.</li></ul></details>`);
  el.appendChild(box);
  box.onclick = async (e) => {
    const b = e.target.closest("[data-k]"); if (!b) return;
    b.disabled = true;
    try {
      if (b.dataset.k === "carregar") {
        for (const [nome, c, qtd] of KIT_BASE) await store.add("emergencia", { nome, cat: CAT_KIT[c], qtd, tenho: false, validade: "", notas: "" });
        aviso("Lista carregada: marca o que já têm");
      } else if (b.dataset.k === "rever") {
        await store.setDoc("kit-emergencia", { ...(rev || {}), revisto: hoje() });
        aviso("Revisão registada · a próxima é daqui a 6 meses");
      } else if (b.dataset.k === "compras") {
        const ja = new Set(compras.filter((c) => !c.comprado).map((c) => String(c.nome).toLowerCase()));
        let k = 0;
        for (const i of falta) { const nome = i.nome.split(" (")[0]; if (ja.has(nome.toLowerCase())) continue; await store.add("compras", { nome, qtd: i.qtd && i.qtd.length < 25 ? i.qtd : "", cat: secaoDe(nome), comprado: false, pedido_por: EU }); k++; }
        aviso(k ? `${k} ${k === 1 ? "artigo juntado" : "artigos juntados"} à lista de compras 🛒` : "Já estavam todos na lista de compras");
      }
      render();
    } catch (err) { erro(err); b.disabled = false; }
  };
  await seccao(el, COLS.emergencia);
}

function alertasContadores(leituras) {
  return ["Luz", "Água", "Gás"].map((c) => {
    const l = leituras.filter((x) => x.contador === c && x.data).sort((a, b) => b.data.localeCompare(a.data));
    if (!l.length) return null;
    const n = -diasAte(l[0].data);
    if (n > 35) return { nivel: "amarelo", dias: 7, texto: `Última leitura há ${n} dias`, rota: "contadores", tit: "Fazer leitura do contador da " + c.toLowerCase(), ico: "contadores" };
    // até 10 dias depois de uma leitura nova, avisa se o consumo subiu muito face ao período anterior
    const v = l.filter((x) => x.leitura != null).slice(0, 3);
    if (n <= 10 && v.length === 3) {
      const pd = (a, b) => (a.leitura - b.leitura) / Math.max(1, Math.round((deIso(a.data) - deIso(b.data)) / 86400000));
      const ul = pd(v[0], v[1]), an = pd(v[1], v[2]);
      if (an > 0 && ul > an * 1.15) return { nivel: "laranja", dias: 3, texto: `Gastaste +${Math.round(((ul - an) / an) * 100)}% por dia do que no período anterior`, rota: "contadores", tit: (c === "Luz" ? "Luz" : c) + " — consumo a subir", ico: COLS.leituras.ico({ contador: c }) };
    }
    return null;
  }).filter(Boolean);
}

/* =====================================================================
   GERIR DADOS (apagar anexos e registos)
   ===================================================================== */
const campoData = (col) => (col.campos.find((c) => c.t === "date") || {}).k;
/* ---------- acessos das crianças (só os pais veem; regras em acessos.sql) ---------- */
const SECOES_CRIANCA = ["ementas", "compras", "escola", "estudo", "tarefas", "ferias", "familia", "viagens", "contactos", "despensa", "casa", "medicos", "despesas", "veiculos", "contadores"];
const NOTA_SEC = { ementas: "só ver", compras: "ver e acrescentar", estudo: "fazer fichas", tarefas: "marcar as tarefas feitas", despesas: "inclui o orçamento", medicos: "inclui saúde de todos" };
async function cartaoAcessos(el) {
  if (!sb || CRIANCA()) return;
  const { data, error } = await sb.from("membros").select("email,nome,papel,secoes").eq("papel", "crianca");
  const box = document.createElement("section"); box.className = "seccao";
  if (error) {
    box.innerHTML = `<h2>👧 Acessos da Ema</h2><p class="det">Para limitar o que a Ema vê, corre uma vez o ficheiro <b>acessos.sql</b> no Supabase (SQL Editor → colar → Run).</p>`;
    return el.appendChild(box);
  }
  if (!data.length) return;
  const nomeSec = Object.fromEntries(SECOES);
  box.innerHTML = data.map((m) => `<div class="acesso" data-email="${esc(m.email)}"><div class="sec-cab"><h2>👧 Acessos da ${esc(m.nome)}</h2></div>
    <p class="det" style="margin:0">Escolhe o que a ${esc(m.nome)} vê na app. Nas secções escolhidas só pode ver (não muda nem apaga nada), exceto o que está entre parênteses.</p>
    <div class="acessos-l">${SECOES_CRIANCA.map((r) => `<label class="chk"><input type="checkbox" value="${r}" ${(m.secoes || []).includes(r) ? "checked" : ""}> ${esc(nomeSec[r])}${NOTA_SEC[r] ? ` <span class="det">(${NOTA_SEC[r]})</span>` : ""}</label>`).join("")}</div>
    <div class="acoes"><button type="button" class="pri" data-guardar>Guardar acessos</button></div></div>`).join("");
  el.appendChild(box);
  box.onclick = async (e) => {
    const b = e.target.closest("[data-guardar]"); if (!b) return;
    const d = b.closest(".acesso"), secoes = [...d.querySelectorAll("input:checked")].map((i) => i.value);
    b.disabled = true;
    try {
      const r = await sb.from("membros").update({ secoes }).eq("email", d.dataset.email).select("email");
      if (r.error) throw r.error;
      if (!r.data.length) throw new Error("Sem permissão para mudar os acessos.");
      aviso("Acessos guardados — a Ema vê as mudanças da próxima vez que abrir a app");
    } catch (err) { erro(err); } finally { b.disabled = false; }
  };
}

async function vDados(el) {
  const listas = {};
  for (const col of Object.values(COLS)) listas[col.id] = await store.list(col.id);
  const docs = await store.listDocs();
  const semanas = docs.filter((d) => /^ementa-\d{4}-\d{2}-\d{2}$/.test(d.id)).sort((a, b) => a.id.localeCompare(b.id));
  const anexos = [];
  Object.values(COLS).forEach((col) => listas[col.id].forEach((it) => (it.anexos || []).forEach((a) => anexos.push({ ...a, col, it }))));
  const totalB = anexos.reduce((s, a) => s + (a.tamanho || 0), 0);
  const umAno = somaDias(hoje(), -365);
  el.innerHTML = `${cab("Gerir dados", "Apagar ficheiros anexos, registos antigos ou secções inteiras.")}
    <section class="seccao"><div class="sec-cab"><h2>📎 Anexos</h2><span class="det">${anexos.length} ${anexos.length === 1 ? "ficheiro" : "ficheiros"} · ${tamanho(totalB)} de ~1 GB</span></div>
      ${anexos.length ? `<div class="orc-b"><i class="verde" style="width:${Math.max(1, Math.min(100, (totalB / 1073741824) * 100))}%"></i></div>` : ""}
      ${anexos.length ? anexos.sort((a, b) => (b.tamanho || 0) - (a.tamanho || 0)).map((a, i) => `<div class="anx" data-i="${i}"><span class="anx-ico">${icoFicheiro(a)}</span>
        <span class="ct"><b class="anx-nome" style="color:var(--texto)">${esc(a.nome)}</b><span class="det">${esc(a.col.nome)} · ${esc(a.col.titulo(a.it))} · ${tamanho(a.tamanho || 0)}</span></span>
        <button type="button" class="sec peq" data-anx="${i}">Apagar</button></div>`).join("") : `<p class="vazio">Não há ficheiros anexos.</p>`}
    </section>
    <section class="seccao"><h2>🗂️ Registos por secção</h2>
      <p class="det" style="margin:0">Para apagar só um registo, abre-o na secção e toca em <b>Apagar</b>. Aqui podes apagar muitos de uma vez.</p>
      ${Object.values(COLS).map((col) => { const n = listas[col.id].length, cd = campoData(col);
        return `<div class="ing-prato"><span><b>${esc(col.id === "despesas" ? "Despesas" : col.nome)}</b><br><span class="det">${n} ${n === 1 ? "registo" : "registos"}</span></span>
          <span class="acoes">${n && cd ? `<button type="button" class="sec peq" data-antigos="${col.id}">Antigos…</button>` : ""}${n ? `<button type="button" class="perigo peq" data-tudo="${col.id}">Apagar tudo</button>` : ""}</span></div>`; }).join("")}
    </section>
    <section class="seccao"><h2>🍽️ Ementas guardadas</h2>
      <p class="det" style="margin:0">${semanas.length} ${semanas.length === 1 ? "semana guardada" : "semanas guardadas"}${semanas.length ? ` (desde ${fmtData(semanas[0].id.slice(7))})` : ""}.</p>
      ${semanas.length ? `<div class="acoes"><label class="mes">Apagar semanas anteriores a <input type="date" id="em-data" value="${somaDias(hoje(), -90)}"></label><button type="button" class="perigo peq" id="em-apagar">Apagar</button></div>` : ""}
    </section>
    <section class="seccao"><h2>💾 Cópias de segurança</h2><p class="det" style="margin:0">Antes de apagar muita coisa, faz uma cópia. Descarrega um Excel (para ler) e um ficheiro .json (para restaurar).</p>
      <div class="acoes"><button type="button" class="sec" id="dados-copia">💾 Fazer cópia</button>
      <label class="sec peq anx-add" style="min-height:48px;font-size:16px">♻️ Restaurar a partir de uma cópia (.json)<input type="file" accept=".json,application/json" id="dados-restaurar" hidden></label></div></section>`;
  $("#dados-copia", el).onclick = exportarExcel;
  $("#dados-restaurar", el).onchange = (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) restaurarCopia(f); };
  const lista = anexos.sort((a, b) => (b.tamanho || 0) - (a.tamanho || 0));
  el.onclick = async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    try {
      if (b.dataset.anx) {
        const a = lista[+b.dataset.anx];
        if (!confirm(`Apagar o ficheiro "${a.nome}"?`)) return;
        await store.apagarFicheiros([a.caminho]);
        await store.update(a.it.id, { ...semId(a.it), anexos: (a.it.anexos || []).filter((x) => x.caminho !== a.caminho) });
        aviso("Ficheiro apagado"); render();
      } else if (b.dataset.tudo) {
        const col = COLS[b.dataset.tudo], itens = listas[col.id];
        const r = prompt(`Vais apagar os ${itens.length} registos de "${col.nome}"${itens.some((i) => i.anexos && i.anexos.length) ? " e os seus anexos" : ""}.\nIsto não se pode desfazer. Escreve APAGAR para confirmar.`);
        if ((r || "").trim().toUpperCase() !== "APAGAR") return aviso("Nada foi apagado");
        await apagarVarios(itens); aviso(`${itens.length} registos apagados`); render();
      } else if (b.dataset.antigos) {
        const col = COLS[b.dataset.antigos], cd = campoData(col);
        const lim = prompt(`Apagar os registos de "${col.nome}" com data anterior a (dd/mm/aaaa):`, fmtData(umAno));
        if (!lim) return;
        const m = lim.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (!m) return aviso("Data inválida. Usa o formato dd/mm/aaaa");
        const iso = `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
        const alvo = listas[col.id].filter((i) => i[cd] && i[cd] < iso);
        if (!alvo.length) return aviso("Não há registos anteriores a essa data");
        if (!confirm(`Apagar ${alvo.length} ${alvo.length === 1 ? "registo" : "registos"} de "${col.nome}" anteriores a ${fmtData(iso)}?`)) return;
        await apagarVarios(alvo); aviso(`${alvo.length} registos apagados`); render();
      } else if (b.id === "em-apagar") {
        const lim = $("#em-data", el).value; if (!lim) return;
        const alvo = semanas.filter((d) => d.id.slice(7) < lim);
        if (!alvo.length) return aviso("Não há semanas anteriores a essa data");
        if (!confirm(`Apagar ${alvo.length} ${alvo.length === 1 ? "semana" : "semanas"} de ementa anteriores a ${fmtData(lim)}?`)) return;
        for (const d of alvo) await store.removeDoc(d.id);
        aviso(`${alvo.length} semanas apagadas`); render();
      }
    } catch (err) { erro(err); }
  };
  await cartaoAcessos(el);
  await cartaoPush(el, true);
}

async function restaurarCopia(file) {
  let dados;
  try { dados = JSON.parse(await file.text()); } catch (e) { return aviso("Este ficheiro não é uma cópia válida"); }
  if (!dados || !dados.itens || !dados.documentos) return aviso("Este ficheiro não é uma cópia de A Nossa Casa");
  const nItens = Object.values(dados.itens).reduce((s, l) => s + l.length, 0);
  const modo = prompt(`Cópia de ${dados.data ? fmtData(dados.data) : "data desconhecida"} com ${nItens} registos.\n\nEscreve:\n  JUNTAR — repõe o que está na cópia sem apagar o que foi feito depois\n  SUBSTITUIR — a app fica exatamente igual à cópia (apaga o que não está lá)`, "JUNTAR");
  const m = (modo || "").trim().toUpperCase();
  if (m !== "JUNTAR" && m !== "SUBSTITUIR") return aviso("Nada foi alterado");
  aviso("A restaurar…");
  try {
    let feitos = 0;
    for (const [modulo, lista] of Object.entries(dados.itens)) {
      if (!COLS[modulo]) continue;
      if (m === "SUBSTITUIR") {
        const ids = new Set(lista.map((i) => i.id));
        for (const atual of await store.list(modulo)) if (!ids.has(atual.id)) await store.remove(atual.id);
      }
      for (const it of lista) { await store.upsertItem(it.id, modulo, semId(it)); feitos++; }
    }
    for (const d of dados.documentos) if (d.id && !d.id.startsWith("foto-")) await store.setDoc(d.id, d.dados);
    aviso(`Cópia restaurada (${feitos} registos)`); render();
  } catch (err) { erro(err); }
}

async function apagarVarios(itens) {
  const fich = itens.flatMap((i) => (i.anexos || []).map((a) => a.caminho));
  for (const i of itens) await store.remove(i.id);
  if (fich.length) { try { await store.apagarFicheiros(fich); } catch (err) { console.error(err); } }
}

/* =====================================================================
   NAVEGAÇÃO
   ===================================================================== */
const ROTAS = { inicio: vInicio, ementas: vEmenta, compras: vCompras, despesas: vDespesas, veiculos: vVeiculos, casa: vCasa, familia: vFamilia, escola: vEscola, estudo: vEstudo, viagens: vViagens, ferias: vFerias, medicos: vMedicos, tarefas: vTarefas, despensa: vDespensa, contactos: vContactos, contadores: vContadores, emergencia: vEmergencia, dados: vDados };
let ROTA_ARGS = [];
async function render() {
  if (!store) return;
  const partes = decodeURIComponent(location.hash.slice(1)).split("/"), h = partes[0], rota = ROTAS[h] && podeVer(h) ? h : "inicio";
  ROTA_ARGS = partes.slice(1);
  const naBarra = NA_BARRA.includes(rota);
  $$("#tabbar [data-r]").forEach((a) => a.classList.toggle("ativo", a.dataset.r === rota || (a.dataset.r === "mais" && !naBarra)));
  $$("#nav a").forEach((a) => { const on = a.dataset.r === rota; a.classList.toggle("ativo", on); if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  const v = document.createElement("div");
  v.className = "vista";
  $("#conteudo").replaceChildren(v);
  try { await ROTAS[rota](v); } catch (e) { console.error(e); v.innerHTML = `<p class="erro">Não foi possível carregar: ${esc(e.message || e)}</p>`; }
}
window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });
document.addEventListener("visibilitychange", () => {
  const a = document.activeElement;
  if (document.visibilityState === "visible" && store && !$("#dlg").open && !(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) render();
});


/* ---------- atualização automática (Supabase Realtime) ---------- */
let canal = null, rtPendente = false;
function ligarTempoReal() {
  if (!sb || canal) return;
  const mudou = () => {
    if (Date.now() - ultimaEscrita < 2500) return; // foi este aparelho que gravou
    const a = document.activeElement;
    if ($("#dlg").open || (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) { rtPendente = true; aviso("Há alterações novas — vão aparecer quando acabares"); return; }
    clearTimeout(mudou.t); mudou.t = setTimeout(() => { render(); aviso("Atualizado com alterações de outra pessoa"); }, 400);
  };
  canal = sb.channel("casa")
    .on("postgres_changes", { event: "*", schema: "public", table: "itens" }, mudou)
    .on("postgres_changes", { event: "*", schema: "public", table: "documentos" }, mudou)
    .subscribe();
}
document.addEventListener("focusout", () => setTimeout(() => { const a = document.activeElement; if (rtPendente && !$("#dlg").open && !(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) { rtPendente = false; render(); } }, 300));
$("#dlg").addEventListener("close", () => { if (rtPendente) { rtPendente = false; setTimeout(render, 200); } });

/* =====================================================================
   ENTRADA (login)
   ===================================================================== */
function mostrarApp(estado) {
  $("#login").hidden = true; $("#app").hidden = false;
  $("#estado").textContent = estado;
  render();
  fotoFamilia().then(atualizarLogo).catch(() => {});
  ligarTempoReal();
  if (!CRIANCA()) lancarContas().then(lancarDespesasFixas).catch((e) => console.error(e));
}
function mostrarLogin(msg, ok) {
  if (canal && sb) { sb.removeChannel(canal); canal = null; }
  store = null; FOTO = undefined; atualizarLogo();
  if (CRIANCA()) { PAPEL = "adulto"; SECOES_OK = []; montarMenus(); }
  $("#app").hidden = true; $("#login").hidden = false;
  const m = $("#login-msg"); m.textContent = msg || ""; m.classList.toggle("ok", !!ok);
}
function carregarScript(src) {
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Sem ligação à internet?")); document.head.appendChild(s); });
}
let msgSaida = "";
const MSG_ERRO = { "Invalid login credentials": "Email ou senha errados.", "Email not confirmed": "Este email ainda não foi confirmado." };

async function entrar(session) {
  const email = (session.user.email || "").toLowerCase();
  let { data, error } = await sb.from("membros").select("nome,papel,secoes").eq("email", email).maybeSingle();
  if (error && /papel|secoes|column/i.test(error.message)) ({ data, error } = await sb.from("membros").select("nome").eq("email", email).maybeSingle()); // acessos.sql ainda não corrido
  if (error || !data) {
    msgSaida = error ? "Erro a verificar acesso: " + error.message : "Esta conta ainda não tem acesso à casa.";
    await sb.auth.signOut();
    return mostrarLogin(msgSaida);
  }
  EU = data.nome;
  PAPEL = data.papel === "crianca" ? "crianca" : "adulto";
  SECOES_OK = data.secoes || [];
  montarMenus();
  store = storeSupabase();
  $("#btn-sair").hidden = false; $("#btn-senha").hidden = false;
  mostrarApp("Online · " + EU);
}

function dialogoSenha(titulo) {
  const dlg = $("#dlg"); dlg.oncancel = null;
  dlg.innerHTML = `<form class="form"><h2>${titulo}</h2>
    <label class="campo"><span>Nova senha (mínimo 8 caracteres)</span><input type="password" name="s1" autocomplete="new-password" minlength="8" required></label>
    <label class="campo"><span>Repetir a nova senha</span><input type="password" name="s2" autocomplete="new-password" required></label>
    <p class="msg" role="alert"></p>
    <div class="acoes"><span class="esp"></span><button type="button" class="sec" data-a="fechar">Cancelar</button><button class="pri">Guardar senha</button></div></form>`;
  const f = $("form", dlg);
  $("[data-a=fechar]", f).onclick = () => dlg.close();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const m = $(".msg", f);
    if (f.s1.value.length < 8) return (m.textContent = "A senha tem de ter pelo menos 8 caracteres.");
    if (f.s1.value !== f.s2.value) return (m.textContent = "As senhas não são iguais.");
    const { error } = await sb.auth.updateUser({ password: f.s1.value });
    if (error) return (m.textContent = error.message);
    dlg.close(); aviso("Senha alterada");
  };
  dlg.showModal();
}

async function iniciar() {
  if (!C.SUPABASE_URL || !C.SUPABASE_KEY) {
    EU = PESSOAS[0] || "";
    store = storeLocal();
    return mostrarApp("Demonstração · dados só neste aparelho");
  }
  try {
    await carregarScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js");
  } catch (e) { return mostrarLogin("Não foi possível carregar o sistema de login. Verifica a ligação à internet."); }
  sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);

  sb.auth.onAuthStateChange((ev) => {
    if (ev === "PASSWORD_RECOVERY") setTimeout(() => dialogoSenha("Escolhe uma senha nova"), 0);
    if (ev === "SIGNED_OUT") setTimeout(() => { mostrarLogin(msgSaida); msgSaida = ""; }, 0);
  });

  $("#form-login").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, b = $("button[type=submit]", f);
    b.disabled = true; $("#login-msg").textContent = "A entrar…"; $("#login-msg").classList.add("ok");
    const { data, error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.senha.value });
    b.disabled = false;
    if (error) return mostrarLogin(MSG_ERRO[error.message] || error.message);
    f.senha.value = "";
    await entrar(data.session);
  };
  $("#esqueci").onclick = async () => {
    const email = $("#form-login").email.value.trim();
    if (!email) return mostrarLogin("Escreve primeiro o teu email.");
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    mostrarLogin(error ? error.message : "Se o email tiver conta, vais receber uma mensagem para mudar a senha.", !error);
  };
  $("#btn-sair").onclick = () => sb.auth.signOut();
  $("#btn-senha").onclick = () => dialogoSenha("Mudar senha");

  const { data } = await sb.auth.getSession();
  if (data.session) await entrar(data.session); else mostrarLogin();
}

/* ---------- instalar a app no Android (Chrome, Samsung Internet, Edge…) ---------- */
(function () {
  const android = /android/i.test(navigator.userAgent);
  const jaInstalada = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (!android || jaInstalada()) return;
  try { const f = +localStorage.getItem("casa-instalar-fechado") || 0; if (Date.now() - f < 14 * 864e5) return; } catch (e) {}
  let pedido = null;
  const samsung = /samsungbrowser/i.test(navigator.userAgent), firefox = /firefox/i.test(navigator.userAgent);
  const passos = samsung ? "Toca no menu ☰ (em baixo, à direita) → «Adicionar página a» → «Ecrã inicial»."
    : firefox ? "Toca no menu ⋮ → «Instalar» ou «Adicionar ao ecrã principal». Se não aparecer, abre este endereço no Google Chrome."
    : "Toca no menu ⋮ (em cima, à direita) → «Instalar app» ou «Adicionar ao ecrã principal» → «Instalar».";
  const barra = document.createElement("div");
  barra.className = "instalar-barra"; barra.setAttribute("role", "region"); barra.setAttribute("aria-label", "Instalar a app");
  barra.innerHTML = '<img src="icons/icon-192.png" alt=""><div class="ib-txt"><b>Instalar «A Nossa Casa»</b><span class="ib-sub">Fica com ícone no telemóvel, como uma app.</span></div><button type="button" class="pri ib-sim">Instalar</button><button type="button" class="ib-nao" aria-label="Agora não">✕</button>';
  const sub = barra.querySelector(".ib-sub");
  barra.querySelector(".ib-sim").onclick = async () => {
    if (pedido) {
      pedido.prompt();
      const r = await pedido.userChoice.catch(() => ({}));
      pedido = null;
      if (r && r.outcome === "accepted") { barra.remove(); return; }
    }
    sub.textContent = passos; barra.classList.add("ib-passos");
  };
  barra.querySelector(".ib-nao").onclick = () => { try { localStorage.setItem("casa-instalar-fechado", String(Date.now())); } catch (e) {} barra.remove(); };
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); pedido = e; });
  window.addEventListener("appinstalled", () => barra.remove());
  const mostrar = () => { if (!document.body.contains(barra)) document.body.appendChild(barra); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(mostrar, 1500)); else setTimeout(mostrar, 1500);
})();

montarMenus();
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
$("#btn-copia").onclick = exportarExcel;
iniciar();
