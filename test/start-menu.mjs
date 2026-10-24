/**
 * Headless check for the start menu.
 * Run from the repo root, with a static server on :8765:
 *   node test/start-menu.mjs
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const playwright = require(process.env.PLAYWRIGHT_PATH || (() => {
  try { require.resolve('playwright'); return 'playwright'; }
  catch (_) { return '/tmp/pwtest/node_modules/playwright'; }
})());
const { chromium } = playwright;

const BASE = process.env.WATT_BASE || 'http://127.0.0.1:8765/index.html';
const OUT = process.env.WATT_SHOTS || '/opt/cursor/artifacts/screenshots';
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
function track(page, label) {
  page.on('pageerror', (err) => errors.push(label + ' pageerror: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(label + ' console: ' + msg.text());
  });
}

async function shot(page, name) {
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

function legacyBlob() {
  return {
    v: 1,
    savedAt: '2026-10-12T18:00:00.000Z',
    state: {
      quarter: 1, year: 2027, caixa: 3.2, divida: 0, nav: 4,
      auctionWon: true, activeNodeId: 'ourique', minimized: []
    },
    auctionState: { wonId: 'ourique', wonLots: ['ourique'], wave: 0 },
    mailLoop: { active: true, seId: 'ourique', month: 4, projectPhase: 'land' },
    mailState: { items: [], view: 'list', activeId: null, open: false },
    mandateState: { tier: 'boutique', acknowledged: true, letterRead: true, skip: false },
    flags: { onboardingDone: true }
  };
}

async function menuTexts(page) {
  return page.locator('#startMenuCard').innerText();
}

async function assertMenuChrome(page, width) {
  const box = await page.locator('#startMenu h1').boundingBox();
  if (!box) throw new Error('menu heading missing at ' + width);
  const gear = await page.locator('#btnSettings').isVisible();
  if (gear) throw new Error('header gear visible on the menu at ' + width);
  const period = await page.locator('#periodLabel').innerText();
  if (period.trim() !== 'v0.1') throw new Error('period is ' + period);
  const text = await menuTexts(page);
  const buttons = await page.locator('#startMenuCard .stack').innerText();
  const order = ['Carregar jogo', 'Novo jogo', 'Como se joga', 'Definições', 'Dar opinião'];
  let at = -1;
  for (const label of order) {
    const i = buttons.indexOf(label);
    if (i < 0) throw new Error('missing button ' + label + ' at ' + width);
    if (i < at) throw new Error('button order at ' + width + ': ' + label);
    at = i;
  }
  if (/Apagar jogo guardado/.test(text)) throw new Error('delete is on the menu, not inside Definições');
  if (!/Sobre/.test(text)) throw new Error('footer missing Sobre');
  if (/o que há de novo/.test(text)) throw new Error('footer has the novidades link');
  const def = page.locator('[data-menu="definicoes"]');
  const defHtml = await def.innerHTML();
  if (/<svg/i.test(defHtml)) throw new Error('Definições button has an icon');
  if (!/Definições/.test(await def.innerText())) throw new Error('Definições label');
}

async function openEmptyMenu(browser, width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  track(page, tag);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#startMenu h1');
  await assertMenuChrome(page, width);
  const text = await menuTexts(page);
  if (!/Ainda não tens jogos guardados/.test(text)) throw new Error('empty subtitle: ' + text);
  if ((await page.locator('#startMenu h1').innerText()).trim() !== 'Novo jogo') throw new Error('title');
  if (!/Desenvolve uma central solar/.test(text)) throw new Error('lead');
  await shot(page, 'menu-empty-' + tag);
  await page.locator('[data-menu="como"]').click();
  await page.waitForSelector('#startModal h2');
  const how = await page.locator('#startModal').innerText();
  if (!/Como se joga/.test(how) || !/COD/.test(how)) throw new Error('how to play sheet');
  await shot(page, 'como-se-joga-' + tag);
  await page.locator('#startModal [data-close-sheet]').first().click();
  await page.locator('[data-menu="sobre"]').click();
  await page.waitForSelector('#startModal h2');
  if (!/Sobre/.test(await page.locator('#startModal h2').innerText())) throw new Error('sobre');
  await page.locator('#startModal [data-close-sheet]').first().click();
  await page.locator('[data-menu="opiniao"]').click();
  await page.waitForSelector('#op1');
  await shot(page, 'opiniao-' + tag);
  await page.locator('#startModal [data-close-sheet]').first().click();
  await page.close();
}

async function migrationAndDelete(browser, width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  track(page, 'migrate-' + tag);
  const raw = JSON.stringify(legacyBlob());
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((saved) => {
    localStorage.clear();
    localStorage.setItem('watt.save.v1', saved);
  }, raw);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#startMenu h1');
  const store = await page.evaluate(() => ({
    index: JSON.parse(localStorage.getItem('watt.saves.index.v1') || 'null'),
    active: localStorage.getItem('watt.saves.active'),
    backup: localStorage.getItem('watt.save.v1.backup'),
    legacy: localStorage.getItem('watt.save.v1'),
    keys: Object.keys(localStorage).filter((k) => k.startsWith('watt.save'))
  }));
  if (!store.index || store.index.length !== 1) throw new Error('index: ' + JSON.stringify(store.index));
  if (!store.active) throw new Error('no active id');
  if (store.backup !== raw) throw new Error('backup mismatch');
  if (store.legacy != null) throw new Error('legacy key still live');
  const slotKey = 'watt.save.slot.' + store.active;
  const slotRaw = await page.evaluate((k) => localStorage.getItem(k), slotKey);
  if (slotRaw !== raw) throw new Error('slot is not the migrated save');
  const text = await menuTexts(page);
  if (!/1 jogo guardado/.test(text)) throw new Error('menu did not count the migrated game: ' + text);
  if (!/Ourique/.test(text)) throw new Error('place missing: ' + text);
  if (!/Mandato 1: O primeiro ponto de ligação/.test(await page.locator('[data-menu="carregar"]').innerText()) && !/Ourique/.test(text)) {
    throw new Error('migrated summary');
  }
  await shot(page, 'menu-migrated-' + tag);
  await page.locator('[data-menu="carregar"]').click();
  await page.waitForSelector('#startModal .slot');
  const sheet = await page.locator('#startModal').innerText();
  if (!/Continuar/.test(sheet) || !/Apagar/.test(sheet)) throw new Error('slot actions');
  if (!/Mandato 1: O primeiro ponto de ligação/.test(sheet)) throw new Error('mandate line: ' + sheet);
  await shot(page, 'carregar-' + tag);
  await page.locator('#startModal [data-close-sheet]').click();

  await page.locator('[data-menu="definicoes"]').click();
  await page.waitForSelector('#settingsSheet.open');
  if (!(await page.locator('#btnSettings').isVisible())) {
    // gear stays hidden on the menu; Definições opened the sheet
  }
  await page.locator('#btnNewGame').click();
  await page.waitForSelector('#settingsConfirm.open');
  const confirm = await page.locator('#settingsConfirm').innerText();
  if (!/Apagar/.test(confirm) || !/Não se pode desfazer/.test(confirm)) throw new Error('confirm copy: ' + confirm);
  await shot(page, 'apagar-confirm-' + tag);
  await page.locator('#settingsConfirmCancel').click();
  const still = await page.evaluate(() => JSON.parse(localStorage.getItem('watt.saves.index.v1') || '[]').length);
  if (still !== 1) throw new Error('cancel deleted the game');
  await page.locator('#btnNewGame').click();
  await page.waitForSelector('#settingsConfirm.open');
  await page.locator('#settingsConfirmOk').click();
  await page.waitForFunction(() => {
    const list = JSON.parse(localStorage.getItem('watt.saves.index.v1') || '[]');
    return list.length === 0;
  });
  const after = await page.evaluate((id) => ({
    index: JSON.parse(localStorage.getItem('watt.saves.index.v1') || '[]'),
    slot: localStorage.getItem('watt.save.slot.' + id),
    backup: localStorage.getItem('watt.save.v1.backup')
  }), store.active);
  if (after.index.length !== 0) throw new Error('index not empty');
  if (after.slot != null) throw new Error('slot not removed');
  if (after.backup !== raw) throw new Error('backup was overwritten or removed');
  await page.waitForSelector('#startMenu h1');
  if (!/Ainda não tens jogos guardados/.test(await menuTexts(page))) throw new Error('menu still lists a game');
  await shot(page, 'menu-after-delete-' + tag);

  // A second visit must not mint another backup or resurrect the legacy save.
  await page.reload({ waitUntil: 'networkidle' });
  const again = await page.evaluate(() => ({
    index: JSON.parse(localStorage.getItem('watt.saves.index.v1') || '[]').length,
    backup: localStorage.getItem('watt.save.v1.backup'),
    legacy: localStorage.getItem('watt.save.v1'),
    slots: Object.keys(localStorage).filter((k) => k.startsWith('watt.save.slot.')).length
  }));
  if (again.index !== 0 || again.slots !== 0) throw new Error('save came back: ' + JSON.stringify(again));
  if (again.backup !== raw) throw new Error('backup changed on reload');
  if (again.legacy != null) throw new Error('legacy key returned');
  await page.close();
  return raw;
}

async function dismissLayers(page) {
  if (await page.locator('#objSheet:not([hidden])').count()) {
    await page.locator('#objClose').click();
    await page.waitForTimeout(80);
  }
  if (await page.locator('#mandate0Card').count()) {
    await page.locator('#mandate0Close').click();
    await page.waitForTimeout(100);
  }
  if (await page.locator('#phase0Welcome').count()) {
    await page.locator('#phase0Welcome button').first().click();
    await page.waitForTimeout(150);
  }
  if (await page.locator('.tut-root.open .tut-off').count()) {
    await page.locator('.tut-root.open .tut-off').click();
    await page.waitForTimeout(200);
  }
  if (await page.locator('#wattCoach[aria-hidden="false"] #wattCoachDismiss').count()) {
    await page.locator('#wattCoachDismiss').click();
    await page.waitForTimeout(100);
  }
  if (await page.locator('#mandateLetter.open').count()) {
    await page.locator('#mandateLetterOpenMarket').click();
    await page.waitForTimeout(200);
    return;
  }
  if (await page.locator('#mandateBriefing.open').count()) {
    await page.locator('#mandateBriefingMarket').click();
    await page.waitForTimeout(200);
  }
}

async function answerOpenLetter(page) {
  const actions = page.locator('.mail-detail-actions button:not([disabled])');
  const n = await actions.count();
  if (!n) return false;
  let pick = 0;
  const labels = [];
  for (let i = 0; i < n; i++) labels.push((await actions.nth(i).innerText()).replace(/\s+/g, ' ').trim());
  const prefer = [
    /hibridizar/i,
    /2,5|2\.5/,
    /Aprovar a decisão final/i,
    /Trazer um sócio/i,
    /Ir ao leilão/i,
    /arrancar/i,
    /Assinar a proposta/i,
    /preço fechado/i,
    /opção/i,
    /Aceitar/i,
    /Pedir o PIP/i,
    /submeter/i,
    /Percebi/i,
    /Continuar/i
  ];
  const avoid = /recusar|ignorar|mais tempo|só com solar|seguir só|adiar/i;
  for (const re of prefer) {
    const i = labels.findIndex((t) => re.test(t) && !avoid.test(t));
    if (i >= 0) { pick = i; break; }
  }
  if (avoid.test(labels[pick])) {
    const alt = labels.findIndex((t) => !avoid.test(t));
    if (alt >= 0) pick = alt;
  }
  await actions.nth(pick).click({ force: true });
  await page.waitForTimeout(250);
  return true;
}

/** Blocking letters first, then the budget and hybrid mails the clock does not stop for. */
async function drainMail(page) {
  const tried = new Set();
  for (let hop = 0; hop < 8; hop++) {
    await dismissLayers(page);
    const want = await page.evaluate(() => {
      const items = (window.__wattQA && window.__wattQA.mailState && window.__wattQA.mailState.items) || [];
      const open = items.filter((l) => l && !l.econChoiceId && !l.deferredChoiceId);
      const btn = document.getElementById('btnNextQ');
      const aria = (btn && btn.getAttribute('aria-label')) || '';
      const drawer = document.getElementById('inboxDrawer');
      return {
        pending: open.length,
        block: /Responder carta/.test(aria),
        inbox: !!(drawer && drawer.classList.contains('open'))
      };
    });
    if (!want.inbox && !want.pending && !want.block) return false;
    if (!want.inbox) {
      if (want.block) await page.locator('#btnNextQ').click();
      else if (await page.locator('#btnInbox').isVisible()) await page.locator('#btnInbox').click();
      else await page.locator('#tabInbox').click();
      await page.waitForTimeout(300);
      await dismissLayers(page);
    }
    if (await page.locator('.mail-detail-actions button:not([disabled])').count()) {
      await answerOpenLetter(page);
      if (await page.locator('#inboxDrawer.open .mail-detail').count()) {
        await page.locator('#inboxBackBtn').click();
        await page.waitForTimeout(120);
      }
      return true;
    }
    if (await page.locator('#inboxDrawer.open .mail-detail').count()) {
      const id = await page.evaluate(() => window.__wattQA && window.__wattQA.mailState && window.__wattQA.mailState.activeId);
      if (id) tried.add(id);
      await page.locator('#inboxBackBtn').click();
      await page.waitForTimeout(150);
    }
    if (!(await page.locator('#inboxDrawer.open').count())) return false;
    const rows = page.locator('.mail-row');
    const n = await rows.count();
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < n; i++) {
      const id = await rows.nth(i).getAttribute('data-mail-id');
      if (id && tried.has(id)) continue;
      const t = (await rows.nth(i).innerText()).replace(/\s+/g, ' ');
      if (/respondida/i.test(t)) continue;
      let score = 10;
      if (/hibrid/i.test(t)) score = 100;
      else if (/orçamento|2,5/i.test(t)) score = 90;
      else if (/PIP|licença/i.test(t)) score = 80;
      else if (/REN|acordo/i.test(t)) score = 70;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) {
      for (let i = 0; i < 3 && await page.locator('#inboxDrawer.open').count(); i++) {
        await page.locator('#inboxBackBtn').click({ force: true });
        await page.waitForTimeout(100);
      }
      return false;
    }
    await rows.nth(best).click({ force: true });
    await page.waitForTimeout(220);
  }
  return false;
}

/** Novo jogo walks Jogador → País → Empresas → Empresa, confirms, and lands in the inbox. */
async function startNewGame(page, shotName) {
  await page.locator('[data-menu="novo"]').click();
  await page.waitForSelector('#arranque[data-step="jogador"] #arranqueNext');
  if (shotName) await shot(page, shotName);
  await page.locator('#arranqueNext').click();
  await page.waitForSelector('#arranque[data-step="pais"]');
  await page.locator('#arranqueNext').click();
  await page.waitForSelector('#arranque[data-step="empresa"] [data-rival="edp"]', { timeout: 15000 });
  await page.locator('#arranqueNext').click();
  await page.waitForSelector('#arranque[data-step="ficha"]');
  await page.locator('#arranqueNext').click();
  await page.waitForSelector('#arranqueConfirm.open #arranqueConfirmYes');
  await page.locator('#arranqueConfirmYes').click();
  await page.waitForSelector('#inboxDrawer.open [data-mail-choice="ir_leilao"]', { timeout: 15000 });
  const preset = await page.evaluate(() => {
    const id = localStorage.getItem('watt.saves.active');
    const idx = JSON.parse(localStorage.getItem('watt.saves.index.v1') || '[]');
    const row = idx.find((s) => s.id === id);
    return row && row.name;
  });
  if (!/Jogo de \d+ \w+ \d{4}/.test(preset || '')) throw new Error('default name: ' + preset);
  try { await page.locator('.tut-root.open .tut-off').click({ timeout: 2000 }); } catch (_) {}
  if (await page.locator('#arranque').isVisible()) throw new Error('opening still visible');
  if (await page.locator('#auctionRoom.open').count()) throw new Error('auction opened from the confirmation');
}

/** Cartas do gás (WATT_GAS=1): força as 3 cartas, verifica efeito e intervalo, fotografa. Também procura «rival» visível. */
const gasReport = {};
async function visibleRival(page) {
  return page.evaluate(() => {
    const hits = [];
    const txt = document.body.innerText || '';
    const m = txt.match(/.{0,40}rival.{0,40}/gi);
    if (m) hits.push(...m);
    document.querySelectorAll('[aria-label],[title],[placeholder]').forEach((el) => {
      ['aria-label', 'title', 'placeholder'].forEach((a) => { const v = el.getAttribute(a); if (v && /rival/i.test(v)) hits.push(a + ': ' + v); });
    });
    return hits;
  });
}
async function openGasLetter(page, prefix, name) {
  await dismissLayers(page);
  for (let i = 0; i < 4 && await page.locator('#inboxDrawer.open').count(); i++) { await page.locator('#inboxBackBtn').click({ force: true }); await page.waitForTimeout(120); }
  if (await page.locator('#inboxDrawer.open').count()) { await page.evaluate(() => document.getElementById('inboxBackdrop').click()); await page.waitForTimeout(200); }
  if (!(await page.locator('#inboxDrawer.open').count())) {
    if (await page.locator('#btnInbox').isVisible()) await page.locator('#btnInbox').click(); else await page.locator('#tabInbox').click();
    await page.waitForTimeout(300);
  }
  for (let i = 0; i < 3 && await page.locator('#inboxDrawer.open .mail-detail').count(); i++) { await page.locator('#inboxBackBtn').click(); await page.waitForTimeout(150); }
  if (!(await page.locator('.mail-row[data-mail-id^="' + prefix + '"]').count())) { await page.evaluate((id) => { if (window.WattInbox) { window.WattInbox.open(); window.WattInbox.openLetter(id); } }, prefix); await page.waitForTimeout(250); }
  const row = page.locator('.mail-row[data-mail-id^="' + prefix + '"]').first();
  if (!(await row.count()) && await page.locator('#inboxDrawer.open .mail-detail').count()) { /* opened directly */ } else
    await row.click({ force: true });
  await page.waitForTimeout(300);
  const text = await page.locator('#inboxDrawer').innerText();
  const clip = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#inboxDrawer .mail-detail, #inboxDrawer .mail-detail *').forEach((el) => {
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible' && el.clientWidth > 0) out.push(el.className || el.tagName);
    });
    const d = document.getElementById('inboxDrawer').getBoundingClientRect();
    if (d.right > window.innerWidth + 1) out.push('drawer off-screen');
    return out;
  });
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  return { text, clip };
}
async function gasHook(page, tag, month, st) {
  const qa = (fn, arg) => page.evaluate(fn, arg);
  const r = gasReport[tag] = gasReport[tag] || { rivalHits: [] };
  const hits = await visibleRival(page);
  if (hits.length) r.rivalHits.push(...hits.map((h) => 'M' + month + ' ' + h));
  const items = await qa(() => window.__wattQA.mailState.items.map((l) => l.id));
  const has = (p) => items.filter((id) => id.startsWith(p));
  if (month < 2) return;
  if (!st.g1) {
    const g = has('mail-mercado-gas-01');
    if (!g.length) { await qa(() => window.__wattQA.forceGas('gas')); return; }
    st.g1 = true;
    const gs = await qa(() => { const x = window.__wattQA.gas(); return { s: x.state, d: x.nightDelta, t: window.__wattQA.mail.tags }; });
    st.gasMonth = gs.s.lastGasMonth;
    const o = await openGasLetter(page, 'mail-mercado-gas-01', 'carta1-gas-sobe-' + tag);
    r.card1 = { month: st.gasMonth, until: gs.s.gasUntil, nightDelta: gs.d, tags: { gas_caro_ativo: gs.t.gas_caro_ativo, preco_noite_up: gs.t.preco_noite_up, preco_dia_sem_efeito: gs.t.preco_dia_sem_efeito }, clip: o.clip };
    if (gs.d !== 25 || gs.s.gasUntil !== st.gasMonth + 3) throw new Error('gas effect ' + JSON.stringify(r.card1));
    if (!/O gás subiu\. As noites ficaram mais caras\./.test(o.text) || !/Em 2022, Portugal e Espanha/.test(o.text)) throw new Error('card1 text');
    await qa(() => window.__wattQA.forceGas('ano'));
    return;
  }
  if (!st.g2) {
    if (!has('mail-rival-gas-01').length) { await qa(() => window.__wattQA.forceGas('ano')); return; }
    st.g2 = true;
    const o = await openGasLetter(page, 'mail-rival-gas-01', 'carta2-ano-fraco-' + tag);
    const gs = await qa(() => ({ s: window.__wattQA.gas().state, t: window.__wattQA.mail.tags }));
    r.card2 = { caixa: gs.s.rivalCaixaMEUR, tags: { rival_caixa_up: gs.t.rival_caixa_up, rival_agressivo_proximo_leilao: gs.t.rival_agressivo_proximo_leilao }, clip: o.clip };
    if (!/Um grande grupo energético nem sentiu/.test(o.text) || /rival/i.test(o.text)) throw new Error('card2 text');
  }
  const gs = await qa(() => ({ s: window.__wattQA.gas().state, d: window.__wattQA.gas().nightDelta, t: window.__wattQA.mail.tags }));
  if (month >= st.gasMonth + 3 && !st.expired) {
    st.expired = true;
    r.expiry = { month, nightDelta: gs.d, gas_caro_ativo: gs.t.gas_caro_ativo };
    if (gs.d !== 0 || (gs.t.gas_caro_ativo | 0) !== 0) throw new Error('gas did not expire ' + JSON.stringify(r.expiry));
  }
  if (!st.g3) {
    const g = has('mail-mercado-gas-01');
    if (g.length > 1) {
      st.g3 = true;
      r.interval = { first: st.gasMonth, second: gs.s.lastGasMonth, gap: gs.s.lastGasMonth - st.gasMonth };
      if (r.interval.gap < 12) throw new Error('interval ' + JSON.stringify(r.interval));
    } else {
      await qa((late) => { window.__wattQA.forceGas('gas'); if (late) window.__wattQA.forceGas('bess'); }, month >= st.gasMonth + 11);
      return;
    }
  }
  if (!st.b && has('mail-bateria-gas-01').length) {
    st.b = true;
    const o = await openGasLetter(page, 'mail-bateria-gas-01', 'carta3-bateria-' + tag);
    const before = await qa(() => window.__wattQA.state.caixa);
    const btn = page.locator('.mail-detail-actions button', { hasText: 'Guardar para a noite' });
    await btn.click({ force: true });
    await page.waitForTimeout(300);
    const after = await qa(() => ({ c: window.__wattQA.state.caixa, sale: window.__wattQA.gas().state.lastBessSaleMEUR, t: window.__wattQA.mail.tags }));
    r.card3 = { before, after: after.c, sale: after.sale, bess_venda_noite: after.t.bess_venda_noite, bess_valor_up: after.t.bess_valor_up, clip: o.clip };
    if (![0.234, 0.105].includes(after.sale)) throw new Error('bess sale ' + JSON.stringify(r.card3));
    if (!/Gás caro: a tua bateria vale mais esta noite/.test(o.text)) throw new Error('card3 text');
    if (!/MERCADO|Mercado/.test(o.text) || /IMPRENSA|Imprensa/.test(o.text.split('Gás caro')[0].slice(-200))) throw new Error('card3 badge');
    if (await page.locator('#inboxDrawer.open .mail-detail').count()) await page.locator('#inboxBackBtn').click();
  }
}

/** Oposição local (WATT_OPO=1): força o evento, segue um caminho por jogo, fotografa cada carta e verifica avisos e saídas. */
const OPO_PATHS = {
  'falhado-27-1440': { name: 'bom', forced: {}, pick: { 'sinal-01': 'a', 'sinal-02': 'a', 'desistir': 'c', 'sinal-04b': 'a', 'sinal-02b': 'ok', 'providencia-02a': 'ok', 'escolha-negociar': 'c', 'escolha-redesenhar': 'c' }, gallery: { after: 'sinal-02', cards: ['c10', 'c4b', 'c2b', 'c5a', 'c6', 'c7'] } },
  'falhado-27-390': { name: 'negociar', forced: { figura: true, prov: true, acordo: true }, pick: { 'sinal-01': 'b', 'sinal-02': 'c', 'sinal-03': 'c', 'sinal-04': 'c', 'providencia-01': 'a', 'escolha-negociar': 'a', 'escolha-redesenhar': 'c', 'providencia-02a': 'ok' }, gallery: { after: 'escolha-negociar', cards: ['c7', 'c5a'] } },
  'conseguido-29-1440': { name: 'tribunal', forced: { figura: true, prov: true, rej: false }, pick: { 'sinal-01': 'b', 'sinal-02': 'b', 'sinal-03': 'c', 'sinal-04': 'c', 'providencia-01': 'b', 'escolha-tribunal': 'b', 'providencia-02b': 'redesenhar', 'escolha-redesenhar': 'b', 'escolha-prorrogacao': 'a' } },
  'conseguido-29-390': { name: 'prorrogar', forced: { figura: true, prov: true, rej: false, prorrog: true }, pick: { 'sinal-01': 'b', 'sinal-02': 'c', 'sinal-03': 'c', 'sinal-04': 'c', 'providencia-01': 'a', 'escolha-tribunal': 'b', 'providencia-02b': 'prorrogar', 'escolha-prorrogacao': 'a', 'desistir': 'c', 'sinal-04b': 'a', 'sinal-02b': 'ok' } }
};
const opoReport = {};
async function opoHook(page, tag, month, st) {
  const P = OPO_PATHS[tag];
  if (!P) return false;
  const r = opoReport[tag] = opoReport[tag] || { path: P.name, cards: [], rivalHits: [], placeholders: [], clip: [] };
  if (!st.init && month >= 1) {
    st.init = true;
    const pr = await page.evaluate((f) => { window.__wattQA.forceOpo({ force: true, forced: f }); return window.__wattQA.opo().prob; }, P.forced);
    r.probSinaisOurique = pr;
  }
  { const h = await visibleRival(page); if (h.length) r.rivalHits.push(...h.map((x) => 'M' + month + ' ' + x)); }
  const pend = await page.evaluate(() => window.__wattQA.mailState.items.filter((l) => l && /^mail-oposicao-/.test(l.skeletonId || '') && !l.econChoiceId && !l.deferredChoiceId).map((l) => ({ id: l.id, sk: l.skeletonId })));
  let did = false;
  pend.sort((a, b) => (/escolha-tribunal/.test(b.sk) ? 1 : 0) - (/escolha-tribunal/.test(a.sk) ? 1 : 0));
  for (const L of pend) {
    const key = L.sk.replace('mail-oposicao-', '');
    const choice = P.pick[key];
    if (!choice) continue;
    if (st.skip && st.skip[L.id]) continue;
    if (!(await page.evaluate((id) => window.__wattQA.mailState.items.some((l) => l && l.id === id && !l.econChoiceId && !l.deferredChoiceId), L.id))) continue;
    const name = 'carta-' + key + '-' + tag;
    const o = await openGasLetter(page, L.id, name); o.caixa = await page.evaluate(() => window.__wattQA.state.caixa);
    r.cards.push({ m: month, card: key, choice, caixa: o.caixa });
    if (/rival/i.test(o.text)) r.rivalHits.push(key);
    if (/\{\{|\{[a-z_.]+\}/.test(o.text)) r.placeholders.push(key + ': ' + (o.text.match(/.{0,30}\{.{0,30}/) || [''])[0]);
    if (o.clip.length) r.clip.push(key + ': ' + o.clip.join(','));
    const btn = page.locator('.mail-detail-actions [data-mail-choice="' + choice + '"]');
    if (!(await btn.count())) throw new Error('opo choice missing ' + key + ' ' + choice);
    await btn.first().click({ force: true });
    await page.waitForTimeout(250);
    if (await page.locator('#inboxDrawer.open .mail-detail').count()) { await page.locator('#inboxBackBtn').click(); await page.waitForTimeout(100); }
    const answered = (id) => page.evaluate((id) => !window.__wattQA.mailState.items.some((l) => l && l.id === id && !l.econChoiceId && !l.deferredChoiceId), id);
    if (!(await answered(L.id))) {
      // choice refused (e.g. not enough cash): try the other buttons on the card, as a player would
      await openGasLetter(page, L.id, name + '-alt');
      const all = await page.locator('.mail-detail-actions [data-mail-choice]').evaluateAll((els) => els.map((e) => e.getAttribute('data-mail-choice')));
      let ok = false;
      for (const c of all.filter((c) => c !== choice)) {
        const b = page.locator('.mail-detail-actions [data-mail-choice="' + c + '"]');
        if (!(await b.count())) continue;
        await b.first().click({ force: true }); await page.waitForTimeout(250);
        if (await answered(L.id)) { ok = true; r.cards.push({ m: month, card: key, choice: c, fallback: true }); break; }
      }
      if (await page.locator('#inboxDrawer.open .mail-detail').count()) { await page.locator('#inboxBackBtn').click(); await page.waitForTimeout(100); }
      if (!ok) { r.noWayOut = (r.noWayOut || []).concat(key); st.skip = st.skip || {}; st.skip[L.id] = 1; continue; }
    }
    did = true;
    if (P.gallery && key === P.gallery.after && !st.gallery) {
      // só para screenshots: mostra as cartas que este caminho não chega a abrir (sem asserções de fluxo)
      st.gallery = true;
      await page.evaluate((cs) => { const s = window.__wattQA.opo().state; const m = window.__wattQA.mail.month | 0; cs.forEach((c) => s.queue.push({ card: c, at: m + 1 })); }, P.gallery.cards);
    }
    if (P.name === 'prorrogar' && key === 'escolha-prorrogacao') {
      await page.evaluate(() => { const s = window.__wattQA.opo().state; const m = window.__wattQA.mail.month | 0; s.queue.push({ card: 'c10', at: m + 1 }, { card: 'c4b', at: m + 1 }, { card: 'c2b', at: m + 1 }); });
    }
  }
  return did;
}
async function opoFinal(page, tag) {
  const P = OPO_PATHS[tag]; if (!P) return;
  const r = opoReport[tag];
  if (r.noWayOut && r.noWayOut.length) throw new Error('opo: card with no usable choice ' + r.noWayOut.join(','));
  const s = await page.evaluate(() => { const o = window.__wattQA.opo(); const t = window.__wattQA.mail.tags; return { st: o.state, folga: o.folga, tags: { retirada: t.providencia_retirada | 0, rejeitada: t.providencia_rejeitada | 0, levantada: t.providencia_levantada | 0, imposto: t.redesenho_imposto | 0, acordo: t.acordo_comunidade_flag | 0, prorrog: t.prorrogacao_excecional_granted | 0, trc_lost: t.trc_lost | 0, suspensa: t.obra_suspensa | 0 } }; });
  r.final = { log: s.st.log.map((x) => x.m + ':' + x.card.replace('mail-oposicao-', '')), sinais: s.st.sinais, ignorados: s.st.ignorados, atrasoConta: s.st.atrasoConta, folga: s.folga, pausa: s.st.pausa, mw: s.st.mwAtual, tags: s.tags };
  const log = s.st.log.map((x) => x.card);
  const i5 = log.indexOf('mail-oposicao-providencia-01');
  if (P.name === 'bom') { if (i5 !== -1) throw new Error('bom path escalated'); if (log.indexOf('mail-oposicao-sinal-01') !== 0) throw new Error('bom path no signal'); }
  else {
    if (i5 < 2) throw new Error('providência without 2 warnings first ' + JSON.stringify(log));
    if (!(s.st.ignorados >= 1)) throw new Error('providência without an ignored warning');
    if (s.tags.suspensa) throw new Error('still suspended at COD');
    if (s.st.atrasoConta > 6 && !log.includes('mail-oposicao-escolha-prorrogacao')) throw new Error('folga blown without card 9 offered ' + s.st.atrasoConta);
  }
  if (P.name === 'negociar' && !(s.tags.retirada && s.tags.acordo)) throw new Error('negotiation did not end the action');
  if (P.name === 'tribunal' && !s.tags.imposto) throw new Error('redesign did not end the suspension');
  if (P.name === 'prorrogar' && !s.tags.prorrog) throw new Error('prorrogação not granted');
  if (s.tags.trc_lost) throw new Error('TRC lost');
  if (r.rivalHits.length || r.placeholders.length || r.clip.length) throw new Error('opo card text ' + JSON.stringify(r));
  if (P.name === 'bom') {
    r.warningsFirst = await page.evaluate(() => {
      const s = window.__wattQA.opo().state; const keep = [s.sinais, s.ignorados, s.nivel];
      const out = {};
      [[0, 0, 3], [1, 1, 3], [2, 0, 3], [3, 1, 2], [2, 1, 3]].forEach(([a, b, c]) => { s.sinais = a; s.ignorados = b; s.nivel = c; out[a + '/' + b + '/' + c] = window.__wattQA.opo().canEscalate; });
      [s.sinais, s.ignorados, s.nivel] = keep; return out;
    });
    const w = r.warningsFirst;
    if (w['0/0/3'] || w['1/1/3'] || w['2/0/3'] || w['3/1/2'] || !w['2/1/3']) throw new Error('warnings-first rule ' + JSON.stringify(w));
    const sims = {
      '5A avisar DGEG': [['oposicao_avisar_dgeg', 'suspensao_comunicada_dgeg'], {}, true],
      '5B ver opções (sem aviso)': [['oposicao_ver_opcoes'], {}, true],
      '6A acordo (sai)': [['oposicao_acordo_fundo_faixa'], { acordo: true }, true],
      '6A acordo (falha)': [['oposicao_acordo_fundo_faixa'], { acordo: false }, true],
      '6B só fundo (falha)': [['oposicao_acordo_fundo'], { acordo: false }, true],
      '6C desconto (sai)': [['oposicao_acordo_desconto'], { acordo: true }, true],
      '7A redesenho': [['oposicao_redesenho_grande'], {}, true],
      '7B redesenho pequeno': [['oposicao_redesenho_pequeno'], { rej: false }, true],
      '7C voltar': [['oposicao_redesenho_voltar'], {}, true],
      '8A defesa completa (perde)': [['oposicao_defesa_completa', 'contestacao_forte'], { rej: false }, true],
      '8B defesa mínima (ganha)': [['oposicao_defesa_minima'], { rej: true }, true],
      '8C interesse público (não sai)': [['oposicao_interesse_publico'], { interesse: false, rej: false }, true],
      '9A prorrogação (recusada)': [['oposicao_prorrogacao_prova'], { prorrog: false }, true],
      '9B desistir do pedido': [['oposicao_prorrogacao_desistir'], {}, true],
      '10C aguentar': [['oposicao_aguentar'], {}, true],
      '3A propor fundo (antes)': [['oposicao_propor_fundo'], { acordo: false, prov: false }, false],
      '4A entrevista (antes)': [['oposicao_entrevista', 'reputation_up_small'], { prov: false }, false],
      '1A esclarecimento': [['oposicao_esclarecimento'], {}, false],
      '2A sessão': [['oposicao_sessao_equipa'], {}, false],
      '3B dados do estudo': [['oposicao_dados_estudo'], { parecer: true, prov: false }, false],
      '4b A mudar equipamento': [['oposicao_patrimonio_mudar'], {}, false],
      '4b B estudo': [['oposicao_patrimonio_estudo'], {}, false],
      '4B rever projeto (antes)': [['oposicao_rever_projeto'], { prov: false }, false]
    };
    r.choiceSims = {};
    for (const [k, [fx, f, susp]] of Object.entries(sims)) {
      const res = await page.evaluate(([a, b, c]) => window.__wattQA.opoSim(a, b, c), [fx, f, susp]);
      r.choiceSims[k] = res;
      if (!res || res.error || !res.ok) throw new Error('choice not viable ' + k + ' ' + JSON.stringify(res));
    }
    r.rarity = await page.evaluate(() => { const e = window.__wattQA.opo().econ; return { sinaisOurique: window.__wattQA.opo().prob, base: e.prob_oposicao_base, providencia: e.prob_providencia, limiar: e.prob_oposicao_limiar }; });
    if (r.rarity.sinaisOurique !== 0.04) throw new Error('Ourique prob ' + r.rarity.sinaisOurique);
  }
}

async function playToCod(browser, width, height, tag, bid, outcome, stopAfterExtra) {
  const page = await browser.newPage({ viewport: { width, height } });
  track(page, 'cod-' + tag);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-menu="novo"]');
  await startNewGame(page, 'novo-jogo-' + tag);
  if (await page.locator('#phase0Welcome').count()) throw new Error('welcome overlay duplicates the mail');
  const title = await page.locator('#inboxTitle').innerText();
  if (title.trim() !== 'Caixa de entrada') throw new Error('inbox title: ' + title);
  const mail = await page.locator('#inboxBody').innerText();
  if (/PLACEHOLDER GM/.test(mail)) throw new Error('placeholder copy still showing');
  if (!/Bem-vindo/.test(mail)) throw new Error('welcome subject: ' + mail.slice(0, 240));
  if (!/Investidores/.test(mail) || !/Para: ti/.test(mail)) throw new Error('welcome from/to: ' + mail.slice(0, 240));
  if (!/A empresa é tua\./.test(mail) || !/2 M€/.test(mail)) throw new Error('welcome body');
  if (!/Ir para o leilão/.test(mail)) throw new Error('welcome button');
  await shot(page, 'caixa-entrada-' + tag);
  const fabBlue = await page.locator('#btnNextQ').evaluate((el) => getComputedStyle(el).backgroundColor);
  if (fabBlue !== 'rgb(0, 122, 255)') throw new Error('body CTA color ' + fabBlue);
  const mailBlue = await page.locator('[data-mail-choice="ir_leilao"]').evaluate((el) => getComputedStyle(el).backgroundColor);
  if (mailBlue !== 'rgb(0, 122, 255)') throw new Error('mail CTA color ' + mailBlue);
  if (await page.locator('#startMenu').isVisible()) throw new Error('menu still visible in game');
  if (!(await page.locator('#btnSettings').isVisible())) throw new Error('gear hidden during the game');

  await page.waitForFunction(() => {
    const bp = window.__wattQA && window.__wattQA.bomPreco && window.__wattQA.bomPreco();
    return !!(bp && bp.lots && bp.lots.ourique === 29 && Object.keys(bp.lots).length === 1);
  }, null, { timeout: 15000 });
  await page.evaluate(() => document.getElementById('inboxBackdrop').click());
  await page.waitForFunction(() => {
    const drawer = document.getElementById('inboxDrawer');
    return drawer && !drawer.classList.contains('open');
  });
  await page.evaluate(() => window.__wattQA.openMandate0());
  await page.waitForSelector('#mandate0Card');
  if (await page.locator('#inboxDrawer.open').count()) throw new Error('inbox still open over Mandato 0');
  const m0 = await page.locator('#mandate0Card').innerText();
  if (!/Ganhar o leilão/.test(m0)) throw new Error('mandato 0 title: ' + m0.slice(0, 300));
  if (!/Sem ligação à rede não há central/.test(m0)) throw new Error('mandato 0 opening');
  if (!/Ganhar um TRC no leilão/.test(m0)) throw new Error('mandato 0 required');
  if (!/pelo menos 29 €\/MWh/.test(m0)) throw new Error('ourique limiar: ' + m0.slice(0, 400));
  if (!/Em curso/.test(m0)) throw new Error('extra not in progress');
  if (/projeto aguenta|Em risco|Em bom caminho/.test(m0)) throw new Error('old extra copy: ' + m0.slice(0, 400));
  if (!/Mandato 1: O primeiro ponto de ligação/.test(m0)) throw new Error('locked mandate 1');
  if (!/Abre quando ganhares o TRC/.test(m0)) throw new Error('locked badge');
  await shot(page, 'mandato0-' + tag);
  await page.locator('#mandate0Close').click();
  if (await page.locator('#btnOpenAuction').isVisible()) await page.locator('#btnOpenAuction').click();
  else await page.locator('#tabAuction').click();
  await page.waitForSelector('#auctionRoom.open', { timeout: 10000 });
  if (await page.locator('#mandateBriefing.open').count()) throw new Error('old mandate briefing overlaps the auction');
  const tipOff = page.locator('.tut-root.open .tut-off');
  try { await tipOff.waitFor({ state: 'visible', timeout: 2500 }); await tipOff.click(); } catch (_) {}
  await page.waitForFunction((n) => {
    const q = window.__wattQA;
    if (!q || !q.econAt) return false;
    const e = q.econAt('ourique', n);
    return !!(e && e.win);
  }, bid, { timeout: 20000 });
  const presetBid = await page.locator('#auctionBidSlider').inputValue();
  if (presetBid !== '27') throw new Error('default bid ' + presetBid);
  const irony = await page.locator('#auctionNpcIrony').innerText();
  if (!/entre 20 e 30/.test(irony) || /30–34|~40–44/.test(irony)) throw new Error('ourique rival hint: ' + irony);
  const defaults = await page.evaluate(() => {
    const q = window.__wattQA;
    return {
      ourique: q.winAt('ourique', 27),
      evora: q.winAt('evora', 27),
      portimao: q.winAt('portimao', 27)
    };
  });
  ['ourique', 'evora', 'portimao'].forEach((id) => {
    if (!defaults[id] || !defaults[id].win) throw new Error('bid 27 loses ' + id + ' ' + JSON.stringify(defaults[id]));
  });
  await dismissLayers(page);
  const lot = page.locator('#auction-lot-ourique, [data-lot="ourique"]').first();
  if (await lot.count() && (await lot.getAttribute('aria-selected')) !== 'true') {
    await lot.click({ force: true });
  }
  const slider = page.locator('#auctionBidSlider');
  await slider.evaluate((el, n) => {
    el.value = String(n);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, bid);
  await page.locator('#auction-confirm').click();
  await page.waitForSelector('[data-screen="trap"].active', { timeout: 10000 });
  try { await page.locator('.tut-root.open .tut-off').click({ timeout: 1000 }); } catch (_) {}
  const trap = await page.locator('#auctionTrapDone').innerText();
  if (!/Aceitar/.test(trap)) throw new Error('did not win the lot: ' + trap);
  await page.locator('#auctionTrapDone').click();
  await page.waitForFunction(() => window.__wattQA && window.__wattQA.state && window.__wattQA.state.auctionWon, null, { timeout: 15000 });
  await page.evaluate(() => window.__wattQA.openMandate0());
  await page.waitForSelector('#mandate0Extra');
  const extra = await page.locator('#mandate0Extra').innerText();
  const note = await page.locator('#mandate0ExtraNote').innerText();
  if (outcome === 'conseguido') {
    if (!/Conseguido/.test(extra)) throw new Error('expected Conseguido: ' + extra);
    if (!/Bom preço: cada MWh de Ourique vale mais/.test(note)) throw new Error('success note: ' + note);
  } else {
    if (!/Falhado/.test(extra)) throw new Error('expected Falhado: ' + extra);
    if (!/Ganhaste, mas barato/.test(note)) throw new Error('failure note: ' + note);
  }
  if (!/pelo menos 29 €\/MWh/.test(extra)) throw new Error('limiar label: ' + extra);
  if (/Em risco|projeto aguenta|Bónus|bónus|bonus/i.test(extra + '\n' + note)) throw new Error('old extra wording: ' + extra);
  await shot(page, 'extra-' + outcome + '-' + tag);
  await page.locator('#mandate0Close').click();
  const visao = page.locator('[data-mail-choice="ver_visao"]');
  if (await visao.count() && await visao.isVisible()) {
    await visao.click();
  } else {
    for (let i = 0; i < 4 && await page.locator('#inboxDrawer.open').count(); i++) {
      await page.locator('#inboxBackBtn').click({ force: true });
      await page.waitForTimeout(80);
    }
    await page.locator('#btnObjetivos').click();
  }
  await page.waitForSelector('#objSheet:not([hidden])', { timeout: 10000 });
  const board = await page.locator('#objBody').innerText();
  if (!/mandato 1/i.test(board) || !/O primeiro ponto de ligação/.test(board)) throw new Error('objectives: ' + board.slice(0, 300));
  await page.locator('#objTabFin').click();
  await page.waitForFunction(() => /caixa para desenvolver/i.test((document.getElementById('objBody') || {}).innerText || ''), null, { timeout: 15000 });
  const fin = await page.locator('#objBody').innerText();
  if (!/ainda por gastar/i.test(fin)) throw new Error('finanças: ' + fin.slice(0, 240));
  await shot(page, 'financas-' + tag);
  await page.locator('#objClose').click();
  await page.waitForFunction(() => {
    const id = localStorage.getItem('watt.saves.active');
    if (!id) return false;
    const raw = localStorage.getItem('watt.save.slot.' + id);
    if (!raw) return false;
    try {
      const blob = JSON.parse(raw);
      return !!(blob && blob.state && blob.state.auctionWon);
    } catch (_) {
      return false;
    }
  }, null, { timeout: 8000 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#startMenu:not([hidden]) [data-menu="carregar"]', { timeout: 15000 });
  await page.locator('[data-menu="carregar"]').click();
  await page.waitForSelector('#startModal [data-continue]');
  await page.locator('#startModal [data-continue]').click();
  await page.waitForFunction(() => {
    const q = window.__wattQA;
    return !!(q && q.state && q.state.auctionWon && !document.body.classList.contains('at-menu'));
  }, null, { timeout: 15000 });
  if (stopAfterExtra) {
    await page.close();
    return { reached: { extra: outcome, bid: bid } };
  }

  let month = -1;
  let guard = 0;
  let lastSig = '';
  let stuck = 0;
  const gasSt = {};
  const opoSt = {};
  while (guard < 420) {
    guard += 1;
    await dismissLayers(page);
    if (await page.locator('#endScreen.open, #endScreen:not([hidden])').count()) {
      const endText = await page.locator('#endScreen').innerText();
      const phase = await page.evaluate(() => (window.__wattQA && window.__wattQA.get && window.__wattQA.mail && window.__wattQA.mail.projectPhase) || (window.__wattQA && window.__wattQA.mail && window.__wattQA.mail.projectPhase) || '');
      const reached = await page.evaluate(() => {
        const m = window.__wattQA && window.__wattQA.mail;
        if (!m) return null;
        return {
          phase: m.projectPhase,
          month: m.month,
          reason: m.end_state && m.end_state.reason,
          status: m.end_state && m.end_state.status,
          cod: m.tags && m.tags.cod_reached
        };
      });
      await shot(page, 'cod-end-' + tag);
      const codish = !!(reached && (reached.phase === 'cod' || reached.reason === 'cod' || reached.reason === 'cod_solar' || reached.status === 'won' || reached.cod));
      if (!codish) throw new Error('end is not COD: ' + endText.slice(0, 400) + ' ' + JSON.stringify(reached));
      if (process.env.WATT_OPO) await opoFinal(page, tag);
      if (process.env.WATT_GAS || process.env.WATT_OPO) { const h = await visibleRival(page); if (h.length) (gasReport[tag] = gasReport[tag] || { rivalHits: [] }).rivalHits.push(...h.map((x) => 'END ' + x)); }
      return { endText: endText.slice(0, 500), reached, steps: guard };
    }
    if (await page.locator('#auctionRoom.open [data-screen="bid"].active').count()) {
      await dismissLayers(page);
      if (await page.locator('#auction-confirm').isVisible()) {
        await page.locator('#auction-confirm').click();
        await page.waitForTimeout(400);
        continue;
      }
    }
    if (await page.locator('#auctionRoom.open [data-screen="trap"].active #auctionTrapDone').count()) {
      await page.locator('#auctionTrapDone').click();
      await page.waitForTimeout(400);
      continue;
    }
    if (process.env.WATT_GAS) await gasHook(page, tag, month, gasSt);
    if (process.env.WATT_OPO && await opoHook(page, tag, month, opoSt)) continue;
    if (await drainMail(page)) continue;
    const play = page.locator('#btnNextQ');
    if (!(await play.isVisible())) {
      for (let i = 0; i < 3 && await page.locator('#inboxDrawer.open').count(); i++) {
        await page.locator('#inboxBackBtn').click({ force: true });
        await page.waitForTimeout(80);
      }
    }
    const disabled = await play.evaluate((el) => el.disabled || el.classList.contains('loading'));
    if (!disabled) {
      await play.click({ force: true });
      await page.waitForTimeout(1100);
    } else {
      await page.waitForTimeout(400);
    }
    const sig = await page.evaluate(() => {
      const m = window.__wattQA && window.__wattQA.mail;
      const s = window.__wattQA && window.__wattQA.state;
      return JSON.stringify({
        month: m && m.month,
        phase: m && m.projectPhase,
        won: s && s.auctionWon,
        end: m && m.end_state,
        letters: window.__wattQA && window.__wattQA.mailState && window.__wattQA.mailState.items && window.__wattQA.mailState.items.length,
        caixa: s && s.caixa,
        lp: m && m.tags && m.tags.lp_request_submitted || 0,
        lpg: m && m.tags && m.tags.lp_granted || 0,
        env: m && m.tags && m.tags.env_gate_ok || 0,
        grid: m && m.tags && m.tags.grid_conditions_accepted || 0,
        hy: m && m.tags && m.tags.bess_dev_flag || 0
      });
    });
    if (sig === lastSig) stuck += 1;
    else { stuck = 0; lastSig = sig; }
    if (stuck > 12) {
      const dump = await page.evaluate(() => {
        const qa = window.__wattQA || {};
        const m = qa.mail || {};
        const btn = document.getElementById('btnNextQ');
        const items = ((qa.mailState && qa.mailState.items) || []).map((l) => ({
          id: l.id, sub: l.subject, econ: l.econChoiceId || null, def: l.deferredChoiceId || null
        }));
        return { aria: btn && btn.getAttribute('aria-label'), caixa: qa.state && qa.state.caixa, month: m.month, phase: m.projectPhase, items: items };
      });
      console.log('STALL', tag, JSON.stringify(dump));
      await shot(page, 'cod-stuck-' + tag);
      throw new Error('stuck ' + sig);
    }
    try { month = JSON.parse(sig).month; } catch (_) {}
    if (guard % 15 === 0) console.log(tag, 'step', guard, sig);
  }
  await shot(page, 'cod-timeout-' + tag);
  throw new Error('did not reach COD, last month ' + month);
}

async function playOtherLot(browser, width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  track(page, 'evora-' + tag);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-menu="novo"]');
  await startNewGame(page);
  await page.evaluate(() => document.getElementById('inboxBackdrop').click());
  await page.waitForFunction(() => {
    const drawer = document.getElementById('inboxDrawer');
    return drawer && !drawer.classList.contains('open');
  });
  if (await page.locator('#btnOpenAuction').isVisible()) await page.locator('#btnOpenAuction').click();
  else await page.locator('#tabAuction').click();
  await page.waitForSelector('#auctionRoom.open', { timeout: 10000 });
  await page.waitForFunction(() => {
    const q = window.__wattQA;
    return !!(q && q.winAt && q.winAt('ourique', 40) && q.winAt('ourique', 40).win === false && q.winAt('evora', 27) && q.winAt('evora', 27).win);
  }, null, { timeout: 20000 });
  try { await page.locator('.tut-root.open .tut-off').click({ timeout: 1500 }); } catch (_) {}
  const firstBid = await page.locator('#auctionBidSlider').inputValue();
  if (firstBid !== '27') throw new Error('ourique default bid ' + firstBid);
  await page.locator('#auctionBidSlider').evaluate((el) => {
    el.value = '40';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#auction-confirm').click();
  await page.waitForSelector('[data-screen="fora"].active #auctionForaNext, #portfolioEmptyCta:not([hidden])', { timeout: 10000 });
  try { await page.locator('.tut-root.open .tut-off').click({ timeout: 1500 }); } catch (_) {}
  const nextRound = page.locator('[data-screen="fora"].active #auctionForaNext');
  if (await nextRound.count()) await nextRound.click({ force: true });
  else await page.locator('#portfolioEmptyCta').click({ force: true });
  await page.waitForFunction(() => {
    const q = window.__wattQA;
    return q && q.auction && q.auction.wave === 1 && q.auction.screen === 'bid';
  }, null, { timeout: 10000 });
  const lot = page.locator('#auction-lot-evora, [data-lot="evora"]').first();
  if ((await lot.getAttribute('aria-selected')) !== 'true') await lot.click({ force: true });
  const preset = await page.locator('#auctionBidSlider').inputValue();
  if (preset !== '27') throw new Error('évora default bid ' + preset);
  try { await page.locator('.tut-root.open .tut-off').click({ timeout: 1000 }); } catch (_) {}
  await page.locator('#auction-confirm').click({ force: true });
  await page.waitForSelector('[data-screen="trap"].active #auctionTrapDone', { timeout: 10000 });
  const trap = await page.locator('#auctionTrapDone').innerText();
  if (!/Aceitar/.test(trap)) throw new Error('évora did not win at 27: ' + trap);
  await page.locator('#auctionTrapDone').click({ force: true });
  await page.waitForFunction(() => window.__wattQA && window.__wattQA.state && window.__wattQA.state.auctionWon, null, { timeout: 15000 });
  await page.evaluate(() => window.__wattQA.openMandate0());
  await page.waitForSelector('#mandate0Card');
  const body = await page.locator('#mandate0Card').innerText();
  if (/bom preço|pelo menos \d+ €\/MWh|projeto aguenta/i.test(body)) throw new Error('extra still shown off Ourique: ' + body.slice(0, 400));
  if (await page.locator('#mandate0Extra').count()) throw new Error('extra row present for Évora');
  if (!/Ganhar um TRC no leilão/.test(body)) throw new Error('required goal missing: ' + body.slice(0, 300));
  await shot(page, 'extra-hidden-evora-' + tag);
  await assetRoomChecks(page, tag);
  await page.close();
}

/** Sala do ativo right after the TRC: «Ver números» not under the HUD, months ≥ 0, MW still a plan, three money pots. */
async function assetRoomChecks(page, tag) {
  await page.locator('#mandate0Close').click({ force: true });
  await page.evaluate(() => window.__tutApi.openSala());
  await page.waitForSelector('#assetRoom.open #verNumeros');
  await page.evaluate(() => { document.getElementById('verNumeros').open = true; });
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => {
    const sum = document.querySelector('#verNumeros > summary').getBoundingClientRect();
    const hit = document.elementFromPoint(sum.left + 8, sum.top + 2);
    return {
      covered: !(hit && hit.closest('#verNumeros')),
      months: (document.getElementById('valMonthsPlayed') || {}).textContent,
      mw: [...document.querySelectorAll('#assetRoom .asset-mw-card .k')].map((e) => e.textContent),
      pots: [...document.querySelectorAll('#assetMoneyStrip .money-pot .k')].map((e) => e.textContent)
    };
  });
  if (r.covered) throw new Error('«Ver números» covered by another layer at ' + tag);
  if (!(Number(r.months) >= 0)) throw new Error('Meses de jogo negative: ' + r.months);
  if (!r.mw.includes('MW no teu plano') || r.mw.includes('MW ligados por ti')) throw new Error('MW card before COD: ' + r.mw.join(' / '));
  if (r.pots.join('|') !== 'Desenvolvimento|Construção|Garantias do banco') throw new Error('money pots: ' + r.pots.join('|'));
  await shot(page, 'sala-ver-numeros-' + tag);
}

async function cleanPage(browser, width, height) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  return { context, page };
}

const WELCOME_REST = [
  'Tens 2 M€ para começar. Este dinheiro serve para concorrer a leilões: preparar o dossier, analisar os lotes e pagar estudos.',
  'Quando ganhares um ponto de ligação, aprovamos o orçamento para desenvolver esse projeto. Se o projeto convencer, entramos com o capital para construir.',
  'O primeiro leilão já abriu: Subestação de Ourique. Lê o Correio antes de licitar.'
].join('\n\n');

async function assertWelcomeLetter(page, expect) {
  const subject = (await page.locator('#mailDetailSubject').innerText()).replace(/\s+/g, ' ').trim();
  if (subject !== expect.subject) throw new Error('subject «' + subject + '»');
  const body = (await page.locator('.mail-detail-body').innerText()).replace(/\u00a0/g, ' ').trim();
  const want = expect.lead + '\n\n' + WELCOME_REST;
  if (body !== want) throw new Error('body «' + body + '»');
  const btn = page.locator('[data-mail-choice="ir_leilao"]');
  if ((await btn.innerText()).trim() !== 'Ir para o leilão') throw new Error('button «' + (await btn.innerText()) + '»');
  const blue = await btn.evaluate((el) => getComputedStyle(el).backgroundColor);
  if (blue !== 'rgb(0, 122, 255)') throw new Error('letter button ' + blue);
}

async function walkToWelcome(page, fields) {
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-menu="novo"]');
  await page.locator('[data-menu="novo"]').click();
  await page.waitForSelector('#arranque[data-step="jogador"] #arrNome');
  await page.locator('#arrNome').fill(fields.nome || '');
  await page.locator('#arrApelido').fill(fields.apelido || '');
  await page.locator('#arrEmpresa').fill(fields.empresa || '');
  await page.locator('#arranqueNext').click();
  await page.waitForSelector('#arranque[data-step="pais"]');
  await page.locator('#arranqueNext').click();
  await page.waitForSelector('#arranque[data-step="empresa"] [data-player="1"]', { timeout: 15000 });
  await page.locator('#arranqueNext').click();
  await page.waitForSelector('#arranque[data-step="ficha"] #arranqueNext');
  await page.locator('#arranqueNext').click();
  await page.waitForSelector('#arranqueConfirm.open #arranqueConfirmYes');
  await page.locator('#arranqueConfirmYes').click();
  await page.waitForSelector('#inboxDrawer.open [data-mail-choice="ir_leilao"]', { timeout: 15000 });
}

/** Empty first name, with and without a company, plus a name and no company. */
async function assertNameVariants(page) {
  const cases = [
    { nome: '', empresa: '', subject: 'Bem-vindo', lead: 'A empresa é tua.' },
    { nome: '', empresa: 'Sol do Sul, Lda.', subject: 'Bem-vindo', lead: 'A Sol do Sul, Lda. é tua.' },
    { nome: 'Ana', empresa: '', subject: 'Bem-vindo, Ana', lead: 'Ana, a tua empresa é tua.' }
  ];
  for (const c of cases) {
    await walkToWelcome(page, c);
    await assertWelcomeLetter(page, c);
    try { await page.locator('.tut-root.open .tut-off').click({ timeout: 1500 }); } catch (_) {}
    await page.locator('[data-mail-choice="ir_leilao"]').click();
    await page.waitForSelector('#auctionRoom.open', { timeout: 15000 });
    if (await page.locator('#inboxDrawer.open').count()) throw new Error('button left the inbox open');
  }
}

/** Novo jogo → 4 ecrãs → confirmação → caixa de entrada → leilão pelo ícone, ganho no lance 27. */
async function openingToAuction(browser, width, height, tag, win) {
  const { context, page } = await cleanPage(browser, width, height);
  track(page, 'abertura-' + tag);
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-menu="novo"]');
    await page.locator('[data-menu="novo"]').click();
    await page.waitForSelector('#arranque[data-step="jogador"] #arrNome');
    const period = (await page.locator('#periodLabel').innerText()).trim();
    const clock = await page.evaluate(() => {
      const s = window.__wattQA && window.__wattQA.state;
      return s ? (s.year + ' · Q' + s.quarter) : '';
    });
    if (period !== clock || period !== '2026 · Q3') throw new Error('opening period ' + period + ' clock ' + clock);
    if (await page.locator('#btnSettings').isVisible()) throw new Error('gear visible during opening');
    if (await page.locator('#arranqueFinancas').isVisible()) throw new Error('finanças pill on jogador');
    const nome = await page.locator('#arrNome').inputValue();
    const apelido = await page.locator('#arrApelido').inputValue();
    const empresa = await page.locator('#arrEmpresa').inputValue();
    if (nome || apelido || empresa) throw new Error('fields should start empty');
    const ph = await page.locator('#arrEmpresa').getAttribute('placeholder');
    if (ph !== 'Ex.: Sol do Sul, Lda.') throw new Error('placeholder ' + ph);
    const nacs = await page.locator('#arrNac option').allInnerTexts();
    if (nacs.length !== 19) throw new Error('nacionalidades ' + nacs.length);
    if (nacs[nacs.length - 1] !== 'Outra') throw new Error('Outra is not last');
    if (await page.locator('#arrNac').inputValue() !== 'Portuguesa') throw new Error('default nationality');
    const blue = await page.locator('#arranqueNext').evaluate((el) => getComputedStyle(el).backgroundColor);
    if (blue !== 'rgb(0, 122, 255)') throw new Error('opening CTA ' + blue);

    const rejectNames = ['EDP', 'iberdrola', 'EDP Renováveis', 'EDPR', 'Ventient', 'TotalEnergies', 'Akuo Energy'];
    for (const name of rejectNames) {
      await page.locator('#arrEmpresa').fill(name);
      await page.locator('#arranqueNext').click();
      await page.waitForFunction((n) => {
        const input = document.getElementById('arrEmpresa');
        const root = document.getElementById('arranque');
        return !!(input && root && root.dataset.step === 'jogador' && input.getAttribute('aria-invalid') === 'true' && input.value === n);
      }, name);
      const hint = (await page.locator('#arrEmpresaHint').innerText()).trim();
      if (hint !== 'Não podes usar o nome de uma empresa real.') throw new Error('reject hint for ' + name + ': ' + hint);
    }
    const acceptNames = ['Galpinha', 'Sol do Sul, Lda.', 'Energia Indeferida, Lda.'];
    for (const name of acceptNames) {
      await page.locator('#arrEmpresa').fill(name);
      await page.locator('#arranqueNext').click();
      await page.waitForSelector('#arranque[data-step="pais"]');
      await page.locator('#arranqueBack').click();
      await page.waitForSelector('#arranque[data-step="jogador"] #arrEmpresa');
    }
    await page.locator('#arrEmpresa').fill('');

    await page.locator('#arranqueNext').click();
    await page.waitForSelector('#arranque[data-step="pais"] [data-pais="portugal"]');
    if ((await page.locator('[data-pais="portugal"]').getAttribute('aria-checked')) !== 'true') throw new Error('Portugal not selected');
    const locked = page.locator('#arranque .ar-li.off');
    if (await locked.count() !== 8) throw new Error('locked countries ' + await locked.count());
    const pe = await page.locator('[data-pais="espanha"]').evaluate((el) => getComputedStyle(el).pointerEvents);
    if (pe !== 'none') throw new Error('locked country is clickable');
    await page.locator('#arranqueNext').click();
    await page.waitForSelector('#arranque[data-step="empresa"] [data-player="1"]');
    const top = await page.locator('[data-player="1"]').innerText();
    if (!/A tua empresa/.test(top) || !/0\s*MW/.test(top)) throw new Error('empty company row: ' + top);
    await page.locator('#arranqueNext').click();
    await page.waitForSelector('#arranque[data-step="ficha"] #arranqueNext');
    await page.locator('#arranqueNext').click();
    await page.waitForSelector('#arranqueConfirm.open');
    const emptyQ = (await page.locator('#arranqueConfirmTitle').innerText()).trim();
    if (emptyQ !== 'Assumir o controlo da tua empresa?') throw new Error('empty confirm ' + emptyQ);
    await page.locator('#arranqueConfirmNo').click();
    await page.waitForFunction(() => {
      const el = document.getElementById('arranqueConfirm');
      const root = document.getElementById('arranque');
      return !!(el && el.hidden && root && root.dataset.step === 'ficha' && !el.classList.contains('open'));
    });
    await page.locator('#arranqueBack').click();
    await page.waitForSelector('#arranque[data-step="empresa"]');
    await page.locator('#arranqueBack').click();
    await page.waitForSelector('#arranque[data-step="pais"]');
    await page.locator('#arranqueBack').click();
    await page.waitForSelector('#arranque[data-step="jogador"]');

    await page.locator('#arrNome').fill('Ana');
    await page.locator('#arrApelido').fill('Ferreira');
    await page.locator('#arrEmpresa').fill('Sol do Sul, Lda.');
    await shot(page, 'abertura-jogador-' + tag);
    if ((await page.locator('#arranque h1').innerText()).trim() !== 'Dados pessoais') throw new Error('jogador title');
    if ((await page.locator('#arranque .ar-lead').innerText()).trim() !== 'O nome aparece nas cartas e nas notícias.') throw new Error('jogador lead');
    if ((await page.locator('#arranqueNext').innerText()).trim() !== 'Seguinte') throw new Error('jogador button');
    if (/HIPÓTESE|\[GM\]/.test(await page.locator('#arranque').innerText())) throw new Error('marker on jogador');
    await page.locator('#arranqueNext').click();
    await page.waitForSelector('#arranque[data-step="pais"]');
    const pais = await page.locator('#arranque').innerText();
    if ((await page.locator('#arranque h1').innerText()).trim() !== 'País') throw new Error('pais title');
    if ((await page.locator('#arranque .ar-lead').innerText()).trim() !== 'Onde a empresa vai desenvolver centrais.') throw new Error('pais lead');
    if ((await page.locator('#arranqueNext').innerText()).trim() !== 'Seguinte') throw new Error('pais button');
    const renFact = await page.locator('#arranque .ar-ln').evaluateAll((els) => {
      const el = els.find((n) => n.textContent.includes('71 subestações'));
      return el ? el.textContent : '';
    });
    if (renFact !== 'A REN gere 71 subestações e quase 10\u00a0000 km de linhas de alta tensão em Portugal continental.') {
      throw new Error('pais ren fact: ' + JSON.stringify(renFact));
    }
    if (/9 subestações com leilão|começa em/.test(pais)) throw new Error('old pais auction line');
    await shot(page, 'abertura-pais-' + tag);
    await page.locator('#arranqueNext').click();
    await page.waitForSelector('#arranque[data-step="empresa"] [data-rival="finerge"]');
    const list = await page.locator('#arranque .ar-et').innerText();
    if (!/Sol do Sul, Lda\./.test(list)) throw new Error('player company missing');
    if (!/EDP/.test(list) || !/9\s*002/.test(list)) throw new Error('EDP mw: ' + list.slice(0, 400));
    const finerge = await page.locator('[data-rival="finerge"]').innerText();
    if (!/≈/.test(finerge) || !/1\s*795/.test(finerge)) throw new Error('Finerge: ' + finerge);
    const tagE = await page.locator('[data-rival="tagenergy"]').innerText();
    if (!/≈/.test(tagE)) throw new Error('TagEnergy: ' + tagE);
    const edpPe = await page.locator('[data-rival="edp"]').evaluate((el) => getComputedStyle(el).pointerEvents);
    if (edpPe === 'none') throw new Error('rival is not clickable');
    if (await page.locator('[data-rival]').count() !== 18) throw new Error('rival count');
    const body = await page.locator('#arranque').innerText();
    if (/HIPÓTESE|\[GM\]/.test(body)) throw new Error('marker on empresa');
    if ((await page.locator('#arranque h1').innerText()).trim() !== 'Empresas') throw new Error('empresa title');
    if ((await page.locator('#arranqueNext').innerText()).trim() !== 'Seguinte') throw new Error('empresa button');
    if (/Começas com uma empresa nova/.test(body)) throw new Error('old empresa lead');
    if (!/Valores fictícios baseados em dados públicos\./.test(body)) throw new Error('fiction note missing');
    await page.locator('[data-rival="galp"]').click();
    await page.waitForSelector('#arranque[data-step="ficha"] #arranqueBack');
    const galp = await page.locator('#arranque').innerText();
    if (!/Henrique Lousada/.test(galp) || !/1846/.test(galp) || await page.locator('#arranqueNext').count()) throw new Error('galp ficha ' + galp.slice(0, 300));
    await page.locator('#arranqueBack').click();
    await page.waitForSelector('#arranque[data-step="empresa"] [data-rival="galp"]');
    await shot(page, 'abertura-empresa-' + tag);
    const iconRef = {};
    const checkIcons = async (where) => {
      const list = await page.locator('#arranque').evaluate((root) => [...root.querySelectorAll('svg[aria-label]')].filter((el) => el.closest('.ar-ic, .ar-pi')).map((el) => ({ t: el.getAttribute('aria-label'), h: el.outerHTML })));
      for (const x of list) {
        if (!x.t) continue;
        if (iconRef[x.t] === undefined) iconRef[x.t] = x.h;
        else if (iconRef[x.t] !== x.h) throw new Error('icon ' + x.t + ' differs on ' + where);
      }
      return list.length;
    };
    await checkIcons('empresas');
    for (const id of ['galp', 'prosolia', 'aura-power', 'edp', 'endesa', 'iberdrola', 'greenvolt']) {
      if (!(await page.locator('[data-rival="' + id + '"] svg').count())) throw new Error(id + ' no icon');
      await page.locator('[data-rival="' + id + '"]').click();
      await page.waitForSelector('#arranque[data-step="ficha"] #arranqueBack');
      { const vp = page.viewportSize(); const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)); await page.setViewportSize({ width: vp.width, height: Math.max(vp.height, h) }); await page.screenshot({ path: path.join(OUT, 'ficha-' + id + '-' + tag + '.png') }); await page.setViewportSize(vp); }
      await checkIcons('ficha ' + id);
      await page.locator('#arranqueBack').click();
      await page.waitForSelector('#arranque[data-step="empresa"] [data-rival="galp"]');
    }
    for (const t of ['Solar', 'Hídrica', 'Baterias', 'Gás', 'Biomassa', 'Eólica']) if (!iconRef[t]) throw new Error('no icon seen for ' + t);
    if (/fill="#0f172a" stroke="#0f172a" stroke-width="1.4"/.test(Object.values(iconRef).join(''))) throw new Error('filled variant still present');
    for (const [id, mw, tot] of [['edp', /2\s*002/, /9\s*002/], ['endesa', /418,5/, /418,5/], ['trustenergy', /418,5/, /418,5/]]) {
      const row = await page.locator('[data-rival="' + id + '"]').innerText();
      if (!tot.test(row)) throw new Error(id + ' list total ' + row);
      if (!(await page.locator('[data-rival="' + id + '"] svg[aria-label="Gás"]').count())) throw new Error(id + ' gas icon');
      await page.locator('[data-rival="' + id + '"]').click();
      await page.waitForSelector('#arranque[data-step="ficha"] #arranqueBack');
      const fx = await page.locator('#arranque').innerText();
      if (/à parte/.test(fx) || !/Gás/.test(fx) || !mw.test(fx)) throw new Error(id + ' ficha gas ' + fx.slice(0, 500));
      if (/rival/i.test(fx)) throw new Error(id + ' ficha rival');
      { const vp = page.viewportSize(); const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)); await page.setViewportSize({ width: vp.width, height: Math.max(vp.height, h) }); await page.screenshot({ path: path.join(OUT, 'ficha-' + id + '-' + tag + '.png') }); await page.setViewportSize(vp); }
      await page.locator('#arranqueBack').click();
      await page.waitForSelector('#arranque[data-step="empresa"] [data-rival="galp"]');
    }
    await page.locator('#arranqueNext').click();
    await page.waitForSelector('#arranque[data-step="ficha"] #arranqueFinCard');
    if (!(await page.locator('#arranqueFinancas').isVisible())) throw new Error('finanças pill hidden on ficha');
    const pill = await page.locator('#arranqueFinancas').innerText();
    if (!/Ok/.test(pill) || /\d/.test(pill)) throw new Error('finanças pill ' + pill);
    const ficha = await page.locator('#arranque').innerText();
    if (!/Country manager: Ana Ferreira \(tu\)/.test(ficha)) throw new Error('ficha identity');
    if (/2027 · Q1/.test(ficha)) throw new Error('ficha still says 2027 · Q1');
    if (await page.locator('#arranque .ar-lead').count()) throw new Error('ficha still has a lead');
    if (/Confirma os dados antes de começar/.test(ficha)) throw new Error('old ficha lead');
    if ((await page.locator('#arranqueNext').innerText()).trim() !== 'Assumir o controlo') throw new Error('ficha button');
    if (/HIPÓTESE|\[GM\]/.test(ficha)) throw new Error('marker on ficha');
    const steps = await page.locator('#arranqueSteps').evaluate((el) => el.textContent.replace(/\s+/g, ' '));
    if (/Controlo/.test(steps)) throw new Error('controlo step still listed: ' + steps);
    if (!/Empresa/.test(steps) || /Ficha/.test(steps)) throw new Error('steps ' + steps);
    await shot(page, 'abertura-ficha-' + tag);
    await page.locator('#arranqueNext').click();
    await page.waitForSelector('#arranqueConfirm.open');
    const namedQ = (await page.locator('#arranqueConfirmTitle').innerText()).trim();
    if (namedQ !== 'Assumir o controlo de Sol do Sul, Lda.?') throw new Error('named confirm ' + namedQ);
    const simBlue = await page.locator('#arranqueConfirmYes').evaluate((el) => getComputedStyle(el).backgroundColor);
    if (simBlue !== 'rgb(0, 122, 255)') throw new Error('confirm Sim ' + simBlue);
    await page.locator('#arranqueConfirmNo').click();
    await page.waitForFunction(() => {
      const el = document.getElementById('arranqueConfirm');
      const root = document.getElementById('arranque');
      return !!(el && el.hidden && root && root.dataset.step === 'ficha');
    });
    await page.locator('#arranqueNext').click();
    await page.waitForSelector('#arranqueConfirm.open');
    await shot(page, 'abertura-confirmacao-' + tag);
    if (!win) {
      await page.locator('#arranqueConfirmNo').click();
      return;
    }

    await page.locator('#arranqueConfirmYes').click();
    await page.waitForFunction(() => {
      return !document.body.classList.contains('at-arranque') && !document.body.classList.contains('at-menu');
    }, null, { timeout: 15000 });
    await page.waitForSelector('#inboxDrawer.open [data-mail-choice="ir_leilao"]', { timeout: 15000 });
    if (await page.locator('#arranque').isVisible()) throw new Error('opening still visible over the inbox');
    if (await page.locator('#auctionRoom.open').count()) throw new Error('auction opened instead of the inbox');
    const letter = await page.locator('#inboxBody').innerText();
    if (!/Investidores/.test(letter)) throw new Error('first letter ' + letter.slice(0, 240));
    await assertWelcomeLetter(page, {
      subject: 'Bem-vindo, Ana',
      lead: 'Ana, a Sol do Sul, Lda. é tua.'
    });
    const headerAuction = await page.locator('#btnOpenAuction').isVisible();
    const badge = page.locator(headerAuction ? '#auctionBadge' : '#tabAuctionBadge');
    if (!(await badge.isVisible())) throw new Error('auction badge hidden');
    const badgeN = (await badge.innerText()).trim();
    if (!/^[1-9]/.test(badgeN)) throw new Error('auction badge ' + badgeN);
    await shot(page, 'abertura-caixa-' + tag);
    const baked = await page.evaluate(() => {
      const id = localStorage.getItem('watt.saves.active');
      const blob = JSON.parse(localStorage.getItem('watt.save.slot.' + id) || 'null');
      const letter = blob && blob.mailState && (blob.mailState.items || []).find((m) => m && m.id === 'm0-bem-vindo');
      return letter && { subject: letter.subject, body: letter.body };
    });
    if (!baked || baked.subject !== 'Bem-vindo, Ana' || !String(baked.body).startsWith('Ana, a Sol do Sul, Lda. é tua.')) {
      throw new Error('saved letter ' + JSON.stringify(baked));
    }
    if (/\{\{/.test(baked.subject + baked.body)) throw new Error('tokens left in the saved letter');
    try { await page.locator('.tut-root.open .tut-off').click({ timeout: 2000 }); } catch (_) {}
    await page.locator('[data-mail-choice="ir_leilao"]').click();
    await page.waitForSelector('#auctionRoom.open', { timeout: 15000 });
    if (await page.locator('#inboxDrawer.open').count()) throw new Error('inbox still open over the auction');
    const visibleFiction = await page.locator('.auction-fiction').evaluateAll((els) => els.filter((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return !el.hidden && s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    }).length);
    if (!visibleFiction) throw new Error('auction fiction note hidden');
    const landed = ((await page.locator('#periodLabel').isVisible())
      ? await page.locator('#periodLabel').innerText()
      : await page.locator('#footerMockPeriod').innerText()).trim();
    if (landed !== period) throw new Error('clock jump ' + period + ' → ' + landed);
    try { await page.locator('.tut-root.open .tut-off').click({ timeout: 8000 }); } catch (_) {}
    await page.waitForFunction(() => {
      const q = window.__wattQA;
      return !!(q && q.winAt && q.winAt('ourique', 27) && q.winAt('ourique', 27).win);
    }, null, { timeout: 20000 });
    const presetBid = await page.locator('#auctionBidSlider').inputValue();
    if (presetBid !== '27') throw new Error('default bid ' + presetBid);
    const caixa = await page.evaluate(() => window.__wattQA.state.caixa);
    if (!(Math.abs(caixa - 2) < 1e-9)) throw new Error('caixa ' + caixa);
    await page.locator('#auction-confirm').click();
    await page.waitForSelector('[data-screen="trap"].active #auctionTrapDone', { timeout: 10000 });
    const trap = await page.locator('#auctionTrapDone').innerText();
    if (!/Aceitar/.test(trap)) throw new Error('bid 27 did not win: ' + trap);
    try { await page.locator('.tut-root.open .tut-off').click({ timeout: 1500 }); } catch (_) {}
    await page.locator('#auctionTrapDone').click();
    await page.waitForFunction(() => window.__wattQA && window.__wattQA.state && window.__wattQA.state.auctionWon, null, { timeout: 15000 });
    const saved = await page.evaluate(() => {
      const id = localStorage.getItem('watt.saves.active');
      const raw = localStorage.getItem('watt.save.slot.' + id);
      return raw ? JSON.parse(raw).player : null;
    });
    if (!saved || saved.nomeProprio !== 'Ana' || saved.apelido !== 'Ferreira') throw new Error('player save ' + JSON.stringify(saved));
    if (saved.nomeEmpresa !== 'Sol do Sul, Lda.') throw new Error('company save ' + saved.nomeEmpresa);
    if (saved.nacionalidade !== 'Portuguesa') throw new Error('nationality save');
    await shot(page, 'abertura-leilao-' + tag);
    await assertNameVariants(page);
  } finally {
    await context.close();
  }
}

/** A save from before the opening loads straight into the game. */
async function oldSaveSkipsOpening(browser, width, height, tag) {
  const { context, page } = await cleanPage(browser, width, height);
  track(page, 'old-save-' + tag);
  try {
    const raw = JSON.stringify(legacyBlob());
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((saved) => {
      localStorage.clear();
      localStorage.setItem('watt.save.v1', saved);
    }, raw);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#startMenu [data-menu="carregar"]');
    await page.locator('[data-menu="carregar"]').click();
    await page.waitForSelector('#startModal [data-continue]');
    await page.locator('#startModal [data-continue]').click();
    await page.waitForFunction(() => {
      return !document.body.classList.contains('at-menu') && !document.body.classList.contains('at-arranque');
    }, null, { timeout: 15000 });
    if (await page.locator('#arranque').isVisible()) throw new Error('opening shown for an old save');
    const quem = page.getByRole('heading', { name: 'Dados pessoais' });
    if (await quem.count() && await quem.first().isVisible()) throw new Error('jogador screen on old save');
    const loaded = await page.evaluate(() => {
      const q = window.__wattQA;
      const id = localStorage.getItem('watt.saves.active');
      const blob = JSON.parse(localStorage.getItem('watt.save.slot.' + id) || 'null');
      return {
        won: !!(q && q.state && q.state.auctionWon),
        caixa: q && q.state && q.state.caixa,
        player: blob && blob.player,
        phase: q && q.mail && q.mail.projectPhase,
        letters: ((blob && blob.mailState && blob.mailState.items) || []).map((m) => m && m.subject).filter(Boolean)
      };
    });
    if (!loaded.won) throw new Error('old save did not resume: ' + JSON.stringify(loaded));
    if (loaded.player && (loaded.player.nomeProprio || loaded.player.nomeEmpresa)) throw new Error('old save grew a player: ' + JSON.stringify(loaded.player));
    if (loaded.phase !== 'land') throw new Error('phase changed: ' + loaded.phase);
    if (loaded.letters.length) throw new Error('old save grew a letter: ' + loaded.letters.join(', '));
    await shot(page, 'old-save-' + tag);
    const oldBody = 'CARTA ANTIGA QUE FICA.';
    const keptRaw = JSON.stringify(Object.assign(legacyBlob(), {
      state: Object.assign({}, legacyBlob().state, { auctionWon: false }),
      auctionState: { wonId: null, wonLots: [], wave: 0 },
      mailLoop: { active: false, month: -1 },
      flags: { onboardingDone: true, phase0Seen: false },
      mailState: {
        items: [{
          id: 'm0-bem-vindo', phase0: true, read: false, type: 'investidores',
          subject: 'Bem-vindo', sender: 'Investidores', to: 'ti', when: 'agora',
          body: oldBody,
          choices: [{ id: 'ver_mandato', label: 'Ver o mandato', opens: 'mandato' }]
        }],
        view: 'list', activeId: null, open: false
      }
    }));
    await page.evaluate((saved) => {
      localStorage.clear();
      localStorage.setItem('watt.save.v1', saved);
    }, keptRaw);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#startMenu [data-menu="carregar"]');
    await page.locator('[data-menu="carregar"]').click();
    await page.waitForSelector('#startModal [data-continue]');
    await page.locator('#startModal [data-continue]').click();
    await page.waitForFunction(() => {
      const q = window.__wattQA;
      return !!(q && q.mailState && q.mailState.open);
    }, null, { timeout: 15000 });
    const kept = await page.evaluate(() => {
      const items = (window.__wattQA.mailState && window.__wattQA.mailState.items) || [];
      const letter = items.find((m) => m && m.id === 'm0-bem-vindo');
      return letter && { subject: letter.subject, body: letter.body, label: letter.choices && letter.choices[0] && letter.choices[0].label };
    });
    if (!kept || kept.body !== oldBody || kept.subject !== 'Bem-vindo' || kept.label !== 'Ver o mandato') {
      throw new Error('old letter replaced: ' + JSON.stringify(kept));
    }
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ headless: true });
const report = { ok: false, errors: [], shots: [] };
try {
  const only = process.env.WATT_ONLY || '';
  if (only !== 'cod' && only !== 'other') {
  await openingToAuction(browser, 1440, 900, '1440', true);
  await openingToAuction(browser, 390, 844, '390', true);
  await oldSaveSkipsOpening(browser, 1440, 900, '1440');
  await oldSaveSkipsOpening(browser, 390, 844, '390');
  console.log('PASS opening flow and old save');
  }
  if (only === 'opening') {
    report.ok = errors.length === 0;
    report.errors = errors.slice();
    if (errors.length) {
      console.error('CONSOLE ERRORS\n' + errors.join('\n'));
      process.exitCode = 1;
    } else {
      console.log('PASS no console errors');
    }
  } else {
  if (only !== 'cod' && only !== 'other') {
  await openEmptyMenu(browser, 390, 844, '390');
  await openEmptyMenu(browser, 1440, 900, '1440');
  await migrationAndDelete(browser, 390, 844, '390');
  await migrationAndDelete(browser, 1440, 900, '1440');
  }
  report.cod = {};
  if (only !== 'other') {
    for (const [bid, outcome] of [[27, 'falhado'], [29, 'conseguido']]) {
      for (const [w, h, tag] of [[1440, 900, '1440'], [390, 844, '390']]) {
        const cod = await playToCod(browser, w, h, outcome + '-' + bid + '-' + tag, bid, outcome);
        console.log('COD', outcome, bid, tag, JSON.stringify(cod.reached));
        report.cod[outcome + '-' + bid + '-' + tag] = cod.reached;
      }
    }
  }
  if (only !== 'cod') {
  await playOtherLot(browser, 1440, 900, '1440');
  await playOtherLot(browser, 390, 844, '390');
  }
  console.log('Évora extra hidden, default 27 wins');
  report.ok = errors.length === 0;
  report.errors = errors.slice();
  if (errors.length) {
    console.error('CONSOLE ERRORS\n' + errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('PASS no console errors');
  }
  }
} catch (err) {
  report.ok = false;
  report.fail = String(err && err.stack || err);
  report.errors = errors.slice();
  console.error(report.fail);
  if (errors.length) console.error('CONSOLE ERRORS\n' + errors.join('\n'));
  process.exitCode = 1;
} finally {
  report.gas = gasReport;
  report.opo = opoReport;
  fs.writeFileSync(path.join(OUT, 'start-menu-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
