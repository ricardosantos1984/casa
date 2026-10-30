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
  };
}
function storeSupabase() {
  const ok = (r) => { if (r.error) throw r.error; return r.data; };
  return {
    modo: "online",
    async list(m) { return ok(await sb.from("itens").select("id,dados").eq("modulo", m)).map((r) => ({ ...r.dados, id: r.id })); },
    async add(m, d) { return ok(await sb.from("itens").insert({ modulo: m, dados: d }).select("id").single()).id; },
    async update(id, d) { ok(await sb.from("itens").update({ dados: d }).eq("id", id)); },
    async remove(id) { ok(await sb.from("itens").delete().eq("id", id)); },
    async getDoc(id) { const r = ok(await sb.from("documentos").select("dados").eq("id", id).maybeSingle()); return r ? r.dados : null; },
    async setDoc(id, d) { ok(await sb.from("documentos").upsert({ id, dados: d })); },
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
      { k: "notas", l: "Notas", t: "textarea" },
    ],
    titulo: (d) => d.desc || d.cat,
    detalhe: (d) => junta(fmtData(d.data), d.cat, d.quem),
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
      { k: "notas", l: "Notas (fornecedor, contrato…)", t: "textarea" },
    ],
    titulo: (d) => d.nome,
    detalhe: (d) => junta(d.periodo, d.dia ? "dia " + d.dia : "", d.debito ? "débito direto" : ""),
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
    ${al.map((a) => `<span class="al ${a.nivel}">${esc(a.texto)}</span>`).join("")}</div>
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
    <button class="pri">+ Adicionar</button></div><div class="topo"></div><div class="lista"></div>`;
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
  $(".pri", box).onclick = () => abrirForm(col, null);
  const abrir = async (e) => {
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

async function abrirForm(col, it) {
  const dlg = $("#dlg");
  const campos = await Promise.all(col.campos.map(async (c) => ({ ...c, o: typeof c.o === "function" ? await c.o() : c.o })));
  const val = (c) => (it ? it[c.k] : typeof c.def === "function" ? c.def() : c.def ?? "");
  dlg.innerHTML = `<form class="form" novalidate>
    <h2>${it ? "Editar" : "Novo(a)"} ${esc(col.item)}</h2>
    ${campos.map((c) => campoHtml(c, val(c))).join("")}
    <p class="msg" role="alert"></p>
    <div class="acoes">${it ? `<button type="button" class="perigo" data-a="apagar">Apagar</button>` : ""}<span class="esp"></span>
    <button type="button" class="sec" data-a="fechar">Cancelar</button><button type="submit" class="pri">Gravar</button></div></form>`;
  const f = $("form", dlg);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = lerForm(f, campos);
    const falta = campos.find((c) => c.req && (d[c.k] === "" || d[c.k] == null));
    if (falta) { $(".msg", f).textContent = `Preenche "${falta.l}".`; f.elements.namedItem(falta.k).focus(); return; }
    try {
      if (it) await store.update(it.id, { ...semId(it), ...d }); else await store.add(col.id, d);
      dlg.close(); aviso("Gravado"); render();
    } catch (err) { $(".msg", f).textContent = "Não foi possível gravar: " + (err.message || err); }
  };
  $("[data-a=fechar]", f).onclick = () => dlg.close();
  const ap = $("[data-a=apagar]", f);
  if (ap) ap.onclick = async () => {
    if (!confirm("Apagar este registo?")) return;
    try { await store.remove(it.id); dlg.close(); aviso("Apagado"); render(); } catch (err) { erro(err); }
  };
  dlg.showModal();
  const p = $("input:not([type=checkbox]),select,textarea", f); if (p) p.focus();
}

const cab = (titulo, sub) => `<div class="cab"><div><h1>${titulo}</h1>${sub ? `<div class="sub2">${sub}</div>` : ""}</div></div>`;

/* =====================================================================
   INÍCIO
   ===================================================================== */
const ROTA_DE = { veiculos: "veiculos", tarefas: "casa", garantias: "casa", datas: "familia", documentos: "familia", escola_testes: "escola", escola_eventos: "escola", viagens: "viagens", consultas: "medicos" };

let FOTO;
async function fotoFamilia() {
  if (FOTO === undefined) { const d = await store.getDoc("foto-familia"); FOTO = d && d.img ? { x: 50, y: 35, z: 1, ...d } : null; }
  return FOTO;
}
const estiloFoto = (f) => `object-position:${f.x}% ${f.y}%;transform:scale(${f.z});transform-origin:${f.x}% ${f.y}%`;
function ajustarFoto() {
  const f = { ...FOTO };
  const dlg = $("#dlg");
  dlg.innerHTML = `<div class="form"><div class="pega" aria-hidden="true"></div><h2>Ajustar foto</h2>
    <div class="heroi prev"><img class="heroi-img" alt="" src="${f.img}" style="${estiloFoto(f)}" draggable="false"></div>
    <p class="det" style="margin:0">Arrasta a foto com o dedo para escolher a parte que aparece.</p>
    <label class="campo"><span>Zoom</span><input type="range" id="f-zoom" min="1" max="2.5" step="0.05" value="${f.z}"></label>
    <div class="acoes"><button type="button" class="sec" data-a="repor">Repor</button><span class="esp"></span><button type="button" class="sec" data-a="fechar">Cancelar</button><button type="button" class="pri" data-a="guardar">Guardar</button></div></div>`;
  const prev = $(".prev", dlg), img = $("img", prev), zoom = $("#f-zoom", dlg);
  const aplicar = () => { img.style.cssText = estiloFoto(f); };
  const lim = (v) => Math.max(0, Math.min(100, v));
  let ini = null;
  prev.onpointerdown = (e) => { ini = { px: e.clientX, py: e.clientY, x: f.x, y: f.y }; prev.setPointerCapture(e.pointerId); };
  prev.onpointermove = (e) => {
    if (!ini) return;
    const r = prev.getBoundingClientRect(), k = 160 / f.z;
    f.x = lim(ini.x - ((e.clientX - ini.px) / r.width) * k);
    f.y = lim(ini.y - ((e.clientY - ini.py) / r.height) * k);
    aplicar();
  };
  prev.onpointerup = prev.onpointercancel = () => { ini = null; };
  zoom.oninput = () => { f.z = +zoom.value; aplicar(); };
  $("[data-a=repor]", dlg).onclick = () => { f.x = 50; f.y = 35; f.z = 1; zoom.value = 1; aplicar(); };
  $("[data-a=fechar]", dlg).onclick = () => dlg.close();
  $("[data-a=guardar]", dlg).onclick = async () => {
    try { await store.setDoc("foto-familia", { img: f.img, x: Math.round(f.x), y: Math.round(f.y), z: f.z }); FOTO = f; dlg.close(); aviso("Foto ajustada"); render(); }
    catch (err) { erro(err); }
  };
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

async function vInicio(el) {
  const ini = sabadoDe(hoje()), idx = Math.round((deIso(hoje()) - deIso(ini)) / 86400000);
  const ids = Object.keys(ROTA_DE);
  const [foto, docE, compras, despesas, ...listas] = await Promise.all([fotoFamilia(), store.getDoc("ementa-" + ini), store.list("compras"), store.list("despesas"), ...ids.map((i) => store.list(i))]);
  const sel = (docE && docE.sel) || {};
  const alertas = [];
  ids.forEach((cid, n) => { if (cid === "consultas") return; listas[n].forEach((it) => (COLS[cid].alertas(it) || []).forEach((a) => alertas.push({ ...a, rota: ROTA_DE[cid], tit: COLS[cid].titulo(it), ico: typeof COLS[cid].ico === "function" ? COLS[cid].ico(it) : COLS[cid].ico }))); });
  alertas.push(...alertasEscolares());
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

  el.innerHTML = `<div class="heroi ${foto ? "" : "sem-foto"}">
    ${foto ? `<img class="heroi-img" alt="A família" src="${foto.img}" style="${estiloFoto(foto)}">` : ""}
    <div class="foto-btns">${foto ? `<button type="button" class="foto-btn" id="foto-aj">${svg("mover")}<span>Ajustar</span></button>` : ""}
    <label class="foto-btn">${svg("camara")}<span>${foto ? "Mudar" : "Pôr foto da família"}</span><input type="file" accept="image/*" id="foto-inp" hidden></label></div>
    <div class="heroi-txt"><h1>${EU ? "Olá, " + esc(EU) : "Olá!"}</h1><div class="sub2">${esc(cap(dataLonga))}</div></div>
  </div>
  <a class="hoje" href="#ementas">
    <div class="hoje-cab"><span class="bolha">${svg("ementas")}</span><h2>Hoje na ementa</h2><span class="seta">›</span></div>
    ${nada ? `<p class="vazio">Ainda não há nada escolhido para hoje. Toca para escolher.</p>` :
      refeicao("Pequeno-almoço", pv(v("P"))) + refeicao("Meio da manhã", pessoas(1)) + refeicao("Almoço", pv(v("A")), v("AS")) + refeicao("Meio da tarde", pessoas(2)) + refeicao("Jantar", pv(v("J")), v("JS"))}
  </a>
  <div class="grelha">
    <a class="mini" href="#compras"><span class="bolha">${svg("compras")}</span><span class="num">${falta.length}</span><span class="rot">por comprar</span></a>
    <a class="mini" href="#despesas"><span class="bolha">${svg("euro")}</span><span class="num">${euro(totSem)}</span><span class="rot">gasto esta semana</span></a>
    <a class="mini" href="#despesas"><span class="bolha">${svg("calendario")}</span><span class="num">${euro(totMes)}</span><span class="rot">gasto este mês</span></a>
  </div>
  <section class="seccao"><div class="sec-cab"><h2>Próximas consultas</h2><a class="ver" href="#medicos">Ver todas</a></div>
    ${consultas.length ? consultas.map((c) => { const n = diasAte(c.data); return `<a class="linha-l" href="#medicos"><span class="bolha ${n <= 1 ? "laranja" : "azul"}">${svg("medicos")}</span><span class="ct"><b>${esc(c.pessoa)} — ${esc(c.esp || "consulta")}</b><span class="det">${esc(fmtData(c.data))}${c.hora ? " às " + esc(c.hora) : ""}${c.local ? " · " + esc(c.local) : ""}</span></span><span class="tag ${n <= 1 ? "laranja" : ""}">${esc(rel(n))}</span></a>`; }).join("") : `<p class="vazio">Sem consultas nos próximos 60 dias.</p>`}
  </section>
  <section class="seccao"><h2>Avisos</h2>
    ${alertas.length ? alertas.map((a) => `<a class="linha-l" href="#${a.rota}"><span class="bolha ${a.nivel}">${svg(a.ico || "calendario")}</span><span class="ct"><b>${esc(a.tit)}</b><span class="det">${esc(a.texto)}</span></span></a>`).join("") : `<p class="vazio">Nada urgente. 👍</p>`}
  </section>
  ${falta.length ? `<section class="seccao"><div class="sec-cab"><h2>Lista de compras</h2><a class="ver" href="#compras">Abrir</a></div><p class="chips">${falta.slice(0, 12).map((c) => `<span class="chip">${esc(c.nome)}</span>`).join("")}${falta.length > 12 ? `<span class="chip">+${falta.length - 12}</span>` : ""}</p></section>` : ""}`;
  $("#foto-inp", el).onchange = async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    aviso("A guardar a foto…");
    try { const img = await reduzirImagem(f); const nova = { img, x: 50, y: 35, z: 1 }; await store.setDoc("foto-familia", nova); FOTO = nova; aviso("Foto guardada"); await render(); ajustarFoto(); }
    catch (err) { erro(err); }
  };
  const aj = $("#foto-aj", el); if (aj) aj.onclick = ajustarFoto;
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

function desenharEmenta(el) {
  const feitas = Object.entries(E.sel).filter(([k, v]) => v && !/S$/.test(k)).length;
  el.innerHTML = `<div class="cab"><div><h1>Ementa semanal</h1><div class="sub2">${dm(E.ini)} a ${dm(somaDias(E.ini, 6))} · ${feitas} de 63 escolhas feitas</div></div>
    <div class="semana">
      <button class="sec peq" data-sem="-7" aria-label="Semana anterior">◀</button>
      <label class="mes">Sábado <input type="date" id="ini" value="${E.ini}" aria-label="Início da semana (sábado)"></label>
      <button class="sec peq" data-sem="7" aria-label="Semana seguinte">▶</button>
      <button class="sec" id="copiar">Copiar semana anterior</button>
      <button class="pri" id="imprimir">Imprimir semana</button>
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

  const gravarSel = async () => { try { await store.setDoc("ementa-" + E.ini, { sel: E.sel }); aviso("Gravado"); } catch (e) { erro(e); } };
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
      E.ideias = { ...E.ideias, [lk]: [...l, t] };
      try { await store.setDoc("ementa-ideias", { ideias: E.ideias }); } catch (e) { erro(e); }
    }
    E.sel[E.dia + k] = t;
    await gravarSel();
    desenharEmenta(el);
  };

  el.onchange = (e) => {
    const t = e.target;
    if (t.dataset.k) { E.sel[E.dia + t.dataset.k] = t.value; gravarSel(); desenharEmenta(el); }
    else if (t.dataset.sal) { E.sel[E.dia + t.dataset.sal + "S"] = t.checked ? "1" : ""; gravarSel(); }
    else if (t.id === "ini" && t.value) mudarSemana(t.value);
  };
  el.onclick = async (e) => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.dia) { E.dia = +t.dataset.dia; desenharEmenta(el); }
    else if (t.dataset.sem) mudarSemana(somaDias(E.ini, +t.dataset.sem));
    else if (t.dataset.usar) usar(t.dataset.usar);
    else if (t.id === "imprimir") imprimirEmenta();
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

function imprimirEmenta() {
  const sel = E.sel, ini = E.ini;
  const pess = (i, ix) => WHO.filter((w) => sel[i + w[ix]]).map((w) => `<div><b>${w[0]}:</b> ${esc(sel[i + w[ix]])}</div>`).join("");
  const ref = (i, k) => esc(sel[i + k] || "") + (sel[i + k + "S"] ? `<div class="sal">(fazer salada)</div>` : "");
  const linhas = DIAS.map((d, i) => `<tr><th>${cap(d)}<br>${dm(somaDias(ini, i))}</th><td>${esc(sel[i + "P"] || "")}</td><td>${pess(i, 1)}</td><td>${ref(i, "A")}</td><td>${pess(i, 2)}</td><td>${ref(i, "J")}</td></tr>`).join("");
  $("#folha").innerHTML = `<div class="folha"><div class="ftit">Menu Semanal - ${dm(ini)} a ${dm(somaDias(ini, 6))}</div>
    <table><colgroup><col style="width:21mm"><col style="width:16%"><col style="width:21%"><col style="width:13%"><col style="width:23%"><col></colgroup>
    <thead><tr><th></th><th>Pequeno-Almoço</th><th>Meio da manhã</th><th>Almoço</th><th>Meio da tarde</th><th>Jantar</th></tr></thead>
    <tbody>${linhas}</tbody></table></div>`;
  window.print();
}

/* =====================================================================
   COMPRAS
   ===================================================================== */
let ultimaCat = "";
async function vCompras(el) {
  const col = COLS.compras;
  const itens = (await store.list("compras")).sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
  const falta = itens.filter((i) => !i.comprado), feitos = itens.filter((i) => i.comprado);
  const linha = (i) => `<div class="artigo ${i.comprado ? "feito" : ""}"><label><input type="checkbox" data-t="${esc(i.id)}" ${i.comprado ? "checked" : ""}><span>${esc(i.nome)}</span>${i.qtd ? `<span class="q">${esc(i.qtd)}</span>` : ""}</label><button class="sec peq" data-e="${esc(i.id)}" aria-label="Editar ${esc(i.nome)}">Editar</button></div>`;
  const grupos = [...CAT_COMP, ""].map((c) => { const g = falta.filter((i) => (i.cat || "") === c || (c === "Outros" && i.cat && !CAT_COMP.includes(i.cat))); return g.length ? `<div class="grupo"><h3>${esc(c || "Sem secção")}</h3>${g.map(linha).join("")}</div>` : ""; }).join("");
  el.innerHTML = `${cab("Lista de compras", `${falta.length} por comprar`)}
    <form class="rapido" id="rapido"><input name="nome" placeholder="Adicionar artigo (ex: leite)" aria-label="Artigo" autocomplete="off">
      <input name="qtd" class="qtd" placeholder="Qtd." aria-label="Quantidade">
      <select name="cat" aria-label="Secção"><option value="">Secção…</option>${CAT_COMP.map((c) => `<option ${c === ultimaCat ? "selected" : ""}>${c}</option>`).join("")}</select>
      <button class="pri">Adicionar</button></form>
    <section class="seccao">${grupos || `<p class="vazio">A lista está vazia.</p>`}
      ${feitos.length ? `<div class="grupo"><h3>Já no carrinho</h3>${feitos.map(linha).join("")}</div><div><button class="sec" id="limpar">Limpar comprados (${feitos.length})</button></div>` : ""}
    </section>`;
  const f = $("#rapido", el);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const nome = f.nome.value.trim(); if (!nome) return f.nome.focus();
    ultimaCat = f.cat.value;
    try { await store.add("compras", { nome, qtd: f.qtd.value.trim(), cat: f.cat.value, comprado: false }); await render(); $("#rapido input[name=nome]")?.focus(); } catch (err) { erro(err); }
  };
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

/* =====================================================================
   DESPESAS, VEÍCULOS, CASA, FAMÍLIA, MÉDICOS
   ===================================================================== */
let mesDesp = hoje().slice(0, 7);
async function vDespesas(el) {
  const nomeMes = deIso(mesDesp + "-01").toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
  el.innerHTML = `<div class="cab"><div><h1>Despesas</h1><div class="sub2">${cap(nomeMes)}</div></div>
    <label class="mes">Mês <input type="month" id="mes" value="${mesDesp}"></label></div>`;
  $("#mes", el).onchange = (e) => { mesDesp = e.target.value || hoje().slice(0, 7); render(); };
  await seccao(el, COLS.despesas, {
    filtro: (d) => String(d.data || "").startsWith(mesDesp),
    topo: (vis) => {
      if (!vis.length) return "";
      const tot = vis.reduce((s, d) => s + (+d.valor || 0), 0);
      const porCat = {}; vis.forEach((d) => { const c = d.cat || "Sem categoria"; porCat[c] = (porCat[c] || 0) + (+d.valor || 0); });
      const porQuem = {}; vis.forEach((d) => { if (d.quem) porQuem[d.quem] = (porQuem[d.quem] || 0) + (+d.valor || 0); });
      const max = Math.max(...Object.values(porCat), 1);
      return `<div class="resumo"><div class="total">Total: ${euro(tot)}</div>
        ${Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<div class="barra"><span>${esc(c)}</span><span class="b"><i style="width:${(v / max) * 100}%"></i></span><b>${euro(v)}</b></div>`).join("")}
        ${Object.keys(porQuem).length ? `<div class="det">${Object.entries(porQuem).map(([q, v]) => `${esc(q)}: ${euro(v)}`).join(" · ")}</div>` : ""}</div>`;
    },
  });
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

async function vEscola(el) {
  el.innerHTML = cab("Escola Ema", "Calendário, testes, trabalhos, reuniões, atividades e contactos da escola.") + blocoCalendario();
  await seccao(el, COLS.escola_testes);
  await seccao(el, COLS.escola_eventos);
  await seccao(el, COLS.escola_atividades);
  await seccao(el, COLS.escola_contactos);
}

async function vViagens(el) {
  el.innerHTML = cab("Viagens", "Ideias, viagens marcadas, reservas e a lista para a mala.");
  await seccao(el, COLS.viagens);
  await seccao(el, COLS.reservas);
  await seccao(el, COLS.mala);
}

async function vMedicos(el) {
  el.innerHTML = cab("Médicos", "Consultas, contactos e registos de saúde de cada pessoa.");
  await seccao(el, COLS.consultas);
  await seccao(el, COLS.contactos);
  await seccao(el, COLS.saude);
}


/* ---------- menu (ícones) ---------- */
const ICO = {
  inicio: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  ementas: '<path d="M6 3v7a2 2 0 0 0 4 0V3M8 12v9M17 21V3c-2 1-3 3-3 7s1 4 3 4"/>',
  compras: '<path d="M3 4h2.5l2.2 11h10.6L21 7.5H6.4"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
  despesas: '<path d="M17.5 6.5A7 7 0 1 0 17.5 17.5"/><path d="M4 10.5h9M4 13.5h9"/>',
  veiculos: '<path d="M4 13.5l1.8-5.5A2 2 0 0 1 7.7 6.5h8.6a2 2 0 0 1 1.9 1.5L20 13.5v4.5H4z"/><path d="M4 13.5h16"/><circle cx="8" cy="16" r=".8"/><circle cx="16" cy="16" r=".8"/><path d="M6 18v2M18 18v2"/>',
  casa: '<path d="M14.5 5.5a4 4 0 0 0 5 5l-8.8 8.8a2.1 2.1 0 0 1-3-3l8.8-8.8z"/><path d="M14.5 5.5l2-2 4 4-2 2"/>',
  familia: '<circle cx="9" cy="8" r="3"/><path d="M3.5 20c0-3.2 2.5-5.5 5.5-5.5s5.5 2.3 5.5 5.5"/><circle cx="17" cy="9.5" r="2.3"/><path d="M16.5 14.6c2.6.2 4.4 2.3 4.4 5.4"/>',
  medicos: '<path d="M12 20.5s-8-4.8-8-10.8A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.7c0 6-8 10.8-8 10.8z"/><path d="M8 12h2l1.2-2 1.6 4 1.2-2h2"/>',
  mover: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
  camara: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.5-2.5h5.6L16.3 7h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.8" r="3.3"/>',
  viagens: '<rect x="3.5" y="7" width="17" height="13" rx="2.5"/><path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M8 7v13M16 7v13"/>',
  calendario: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
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
const SECOES = [["inicio", "Início"], ["ementas", "Ementas"], ["compras", "Compras"], ["despesas", "Despesas"], ["veiculos", "Veículos"], ["casa", "Casa"], ["familia", "Família"], ["escola", "Escola Ema"], ["viagens", "Viagens"], ["medicos", "Médicos"]];
const svg = (k) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[k]}</svg>`;
const NA_BARRA = ["inicio", "ementas", "compras", "despesas"];
function montarMenus() {
  $("#nav").innerHTML = SECOES.map(([r, l]) => `<a href="#${r}" data-r="${r}">${svg(r)}<span>${l}</span></a>`).join("");
  $("#tabbar").innerHTML = SECOES.filter(([r]) => NA_BARRA.includes(r)).map(([r, l]) => `<a href="#${r}" data-r="${r}">${svg(r)}<span>${l}</span></a>`).join("")
    + `<button type="button" id="btn-mais" data-r="mais">${svg("mais")}<span>Mais</span></button>`;
  $("#btn-mais").onclick = abrirMais;
}
function abrirMais() {
  const dlg = $("#dlg");
  const online = store && store.modo === "online";
  dlg.innerHTML = `<div class="form folha-mais"><div class="pega" aria-hidden="true"></div><h2>Mais</h2>
    <div class="mosaico">${SECOES.filter(([r]) => !NA_BARRA.includes(r)).map(([r, l]) => `<a href="#${r}" class="tile">${svg(r)}<span>${l}</span></a>`).join("")}</div>
    ${online ? `<div class="acoes"><button type="button" class="sec" data-a="senha">Mudar senha</button><button type="button" class="sec" data-a="sair">Sair</button></div>` : ""}
    <button type="button" class="sec grande" data-a="fechar">Fechar</button></div>`;
  dlg.onclick = (e) => {
    if (e.target === dlg || e.target.closest("[data-a=fechar]") || e.target.closest("a.tile")) dlg.close();
    if (e.target.closest("[data-a=senha]")) { dlg.close(); dialogoSenha("Mudar senha"); }
    if (e.target.closest("[data-a=sair]")) { dlg.close(); sb.auth.signOut(); }
  };
  dlg.classList.add("de-baixo");
  dlg.addEventListener("close", () => { dlg.onclick = null; dlg.classList.remove("de-baixo"); }, { once: true });
  dlg.showModal();
}

/* =====================================================================
   NAVEGAÇÃO
   ===================================================================== */
const ROTAS = { inicio: vInicio, ementas: vEmenta, compras: vCompras, despesas: vDespesas, veiculos: vVeiculos, casa: vCasa, familia: vFamilia, escola: vEscola, viagens: vViagens, medicos: vMedicos };
async function render() {
  if (!store) return;
  const h = location.hash.slice(1), rota = ROTAS[h] ? h : "inicio";
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

/* =====================================================================
   ENTRADA (login)
   ===================================================================== */
function mostrarApp(estado) {
  $("#login").hidden = true; $("#app").hidden = false;
  $("#estado").textContent = estado;
  render();
}
function mostrarLogin(msg, ok) {
  store = null; FOTO = undefined;
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
  const { data, error } = await sb.from("membros").select("nome").eq("email", email).maybeSingle();
  if (error || !data) {
    msgSaida = error ? "Erro a verificar acesso: " + error.message : "Esta conta ainda não tem acesso à casa.";
    await sb.auth.signOut();
    return mostrarLogin(msgSaida);
  }
  EU = data.nome;
  store = storeSupabase();
  $("#btn-sair").hidden = false; $("#btn-senha").hidden = false;
  mostrarApp("Online · " + EU);
}

function dialogoSenha(titulo) {
  const dlg = $("#dlg");
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

montarMenus();
iniciar();
