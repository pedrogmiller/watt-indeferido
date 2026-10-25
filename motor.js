/* Motor de pesquisa · fase 1.
 * Pessoas fictícias e organizações fictícias: content/data/pessoas.json.
 * Empresas reais: content/data/empresas-arranque.json (promotores) e content/events/entities.draft.json (entidades, rede, bancos).
 * Sem números no código: espera do relatório e lista de qualidades vêm de pessoas.json. */
(function () {
  'use strict';
  const URLS = { pessoas: 'content/data/pessoas.json', empresas: 'content/data/empresas-arranque.json', entidades: 'content/events/entities.draft.json' };
  const SECOES = [
    ['PESSOAS', [['quadros', 'Quadros'], ['consultores', 'Consultores'], ['interlocutores', 'Interlocutores']]],
    ['ORGANIZAÇÕES', [['promotores', 'Promotores'], ['publicas', 'Entidades públicas'], ['rede', 'Rede'], ['bancos', 'Bancos'], ['fornecedores', 'Fornecedores'], ['ppa', 'Clientes PPA']]]
  ];
  const TIPO_SEC = { quadro: 'quadros', consultor: 'consultores', interlocutor: 'interlocutores' };
  const ENT_SEC = { dgeg: 'publicas', apa: 'publicas', icnf: 'publicas', ccdr: 'publicas', camara: 'publicas', ren: 'rede', e_redes: 'rede', banco: 'bancos' };
  const ORG_SEC = { fornecedor: 'fornecedores', cliente_ppa: 'ppa' };
  const COM_RELATORIO = { quadros: 1, consultores: 1, bancos: 1, fornecedores: 1, ppa: 1 };
  const MISS = '<span class="mo-miss">—</span>';

  let D = null; let loading = null;
  // Estado do jogo (vai no save): relatórios pedidos { chave: meses em falta } e recebidos { chave: true }
  let S = { reps: {}, done: {} };
  const nav = { stack: [] };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function curto(n) { return String(n || '').split(' — ')[0]; }
  function nomeEmpresaJogador() { try { const t = (localStorage.getItem('wi.arranque.nomeEmpresa') || '').trim(); if (t) return t; } catch (_) {} return 'A tua empresa'; }

  function load() {
    if (D) return Promise.resolve(D);
    if (loading) return loading;
    const get = (u) => fetch(u, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });
    loading = Promise.all([get(URLS.pessoas), get(URLS.empresas), get(URLS.entidades)]).then(([p, emp, ent]) => {
      const orgs = [];
      orgs.push({ ref: 'jogador', nome: nomeEmpresaJogador(), sec: 'promotores', desc: 'A tua empresa', jogador: true });
      (emp.empresas || []).forEach((e) => orgs.push({ ref: 'empresa:' + e.id, nome: e.nome, sec: 'promotores', desc: e.tipo === 'utility' ? 'Grupo de energia' : e.tipo === 'fundo' ? 'Fundo' : 'Promotor' }));
      const labels = ent.traits_labels_pt || {};
      (ent.instances || []).forEach((e) => {
        const sec = ENT_SEC[e.type]; if (!sec) return; // concorrentes já estão nos promotores
        orgs.push({ ref: 'entidade:' + e.id, nome: e.name, sec, desc: e.who_pt || '', escondidos: sec === 'bancos' ? (e.traits || []).map((t) => labels[t] || t) : null });
      });
      const grupos = (p.atributos_organizacoes && p.atributos_organizacoes.grupos) || {};
      (p.organizacoes || []).forEach((o) => {
        const sec = ORG_SEC[o.tipo]; if (!sec) return;
        orgs.push({ ref: 'org:' + o.id, nome: o.nome, sec, desc: o.descricao, atributos: (grupos[o.grupo_atributos] || []).map((a, i) => ({ nome: a.nome, visivel: !!a.visivel, v: (o.valores || [])[i] })) });
      });
      D = { cfg: p, orgs, pessoas: p.pessoas || [], byRef: {} };
      orgs.forEach((o) => { D.byRef[o.ref] = o; });
      return D;
    });
    return loading;
  }

  function espera() { return (D && D.cfg.relatorio && D.cfg.relatorio.espera_meses) || 0; }
  function repKey(kind, id) { return kind + ':' + id; }
  function repEstado(k) { if (S.done[k]) return 'feito'; if (S.reps[k] != null) return 'curso'; return null; }
  function tick(n) {
    const steps = Math.max(0, n | 0); if (!steps) return;
    let mudou = false;
    Object.keys(S.reps).forEach((k) => { S.reps[k] -= steps; if (S.reps[k] <= 0) { delete S.reps[k]; S.done[k] = true; mudou = true; } });
    if (mudou && isOpen()) render();
  }

  /* ── HTML ── */
  function orgLink(ref) {
    if (!ref || ref === 'livre') return null;
    const o = D.byRef[ref]; if (!o) return null;
    return '<a href="#" class="mo-link" data-mo-org="' + esc(ref) + '">' + esc(curto(o.nome)) + '</a>';
  }
  function cabecalho(nome, ref) {
    const l = orgLink(ref);
    return '<h2 class="mo-titulo" id="moTitulo">' + esc(nome) + ' <span class="mo-emp">(' + (l || 'Livre') + ')</span></h2>';
  }
  function navBar(crumb) {
    return '<div class="mo-nav"><button type="button" class="mo-btn-g" id="moVoltar">‹ Voltar</button><button type="button" class="mo-btn-g" id="moInicio">⌂ Início</button><span class="mo-crumb">' + esc(crumb) + '</span></div>';
  }
  function secNav(cur) {
    return SECOES.map(([g, list]) => '<div class="mo-grupo"><div class="mo-glabel">' + g + '</div><div class="mo-tabs">' +
      list.map(([id, l]) => '<button type="button" class="mo-tab' + (id === cur ? ' on' : '') + '" data-mo-sec="' + id + '">' + l + '</button>').join('') + '</div></div>').join('');
  }
  function pessoaRow(p) {
    const l = orgLink(p.trabalha_em);
    return '<li class="mo-row"><a href="#" class="mo-link mo-nome" data-mo-pessoa="' + esc(p.id) + '">' + esc(p.nome) + '</a><span class="mo-sub">' + esc(p.cargo || '') + ' · ' + (l || 'Livre') + '</span></li>';
  }
  function orgRow(o) {
    const n = D.pessoas.filter((p) => p.trabalha_em === o.ref).length;
    return '<li class="mo-row"><a href="#" class="mo-link mo-nome" data-mo-org="' + esc(o.ref) + '">' + esc(curto(o.nome)) + '</a><span class="mo-sub">' + esc(o.desc || '') + ' · ' + n + (n === 1 ? ' pessoa' : ' pessoas') + '</span></li>';
  }
  function listaHtml(sec, q) {
    const ql = (q || '').trim().toLowerCase();
    const m = (s) => !ql || String(s).toLowerCase().indexOf(ql) >= 0;
    let items;
    if (sec === 'quadros' || sec === 'consultores' || sec === 'interlocutores') items = D.pessoas.filter((p) => TIPO_SEC[p.tipo] === sec && m(p.nome)).map(pessoaRow);
    else items = D.orgs.filter((o) => o.sec === sec && m(o.nome)).map(orgRow);
    return '<ul class="mo-lista" id="moLista" data-sec="' + sec + '">' + (items.join('') || '<li class="mo-vazio">Nenhum resultado.</li>') + '</ul>';
  }
  function homeHtml(st) {
    const sec = st.sec || 'quadros';
    return navBar('Pesquisa') + '<div class="mo-busca"><input type="search" id="moQ" placeholder="Procurar por nome" value="' + esc(st.q || '') + '" autocomplete="off"></div>' + secNav(sec) + listaHtml(sec, st.q);
  }
  function qvHtml(v, hidden) { if (hidden) return '<span class="mo-q" title="Escondido até haver relatório">?</span>'; return v == null ? MISS : '<b>' + esc(v) + '</b>'; }
  function qualCols(p) {
    const Q = D.cfg.qualidades || {};
    const L = p.tipo === 'interlocutor' ? (Q.interlocutores || []) : (Q.quadros_consultores || []);
    const reveal = repEstado(repKey('p', p.id)) === 'feito';
    const cols = [];
    L.forEach((q) => { (cols[q.coluna] = cols[q.coluna] || []).push(q); });
    return '<div class="mo-cols mo-cols-' + cols.length + '" id="moQual">' + cols.map((c) => '<div class="mo-col">' + c.map((q) =>
      '<div class="mo-qrow"><span>' + esc(q.nome) + '</span>' + qvHtml((p.qualidades || {})[q.id], !q.visivel && !reveal) + '</div>').join('') + '</div>').join('') + '</div>';
  }
  function relatorioHtml(k) {
    const e = repEstado(k); const n = espera();
    const prazo = n === 1 ? '1 mês' : n + ' meses';
    if (e === 'feito') return '<div class="mo-rep ok" id="moRep">Relatório recebido. Já vês tudo.</div>';
    if (e === 'curso') return '<div class="mo-rep" id="moRep">Relatório pedido. Chega daqui a <span class="mo-est">≈</span> ' + prazo + ' de jogo.</div>';
    return '<div class="mo-acoes" id="moAcoes"><div class="mo-glabel">Ações</div><button type="button" class="mo-btn" id="moPedir" data-mo-rep="' + esc(k) + '">Pedir relatório</button><span class="mo-sub">Gratuito. Chega daqui a ' + prazo + ' de jogo e mostra todas as qualidades.</span></div>';
  }
  function historial(p) {
    const h = p.historial || [];
    if (!h.length) return '';
    return '<div class="mo-card"><div class="mo-glabel">Historial</div><ul class="mo-hist">' + h.map((x) => '<li>' + (orgLink(x.onde) || esc(x.onde)) + ' <span class="mo-sub">' + (x.de || '—') + ' – ' + (x.ate || 'hoje') + '</span></li>').join('') + '</ul></div>';
  }
  function pessoaHtml(id) {
    const p = D.pessoas.find((x) => x.id === id); if (!p) return navBar('Pesquisa') + '<p>' + MISS + '</p>';
    const sec = TIPO_SEC[p.tipo];
    return navBar(SECOES[0][1].find((s) => s[0] === sec)[1]) + '<section class="mo-ficha" id="moFicha" data-tipo="' + p.tipo + '">' + cabecalho(p.nome, p.trabalha_em) +
      '<p class="mo-sub">' + esc(p.cargo || '') + (p.regiao ? ' · ' + esc(p.regiao) : '') + '</p>' +
      '<div class="mo-card"><div class="mo-glabel">Trabalha em</div><div id="moTrabalha">' + (orgLink(p.trabalha_em) || 'Livre') + '</div></div>' +
      qualCols(p) + (COM_RELATORIO[sec] ? relatorioHtml(repKey('p', p.id)) : '') + historial(p) + '</section>';
  }
  function orgHtml(ref) {
    const o = D.byRef[ref]; if (!o) return navBar('Pesquisa') + '<p>' + MISS + '</p>';
    const k = repKey('o', ref); const reveal = repEstado(k) === 'feito';
    const staff = D.pessoas.filter((p) => p.trabalha_em === ref);
    let attrs = '';
    if (o.atributos) attrs = '<div class="mo-cols mo-cols-1" id="moAttr"><div class="mo-col">' + o.atributos.map((a) => '<div class="mo-qrow"><span>' + esc(a.nome) + '</span>' + (a.visivel || reveal ? (a.v == null ? MISS : '<b>' + esc(a.v) + '</b><span class="mo-sub">/5</span>') : qvHtml(null, true)) + '</div>').join('') + '</div></div>';
    else if (o.escondidos) attrs = '<div class="mo-cols mo-cols-1" id="moAttr"><div class="mo-col">' + o.escondidos.map((t, i) => '<div class="mo-qrow"><span>' + (reveal ? esc(t) : 'Característica ' + (i + 1)) + '</span>' + (reveal ? '<b>✓</b>' : qvHtml(null, true)) + '</div>').join('') + '</div></div>';
    const secL = SECOES[1][1].find((s) => s[0] === o.sec)[1];
    return navBar(secL) + '<section class="mo-ficha" id="moOrg" data-sec="' + o.sec + '"><h2 class="mo-titulo">' + esc(curto(o.nome)) + '</h2><p class="mo-sub">' + esc(secL) + (o.desc ? ' · ' + esc(o.desc) : '') + '</p>' +
      attrs + (COM_RELATORIO[o.sec] ? relatorioHtml(k) : '') +
      '<div class="mo-card" id="moPlantel"><div class="mo-glabel">Plantel · ' + staff.length + '</div>' + (staff.length ? '<ul class="mo-lista">' + staff.map(pessoaRow).join('') + '</ul>' : '<p class="mo-sub">Ninguém conhecido. ' + MISS + '</p>') + '</div></section>';
  }

  /* ── Painel ── */
  function panel() { return document.getElementById('motorPanel'); }
  function isOpen() { const p = panel(); return !!(p && !p.hidden); }
  function cur() { return nav.stack[nav.stack.length - 1] || { v: 'home', sec: 'quadros' }; }
  function place() {
    const p = panel(); if (!p) return;
    const h = document.querySelector('header.header');
    p.style.top = Math.max(0, Math.round(h ? h.getBoundingClientRect().bottom : 0)) + 'px';
  }
  function render() {
    const p = panel(); if (!p || !D) return;
    const st = cur();
    const body = p.querySelector('.mo-body');
    body.innerHTML = st.v === 'pessoa' ? pessoaHtml(st.id) : st.v === 'org' ? orgHtml(st.ref) : homeHtml(st);
    body.scrollTop = 0;
    const q = document.getElementById('moQ');
    if (q) q.addEventListener('input', () => { st.q = q.value; const l = document.getElementById('moLista'); if (l) l.outerHTML = listaHtml(st.sec || 'quadros', st.q); });
  }
  function go(st) { nav.stack.push(st); render(); }
  function open() {
    const p = panel(); if (!p) return;
    load().then(() => {
      if (!nav.stack.length) nav.stack.push({ v: 'home', sec: 'quadros' });
      p.hidden = false; document.body.classList.add('motor-open');
      const b = document.getElementById('btnMotor'); if (b) b.setAttribute('aria-expanded', 'true');
      place(); render();
    }).catch((err) => { try { console.warn('[motor] dados', err); } catch (_) {} });
  }
  function close() {
    const p = panel(); if (!p) return;
    p.hidden = true; nav.stack = []; document.body.classList.remove('motor-open');
    const b = document.getElementById('btnMotor'); if (b) b.setAttribute('aria-expanded', 'false');
  }
  function back() { if (nav.stack.length > 1) { nav.stack.pop(); render(); } else close(); }

  function wire() {
    const btn = document.getElementById('btnMotor');
    if (btn) btn.addEventListener('click', () => { if (isOpen()) close(); else open(); });
    ['btnInbox', 'btnObjetivos', 'btnSettings', 'btnTutorial'].forEach((id) => { const b = document.getElementById(id); if (b) b.addEventListener('click', () => { if (isOpen()) close(); }, true); });
    const p = panel(); if (!p) return;
    p.addEventListener('click', (ev) => {
      const t = ev.target.closest('button, a'); if (!t) return;
      if (t.id === 'moVoltar') return back();
      if (t.id === 'moInicio') return close();
      if (t.dataset.moSec) { ev.preventDefault(); const st = cur(); if (st.v === 'home') { st.sec = t.dataset.moSec; render(); } else go({ v: 'home', sec: t.dataset.moSec }); return; }
      if (t.dataset.moPessoa) { ev.preventDefault(); return go({ v: 'pessoa', id: t.dataset.moPessoa }); }
      if (t.dataset.moOrg) { ev.preventDefault(); return go({ v: 'org', ref: t.dataset.moOrg }); }
      if (t.dataset.moRep) { const k = t.dataset.moRep; if (!repEstado(k)) { S.reps[k] = espera(); if (S.reps[k] <= 0) { delete S.reps[k]; S.done[k] = true; } try { if (typeof window.__wiScheduleSave === 'function') window.__wiScheduleSave('motor-relatorio'); } catch (_) {} } render(); }
    });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) close(); });
    window.addEventListener('resize', () => { if (isOpen()) place(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();

  window.WIMotor = {
    open, close, isOpen, tick, load,
    exportState: () => JSON.parse(JSON.stringify(S)),
    importState: (s) => { S = { reps: (s && s.reps && typeof s.reps === 'object') ? Object.assign({}, s.reps) : {}, done: (s && s.done && typeof s.done === 'object') ? Object.assign({}, s.done) : {} }; },
    openPessoa: (id) => { open(); load().then(() => go({ v: 'pessoa', id })); },
    openOrg: (ref) => { open(); load().then(() => go({ v: 'org', ref })); }
  };
})();
