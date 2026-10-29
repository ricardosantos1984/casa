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

const COLS = {
  compras: {
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
  saude: {
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
  return `<div class="cartao ${nv}" data-id="${esc(it.id)}" tabindex="0" role="button" aria-label="Editar ${esc(col.titulo(it))}">
    <div class="ct"><div class="tit">${esc(col.titulo(it))}</div>${col.detalhe ? `<div class="det">${col.detalhe(it)}</div>` : ""}
    ${al.map((a) => `<span class="al ${a.nivel}">${esc(a.texto)}</span>`).join("")}</div>
    ${col.valor ? `<div class="val">${esc(col.valor(it))}</div>` : ""}
    ${col.acao ? `<button class="sec peq" data-acao="${esc(it.id)}">${col.acao.l}</button>` : ""}
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
    const el = f.elements[c.k];
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
    if (falta) { $(".msg", f).textContent = `Preenche "${falta.l}".`; f.elements[falta.k].focus(); return; }
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
const ROTA_DE = { veiculos: "veiculos", tarefas: "casa", garantias: "casa", datas: "familia", documentos: "familia", consultas: "medicos" };

async function vInicio(el) {
  const ini = sabadoDe(hoje()), idx = Math.round((deIso(hoje()) - deIso(ini)) / 86400000);
  const ids = Object.keys(ROTA_DE);
  const [docE, compras, despesas, ...listas] = await Promise.all([store.getDoc("ementa-" + ini), store.list("compras"), store.list("despesas"), ...ids.map((i) => store.list(i))]);
  const sel = (docE && docE.sel) || {};
  const alertas = [];
  ids.forEach((cid, n) => listas[n].forEach((it) => (COLS[cid].alertas(it) || []).forEach((a) => alertas.push({ ...a, rota: ROTA_DE[cid], tit: COLS[cid].titulo(it) }))));
  alertas.sort((a, b) => a.dias - b.dias);
  const porComprar = compras.filter((c) => !c.comprado).length;
  const mes = hoje().slice(0, 7);
  const totMes = despesas.filter((d) => (d.data || "").startsWith(mes)).reduce((s, d) => s + (+d.valor || 0), 0);
  const dataLonga = new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
  const ref = (k) => sel[idx + k] ? esc(sel[idx + k]) + (sel[idx + k + "S"] ? " <small>(+ salada)</small>" : "") : `<span class="vazio">por escolher</span>`;
  el.innerHTML = `${cab(EU ? "Olá, " + esc(EU) : "Olá!", cap(dataLonga))}
  <div class="grelha">
    <a class="mini" href="#ementas"><span class="rot">Hoje na ementa</span>
      <div><b>Almoço:</b> ${ref("A")}</div><div><b>Jantar:</b> ${ref("J")}</div></a>
    <a class="mini" href="#compras"><span class="rot">Lista de compras</span><span class="num">${porComprar}</span><span>${porComprar === 1 ? "artigo" : "artigos"} por comprar</span></a>
    <a class="mini" href="#despesas"><span class="rot">Despesas este mês</span><span class="num">${euro(totMes)}</span></a>
  </div>
  <section class="seccao"><h2>Avisos e próximos dias</h2>
    <div>${alertas.length ? alertas.map((a) => `<a class="alerta-linha" href="#${a.rota}"><span class="ponto ${a.nivel}"></span><span><b>${esc(a.tit)}</b><br><span class="det">${esc(a.texto)}</span></span></a>`).join("") : `<p class="vazio">Nada urgente. 👍</p>`}</div>
  </section>`;
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

async function vMedicos(el) {
  el.innerHTML = cab("Médicos", "Consultas, contactos e registos de saúde de cada pessoa.");
  await seccao(el, COLS.consultas);
  await seccao(el, COLS.contactos);
  await seccao(el, COLS.saude);
}

/* =====================================================================
   NAVEGAÇÃO
   ===================================================================== */
const ROTAS = { inicio: vInicio, ementas: vEmenta, compras: vCompras, despesas: vDespesas, veiculos: vVeiculos, casa: vCasa, familia: vFamilia, medicos: vMedicos };
async function render() {
  if (!store) return;
  const h = location.hash.slice(1), rota = ROTAS[h] ? h : "inicio";
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
  store = null;
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
    return mostrarApp("Modo demonstração · dados só neste browser");
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

iniciar();
