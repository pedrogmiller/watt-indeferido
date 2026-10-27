/**
 * Cartas que param o tempo (Pedro 27/10, GM cartas-param-tempo-gm.md).
 * 1) As 13 cartas novas bloqueiam; avisos não bloqueiam; as exceções continuam a bloquear.
 * 2) Audiências legais sem «adiar».
 * 3) Adiar com prazo: a carta volta; depois do último adiamento sai o desfecho por omissão
 *    (banco term_sheet_expired, EPC retender, comprador: sorteio walk_away | oferta revista).
 * 4) Jogo longo com adiamentos sem ficar preso (o COD completo está em start-menu.mjs).
 *   WATT_BASE=http://127.0.0.1:<porta>/index.html WATT_SHOTS=<pasta> node test/cartas-param-tempo.mjs
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const playwright = require(process.env.PLAYWRIGHT_PATH || (() => {
  try { require.resolve('playwright'); return 'playwright'; } catch (_) { return '/tmp/pwtest/node_modules/playwright'; }
})());
const { chromium } = playwright;
const BASE = process.env.WATT_BASE || 'http://127.0.0.1:8765/index.html';
const OUT = process.env.WATT_SHOTS || '/opt/cursor/artifacts/screenshots';
fs.mkdirSync(OUT, { recursive: true });
let pass = 0; const fails = []; const errors = [];
function ok(c, l) { if (c) { pass++; console.log('OK  ', l); } else { fails.push(l); console.log('FAIL', l); } }
const VAL = JSON.parse(fs.readFileSync(new URL('../content/events/lp-cod-rules.draft.json', import.meta.url))).validade_propostas;

const NOVAS = [['mail-dgeg-lp-audiencia-01', 'ourique', 'hearing'], ['mail-dgeg-lp-condicionada-01', 'ourique', 'due'], ['mail-apa-dia-desfavoravel-01', 'default', 'hearing'],
  ['mail-apa-ca-quercineas-01', 'ourique', 'due'], ['mail-icnf-quercineas-01', 'ourique', 'due'], ['mail-apa-icnf-vinculativo-01', 'aia', 'due'],
  ['mail-icnf-compensacao-exigente-01', 'aia', 'due'], ['mail-buyer-offer-01', 'full-exit-pos-lp', 'due'], ['mail-banco-term-sheet-01', 'ourique', 'due'],
  ['mail-epc-propostas-01', 'ourique', 'due'], ['mail-rede-lp-parecer-01', 'ourique', 'due'], ['mail-apa-dia-01', 'ourique', 'due'], ['mail-camara-linha-enterrada-01', 'default', 'due']];
const AVISOS = [['mail-comunidade-01', 'ourique'], ['mail-camara-followup-01', 'hostil']];
const EXCECOES = [['mail-investidores-fid-01', 'falta-capital-proprio'], ['mail-obra-meteo-01', 'ourique-chuva']];

function save(month, phase, tags) {
  const tm = {}; Object.keys(tags).forEach((k) => { tm[k] = Math.max(0, month - 2); });
  return { v: 1, savedAt: '2026-10-27T10:00:00Z',
    state: { quarter: 3, year: 2027, caixa: 9, divida: 0, nav: 4, auctionWon: true, activeNodeId: 'ourique', minimized: [] },
    auctionState: { wonId: 'ourique', wonLots: ['ourique'], wave: 0 },
    mailLoop: { active: true, seId: 'ourique', month, projectPhase: phase, tags, tagMonth: tm, firedDeadlines: { land_option: true, pip_camara: true, lp_request: true } },
    mailState: { items: [], view: 'list', activeId: null, open: false },
    mandateState: { tier: 'boutique', acknowledged: true, letterRead: true, skip: false },
    flags: { onboardingDone: true } };
}
async function boot(browser, width, blob) {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
  page.on('pageerror', (e) => errors.push(width + ' pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(width + ' console: ' + m.text()); });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('watt-indeferido-onboarding-done', '1'); localStorage.setItem('watt.save.v1', s); }, JSON.stringify(blob));
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-menu="carregar"]').click();
  await page.locator('#startModal .slot button', { hasText: 'Continuar' }).first().click();
  await page.waitForFunction(() => window.__tutApi && window.__tutApi.month() >= 0 && window.__wattEventPack, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  return page;
}
const q = (page, fn, arg) => page.evaluate(fn, arg);
const deliver = (page, sk, skin) => q(page, ([a, b]) => window.__wattQA.deliverLetter(a, b), [sk, skin]);
const blocks = (page, id) => q(page, (i) => window.__wattQA.blocksPlay(i), id);
const letter = (page, id) => q(page, (i) => { const L = window.__wattQA.mailState.items.find((m) => m.id === i); return L ? { c: L.econChoiceId, d: L.deferredChoiceId, n: L.deferCount | 0, until: L.deferUntil, ids: (L.choices || []).map((c) => c.id), hide: L.hide_choices || [] } : null; }, id);
async function choose(page, id, choice) {
  await q(page, (i) => window.__tutApi.openLetter(i), id); await page.waitForTimeout(300);
  await page.locator('[data-mail-choice="' + choice + '"]').click({ force: true }); await page.waitForTimeout(300);
}
const bump = (page, n) => q(page, (k) => { window.__wattQA.mail.month += k; window.__wattQA.resurface(); }, n);
const visibleChoices = async (page, id) => { await q(page, (i) => window.__tutApi.openLetter(i), id); await page.waitForTimeout(250); return page.locator('#inboxBody [data-mail-choice]').evaluateAll((bs) => bs.map((b) => b.getAttribute('data-mail-choice'))); };

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' });
try {
  for (const width of (process.env.ONLY_GAME ? [] : [1440, 390])) {
    const page = await boot(browser, width, save(20, 'licenca_producao', { land_option_open: 1, dd_started: 1, pip_aprovado: 1, lp_request_submitted: 1, lp_granted: 1 }));
    // 1) bloqueia / aviso / exceções
    for (const [sk, skin, role] of NOVAS) {
      const id = await deliver(page, sk, skin);
      const m = await q(page, (i) => { const L = window.__wattQA.mailState.items.find((x) => x.id === i); return L ? { r: L.deadline_role, b: L.deadline_blocks_play } : null; }, id);
      ok(id && await blocks(page, id) === true && m.r === role && m.b === true, width + ' ' + sk + ' bloqueia (' + role + ')');
      if (sk === 'mail-banco-term-sheet-01' && width === 390 || sk === 'mail-banco-term-sheet-01' && width === 1440) {
        await q(page, (i) => window.__tutApi.openLetter(i), id); await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(OUT, 'bloqueia-banco-term-sheet-' + width + '.png') });
        await q(page, () => window.__tutApi.closeInbox());
      }
      if (role === 'hearing') { const ids = (await letter(page, id)).ids; ok(!ids.some((c) => c === 'hold' || c === 'delay'), width + ' ' + sk + ' sem «adiar»'); }
    }
    for (const [sk, skin] of AVISOS) {
      const id = await deliver(page, sk, skin);
      ok(id && await blocks(page, id) === false, width + ' ' + sk + ' é só aviso');
      if (sk === 'mail-comunidade-01') { await q(page, (i) => window.__tutApi.openLetter(i), id); await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, 'aviso-comunidade-' + width + '.png') }); await q(page, () => window.__tutApi.closeInbox()); }
    }
    for (const [sk, skin] of EXCECOES) { const id = await deliver(page, sk, skin); ok(id && await blocks(page, id) === true, width + ' ' + sk + ' continua a bloquear (exceção)'); }
    const icnf = await q(page, () => window.__wattEventPack.skeletons.find((s) => s.id === 'mail-icnf-quercineas-01').from_type);
    ok(icnf === 'ICNF', width + ' quercíneas ICNF: remetente ICNF');
    await q(page, () => { window.__wattQA.mailState.items = []; });

    // 2) Banco: adiar 2× → term_sheet_expired
    let id = await deliver(page, 'mail-banco-term-sheet-01', 'ourique');
    ok((await visibleChoices(page, id)).join('|') === 'sign|negotiate|delay', width + ' banco: escolhas sign · negotiate · delay (term_sheet_expired escondida)');
    const cons = await q(page, (i) => { const L = window.__wattQA.mailState.items.find((m) => m.id === i); const c = L.choices.find((x) => x.id === 'delay'); return c.label + ' | ' + c.consequence_pt; }, id);
    ok(/Adiar a resposta ao banco/.test(cons) && new RegExp('segura as condições por ' + VAL.validade_term_sheet_meses + ' meses').test(cons), width + ' banco: rótulo e consequência com ' + VAL.validade_term_sheet_meses + ' meses (dados)');
    await choose(page, id, 'delay');
    let L = await letter(page, id);
    ok(L.d === 'delay' && !L.c && await blocks(page, id) === false && L.until === 20 + VAL.validade_term_sheet_meses, width + ' banco: adiado não bloqueia, volta no mês ' + L.until);
    await bump(page, VAL.validade_term_sheet_meses - 1);
    ok(await blocks(page, id) === false, width + ' banco: ainda não voltou antes do prazo');
    await bump(page, 1);
    L = await letter(page, id);
    ok(!L.d && !L.c && await blocks(page, id) === true, width + ' banco: voltou e bloqueia outra vez');
    await choose(page, id, 'delay'); await bump(page, VAL.validade_term_sheet_meses);
    L = await letter(page, id);
    const ts = await q(page, () => window.__wattQA.mail.tags.term_sheet_expired | 0);
    ok(L.c === 'term_sheet_expired' && ts > 0 && await blocks(page, id) === false, width + ' banco: depois do 2.º adiamento sai term_sheet_expired');
    const rule = await q(page, () => { const r = window.__wattEventPack.rules_draft.rules.find((x) => x.id === 'r-banco' || x.skeleton === 'mail-banco-term-sheet-01'); return r ? (r.rearm_on_effects || []) : null; });
    ok(rule && !rule.includes('term_sheet_defer'), width + ' banco: regra sem rearm term_sheet_defer');

    // 3) EPC: adiar 1× → retender
    id = await deliver(page, 'mail-epc-propostas-01', 'ourique');
    await choose(page, id, 'delay'); await bump(page, VAL.validade_proposta_epc_meses);
    L = await letter(page, id);
    ok(L.c === 'retender', width + ' EPC: depois do único adiamento sai retender');

    // 4) Comprador: 2 adiamentos → sorteio (os dois ramos, forçados)
    for (const ramo of ['walk_away', 'skin:oferta-revista']) {
      await q(page, (r) => { window.__wattEconForce = Object.assign({}, window.__wattEconForce, { buyer_expira: r }); window.__wattQA.mailState.items = window.__wattQA.mailState.items.filter((m) => !/buyer-offer/.test(m.id)); }, ramo);
      id = await deliver(page, 'mail-buyer-offer-01', 'full-exit-pos-lp');
      const vis = await visibleChoices(page, id);
      ok(vis.includes('hold') && /Pedir tempo para pensar/.test(await page.locator('#inboxBody').innerText()), width + ' comprador: «Pedir tempo para pensar»');
      await choose(page, id, 'hold'); await bump(page, VAL.validade_proposta_meses);
      ok(await blocks(page, id) === true, width + ' comprador: voltou depois do 1.º adiamento');
      await choose(page, id, 'hold'); await bump(page, VAL.validade_proposta_meses);
      L = await letter(page, id);
      if (ramo === 'walk_away') ok(L.c === 'walk_away', width + ' comprador: sorteio → walk_away');
      else {
        const rev = await q(page, () => window.__wattQA.mailState.items.filter((m) => m.skinId === 'oferta-revista').map((m) => m.id));
        ok(L.c === 'expirou' && rev.length === 1, width + ' comprador: sorteio → oferta revista');
        const vis2 = await visibleChoices(page, rev[0]);
        ok(!vis2.includes('hold') && vis2.includes('walk_away') && await blocks(page, rev[0]) === true, width + ' oferta revista bloqueia, sem «adiar» (' + vis2.join('|') + ')');
        await page.screenshot({ path: path.join(OUT, 'oferta-revista-' + width + '.png') });
        await q(page, () => window.__tutApi.closeInbox());
      }
    }
    const body = await page.locator('body').innerText();
    ok(!/\brival/i.test(body), width + ' sem «rival»');
    await page.close();
  }
  // 5) Jogo completo até ao COD sem ficar preso (adia sempre que pode, à 1.ª vez)
  for (const width of (process.env.ONLY_GAME ? [1440] : [1440, 390])) {
    const page = await boot(browser, width, save(8, 'aia', { land_option_open: 1, dd_started: 1, nao_sujeicao: 1, pip_request_submitted: 1, pip_aprovado: 1, env_gate_ok: 1, lp_request_submitted: 1 }));
    const BAD = ['close', 'walk_away', 'abandon', 'silence', 'sell_lot', 'rescue_sell', 'refuse', 'let_go'];
    const PREF = ['rescue_capital', 'rescue_cut', 'accept_grid', 'send_full', 'reply', 'accept_conditions', 'accept', 'ack', 'sign', 'turnkey', 'go', 'go_lp', 'submit_full', 'approve', 'continue', 'pay'];
    const deferred = new Set(); let stuck = 0; let last = -1; let months = [];
    for (let i = 0; i < 34; i++) {
      for (let k = 0; k < 10; k++) {
        const pend = await q(page, () => window.__tutApi.mailItems().filter((x) => !x.econChoiceId && !x.deferredChoiceId && x.delivery !== 'note' && (x.choices || []).length).map((x) => x.id));
        if (!pend.length) break;
        const lid = pend[0];
        await q(page, (x) => window.__tutApi.openLetter(x), lid); await page.waitForTimeout(250);
        const btns = page.locator('#inboxBody [data-mail-choice]:not([disabled])');
        const ids = await btns.evaluateAll((bs) => bs.map((b) => b.getAttribute('data-mail-choice')));
        if (!ids.length) break;
        const skOf = lid.split(':')[0];
        let pick = (!process.env.NODEFER && !deferred.has(skOf) && ids.find((x) => x === 'delay' || x === 'hold')) || PREF.find((x) => ids.includes(x)) || ids.find((x) => x !== 'delay' && x !== 'hold' && !BAD.includes(x)) || ids.find((x) => x !== 'delay' && x !== 'hold') || ids[0];
        if (pick === 'delay' || pick === 'hold') deferred.add(skOf);
        await btns.nth(ids.indexOf(pick)).click({ force: true }); await page.waitForTimeout(350);
      }
      await q(page, () => window.__tutApi.closeInbox()); await page.waitForTimeout(100);
      const st = await q(page, () => ({ m: window.__tutApi.month(), ph: window.__tutApi.phase(), end: (window.__wattQA.mail.end_state || {}).status, cod: window.__wattQA.mail.tags.cod_reached | 0 }));
      if (st.cod || st.ph === 'cod' || (st.end && st.end !== 'playing')) { months.push(st); break; }
      if (st.m === last) stuck++; else stuck = 0;
      last = st.m;
      if (stuck >= 3) { console.log('preso', JSON.stringify(await q(page, () => window.__tutApi.mailItems().filter((x) => window.__wattQA.blocksPlay(x.id)).map((x) => ({ id: x.id, c: x.econChoiceId, d: x.deferredChoiceId, ch: (x.choices || []).map((c) => c.id) }))))); await q(page, () => window.__tutApi.openLetter('mail-banco-term-sheet-01:ourique:m11')); await page.waitForTimeout(400); console.log('btns', await page.locator('#inboxBody').evaluate((b) => [...b.querySelectorAll('button')].map((x) => x.outerHTML.slice(0, 160)).join('\n')), JSON.stringify(await q(page, () => window.__tutApi.mailItems().filter((x) => /banco/.test(x.id)).map((x) => [x.id, x.econChoiceId, x.deferredChoiceId, x.deferCount, x.delivery])))); break; }
      await page.locator('#btnNextQ').dispatchEvent('pointerdown'); await page.waitForTimeout(1000);
      await q(page, () => { document.querySelectorAll('#endScreen:not([hidden]) button').forEach(() => {}); });
    }
    const fin = await q(page, () => ({ m: window.__tutApi.month(), ph: window.__tutApi.phase(), end: window.__wattQA.mail.end_state, cod: window.__wattQA.mail.tags.cod_reached | 0 }));
    console.log('jogo-' + width, JSON.stringify({ fin, adiadas: [...deferred] }));
    console.log('tags', JSON.stringify(await q(page, () => Object.keys(window.__wattQA.mail.tags).filter((k) => /term_sheet|epc|fid|obra|equity|lp_|cod|le_/.test(k) && window.__wattQA.mail.tags[k]))), JSON.stringify(await q(page, () => window.__tutApi.mailItems().slice(0, 12).map((x) => x.id + '=' + (x.econChoiceId || x.deferredChoiceId || '-')))));
    ok(stuck < 3, width + ' jogo: o mês avança sempre (nunca preso)');
    // O COD com jogo completo é coberto pelos 4 jogos de start-menu.mjs; aqui o objetivo é nunca ficar preso com as cartas novas e os adiamentos.
    ok(fin.m >= 40 || fin.cod > 0 || (fin.end && fin.end.status !== 'playing'), width + ' jogo: corre ' + (fin.m - 8) + ' meses sem ficar preso (fim: mês ' + fin.m + ', ' + (fin.end && fin.end.status) + ')');
    await page.close();
  }
} finally { await browser.close(); }
ok(errors.length === 0, 'sem erros na consola' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
console.log('\n' + pass + ' OK, ' + fails.length + ' falhas');
if (fails.length) process.exit(1);
