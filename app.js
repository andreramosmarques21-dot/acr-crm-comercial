/* CRM Comercial ACR · lê os dados do Supabase e calcula os indicadores no navegador */
const C = window.ACR_CONFIG;
const $ = id => document.getElementById(id);
const sum = (a, f) => a.reduce((s, x) => s + (+f(x) || 0), 0);
const by = (a, f) => a.reduce((m, x) => { const k = f(x) ?? "Não informado"; (m[k] = m[k] || []).push(x); return m; }, {});
const R0 = v => isFinite(v) ? "R$ " + Math.round(v).toLocaleString("pt-BR") : "—";
const R2 = v => isFinite(v) ? "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
const P = (v, d = 1) => isFinite(v) ? (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: d }) + "%" : "—";
const N = v => isFinite(v) ? Math.round(v).toLocaleString("pt-BR") : "—";
const X = v => isFinite(v) ? "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
const REG = { SP: "Sudeste", RJ: "Sudeste", MG: "Sudeste", ES: "Sudeste", PR: "Sul", SC: "Sul", RS: "Sul", GO: "Centro-Oeste", DF: "Centro-Oeste", MT: "Centro-Oeste", MS: "Centro-Oeste", AC: "Norte", AM: "Norte", AP: "Norte", PA: "Norte", RO: "Norte", RR: "Norte", TO: "Norte" };
const regiao = uf => REG[uf] || (uf && uf.length === 2 ? "Nordeste" : "Não informado");

/* ---------- dados ---------- */
let D = null, MES = null, MI = {};
async function api(path) {
  const r = await fetch(`${C.SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: C.SUPABASE_KEY } });
  if (!r.ok) throw new Error("Falha ao ler " + path.split("?")[0]);
  return r.json();
}
async function carregar(mes) {
  $("content").innerHTML = `<p class="muted">Carregando dados…</p>`;
  const meses = await api("meses?select=id,rotulo,parcial,dados_ate,campanhas_ate&order=id.desc");
  MES = mes || (meses[0] && meses[0].id);
  $("mes").innerHTML = meses.length ? meses.map(m => `<option value="${m.id}" ${m.id === MES ? "selected" : ""}>${m.rotulo}</option>`).join("") : `<option>Sem meses</option>`;
  MI = meses.find(m => m.id === MES) || {};
  if (!MES) { D = null; return; }
  const q = `mes_id=eq.${MES}`;
  const [campanhas, civel, prev, metas, prem, trab, ativ, social, socialF] = await Promise.all([
    api(`campanhas?${q}`), api(`contratos_civel?${q}`), api(`contratos_prev?${q}`), api(`metas?${q}`), api(`premissas_prev?${q}`), api(`contratos_trab?${q}`),
    api(`atividade_diaria?${q}&order=data`).catch(() => []),
    api(`leads_social?mes_id=lte.${MES}&order=data`).catch(() => []), api(`social_fechamentos?${q}`).catch(() => [])
  ]);
  D = { campanhas, civel, prev, metas, trab, ativ, socialAll: social, social: social.filter(x => x.mes_id === MES), socialF, prem: prem[0] || { salario_beneficio: 2500, meses_atrasados_aux: 12, meses_atrasados_bpc: 6, parcelas_bit: 4, taxa_exito: 0.6, salario_minimo: 1621 } };
}
function honorario(ben, p) {
  const sb = +p.salario_beneficio, sm = +p.salario_minimo;
  if (/acidente/i.test(ben)) { const b = .5 * sb; return 4 * b + .3 * p.meses_atrasados_aux * b; }
  if (/bpc/i.test(ben)) return 4 * sm + .3 * p.meses_atrasados_bpc * sm;
  if (/incap/i.test(ben)) return .3 * .91 * sb * p.parcelas_bit;
  if (/matern/i.test(ben)) return .3 * 4 * sm;
  return 0;
}

/* Metas e regras */
const FAIXAS_PREV = [[35, 60], [20, 40], [10, 30]]; // a partir de X protocolos → R$ por contrato (vale para todos)
const faixaPrev = n => { const f = FAIXAS_PREV.find(([min]) => n >= min); return f ? { min: f[0], valor: f[1], premio: n * f[1] } : { min: 0, valor: 0, premio: 0 }; };
const metaSetor = area => { const m = D.metas.find(x => x.area === area && x.pessoa === "SETOR"); return m ? +m.meta : null; };
const FAIXAS_CLOSER = [[30000, .15], [20000, .07], [10000, .05]]; // valor recebido acumulado no mês → % de comissão sobre todo o valor
const faixaCloser = v => { const f = FAIXAS_CLOSER.find(([min]) => v >= min); const prox = [...FAIXAS_CLOSER].reverse().find(([min]) => v < min); return { min: f ? f[0] : 0, pct: f ? f[1] : 0, comissao: f ? v * f[1] : 0, prox: prox ? prox[0] : null }; };
// Regras da apresentação do comercial (cível)
const REGRAS = { metaCloser: 30000, bonusPrimeiro: 300, bonusMaior: 500, metaSdr: 15, pctSdrMeta: .01, pctSdrBase: .005, diariaSdr: 15 };
function diasDoMes(mes) { const [y, m] = MES.split("-").map(Number); const tot = new Date(y, m, 0).getDate(); return MI.parcial && MI.dados_ate ? Math.min(tot, +MI.dados_ate.slice(8, 10)) : tot; }
const dm_ = d => d ? d.slice(8, 10) + "/" + d.slice(5, 7) : "";
const mesNome = () => (MI.rotulo || "").split("/")[0].toLowerCase() || "o mês";
const semCampanhas = () => !D || !D.campanhas.length || (MI.parcial && !MI.campanhas_ate);
// Diária: R$ 15 por dia com pelo menos um contrato qualificado pelo SDR (data de fechamento do closer). Dia sem contrato não acumula.
function diariaSdr(lista) { const dias = new Set(lista.filter(x => x.data).map(x => x.data)); return { pago: dias.size * REGRAS.diariaSdr, dias: dias.size }; }
// Primeiro closer a atingir a meta individual, pela data dos contratos.
function primeiroNaMeta(c) { let melhor = null; Object.entries(by(c, x => x.closer)).forEach(([p, l]) => { let acc = 0; for (const x of l.filter(x => x.data).sort((a, b) => a.data.localeCompare(b.data))) { acc += +x.valor_recebido; if (acc >= REGRAS.metaCloser) { if (!melhor || x.data < melhor.data) melhor = { p, data: x.data }; break; } } }); return melhor; }
const SEM_CUSTO = ["Orgânico", "Indicação", "TikTok"];

/* ---------- Custo colaborador: valor fixo + comissões/premiações ---------- */
const FIXO = { sdr: 2000, closer: 2400, prev: 2000, trab: 1800, social: 900 };
// Social Seller: conta o lead encaminhado que FECHOU contrato no mês. Até 4: R$ 30 por contrato; 5 a 15: R$ 50 por contrato;
// 16 ou mais: a definir (calculado a R$ 50 até definir).
const encaminhados = () => (D.socialF || []).length;
const faixaSocial = (enc, contratos) => enc >= 16 ? { valor: 50, premio: contratos * 50, aDefinir: true } : enc >= 5 ? { valor: 50, premio: contratos * 50 } : { valor: 30, premio: contratos * 30 };
const socialNome = () => { const m = (D.metas || []).find(x => x.area === "social" && x.pessoa !== "SETOR"); return m ? m.pessoa : null; };
// Fixo do Social Seller no mês: o valor da linha em metas quando informado (mês proporcional, ex.: setembro = R$ 510 a partir de 14/09); senão o fixo cheio.
const fixoSocial = () => { const m = (D.metas || []).find(x => x.area === "social" && x.pessoa !== "SETOR"); return m && +m.meta > 0 ? +m.meta : FIXO.social; };
function equipeSocial(P_) { const nome = socialNome(); if (nome) P_[nome] = { p: nome, papeis: ["Social Seller"], fixo: fixoSocial(), variavel: faixaSocial(encaminhados(), (D.socialF || []).length).premio }; }
function equipeCivel() {
  const c = D.civel, rec = sum(c, x => x.valor_recebido), meta = metaSetor("civel"), timeMeta = meta ? rec >= meta : false, primeiro = primeiroNaMeta(c);
  const closers = Object.entries(by(c, x => x.closer)), sdrs = Object.entries(by(c.filter(x => x.sdr && !/pr[óo]prio/i.test(x.sdr)), x => x.sdr));
  const maior = [...closers].sort((a, b) => sum(b[1], x => x.valor_recebido) - sum(a[1], x => x.valor_recebido))[0];
  const P_ = {}; const get = p => P_[p] || (P_[p] = { p, papeis: [], fixo: 0, variavel: 0 });
  sdrs.forEach(([p, l]) => { const o = get(p), bate = l.length >= REGRAS.metaSdr; o.papeis.push("SDR"); o.variavel += rec * (bate ? REGRAS.pctSdrMeta : REGRAS.pctSdrBase) + diariaSdr(l).pago; });
  closers.forEach(([p, l]) => { const o = get(p), v = sum(l, x => x.valor_recebido); o.papeis.push("Closer"); o.variavel += faixaCloser(v).comissao + (primeiro && primeiro.p === p ? REGRAS.bonusPrimeiro : 0) + (timeMeta && maior && maior[0] === p ? REGRAS.bonusMaior : 0); });
  Object.values(P_).forEach(o => o.fixo = o.papeis.includes("SDR") ? FIXO.sdr : FIXO.closer);
  equipeSocial(P_);
  return fechaEquipe(P_);
}
// Equipe do previdenciário: quem tem contrato no mês + quem está cadastrado nas metas (ex.: consultora nova ainda sem contrato).
const equipeListaPrev = () => D.metas.filter(m => m.area === "previdenciario" && m.pessoa !== "SETOR").map(m => m.pessoa);
const AGUARDA_CALCULO = /pens|aposent/i; // benefícios ainda sem regra de honorário
function equipePrev() {
  const P_ = {}; equipeListaPrev().forEach(p => { P_[p] = { p, papeis: ["Consultor"], fixo: FIXO.prev, variavel: 0 }; });
  Object.entries(by(D.prev, x => x.consultor)).forEach(([p, l]) => { P_[p] = { p, papeis: ["Consultor"], fixo: FIXO.prev, variavel: faixaPrev(l.filter(x => x.protocolado === "sim").length).premio }; });
  return fechaEquipe(P_);
}
function trabCalc() {
  const meta = metaSetor("trabalhista"), LIM = meta || 15, val = D.trab.filter(validoTrab);
  let top = null, topDia = null;
  if (meta) Object.entries(by(val, x => x.consultor)).forEach(([p, l]) => { const ord = [...l].sort((a, b) => (a.data || "9999").localeCompare(b.data || "9999")); if (ord.length >= meta) { const d = ord[meta - 1].data || "9999"; if (!topDia || d < topDia) { top = p; topDia = d; } } });
  const cons = Object.entries(by(D.trab, x => x.consultor)).map(([p, l]) => { const v = l.filter(validoTrab).length, valor = v >= LIM ? 40 : v >= 1 ? 30 : 0, bonus = p === top ? 100 : 0; return { p, tot: l.length, v, valor, premio: v * valor, bonus }; }).sort((a, b) => b.v - a.v);
  return { meta, LIM, top, topDia, cons };
}
function equipeTrab() {
  const P_ = {}; trabCalc().cons.forEach(x => { P_[x.p] = { p: x.p, papeis: ["Consultor"], fixo: FIXO.trab, variavel: x.premio + x.bonus }; });
  return fechaEquipe(P_);
}
function fechaEquipe(P_) { const l = Object.values(P_); return { pessoas: l, fixo: sum(l, x => x.fixo), variavel: sum(l, x => x.variavel), total: sum(l, x => x.fixo + x.variavel) }; }
const noCusto = (eq, edge) => ({ k: "Custo colaborador", v: R0(eq.total), d: `${eq.pessoas.length} pessoas: fixo ${R0(eq.fixo)} + comissões ${R0(eq.variavel)}`, m: [["Peso das comissões", P(eq.variavel / eq.total, 0)]], neg: true, edge });

/* ---------- indicadores do Marketing no Comercial ---------- */
// Regra: CAC = gasto com anúncios ÷ TODOS os clientes válidos (anúncio + orgânico + indicação + TikTok),
// porque orgânico e indicação são frutos indiretos das campanhas.
function origensSemCusto(lista, valorFn) {
  return Object.entries(by(lista.filter(c => !c.campanha_grupo && SEM_CUSTO.includes(c.canal)), c => c.canal))
    .map(([k, l]) => [k, 0, "Sem custo de anúncio", `${l.length} cliente${l.length === 1 ? "" : "s"} · ${R0(sum(l, valorFn))}`]);
}
function mktCivel() {
  const cp = D.campanhas.filter(c => c.area === "civel"), inv = sum(cp, c => c.investimento), cont = sum(cp, c => c.contatos);
  const todos = D.civel, n = todos.length, pagos = todos.filter(c => c.campanha_grupo), np = pagos.length, no = n - np;
  const rec = sum(todos, c => c.valor_recebido), contr = sum(todos, c => c.valor_contratado);
  const invTot = sum(D.campanhas, c => c.investimento), cac = inv / n, meta = metaSetor("civel"), EQ = equipeCivel();
  const camps = Object.entries(by(cp, c => c.grupo)).map(([g, l]) => {
    const i = sum(l, c => c.investimento), k = sum(l, c => c.contatos), m = pagos.filter(c => c.campanha_grupo === g).length;
    const tipo = { conversa: "conversas", visita: "visitas", clique: "cliques" }[l[0].tipo_contato];
    return [g, i / m, `${X(i / k)} por contato · ${P(m / k, 2)} viram cliente`, `${N(k)} ${tipo} → ${m} contrato${m === 1 ? "" : "s"}`];
  }).sort((a, b) => (isFinite(a[1]) ? a[1] : 1e9) - (isFinite(b[1]) ? b[1] : 1e9)).concat(origensSemCusto(todos, c => c.valor_contratado));
  return {
    lead: `O cível fechou ${n} contratos: ${np} vieram direto dos anúncios e ${no} de orgânico, indicação e TikTok, que também são fruto indireto das campanhas.`,
    flow: [
      { k: "Gasto com anúncios", v: R0(inv), d: `${cp.length} campanhas`, m: [["Fatia do orçamento total", P(inv / invTot, 0)]], edge: "geram contatos" },
      { k: "Contatos recebidos", v: N(cont), d: "Conversas, visitas ao Instagram e cliques dos anúncios", m: [["Cada contato custou", X(inv / cont)]], edge: "equipe atende" },
      { k: "Clientes fechados", v: `${n} contratos`, d: `${np} de anúncio + ${no} de orgânico, indicação e TikTok`, m: [["Direto dos anúncios", P(np / n, 0)]], edge: "gasto ÷ clientes" },
      { k: "Custo por cliente (CAC)", v: R0(cac), d: "Gasto com anúncios ÷ todos os clientes do mês", m: [["Limite de referência", "R$ 250"], ["Peso no valor do contrato", P(cac / (contr / n), 0)]], cac: true, edge: "valor dos contratos" },
      { k: "Quanto entra", v: R0(contr), d: `${R0(rec)} já entraram e ${R0(contr - rec)} vêm em parcelas`, m: meta ? [["Meta do setor (recebido)", `${R0(rec)} de ${R0(meta)} · ${P(rec / meta, 0)}`], ["Valor médio do contrato", R0(contr / n)]] : [["Valor médio do contrato", R0(contr / n)]], edge: "menos o gasto" },
      { k: "Lucro bruto", v: R0(contr - inv), d: `Contratado − anúncios. No caixa do mês: ${R0(rec - inv)}`, m: [["Cada R$ 1 virou (no caixa)", X(rec / inv)], ["Cada R$ 1 virou (total)", X(contr / inv)]], edge: "menos a equipe" },
      noCusto(EQ, "lucro líquido"),
      { k: "Lucro líquido", v: R0(contr - inv - EQ.total), d: `Total contratado. No caixa do mês: ${R0(rec - inv - EQ.total)}`, m: [["Caixa do mês", R0(rec - inv - EQ.total)], ["Total contratado", R0(contr - inv - EQ.total)]], profit: true }
    ],
    tree: { root: ["Custo por cliente", R0(cac), "por contrato"], a: ["Gasto com anúncios", R0(inv), `${cp.length} campanhas`], a1: null, a2: null, b: ["Clientes do mês", N(n), "todas as origens"], b1: ["Dos anúncios", N(np), `${P(np / n, 0)} do total`], b2: ["Sem anúncio", N(no), "orgânico, indicação, TikTok"], bop: "+" },
    formula: `Custo por cliente = gasto com anúncios ÷ clientes do mês  →  ${R0(inv)} ÷ ${n} = ${R2(cac)}`,
    caption: "Orgânico, indicação e TikTok entram na conta porque também são fruto indireto das campanhas. Quanto mais clientes vierem dessas origens, menor fica o custo por cliente.",
    camps, teto: 250,
    insight: `Entre os anúncios, o mais barato foi ${camps[0][0]} (${R0(camps[0][1])} por cliente). ${no} clientes chegaram sem custo direto de anúncio.`,
    _: { inv, cont, n, rec, contr, eq: EQ.total }
  };
}
function mktPrev() {
  const cp = D.campanhas.filter(c => c.area === "previdenciario"), inv = sum(cp, c => c.investimento), cont = sum(cp, c => c.contatos);
  const pagos = D.prev.filter(c => c.campanha_grupo), protPagos = pagos.filter(c => c.protocolado === "sim");
  const prot = D.prev.filter(c => c.protocolado === "sim"), n = prot.length, np = protPagos.length, no = n - np;
  const ex = +D.prem.taxa_exito, esp = sum(prot, c => honorario(c.beneficio, D.prem)) * ex;
  const invTot = sum(D.campanhas, c => c.investimento), cac = inv / n, EQ = equipePrev();
  const cons = Object.entries(by(prot, c => c.consultor)).map(([p, l]) => [p, l.length, faixaPrev(l.length)]);
  const naMeta = cons.filter(c => c[2].min > 0).length;
  const camps = Object.entries(by(cp, c => c.grupo)).map(([g, l]) => {
    const i = sum(l, c => c.investimento), k = sum(l, c => c.contatos), ct = pagos.filter(c => c.campanha_grupo === g), pr = ct.filter(c => c.protocolado === "sim").length;
    return [g, i / pr, `${X(i / k)} por conversa · ${P(pr / k, 1)} viram cliente`, `${N(k)} conversas → ${ct.length} contratos → ${pr} protocolos`];
  }).sort((a, b) => (isFinite(a[1]) ? a[1] : 1e9) - (isFinite(b[1]) ? b[1] : 1e9)).concat(origensSemCusto(prot, c => honorario(c.beneficio, D.prem) * ex));
  return {
    lead: `Só conta o cliente com processo protocolado: ${n} em ${mesNome()}${MI.parcial ? " até agora" : ""}, sendo ${np} dos anúncios e ${no} de orgânico ou indicação. O escritório recebe quando o benefício é aprovado, então o valor é uma previsão.`,
    flow: [
      { k: "Gasto com anúncios", v: R0(inv), d: `${cp.length} campanhas`, m: [["Fatia do orçamento total", P(inv / invTot, 0)]], edge: "geram conversas" },
      { k: "Contatos recebidos", v: `${N(cont)} conversas`, d: "WhatsApp e Instagram", m: [["Cada conversa custou", X(inv / cont)]], edge: "consultor atende" },
      { k: "Clientes fechados", v: `${n} protocolados`, d: `${np} de anúncio + ${no} de orgânico ou indicação`, m: [["Contratos de anúncio protocolados", P(np / pagos.length, 0)], ["Consultores na faixa de meta", `${naMeta} de ${cons.length}`]], edge: "gasto ÷ clientes" },
      { k: "Custo por cliente (CAC)", v: R0(cac), d: "Gasto com anúncios ÷ todos os protocolos do mês", m: [["Custo por contrato assinado", R0(inv / D.prev.length)]], cac: true, edge: "honorários previstos" },
      { k: "Quanto deve entrar", v: R0(esp), d: `Honorários previstos se ${P(ex, 0)} forem aprovados`, m: [["Honorário previsto por cliente", R0(esp / n)], ["Quando entra", "em 6 a 24 meses"]], edge: "menos o gasto" },
      { k: "Lucro bruto previsto", v: R0(esp - inv), d: "Honorários previstos − anúncios. Só se confirma com a aprovação dos benefícios", m: [["Cada R$ 1 deve virar", X(esp / inv)]], edge: "menos a equipe" },
      noCusto(EQ, "lucro líquido"),
      { k: "Lucro líquido previsto", v: R0(esp - inv - EQ.total), d: `Caixa do mês: ${R0(-inv - EQ.total)} (os honorários entram em 6 a 24 meses)`, m: [["Caixa do mês", R0(-inv - EQ.total)]], profit: true }
    ],
    tree: { root: ["Custo por cliente", R0(cac), "por protocolo"], a: ["Gasto com anúncios", R0(inv), `${cp.length} campanhas`], a1: null, a2: null, b: ["Protocolos do mês", N(n), "todas as origens"], b1: ["Dos anúncios", N(np), `${P(np / n, 0)} do total`], b2: ["Sem anúncio", N(no), "orgânico e indicação"], bop: "+" },
    formula: `Custo por cliente = gasto com anúncios ÷ protocolos do mês  →  ${R0(inv)} ÷ ${n} = ${R2(cac)}`,
    caption: "Todos os protocolos do mês entram na conta, inclusive os de orgânico e indicação, que também são fruto indireto das campanhas.",
    camps, teto: 200, insight: "",
    _: { inv, cont, n, esp, eq: EQ.total }
  };
}
// Trabalhista: só contratos (sem valores em R$). Válido = documentação completa + cadastro no Astrea.
const validoTrab = x => x.cadastro_astrea && x.documentacao;
function mktTrab() {
  const cp = D.campanhas.filter(c => c.area === "trabalhista"), inv = sum(cp, c => c.investimento), cont = sum(cp, c => c.contatos);
  const tot = D.trab.length, n = D.trab.filter(validoTrab).length, cac = inv / n, meta = metaSetor("trabalhista"), EQ = equipeTrab();
  return {
    lead: `O trabalhista fechou ${tot} contratos, e ${n} estão válidos (documentação completa e cadastro no Astrea). Todos vêm da campanha do setor. Aqui não há valores em R$: o resultado é medido em contratos.`,
    flow: [
      { k: "Gasto com anúncios", v: R0(inv), d: `${cp.length} campanha no Meta`, m: [["Fatia do orçamento total", P(inv / sum(D.campanhas, c => c.investimento), 0)]], edge: "geram conversas" },
      { k: "Contatos recebidos", v: `${N(cont)} conversas`, d: "WhatsApp e Instagram", m: [["Cada conversa custou", X(inv / cont)]], edge: "consultor fecha" },
      { k: "Contratos fechados", v: `${tot} contratos`, d: `${tot - n} ainda sem documentação ou cadastro`, m: [["Conversas que viram contrato", P(tot / cont)]], edge: "documentação + Astrea" },
      { k: "Contratos válidos", v: `${n} válidos`, d: "Documentação completa e cadastro no Astrea", m: meta ? [["Meta do setor", `${n} de ${meta} · ${P(n / meta, 0)}`], ["Fechados que ficaram válidos", P(n / tot, 0)]] : [["Fechados que ficaram válidos", P(n / tot, 0)]], edge: "gasto ÷ válidos" },
      { k: "Custo por contrato (CAC)", v: R0(cac), d: "Gasto com anúncios ÷ contratos válidos", m: [["Se todos os fechados fossem válidos", R0(inv / tot)]], cac: true , edge: "mais a equipe" },
      noCusto(EQ, "custo total"),
      { k: "Custo total do setor", v: R0(inv + EQ.total), d: "Anúncios + equipe. O setor não tem valores em R$ de receita", m: [["Custo total por contrato válido", R0((inv + EQ.total) / n)]], neg: true }
    ],
    tree: { root: ["Custo por contrato", R0(cac), "por contrato válido"], a: ["Gasto com anúncios", R0(inv), "campanha Trabalhista"], a1: null, a2: null, b: ["Contratos válidos", N(n), "documentação + Astrea"], b1: ["Fechados", N(tot), "no mês"], b2: ["Viraram válidos", P(n / tot, 0), `${n} de ${tot}`], bop: "×" },
    formula: `Custo por contrato = gasto com anúncios ÷ contratos válidos  →  ${R0(inv)} ÷ ${n} = ${R2(cac)}`,
    caption: "Só conta o contrato com documentação completa e cadastro no Astrea. Cada contrato pendente que for regularizado reduz o custo por contrato.",
    camps: cp.map(c => [c.nome + " · " + c.plataforma, cac, `${X(c.investimento / c.contatos)} por conversa · ${P(n / c.contatos, 1)} viraram contrato válido`, `${N(c.contatos)} conversas → ${tot} fechados → ${n} válidos`]),
    teto: 200, insight: "",
    _: { inv, cont, n, eq: EQ.total }
  };
}
function mktCons() {
  const A = mktCivel(), B = mktPrev(), a = A._, b = B._;
  const T = D.trab && D.trab.length ? mktTrab() : null, t = T ? T._ : { inv: 0, cont: 0, n: 0 };
  const inv = a.inv + b.inv + t.inv, n = a.n + b.n + t.n, cont = a.cont + b.cont + t.cont;
  const camps = [...A.camps.map(c => [c[0] + " (cível)", c[1], "", c[3]]), ...B.camps.map(c => [c[0] + " (prev.)", c[1], "", c[3]]), ...(T ? T.camps.map(c => [c[0] + " (trab.)", c[1], "", c[3]]) : [])].sort((x, y) => (isFinite(x[1]) ? x[1] : 1e9) - (isFinite(y[1]) ? y[1] : 1e9));
  const total = a.contr + b.esp, EQT = a.eq + b.eq + (t.eq || 0);
  const setores = [D.civel.length && "cível", D.prev.length && "previdenciário", T && "trabalhista"].filter(Boolean);
  return {
    lead: `Todos os setores reúne o investimento em anúncios e o resultado de todos os setores com dados no mês (${setores.join(", ")}), com todas as origens de cliente.${T ? " O trabalhista entra em gasto e clientes, mas não tem valores em R$." : ""}`,
    flow: [
      { k: "Gasto com anúncios", v: R0(inv), d: `Cível ${R0(a.inv)} + Previdenciário ${R0(b.inv)}${T ? ` + Trabalhista ${R0(t.inv)}` : ""}`, m: [["Fatia do orçamento total", P(inv / sum(D.campanhas, c => c.investimento), 0)]], edge: "geram contatos" },
      { k: "Contatos recebidos", v: N(cont), d: `${N(a.cont)} cível + ${N(b.cont)} previdenciário${T ? ` + ${N(t.cont)} trabalhista` : ""}`, m: [["Cada contato custou", X(inv / cont)]], edge: "equipe atende" },
      { k: "Clientes fechados", v: N(n), d: `${a.n} contratos do cível + ${b.n} protocolos${T ? ` + ${t.n} contratos trabalhistas` : ""}`, m: [["Contatos para 1 cliente", N(cont / n)]], edge: "gasto ÷ clientes" },
      { k: "Custo por cliente (CAC)", v: R0(inv / n), d: "Gasto total ÷ clientes de todos os setores", m: [["Cível", R0(a.inv / a.n)], ["Previdenciário", R0(b.inv / b.n)]].concat(T ? [["Trabalhista", R0(t.inv / t.n)]] : []), cac: true, edge: "valor dos contratos" },
      { k: "Quanto entra", v: R0(total), d: `${R0(a.rec)} já entraram; ${R0(total - a.rec)} vêm depois${T ? " (trabalhista sem valor em R$)" : ""}`, m: [["Já no caixa", R0(a.rec)]], edge: "menos o gasto" },
      { k: "Lucro bruto", v: R0(total - inv), d: `${R0(a.rec - inv)} de caixa no mês, já descontado todo o gasto com anúncios`, m: [["Cada R$ 1 deve virar", X(total / inv)]], edge: "menos a equipe" },
      { k: "Custo colaborador", v: R0(EQT), d: `Cível ${R0(a.eq)} + Previdenciário ${R0(b.eq)}${T ? ` + Trabalhista ${R0(t.eq)}` : ""}`, m: [["Fixo + comissões", "todos os setores"]], neg: true, edge: "lucro líquido" },
      { k: "Lucro líquido previsto", v: R0(total - inv - EQT), d: `Inclui parcelas do cível e honorários do previdenciário que ainda vão entrar. Sobra no caixa de ${mesNome()}: ${R0(a.rec - inv - EQT)}, porque só o cível recebeu no mês (${R0(a.rec)}), mas anúncios e equipe dos ${setores.length} setores já foram pagos.`, m: [["Sobra no caixa do mês", R0(a.rec - inv - EQT)], ["Previsto (com o que vem depois)", R0(total - inv - EQT)]], profit: true }
    ],
    tree: { root: ["Custo por cliente", R0(inv / n), "média de todos os setores"], a: ["Gasto total", R0(inv), `${setores.length} setores`], a1: null, a2: null, b: ["Clientes válidos", N(n), setores.length + " setores"], b1: null, b2: null },
    formula: `Custo por cliente = gasto total ÷ total de clientes  →  ${R0(inv)} ÷ ${N(n)} = ${R2(inv / n)}`,
    caption: "A média pesa mais para o setor que trouxe mais clientes.",
    camps, teto: 250, insight: ""
  };
}
const MKT = { civel: mktCivel, prev: mktPrev, trab: mktTrab, cons: mktCons };
function renderMkt(f) {
  const flow = f.flow.map((n, i) => `<div class="step"><span class="step-n">${String(i + 1).padStart(2, "0")}</span><div class="node ${n.wait ? "wait" : ""} ${n.cac && !n.wait ? "cac" : ""} ${n.profit && !n.wait ? "profit" : ""} ${n.neg && !n.wait ? "neg" : ""}"><span class="k">${n.k}</span><span class="v">${n.v}</span><span class="d">${n.d}</span><div class="m">${n.m.map(([a, b]) => `<span>${a}: <b>${b}</b></span>`).join("")}</div></div><span class="edge-l">${n.edge ? "→ " + n.edge : ""}</span></div>`).join("");
  const max = Math.max(...f.camps.map(c => isFinite(c[1]) ? c[1] : 0), 1);
  const camps = f.camps.map(c => { const ok = isFinite(c[1]); const st = c[1] === 0 ? ["good", "Sem custo"] : !ok ? ["bad", "Sem cliente"] : c[1] <= f.teto * .5 ? ["good", "Bom"] : c[1] <= f.teto ? ["warn", "Atenção"] : ["bad", "Caro"];
    return `<div class="camp"><div class="top"><span class="name">${esc(c[0])}</span><span class="pill ${st[0]}">${st[1]}</span></div><span class="cv">${ok ? R2(c[1]) : "—"}</span><div class="meter"><span style="width:${ok ? c[1] / max * 100 : 0}%"></span></div>${c[2] ? `<span class="f">${c[2]}</span>` : ""}<span class="note">${c[3]}</span></div>`; }).join("");
  if (f.semCamp) { $("view").innerHTML = avisoCampanhas() + `<section><div class="sec-head"><h2>O caminho do dinheiro</h2><p>${f.lead}</p></div><div class="flow">${flow}</div></section>`; return; }
  const campParcial = MI.parcial && MI.campanhas_ate ? `<div class="aviso-camp ok"><span class="pill good">Campanhas</span><div><b>Números das campanhas até ${dm_(MI.campanhas_ate)}</b><span>Atualização semanal. Gasto, contatos e custo por cliente mostram o resultado parcial do mês.</span></div></div>` : "";
  $("view").innerHTML = campParcial + `<section><div class="sec-head"><h2>O caminho do dinheiro</h2><p>${f.lead}</p></div><div class="flow">${flow}</div></section>
    <section><div class="sec-head"><h2>De onde vem o custo por cliente</h2><p>Os números menores que, juntos, formam o custo por cliente.</p></div><div class="tree-wrap"><figure>${treeSVG(f.tree)}<figcaption>${f.caption}</figcaption></figure></div><div class="formula">${esc(f.formula)}</div></section>
    <section><div class="sec-head"><h2>Custo por cliente em cada anúncio</h2><p>Limite de referência: ${R2(f.teto)} por cliente.</p></div><div class="camps">${camps}</div>${f.insight ? `<p class="callout">${f.insight}</p>` : ""}</section>`;
}

/* ---------- componentes ---------- */
function bars(rows) {
  const m = Math.max(...rows.map(r => r[1] + (typeof r[2] === "number" ? r[2] : 0)), 1);
  return `<div class="bars">${rows.map(r => { const two = typeof r[2] === "number";
    return `<div class="bar-row"><span class="lab" title="${esc(r[0])}">${esc(r[0])}</span><div class="track ${two ? "stack" : ""}"><div class="seg" style="width:${r[1] / m * 100}%"></div>${two ? `<div class="seg b" style="width:${r[2] / m * 100}%"></div>` : ""}</div><span class="val">${two ? r[1] + " / " + (r[1] + r[2]) : r[1]}${!two && r[2] ? " · " + esc(r[2]) : ""}</span></div>`; }).join("")}</div>`;
}
const count = (a, f) => Object.entries(by(a, f)).map(([k, l]) => [k, l.length]).sort((x, y) => y[1] - x[1]);
const kpis = k => `<div class="kpis">${k.map(([l, v, s]) => `<div class="kpi"><span class="l">${l}</span><span class="v">${v}</span><span class="s">${s}</span></div>`).join("")}</div>`;
const alerts = a => a.length ? `<div class="alerts">${a.map(([t, x]) => `<div class="alert"><span class="pill ${t}">${{ bad: "Urgente", warn: "Atenção", good: "Ponto forte" }[t]}</span><span>${x}</span></div>`).join("")}</div>` : `<p class="muted">Nenhum alerta neste mês.</p>`;
const selo = () => MI.parcial ? `<div class="mes-parcial"><span class="dot"></span><b>${MI.rotulo.split("/")[0]} em andamento</b><span>Dados até ${dm_(MI.dados_ate)}. Metas, comissões e diárias mostram o resultado até agora.</span></div>` : "";
const head = (crumb, t, d) => `<div class="page-head"><span class="crumb">${crumb}</span><h1>${t}</h1><p>${d}</p></div>` + selo();
const vazio = () => `<div class="soon"><span class="pill warn" style="justify-self:start">Sem dados</span><p>Ainda não há dados para este mês. Eles aparecem aqui assim que forem lançados.</p></div>`;

const DOOR = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21h18"/><path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/><path d="M14 12h.01"/></svg>';
/* ---------- Porta de entrada · Social Seller ---------- */
const NO_CLOSER = x => /agendado|fechado/i.test(x.status || "");
const FECHOU = x => /fechado/i.test(x.status || "");
const FAIXAS_BLOQ = [["Até 7 dias", 0, 7], ["8 a 30 dias", 8, 30], ["31 a 90 dias", 31, 90], ["91 dias a 1 ano", 91, 365], ["Mais de 1 ano", 366, 1e9]];
function semanaDe(d) { const t = new Date(d + "T12:00:00Z"), w = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - w); return iso(t); }
function viewSocial() {
  const LM = D ? (D.social || []) : [], L = D ? (D.socialAll || []) : [], F = D ? (D.socialF || []) : [], nome = D ? (socialNome() || "Social Seller") : "Social Seller";
  $("content").innerHTML = head("Marketing no Comercial · Porta de entrada", `<span class="door-ic">${DOOR}</span>Porta de entrada`, `${esc(nome)} (Social Seller) atende quem chega pelas redes, de forma orgânica ou reagindo aos criativos, e encaminha ao SDR. É o primeiro contato do cliente com o escritório.`) + subtabsMkt("social");
  if (!LM.length && !F.length) { $("content").innerHTML += vazio(); return; }
  const desde = L.length ? dm_(L[0].data) : "o início", nm = LM.length;
  const n = L.length, comSdr = L.filter(x => x.sdr).length, ate = L.filter(NO_CLOSER).length, fech = L.filter(FECHOU).length, semSt = L.filter(x => !x.status).length;
  const enc = encaminhados(), f = faixaSocial(enc, F.length), aReceber = fixoSocial() + f.premio, crm = D.civel.filter(x => x.social_seller).length;
  const pct = (a, b) => b ? P(a / b, 0) : "—";
  const porOrigem = Object.entries(by(L, x => x.origem)).map(([o, l]) => [o, l.length, l.filter(NO_CLOSER).length, l.filter(FECHOU).length]).sort((a, b) => b[1] - a[1]);
  const faixas = FAIXAS_BLOQ.map(([k, a, b]) => { const l = L.filter(x => x.dias_bloqueado != null && x.dias_bloqueado >= a && x.dias_bloqueado <= b); return [k, l.length, l.length ? `${l.filter(NO_CLOSER).length} ao closer` : ""]; });
  const semInfo = L.filter(x => x.dias_bloqueado == null).length;
  const semanas = Object.entries(by(L, x => semanaDe(x.data))).sort((a, b) => a[0].localeCompare(b[0])).map(([w, l]) => [`Semana de ${dm_(w)}`, l.length]);
  const sdrRows = count(L, x => x.sdr || "Sem SDR"), stRows = count(L, x => x.status || "Sem status");
  const gat = (e, nm, det) => `<li class="g-${e}"><span class="g-n">${nm}</span><span class="g-s">${det}</span></li>`;
  const al = [];
  if (n && (n - comSdr) / n >= .2) al.push(["bad", `${n - comSdr} de ${n} leads (${pct(n - comSdr, n)}) estão sem SDR definido: ninguém é dono do próximo passo.`]);
  if (n && semSt / n >= .2) al.push(["warn", `${semSt} leads (${pct(semSt, n)}) estão sem status na planilha. Sem status, o funil não mostra onde o lead parou.`]);
  const semData = L.filter(x => FECHOU(x) && !x.data_fechado).length;
  if (semData) al.push(["warn", `${semData} contrato${semData === 1 ? "" : "s"} fechado${semData === 1 ? "" : "s"} sem data de fechamento na planilha do Social Seller.`]);
  const dia = L.filter(x => x.diaria != null).length;
  if (n && dia / n < .3) al.push(["warn", `A diária perdida está preenchida em só ${dia} de ${n} leads. É o argumento de urgência para o fechamento.`]);
  if (porOrigem.length > 1) { const best = [...porOrigem].sort((a, b) => b[2] / b[1] - a[2] / a[1])[0]; al.push(["good", `${best[0]} leva ${pct(best[2], best[1])} dos leads até o closer, a melhor taxa entre as origens.`]); }
  if (F.length !== crm) al.push(["warn", `Conferência: ${F.length} contrato${F.length === 1 ? "" : "s"} na planilha do Social Seller para este mês e ${crm} marcado${crm === 1 ? "" : "s"} como dele no Cível. O fechamento pode vir depois do encaminhamento (follow-up), então confira as datas.`]);
  $("content").innerHTML += `<div class="sec">${kpis([["Leads iniciados", nm, "Conversas abertas no mês"], ["Com SDR definido", LM.filter(x => x.sdr).length, pct(LM.filter(x => x.sdr).length, nm) + " dos leads do mês"], ["Chegaram ao closer", LM.filter(NO_CLOSER).length, pct(LM.filter(NO_CLOSER).length, nm) + " dos leads do mês"], ["Contratos fechados", F.length, `encaminhados que fecharam · faixa de ${R0(f.valor)} por contrato`], ["A receber", R0(aReceber), `Fixo ${R0(fixoSocial())} + comissão ${R0(f.premio)}`]])}</div>
  <div class="sec"><h2>Funil da porta de entrada</h2><p class="sub">Todos os leads desde ${desde}: o fechamento costuma vir dias depois do primeiro contato.</p><div class="panel">${funil([["Iniciados", n], ["Com SDR", comSdr], ["Chegaram ao closer", ate], ["Fechados", fech, "pela planilha do Social Seller"]])}</div></div>
  <div class="sec"><h2>De onde vêm</h2><p class="sub">Desde ${desde}</p><div class="panel"><div class="tbl-wrap"><table><thead><tr><th>Origem</th><th class="n">Leads</th><th class="n">Chegaram ao closer</th><th class="n">Fechados</th><th class="n">Taxa até o closer</th></tr></thead><tbody>${porOrigem.map(([o, a, b, c]) => `<tr><td>${esc(o)}</td><td class="n">${a}</td><td class="n">${b}</td><td class="n">${c}</td><td class="n"><b>${pct(b, a)}</b></td></tr>`).join("")}</tbody></table></div><p class="note">Volume não é qualidade: compare a taxa até o closer de cada rede.</p></div></div>
  <div class="sec"><h2>Quem é esse lead</h2><p class="sub">Desde ${desde}</p><div class="grid2">
    <div class="panel"><h3>Aplicativo</h3>${bars(count(L, x => x.app || "Não informado"))}</div>
    <div class="panel"><h3>Motivo do bloqueio</h3><p class="sub">Os 8 mais comuns</p>${bars(count(L.filter(x => x.motivo), x => x.motivo).slice(0, 8))}</div>
    <div class="panel"><h3>Há quanto tempo está bloqueado</h3><p class="sub">Leads por faixa e quantos chegaram ao closer${semInfo ? ` · ${semInfo} sem a data do bloqueio` : ""}</p>${bars(faixas)}</div>
    <div class="panel"><h3>Leads por semana</h3>${bars(semanas)}</div></div></div>
  <div class="sec"><h2>Passagem para o time</h2><p class="sub">Situação atual de todos os leads desde ${desde}</p><div class="grid2">
    <div class="panel"><h3>Para qual SDR foi</h3>${bars(sdrRows)}</div>
    <div class="panel"><h3>Onde o lead está agora</h3>${bars(stRows)}</div></div></div>
  <div class="sec"><h2>Remuneração</h2><div class="pcards"><div class="pcard"><div class="ph"><b>${esc(nome)}</b><span><span class="muted">a receber</span> <b class="num">${R0(aReceber)}</b></span></div>
    <div class="prog" title="${enc} de 15 contratos"><span style="width:${Math.min(enc / 15, 1) * 100}%"></span></div>
    <ul class="gl">${gat("ok", "Valor fixo · Social Seller", fixoSocial() < FIXO.social ? `${R0(fixoSocial())} · proporcional` : R0(FIXO.social))}${enc <= 4 ? gat("ok", "Até 4 contratos · R$ 30 cada", `Atual · ${F.length} × R$ 30 = ${R0(F.length * 30)}`) : gat("lock", "Até 4 contratos · R$ 30 cada", "Superada")}${enc >= 5 && enc <= 15 ? gat("ok", "5 a 15 contratos · R$ 50 cada", `Atual · ${F.length} × R$ 50 = ${R0(F.length * 50)}`) : enc > 15 ? gat("lock", "5 a 15 contratos · R$ 50 cada", "Superada") : gat("no", "5 a 15 contratos · R$ 50 cada", `Faltam ${5 - enc} contratos`)}${gat("lock", "16 ou mais contratos", enc >= 16 ? "Atingida · regra a definir (calculado a R$ 50)" : "Regra a definir")}</ul>
    <div class="chips"><span class="chip"><b>${F.length}</b> contratos fechados</span><span class="chip"><b>${crm}</b> marcados no Cível</span></div></div></div>
    <p class="note">Conta o lead que ele encaminhou e que fechou contrato. A faixa vale para todos os contratos do mês. O fechamento pode acontecer dias depois, por follow-up, e entra no mês em que é pago.</p></div>
  <div class="sec atencao"><h2>Pontos de atenção</h2>${alerts(al)}</div>`;
}

/* ---------- ritmo do mês (relatório diário) ---------- */
let RITMO_P = "mes";
window.setRitmo = p => { RITMO_P = p; route(); };
const iso = dt => dt.toISOString().slice(0, 10);
function diasUteis() { // dias úteis do mês: total, já passados (até a data dos dados) e restantes
  const [y, m] = MES.split("-").map(Number), fim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const ref = MI.parcial && MI.dados_ate ? +MI.dados_ate.slice(8, 10) : fim;
  let tot = 0, pass = 0;
  for (let d = 1; d <= fim; d++) { const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); if (w && w < 6) { tot++; if (d <= ref) pass++; } }
  return { tot, pass, rest: tot - pass };
}
function janela() { // período escolhido no botão Hoje / Semana / Mês
  const datas = (D.ativ || []).map(x => x.data).sort(), ult = datas.at(-1);
  if (RITMO_P === "hoje") return { de: ult, ate: ult, nome: `em ${dm_(ult)}` };
  if (RITMO_P === "semana") { const d = new Date(ult + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - 6); return { de: iso(d), ate: ult, nome: `de ${dm_(iso(d))} a ${dm_(ult)}` }; }
  return { de: "0000", ate: "9999", nome: "no mês" };
}
const naJanela = (x, j) => x.data && x.data >= j.de && x.data <= j.ate;
const botoesRitmo = () => `<div class="rbtn">${[["hoje", "Hoje"], ["semana", "Semana"], ["mes", "Mês"]].map(([k, l]) => `<button type="button" onclick="setRitmo('${k}')" ${RITMO_P === k ? 'aria-pressed="true"' : ""}>${l}</button>`).join("")}</div>`;
function funil(etapas) { // [[nome, valor, nota?], ...]
  const top = etapas[0][1] || 1;
  return `<div class="funil">${etapas.map(([k, v, nota], i) => `${i ? `<div class="fpass"><b>${P(v / etapas[i - 1][1], 0)}</b><span>seguem</span></div>` : ""}<div class="fstep"><span class="fv">${N(v)}</span><span class="fk">${k}</span><div class="fbar"><span style="width:${Math.max(v / top * 100, 2)}%"></span></div>${nota ? `<span class="fn">${nota}</span>` : ""}</div>`).join("")}</div>`;
}
function ritmoCivel(c, al) {
  const A = (D.ativ || []).filter(x => x.setor === "civel");
  if (!A.length) return { html: "", porSdr: {} };
  const j = janela(), du = diasUteis(), sdrA = A.filter(x => x.papel === "sdr"), cloA = A.filter(x => x.papel === "closer");
  const sj = sdrA.filter(x => naJanela(x, j)), cj = c.filter(x => naJanela(x, j) || (RITMO_P === "mes"));
  const lig = sum(sj, x => x.ligacoes), at = sum(sj, x => x.atendidas), ql = sum(sj, x => x.qualificadas);
  const diasTime = [...new Set(sdrA.map(x => x.data))].sort();
  // previsão do time (ritmo por dia útil)
  const meta = metaSetor("civel"), rec = sum(c, x => x.valor_recebido), projN = c.length / du.pass * du.tot, projR = rec / du.pass * du.tot;
  const tom = !meta ? "warn" : projR >= meta ? "good" : projR >= meta * .85 ? "warn" : "bad";
  // por SDR
  const sdrs = [...new Set(sdrA.map(x => x.pessoa))];
  const linhas = sdrs.map(p => { const l = sdrA.filter(x => x.pessoa === p), q = sum(l, x => x.qualificadas), n = c.filter(x => x.sdr === p).length, qd = q / diasTime.length, conv = q ? n / q : 0; return { p, q, n, qd, conv, falta: Math.max(REGRAS.metaSdr - n, 0), semReg: l.filter(x => !x.registrado).map(x => dm_(x.data)), proj: n + qd * du.rest * conv }; });
  const best = Math.max(...linhas.map(x => x.conv));
  const porSdr = {};
  linhas.forEach(x => { porSdr[x.p] = !du.rest ? null : !x.falta ? "Meta batida" : `Faltam ${x.falta} em ${du.rest} dias úteis · ${(x.falta / du.rest).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por dia`; });
  const heat = (() => { const mx = Math.max(...sdrA.map(x => x.qualificadas || 0), 1);
    return `<div class="tbl-wrap"><table class="heat"><thead><tr><th>SDR</th>${diasTime.map(d => `<th class="n">${dm_(d)}</th>`).join("")}<th class="n">Total</th></tr></thead><tbody>${sdrs.map(p => `<tr><td>${esc(p)}</td>${diasTime.map(d => { const r = sdrA.find(x => x.pessoa === p && x.data === d); return !r || !r.registrado ? `<td class="n nr" title="Sem relatório">—</td>` : `<td class="n" style="--h:${(r.qualificadas || 0) / mx}" title="${r.ligacoes} ligações · ${r.atendidas} atendidas · ${r.qualificadas} qualificadas">${r.qualificadas}</td>`; }).join("")}<td class="n"><b>${sum(sdrA.filter(x => x.pessoa === p), x => x.qualificadas)}</b></td></tr>`).join("")}</tbody></table></div>`; })();
  const prev = `<div class="tbl-wrap"><table><thead><tr><th>SDR</th><th class="n">Qualificações por dia</th><th class="n">Viram contrato</th><th class="n">Contratos</th><th>Previsão no fim do mês</th><th>Para bater ${REGRAS.metaSdr}</th><th>Onde ganhar</th></tr></thead><tbody>${linhas.sort((a, b) => b.proj - a.proj).map(x => { const t = x.proj >= REGRAS.metaSdr ? "good" : x.proj >= REGRAS.metaSdr * .8 ? "warn" : "bad"; const ganho = x.qd * du.rest * (best - x.conv);
    return `<tr><td>${esc(x.p)}</td><td class="n">${x.qd.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td><td class="n">${P(x.conv, 0)}</td><td class="n">${x.n}</td><td><span class="pill ${t}">${du.rest ? "≈ " + Math.round(x.proj) : x.n} de ${REGRAS.metaSdr}</span></td><td>${porSdr[x.p] || "—"}</td><td>${x.conv >= best ? "Melhor conversão do time" : ganho >= .5 ? `+${Math.round(ganho)} contratos se chegar a ${P(best, 0)}` : "Aumentar volume de qualificações"}</td></tr>`; }).join("")}</tbody></table></div>`;
  // Contratos sempre pela planilha dos closers; reuniões pelo relatório diário (só nos dias em que houve relatório).
  const clos = [...new Set(cloA.map(x => x.pessoa))].map(p => { const l = cloA.filter(x => x.pessoa === p), r = sum(l, x => x.reunioes), dias = new Set(l.map(x => x.data)), mes = c.filter(y => y.closer === p).length, f = c.filter(y => y.closer === p && dias.has(y.data)).length;
    return `<div class="kpi"><span class="l">${esc(p)}</span><span class="v">${mes} contratos</span><span class="s">No mês, pela planilha. Nos ${l.length} dia${l.length === 1 ? "" : "s"} com relatório: ${f} contrato${f === 1 ? "" : "s"} em ${r} reuniões (${P(f / r, 0)})</span></div>`; }).join("");
  // conferências e avisos
  cloA.filter(x => x.fechamentos != null).forEach(x => { const real = c.filter(y => y.closer === x.pessoa && y.data === x.data).length; if (real !== x.fechamentos) al.push(["warn", `Relatório × planilha: ${x.pessoa} informou ${x.fechamentos} fechamento${x.fechamentos === 1 ? "" : "s"} em ${dm_(x.data)}, a planilha tem ${real}.`]); });
  linhas.filter(x => x.semReg.length).forEach(x => al.push(["warn", `${x.p} ficou sem relatório diário em ${x.semReg.length > 1 ? x.semReg.slice(0, -1).join(", ") + " e " + x.semReg.at(-1) : x.semReg[0]}.`]));
  const html = `<div class="sec ritmo"><div class="rhead"><h2>Ritmo do mês</h2>${botoesRitmo()}</div><p class="sub">Relatório diário da equipe ${j.nome}. Dias úteis: ${du.pass} de ${du.tot}${du.rest ? `, faltam ${du.rest}` : ""}.</p>
    <div class="panel"><h3>Funil do time</h3>${funil([["Ligações", lig], ["Atendidas", at], ["Qualificadas", ql], ["Contratos", cj.length, "pela planilha dos closers"]])}
      ${du.rest ? `<div class="previsao ${tom}"><span class="pill ${tom}">Previsão</span><span>No ritmo atual, o time termina com <b>≈ ${Math.round(projN)} contratos</b> e <b>${R0(projR)} recebidos</b>${meta ? ` (${P(projR / meta, 0)} da meta de ${R0(meta)})` : ""}.</span></div>` : ""}</div>
    <div class="grid2"><div class="panel"><h3>Qualificações por dia</h3><p class="sub">Quanto mais forte a cor, mais qualificações. “—” = dia sem relatório.</p>${heat}</div>
      <div class="panel"><h3>Closers · reunião que vira contrato</h3><p class="sub">Contratos pela planilha dos closers; reuniões pelo relatório diário.</p><div class="kpis">${clos || '<p class="muted">Sem relatório dos closers.</p>'}</div></div></div>
    <div class="panel"><h3>Previsão e caminho para a meta</h3><p class="sub">Ritmo de cada SDR por dia útil e quanto da qualificação vira contrato. “Onde ganhar” compara com a melhor taxa do time.</p>${prev}</div></div>`;
  return { html, porSdr };
}

/* ---------- telas ---------- */
const subtabsMkt = k => { const names = { social: "Porta de entrada", civel: "Cível", prev: "Previdenciário", trab: "Trabalhista", cons: "Todos os setores" };
  return `<div class="subtabs">${Object.keys(names).map(n => `<a href="#mkt-${n}" class="${n === "social" ? "st-porta" : ""}" ${n === k ? 'aria-current="page"' : ""}>${n === "social" ? `<span class="door-ic">${DOOR}</span>` : ""}${names[n]}</a>`).join("")}</div>`; };
function viewMkt(k) {
  const names = { civel: "Cível", prev: "Previdenciário", trab: "Trabalhista", cons: "Todos os setores" };
  $("content").innerHTML = head("Marketing no Comercial", "Do anúncio ao lucro", "Quanto custa conquistar cada cliente e quanto ele traz de volta. O custo por cliente (CAC) é o número principal.") +
    subtabsMkt(k) + `
    <div class="glossary"><span><b>Custo por cliente (CAC):</b> quanto gastamos em anúncios para conseguir 1 cliente.</span><span><b>Contatos:</b> pessoas que chegaram pelo anúncio.</span><span><b>Valor a receber:</b> parcelas e honorários que ainda vão entrar.</span><span><b>Retorno:</b> quantos reais voltaram para cada R$ 1 gasto.</span></div><div id="view"></div>`;
  if (!D) { $("view").innerHTML = vazio(); return; }
  const tem = { civel: D.civel.length, prev: D.prev.length, trab: D.trab.length, cons: D.civel.length + D.prev.length + D.trab.length }[k];
  if (!tem) { $("view").innerHTML = vazio(); return; }
  const f = MKT[k]();
  if (semCampanhas()) aguardaCampanhas(f);
  renderMkt(f);
}
// Sem números de campanha no mês: mostra o que já é conhecido e marca o resto como "aguardando".
const DEPENDE_ANUNCIO = /^(Gasto com anúncios|Contatos recebidos|Custo por (cliente|contrato)|Lucro|Custo total do setor)/;
function aguardaCampanhas(f) {
  f.semCamp = true;
  f.flow = f.flow.map(n => DEPENDE_ANUNCIO.test(n.k) ? { k: n.k, v: "Aguardando", d: "Depende dos números das campanhas", m: [["Atualização", "semanal"]], wait: true, edge: n.edge } : n);
}
const avisoCampanhas = () => `<div class="aviso-camp"><span class="pill warn">Campanhas</span><div><b>Números das campanhas de ${mesNome()} ainda não chegaram</b><span>Eles chegam toda semana. Até lá, gasto, contatos, custo por cliente e lucro ficam como “aguardando”. Contratos, valores e custo da equipe já estão atualizados.</span></div></div>`;
function viewCivel() {
  const c = D ? D.civel : [];
  $("content").innerHTML = head("Setores do Comercial · Cível", "Cível", "Contratos fechados pelos Closers: quem qualificou, de onde veio o cliente e como pagou.");
  if (!c.length) { $("content").innerHTML += vazio(); return; }
  const contr = sum(c, x => x.valor_contratado), rec = sum(c, x => x.valor_recebido), n = c.length;
  const closers = Object.entries(by(c, x => x.closer)).sort((a, b) => b[1].length - a[1].length);
  const sdrs = Object.entries(by(c.filter(x => x.sdr && !/pr[óo]prio/i.test(x.sdr)), x => x.sdr)).sort((a, b) => b[1].length - a[1].length);
  const recTime = rec, timeMeta = metaSetor("civel") ? recTime >= metaSetor("civel") : false, primeiro = primeiroNaMeta(c);
  const maior = [...closers].sort((a, b) => sum(b[1], x => x.valor_recebido) - sum(a[1], x => x.valor_recebido))[0];
  const bonusCloser = p => (primeiro && primeiro.p === p ? REGRAS.bonusPrimeiro : 0) + (timeMeta && maior && maior[0] === p ? REGRAS.bonusMaior : 0);
  const sdrCalc = sdrs.map(([p, l]) => { const bate = l.length >= REGRAS.metaSdr, pct = bate ? REGRAS.pctSdrMeta : REGRAS.pctSdrBase, d = diariaSdr(l); return { p, n: l.length, bate, pct, meta: recTime * pct, diaria: d.pago, dias: d.dias }; });
  const recTotal = rec;
  const al = [], RIT = ritmoCivel(c, al);
  const gat = (estado, nome, det) => `<li class="g-${estado}"><span class="g-n">${nome}</span><span class="g-s">${det}</span></li>`;
  const chip = (l, v) => `<span class="chip"><b>${v}</b> ${l}</span>`;
  function cardCloser(p, l) {
    const v = sum(l, x => x.valor_recebido), ct = sum(l, x => x.valor_contratado), f = faixaCloser(v), b1 = primeiro && primeiro.p === p, ehMaior = maior && maior[0] === p;
    const faixas = [...FAIXAS_CLOSER].reverse().map(([min, pct]) => v >= min ? gat("ok", `Faixa ${P(pct, 0)} · R$ ${N(min)}`, f.min === min ? `Atingida · ${R0(v * pct)}` : "Superada") : gat("no", `Faixa ${P(pct, 0)} · R$ ${N(min)}`, `Falta ${R0(min - v)}`));
    const bonus = [
      b1 ? gat("ok", `Primeiro a bater ${R0(REGRAS.metaCloser)}`, `Conquistado · ${R0(REGRAS.bonusPrimeiro)}`) : gat(primeiro ? "lock" : "no", `Primeiro a bater ${R0(REGRAS.metaCloser)}`, primeiro ? `Indisponível · já ganho por ${primeiro.p}` : `Falta ${R0(REGRAS.metaCloser - v)}`),
      ehMaior && timeMeta ? gat("ok", "Maior faturamento do mês", `Conquistado · ${R0(REGRAS.bonusMaior)}`) : gat("lock", "Maior faturamento do mês · R$ 500", ehMaior ? `Líder do mês, mas bloqueado: time em ${P(recTotal / metaSetor("civel"), 0)} da meta geral (faltam ${R0(metaSetor("civel") - recTotal)})` : `Indisponível · líder: ${maior[0]}`)
    ];
    const ehSdr = sdrCalc.some(y => y.p === p), fixo = ehSdr ? 0 : FIXO.closer, total = fixo + f.comissao + bonusCloser(p);
    return `<div class="pcard"><div class="ph"><b>${esc(p)}</b><span><span class="muted">a receber</span> <b class="num">${R0(total)}</b></span></div>
      <div class="prog" title="${R0(v)} de ${R0(REGRAS.metaCloser)}"><span style="width:${Math.min(v / REGRAS.metaCloser, 1) * 100}%"></span></div>
      <ul class="gl">${ehSdr ? gat("lock", "Valor fixo", "Contado no cartão de SDR (R$ 2.000)") : gat("ok", "Valor fixo · Closer", R0(FIXO.closer))}${faixas.join("")}${bonus.join("")}</ul>
      <div class="chips">${chip("contratos", l.length)}${chip("recebido", R0(v))}${chip("contratado", R0(ct))}${chip("do recebido do time", P(v / recTotal, 0))}${chip("ticket médio", R0(ct / l.length))}</div></div>`;
  }
  function cardSdr(x) {
    const l = c.filter(y => y.sdr === x.p), recG = sum(l, y => y.valor_recebido), dm = diasDoMes();
    const lista = [
      x.bate ? gat("ok", `Meta de ${REGRAS.metaSdr} qualificações · 1%`, `Atingida · ${R2(recTotal * REGRAS.pctSdrMeta)}`) : gat("no", `Meta de ${REGRAS.metaSdr} qualificações · 1%`, `Falta ${REGRAS.metaSdr - x.n} · valeria ${R2(recTotal * REGRAS.pctSdrMeta)}`),
      x.bate ? gat("lock", "Base 0,5%", "Substituída pela meta de 1%") : gat("ok", "Base 0,5%", `Garantida · ${R2(recTotal * REGRAS.pctSdrBase)}`),
      gat(x.diaria > 0 ? "ok" : "no", "Diária R$ 15 por dia", x.diaria > 0 ? `${R0(x.diaria)} · ${x.dias} dia${x.dias === 1 ? "" : "s"} com contrato` : "Nenhum dia com contrato"),
      ...(RIT.porSdr[x.p] ? [gat(RIT.porSdr[x.p] === "Meta batida" ? "ok" : "no", "Ritmo para a meta", RIT.porSdr[x.p])] : []),
    ];
    const imed = l.filter(y => /imediato/i.test(y.tipo_fechamento || "")).length;
    return `<div class="pcard"><div class="ph"><b>${esc(x.p)}</b><span><span class="muted">a receber</span> <b class="num">${R2(FIXO.sdr + x.meta + x.diaria)}</b></span></div>
      <div class="prog" title="${x.n} de ${REGRAS.metaSdr}"><span style="width:${Math.min(x.n / REGRAS.metaSdr, 1) * 100}%"></span></div>
      <ul class="gl">${gat("ok", "Valor fixo · SDR", R0(FIXO.sdr))}${lista.join("")}</ul>
      <div class="chips">${chip("qualificações fechadas", `${x.n}/${REGRAS.metaSdr}`)}${chip("recebido gerado", R0(recG))}${chip("fechados na hora", P(imed / l.length, 0))}${chip(x.dias === 1 ? "dia com contrato" : "dias com contrato", x.dias)}</div></div>`;
  }
  const sem = [["1 a 7", 1, 7], ["8 a 14", 8, 14], ["15 a 21", 15, 21], ["22 a 28", 22, 28], ["29 a 31", 29, 31]].map(([l, a, b]) => [l, c.filter(x => x.data && +x.data.slice(8, 10) >= a && +x.data.slice(8, 10) <= b).length]);
  sem.push(["Sem data", c.filter(x => !x.data).length]);
  const fim = sem[3][1] + sem[4][1], datados = n - sem[5][1];
  if (!MI.parcial && datados && fim / datados < .2) al.push(["bad", `Só ${fim} contratos depois do dia 21. Vale entender se faltou contato, agenda ou registro.`]);
  closers.forEach(([p, l]) => { const v = sum(l, x => x.valor_recebido), f = faixaCloser(v); if (f.pct) al.push(["good", `${p} acumulou ${R0(v)} e está na faixa de ${P(f.pct, 0)} (comissão de ${R0(f.comissao)}).`]); else if (v >= 5000) al.push(["warn", `${p} acumulou ${R0(v)}: faltam ${R0(10000 - v)} para a primeira faixa de comissão (5%).`]); });
  if (primeiro) al.push(["good", `${primeiro.p} foi o primeiro a bater a meta individual de ${R0(REGRAS.metaCloser)} (dia ${primeiro.data.slice(8, 10)}): bônus de ${R0(REGRAS.bonusPrimeiro)}.`]);
  if (maior && !timeMeta) al.push(["warn", `${maior[0]} teve o maior faturamento, mas o bônus de ${R0(REGRAS.bonusMaior)} só vale se o time bater a meta geral.`]);
  sdrCalc.filter(x => !x.bate && x.n >= REGRAS.metaSdr - 3).forEach(x => al.push(["warn", `SDR ${x.p} teve ${x.n} leads qualificados fechados pelos Closers: faltou ${REGRAS.metaSdr - x.n} para a meta de ${REGRAS.metaSdr} (1% em vez de 0,5%).`]));
  const semMidia = c.filter(x => !x.campanha_grupo).length;
  if (semMidia / n >= .4) al.push(["good", `${semMidia} de ${n} clientes vieram sem anúncio (orgânico, indicação e outros).`]);
  $("content").innerHTML += `<div class="sec">${kpis([["Contratos fechados", n, "No mês"], ["Valor contratado", R0(contr), "Soma dos contratos"], ["Já recebido", R0(rec), metaSetor("civel") ? `${P(rec / metaSetor("civel"), 0)} da meta de ${R0(metaSetor("civel"))}` : P(rec / contr, 0) + " do contratado"], ["A receber", R0(contr - rec), "Parcelas futuras"], ["Valor médio do contrato", R0(contr / n), "Recebido por contrato: " + R0(rec / n)], ["Custo colaborador", R0(equipeCivel().total), `Fixo ${R0(equipeCivel().fixo)} + comissões ${R0(equipeCivel().variavel)}`], ["Recebido − custo colaborador", R0(rec - equipeCivel().total), "O que sobra do recebido após pagar a equipe"]])}</div>
  <div class="sec atencao"><h2>Pontos de atenção</h2>${alerts(al)}</div>
  <div class="sec"><h2>Time · metas individuais</h2>
    <div class="panel"><h3>Closers</h3><p class="sub">Comissão sobre todo o valor recebido no mês (5% a partir de R$ 10 mil, 7% a partir de R$ 20 mil, 15% a partir de R$ 30 mil) e bônus extras.</p><div class="pcards">${closers.map(([p, l]) => cardCloser(p, l)).join("")}</div></div>
    <div class="panel"><h3>SDRs</h3><p class="sub">O SDR qualifica o lead e agenda com o Closer; conta o lead dele que virou contrato. Meta de ${REGRAS.metaSdr} no mês → 1% do recebido do time (abaixo, 0,5%), mais a diária de R$ 15.</p><div class="pcards">${sdrCalc.map(cardSdr).join("")}</div><p class="note">Contratos sem data não entram na diária. A data usada é a do fechamento do contrato.</p></div></div>
  ${RIT.html}
  <div class="sec"><h2>Clientes</h2><div class="grid2">
    <div class="panel"><h3>De onde veio o cliente</h3>${bars(count(c, x => x.canal))}</div>
    <div class="panel"><h3>Contratos por semana</h3>${bars(sem)}</div>
    <div class="panel"><h3>Como pagou</h3>${bars(count(c, x => x.forma_pagamento))}</div>
    <div class="panel"><h3>Como fechou</h3>${bars(count(c, x => x.tipo_fechamento))}</div>
    <div class="panel"><h3>Região</h3>${bars(count(c, x => regiao(x.uf)))}</div>
    <div class="panel"><h3>Estados</h3><p class="sub">Contratos e % do total do mês</p>${bars(count(c, x => x.uf).map(([k, v]) => [k, v, P(v / n, 0)]))}</div></div></div>`;
}
function viewPrev() {
  const c = D ? D.prev : [];
  $("content").innerHTML = head("Setores do Comercial · Previdenciário", "Previdenciário", "Contratos assinados pelos consultores. Só conta como venda o processo já protocolado.");
  if (!c.length) { $("content").innerHTML += vazio(); return; }
  const ex = +D.prem.taxa_exito, h = x => honorario(x.beneficio, D.prem) * ex;
  const prot = c.filter(x => x.protocolado === "sim"), par = c.filter(x => x.protocolado !== "sim");
  const cons = Object.entries(by(c, x => x.consultor)).map(([p, l]) => { const pr = l.filter(x => x.protocolado === "sim"); return [p, l.length, pr.length, sum(pr, h), sum(l.filter(x => x.protocolado !== "sim"), h), l.filter(x => x.protocolado === "em_branco").length]; }).sort((a, b) => b[2] - a[2]);
  equipeListaPrev().filter(p => !cons.some(r => r[0] === p)).forEach(p => cons.push([p, 0, 0, 0, 0, 0]));
  const proj = c.filter(x => x.projecao), semCalc = c.filter(x => AGUARDA_CALCULO.test(x.beneficio || ""));
  const mot = count(par, x => x.motivo_parada), ress = prot.filter(x => x.ressalva);
  const al = [];
  if (mot.length) al.push(["bad", `${mot[0][1]} contrato${mot[0][1] === 1 ? "" : "s"} parado${mot[0][1] === 1 ? "" : "s"} por: ${mot[0][0].toLowerCase()}. É o maior gargalo do setor.`]);
  cons.filter(r => r[5] >= 5).forEach(r => al.push(["warn", `${r[0]} tem ${r[5]} contratos sem a coluna de protocolo preenchida. Confirmar antes de avaliar o desempenho.`]));
  if (ress.length) al.push(["warn", `${ress.length} protocolo(s) com ressalva: ${ress.map(x => x.ressalva.toLowerCase()).join(", ")}.`]);
  if (proj.length) al.push(["warn", `${proj.length} contrato${proj.length === 1 ? "" : "s"} com data futura (${[...new Set(proj.map(x => dm_(x.data)))].join(", ")}): é projeção e só se confirma na próxima atualização da planilha.`]);
  if (semCalc.length) al.push(["warn", `${semCalc.length} contrato${semCalc.length === 1 ? "" : "s"} de ${[...new Set(semCalc.map(x => x.beneficio))].join(" e ")}: honorário aguarda cálculo (regra ainda não definida).`]);
  cons.filter(r => r[1] === 0).forEach(r => al.push(["warn", `${r[0]} ainda não tem contratos no mês.`]));
  const comProt = cons.filter(r => r[2] > 0);
  if (comProt.length) { const best = [...comProt].sort((a, b) => b[2] / b[1] - a[2] / a[1])[0]; al.push(["good", `${best[0]} protocolou ${P(best[2] / best[1], 0)} do que assinou.`]); }
  $("content").innerHTML += `<div class="sec">${kpis([["Contratos assinados", c.length, proj.length ? `${proj.length} com data projetada` : "No mês"], ["Protocolados", prot.length, P(prot.length / c.length, 0) + " dos contratos"], ["Parados", par.length, "Sem protocolo"], ["Honorários previstos", R0(sum(prot, h)), `Se ${P(ex, 0)} forem aprovados`], ["Previsto parado", R0(sum(par, h)), "Dos contratos sem protocolo"], ["Custo colaborador", R0(equipePrev().total), `Fixo ${R0(equipePrev().fixo)} + prêmios ${R0(equipePrev().variavel)}`]])}</div>
  <div class="sec atencao"><h2>Pontos de atenção</h2>${alerts(al)}</div>
  <div class="sec"><h2>Consultores</h2><div class="panel"><div class="tbl-wrap"><table><thead><tr><th>Consultor</th><th>Protocolados</th><th class="n">Assinados</th><th class="n">Protocolados</th><th>Faixa de meta</th><th class="n">Prêmio</th><th class="n">Fixo</th><th class="n">Total a receber</th><th class="n">Honorário previsto</th><th class="n">Previsto parado</th></tr></thead><tbody>${cons.map(([p, a, pr, e, pa]) => { const f = faixaPrev(pr); return `<tr><td>${esc(p)}</td><td><div class="prog"><span style="width:${a ? pr / a * 100 : 0}%"></span></div></td><td class="n">${a}</td><td class="n">${a ? `${pr} (${P(pr / a, 0)})` : "—"}</td><td>${f.min ? `<span class="pill good">${f.min}+ · R$ ${f.valor}/contrato</span>` : `<span class="pill warn">Abaixo de 10</span>`}</td><td class="n">${R0(f.premio)}</td><td class="n">${R0(FIXO.prev)}</td><td class="n"><b>${R0(FIXO.prev + f.premio)}</b></td><td class="n">${R0(e)}</td><td class="n">${R0(pa)}</td></tr>`; }).join("")}</tbody></table></div><p class="note">Meta individual: 10, 20 e 35 protocolos (R$ 30, R$ 40 e R$ 60 por contrato, valendo para todos os contratos da faixa). Honorário previsto: salário de benefício de ${R0(D.prem.salario_beneficio)}, atrasados de ${D.prem.meses_atrasados_aux} meses (Auxílio-Acidente) e ${D.prem.meses_atrasados_bpc} (BPC), ${P(ex, 0)} aprovados.${semCalc.length ? " Pensão por Morte e Aposentadoria: aguardando cálculo." : ""}</p></div></div>
  <div class="sec"><div class="grid2">
    <div class="panel"><h3>Por que os contratos pararam</h3>${bars(mot)}</div>
    <div class="panel"><h3>Benefícios protocolados</h3>${bars(count(prot, x => x.beneficio))}</div>
    <div class="panel"><h3>Onde estão os clientes</h3><p class="sub">Protocolados por estado</p>${bars(count(prot, x => x.uf))}</div>
    <div class="panel"><h3>Assinados × protocolados</h3><div class="legend"><span><i style="background:var(--s1)"></i>Protocolados</span><span><i style="background:var(--s2)"></i>Parados</span></div>${bars(cons.map(r => [r[0], r[2], r[1] - r[2]]))}</div></div></div>`;
}
function viewTrab() {
  const c = D ? D.trab : [];
  $("content").innerHTML = head("Setores do Comercial · Trabalhista", "Trabalhista", "Contratos fechados pelos consultores. Só conta como válido o contrato com documentação completa e cadastro no Astrea. Este setor é medido em contratos, sem valores em R$.");
  if (!c.length) { $("content").innerHTML += vazio(); return; }
  const val = c.filter(validoTrab), pend = c.filter(x => !validoTrab(x)), n = c.length, nv = val.length, meta = metaSetor("trabalhista");
  const cp = D.campanhas.filter(x => x.area === "trabalhista"), inv = sum(cp, x => x.investimento);
  const LIM = meta || 15; // faixa de R$ 40 começa na meta do mês (setembro: 25; a partir de outubro: 15)
  const TC = trabCalc(), cons = TC.cons, top = TC.top, topDia = TC.topDia, lider = cons[0] ? cons[0].p : null;
  const gat = (e, nome, det) => `<li class="g-${e}"><span class="g-n">${nome}</span><span class="g-s">${det}</span></li>`;
  const chip = (l, v) => `<span class="chip"><b>${v}</b> ${l}</span>`;
  const card = x => { const bonus = x.bonus, pp = c.filter(y => y.consultor === x.p && !validoTrab(y)).length;
    const lista = [
      x.v >= 1 && x.v < LIM ? gat("ok", `Até ${LIM - 1} contratos · R$ 30 cada`, `Atingida · ${R0(x.v * 30)}`) : x.v >= LIM ? gat("lock", `Até ${LIM - 1} contratos · R$ 30 cada`, "Superada pela faixa de R$ 40") : gat("no", `Até ${LIM - 1} contratos · R$ 30 cada`, "Nenhum contrato válido"),
      x.v >= LIM ? gat("ok", `A partir de ${LIM} · R$ 40 cada`, `Atingida · ${R0(x.v * 40)}`) : gat("no", `A partir de ${LIM} · R$ 40 cada`, LIM - x.v === 1 ? "Falta 1 contrato válido" : `Faltam ${LIM - x.v} contratos válidos`),
      bonus ? gat("ok", `Primeiro a atingir a meta (${meta}) · R$ 100`, topDia && topDia !== "9999" ? `Conquistado no dia ${topDia.slice(8, 10)}` : "Conquistado") : gat(top ? "lock" : "no", `Primeiro a atingir a meta (${meta}) · R$ 100`, top ? `Indisponível · já ganho por ${top}` : (meta - x.v === 1 ? "Falta 1 contrato válido" : `Faltam ${Math.max(meta - x.v, 0)} contratos válidos`)),
      pp ? gat("no", "Contratos pendentes", `${pp} sem documentação ou cadastro`) : gat("ok", "Contratos pendentes", "Nenhum")
    ];
    return `<div class="pcard"><div class="ph"><b>${esc(x.p)}</b><span><span class="muted">a receber</span> <b class="num">${R0(FIXO.trab + x.premio + bonus)}</b></span></div>
      <div class="prog" title="${x.v} de ${LIM}"><span style="width:${Math.min(x.v / LIM, 1) * 100}%"></span></div>
      <ul class="gl">${gat("ok", "Valor fixo · Consultor", R0(FIXO.trab))}${lista.join("")}</ul>
      <div class="chips">${chip("fechados", x.tot)}${chip("válidos", x.v)}${chip("viraram válidos", P(x.v / x.tot, 0))}${chip("do setor", P(x.v / nv, 0))}</div></div>`; };
  const sem = [["1 a 7", 1, 7], ["8 a 14", 8, 14], ["15 a 21", 15, 21], ["22 a 28", 22, 28], ["29 a 31", 29, 31]].map(([l, a, b]) => [l, c.filter(x => x.data && +x.data.slice(8, 10) >= a && +x.data.slice(8, 10) <= b).length]);
  sem.push(["Sem data", c.filter(x => !x.data).length]);
  const motivo = x => !x.documentacao && !x.cadastro_astrea ? "Sem documentação e sem cadastro" : !x.cadastro_astrea ? "Sem cadastro no Astrea" : "Sem documentação completa";
  const al = [];
  if (meta) al.push(nv >= meta ? ["good", `Meta do setor batida: ${nv} contratos válidos de ${meta} (${P(nv / meta, 0)}).`] : ["warn", `${meta - nv === 1 ? "Falta 1 contrato válido" : `Faltam ${meta - nv} contratos válidos`} para a meta de ${meta}.`]);
  if (pend.length) al.push(["bad", `${pend.length} contrato${pend.length === 1 ? "" : "s"} fechado${pend.length === 1 ? "" : "s"} ainda não conta${pend.length === 1 ? "" : "m"}: faltam documentação ou cadastro no Astrea.${semCampanhas() ? "" : ` Regularizar baixa o custo por contrato de ${R0(inv / nv)} para ${R0(inv / n)}.`}`]);
  if (meta) al.push(top ? ["good", `${top} foi o primeiro a atingir sozinho a meta de ${meta} contratos válidos: bônus de R$ 100.`] : ["warn", `Ninguém atingiu sozinho a meta de ${meta} contratos válidos, então o bônus de R$ 100 não foi pago. ${lider} chegou mais perto, com ${cons[0].v}.`]);
  cons.filter(x => x.tot && !x.v).forEach(x => al.push(["warn", `${x.p} fechou ${x.tot} contrato(s), mas nenhum está válido ainda.`]));
  const pctRows = rows => rows.map(([k, v]) => [k, v, P(v / n, 0)]);
  $("content").innerHTML += `<div class="sec">${kpis([["Contratos fechados", n, "No mês"], ["Contratos válidos", nv, P(nv / n, 0) + " dos fechados"], ["Pendentes", pend.length, "Sem documentação ou cadastro"], ["Meta do setor", meta ? `${nv}/${meta}` : "—", meta ? P(nv / meta, 0) + " da meta" : ""], semCampanhas() ? ["Custo por contrato", "Aguardando", "Números das campanhas chegam toda semana"] : ["Custo por contrato", R0(inv / nv), `Gasto de ${R0(inv)} ÷ válidos`], ["Custo colaborador", R0(equipeTrab().total), `Fixo ${R0(equipeTrab().fixo)} + prêmios ${R0(equipeTrab().variavel)}`]])}</div>
  <div class="sec atencao"><h2>Pontos de atenção</h2>${alerts(al)}</div>
  <div class="sec"><h2>Time · metas individuais</h2><div class="panel"><h3>Consultores</h3><p class="sub">Por consultor, contando só contratos válidos: R$ 30 por contrato até ${LIM - 1}; a partir de ${LIM} (a meta do mês), R$ 40 por contrato, valendo para todos. O primeiro a atingir sozinho a meta do mês (${meta} contratos válidos) ganha R$ 100 a mais.</p><div class="pcards">${cons.map(card).join("")}</div></div></div>
  <div class="sec"><h2>Contratos</h2><div class="grid2">
    <div class="panel"><h3>Tipo de ação</h3>${bars(pctRows(count(c, x => x.tipo_acao)))}</div>
    <div class="panel"><h3>Teses</h3>${bars(pctRows(count(c, x => x.tese)))}</div>
    <div class="panel"><h3>Por que não estão válidos</h3>${bars(count(pend, motivo))}</div>
    <div class="panel"><h3>Ritmo do mês</h3><p class="sub">Contratos por semana</p>${bars(sem)}</div>
    <div class="panel"><h3>Região</h3>${bars(pctRows(count(c, x => regiao(x.uf))))}</div>
    <div class="panel"><h3>Estados</h3><p class="sub">Contratos e % do total do mês</p>${bars(pctRows(count(c, x => x.uf)))}</div></div></div>`;
}
function viewSoon(nome, area, falta, ind) {
  const cp = D ? D.campanhas.filter(c => c.area === area) : [];
  const sabe = cp.length ? [`${R0(sum(cp, c => c.investimento))} em anúncios no mês.`, `${N(sum(cp, c => c.contatos))} contatos, a ${X(sum(cp, c => c.investimento) / sum(cp, c => c.contatos))} cada.`] : null;
  $("content").innerHTML = head("Setores do Comercial · " + nome, nome, "Este setor entra no CRM assim que definirmos as regras.") +
    `<div class="soon"><span class="pill warn" style="justify-self:start">Em construção</span>${sabe ? `<div><h3>O que já sabemos</h3><ul>${sabe.map(x => `<li>${x}</li>`).join("")}</ul></div>` : ""}<div><h3>O que falta</h3><ul>${falta.map(x => `<li>${x}</li>`).join("")}</ul></div><div><h3>Indicadores previstos</h3><ul>${ind.map(x => `<li>${x}</li>`).join("")}</ul></div></div>`;
}
const ROUTES = {
  "mkt-social": viewSocial, "mkt-civel": () => viewMkt("civel"), "mkt-prev": () => viewMkt("prev"), "mkt-trab": () => viewMkt("trab"), "mkt-cons": () => viewMkt("cons"),
  "setor-civel": viewCivel, "setor-prev": viewPrev,
  "setor-trab": viewTrab,
  "setor-cs": () => viewSoon("CS", "cs", ["Definir as regras do setor.", "Base de clientes ativos e pagamentos."], ["Clientes pagando em dia", "Benefícios aprovados e negados", "Indicações geradas", "Tempo até o primeiro retorno"])
};
function route() {
  let r = location.hash.slice(1); if (!ROUTES[r]) r = "mkt-civel";
  document.querySelectorAll(".nav a").forEach(a => a.dataset.r === r ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  try { ROUTES[r](); const at = document.querySelector("#content .atencao"); if (at) $("content").appendChild(at); } catch (e) { $("content").innerHTML = `<p class="muted">Não foi possível montar esta tela. ${esc(e.message)}</p>`; }
}

/* ---------- tema ---------- */
const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const isDark = () => { const t = document.documentElement.dataset.theme; return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; };
function paintBtn() { const d = isDark(); $("theme").innerHTML = (d ? SUN : MOON) + `<span>${d ? "Modo claro" : "Modo noturno"}</span>`; }
$("theme").onclick = () => { const t = isDark() ? "light" : "dark"; document.documentElement.dataset.theme = t; try { localStorage.setItem("acr-tema", t); } catch (e) {} paintBtn(); };
try { const t = localStorage.getItem("acr-tema"); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
paintBtn();

/* ---------- PIN e início ---------- */
async function iniciar() {
  $("lock").hidden = true; $("app").hidden = false;
  try { await carregar(); } catch (e) { $("content").innerHTML = `<p class="muted">Não foi possível conectar ao banco de dados. Verifique a internet e recarregue a página.</p>`; return; }
  route();
}
$("mes").onchange = async e => { await carregar(e.target.value); route(); };
window.addEventListener("hashchange", route);
$("pin-form").onsubmit = e => {
  e.preventDefault();
  if ($("pin").value === String(C.PIN)) { try { sessionStorage.setItem("acr-ok", "1"); } catch (_) {} iniciar(); }
  else { $("pin-erro").hidden = false; $("pin").value = ""; $("pin").focus(); }
};
let ok = false; try { ok = sessionStorage.getItem("acr-ok") === "1"; } catch (_) {}
if (ok) iniciar(); else $("pin").focus();
