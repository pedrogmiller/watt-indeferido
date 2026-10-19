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
  const order = ['Carregar jogo', 'Novo jogo', 'Como se joga', 'Definições', 'Dar opinião'];
  let at = -1;
  for (const label of order) {
    const i = text.indexOf(label);
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
  if (!/Preparar jogo/.test(text)) throw new Error('title');
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

/** Novo jogo walks Jogador → País → Empresa → Ficha → Controlo, then the auction. */
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
  await page.waitForSelector('#arranque[data-step="controlo"] #arranqueAuction');
  await page.locator('#arranqueAuction').click();
  await page.waitForSelector('#auctionRoom.open', { timeout: 15000 });
  const preset = await page.evaluate(() => {
    const id = localStorage.getItem('watt.saves.active');
    const idx = JSON.parse(localStorage.getItem('watt.saves.index.v1') || '[]');
    const row = idx.find((s) => s.id === id);
    return row && row.name;
  });
  if (!/Jogo de \d+ \w+ \d{4}/.test(preset || '')) throw new Error('default name: ' + preset);
  try { await page.locator('.tut-root.open .tut-off').click({ timeout: 2000 }); } catch (_) {}
  await page.locator('#auctionClose').click();
  await page.waitForFunction(() => {
    const room = document.getElementById('auctionRoom');
    return room && !room.classList.contains('open');
  });
  if (await page.locator('#btnInbox').isVisible()) await page.locator('#btnInbox').click();
  else await page.locator('#tabInbox').click();
  await page.waitForSelector('#inboxDrawer.open', { timeout: 10000 });
  if (!(await page.locator('#inboxDrawer.open [data-mail-choice="ver_mandato"]').count())) {
    await page.locator('.mail-row').first().click();
  }
  await page.waitForSelector('#inboxDrawer.open [data-mail-choice="ver_mandato"]', { timeout: 10000 });
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
  if (!/ponto de ligação à rede/.test(mail)) throw new Error('welcome body');
  if (!/Ver o mandato/.test(mail)) throw new Error('welcome button');
  await shot(page, 'caixa-entrada-' + tag);
  const fabBlue = await page.locator('#btnNextQ').evaluate((el) => getComputedStyle(el).backgroundColor);
  if (fabBlue !== 'rgb(0, 122, 255)') throw new Error('body CTA color ' + fabBlue);
  const mailBlue = await page.locator('[data-mail-choice="ver_mandato"]').evaluate((el) => getComputedStyle(el).backgroundColor);
  if (mailBlue !== 'rgb(0, 122, 255)') throw new Error('mail CTA color ' + mailBlue);
  if (await page.locator('#startMenu').isVisible()) throw new Error('menu still visible in game');
  if (!(await page.locator('#btnSettings').isVisible())) throw new Error('gear hidden during the game');

  await page.waitForFunction(() => {
    const bp = window.__wattQA && window.__wattQA.bomPreco && window.__wattQA.bomPreco();
    return !!(bp && bp.lots && bp.lots.ourique === 29 && Object.keys(bp.lots).length === 1);
  }, null, { timeout: 15000 });
  await page.locator('[data-mail-choice="ver_mandato"]').click();
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
  await page.locator('[data-mail-choice="ver_mandato"]').click();
  await page.waitForSelector('#mandate0Close');
  await page.locator('#mandate0Close').click();
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

/** Novo jogo → 5 ecrãs → leilão de Ourique ganho no lance por defeito 27. */
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
    if (period !== '2027 · Q1') throw new Error('opening period ' + period);
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
    if (!/A tua empresa/.test(top) || !/Promotora/.test(top) || !/0 MW/.test(top)) throw new Error('empty company row: ' + top);
    await page.locator('#arranqueBack').click();
    await page.waitForSelector('#arranque[data-step="pais"]');
    await page.locator('#arranqueBack').click();
    await page.waitForSelector('#arranque[data-step="jogador"]');

    await page.locator('#arrEmpresa').fill('EDP');
    await page.locator('#arranqueNext').click();
    await page.waitForFunction(() => {
      const input = document.getElementById('arrEmpresa');
      const root = document.getElementById('arranque');
      return !!(input && root && root.dataset.step === 'jogador' && input.getAttribute('aria-invalid') === 'true');
    });
    await page.locator('#arrEmpresa').fill('iberdrola');
    await page.locator('#arranqueNext').click();
    await page.waitForFunction(() => {
      const input = document.getElementById('arrEmpresa');
      const root = document.getElementById('arranque');
      return !!(input && root && root.dataset.step === 'jogador' && input.getAttribute('aria-invalid') === 'true' && /iberdrola/i.test(input.value));
    });

    await page.locator('#arrNome').fill('Ana');
    await page.locator('#arrApelido').fill('Ferreira');
    await page.locator('#arrEmpresa').fill('Sol do Sul, Lda.');
    await shot(page, 'abertura-jogador-' + tag);
    if (/HIPÓTESE|\[GM\]/.test(await page.locator('#arranque').innerText())) throw new Error('marker on jogador');
    await page.locator('#arranqueNext').click();
    await page.waitForSelector('#arranque[data-step="pais"]');
    await shot(page, 'abertura-pais-' + tag);
    await page.locator('#arranqueNext').click();
    await page.waitForSelector('#arranque[data-step="empresa"] [data-rival="finerge"]');
    const list = await page.locator('#arranque .ar-ls').innerText();
    if (!/Sol do Sul, Lda\./.test(list)) throw new Error('player company missing');
    if (!/EDP/.test(list) || !/7\s*000/.test(list)) throw new Error('EDP mw: ' + list.slice(0, 400));
    const finerge = await page.locator('[data-rival="finerge"]').innerText();
    if (!/~/.test(finerge) || !/1\s*795/.test(finerge)) throw new Error('Finerge: ' + finerge);
    const tagE = await page.locator('[data-rival="tagenergy"]').innerText();
    if (!/—/.test(tagE)) throw new Error('TagEnergy: ' + tagE);
    const edpPe = await page.locator('[data-rival="edp"]').evaluate((el) => getComputedStyle(el).pointerEvents);
    if (edpPe !== 'none') throw new Error('rival is selectable');
    if (!/rival/i.test(await page.locator('[data-rival="edp"]').innerText())) throw new Error('missing Rival');
    if (await page.locator('[data-rival]').count() !== 16) throw new Error('rival count');
    const body = await page.locator('#arranque').innerText();
    if (/HIPÓTESE|\[GM\]/.test(body)) throw new Error('marker on empresa');
    if (!/2,0 M€ para começar/.test(body)) throw new Error('starting cash copy');
    await shot(page, 'abertura-empresa-' + tag);
    await page.locator('#arranqueNext').click();
    await page.waitForSelector('#arranque[data-step="ficha"] #arranqueFinCard');
    if (!(await page.locator('#arranqueFinancas').isVisible())) throw new Error('finanças pill hidden on ficha');
    const pill = await page.locator('#arranqueFinancas').innerText();
    if (!/Ok/.test(pill) || /\d/.test(pill)) throw new Error('finanças pill ' + pill);
    const finCard = await page.locator('#arranqueFinCard').innerText();
    if (!/Ok/.test(finCard) || /\d/.test(finCard)) throw new Error('finanças card ' + finCard);
    const ficha = await page.locator('#arranque').innerText();
    if (!/Ana Ferreira/.test(ficha) || !/Portuguesa/.test(ficha)) throw new Error('ficha identity');
    if (/HIPÓTESE|\[GM\]/.test(ficha)) throw new Error('marker on ficha');
    await shot(page, 'abertura-ficha-' + tag);
    await page.locator('#arranqueNext').click();
    await page.waitForSelector('#arranque[data-step="controlo"] #arranqueAuction');
    await page.waitForFunction(() => {
      const el = document.getElementById('arranqueOuriqueMeta');
      const q = window.__wattQA;
      if (!el || !q || typeof q.faixa !== 'function' || !q.faixa()) return false;
      const lot = (q.lots || []).find((l) => l.id === 'ourique');
      if (!lot || lot.kv == null || !lot.mw) return false;
      const kv = String(lot.kv).replace(/\s*kV$/i, '').trim() + ' kV';
      const text = el.textContent || '';
      return text.indexOf(kv) === 0 && text.indexOf(String(lot.mw).trim()) !== -1;
    }, null, { timeout: 15000 });
    const controlo = await page.locator('#arranque').innerText();
    if (!/Assumiste o controlo/.test(controlo)) throw new Error('controlo title');
    if (!/Ana, a empresa é tua/.test(controlo)) throw new Error('controlo name');
    if (!/Ir para o leilão/.test(controlo) || !/Ourique/.test(controlo)) throw new Error('controlo auction');
    if (/HIPÓTESE|\[GM\]|Fim da maquete/.test(controlo)) throw new Error('marker on controlo');
    const ouriqueMeta = await page.locator('#arranqueOuriqueMeta').innerText();
    if (!/^150 kV · 120 MWp · /.test(ouriqueMeta)) throw new Error('ourique meta ' + ouriqueMeta);
    const goBlue = await page.locator('#arranqueAuction').evaluate((el) => getComputedStyle(el).backgroundColor);
    if (goBlue !== 'rgb(0, 122, 255)') throw new Error('auction CTA ' + goBlue);
    await shot(page, 'abertura-controlo-' + tag);
    if (!win) return;

    await page.locator('#arranqueAuction').click();
    await page.waitForSelector('#auctionRoom.open', { timeout: 15000 });
    if (await page.locator('#arranque').isVisible()) throw new Error('opening still visible over the auction');
    try { await page.locator('.tut-root.open .tut-off').click({ timeout: 2500 }); } catch (_) {}
    await page.waitForFunction(() => {
      const q = window.__wattQA;
      return !!(q && q.winAt && q.winAt('ourique', 27) && q.winAt('ourique', 27).win);
    }, null, { timeout: 20000 });
    const presetBid = await page.locator('#auctionBidSlider').inputValue();
    if (presetBid !== '27') throw new Error('default bid ' + presetBid);
    const auctionSub = await page.locator('#auctionSub').innerText();
    const kvBit = ouriqueMeta.match(/^(\d+(?:\/\d+)? kV)/);
    const mwBit = ouriqueMeta.match(/(\d[\d\s]*MWp)/);
    if (!kvBit || auctionSub.indexOf(kvBit[1]) !== 0) throw new Error('auction voltage ' + auctionSub + ' vs ' + ouriqueMeta);
    if (!mwBit || auctionSub.indexOf(mwBit[1]) === -1) throw new Error('auction size ' + auctionSub + ' vs ' + ouriqueMeta);
    const caixa = await page.evaluate(() => window.__wattQA.state.caixa);
    if (!(Math.abs(caixa - 2) < 1e-9)) throw new Error('caixa ' + caixa);
    await page.locator('#auction-confirm').click();
    await page.waitForSelector('[data-screen="trap"].active #auctionTrapDone', { timeout: 10000 });
    const trap = await page.locator('#auctionTrapDone').innerText();
    if (!/Aceitar/.test(trap)) throw new Error('bid 27 did not win: ' + trap);
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
    const quem = page.getByRole('heading', { name: 'Quem és tu?' });
    if (await quem.count() && await quem.first().isVisible()) throw new Error('jogador screen on old save');
    const loaded = await page.evaluate(() => {
      const q = window.__wattQA;
      const id = localStorage.getItem('watt.saves.active');
      const blob = JSON.parse(localStorage.getItem('watt.save.slot.' + id) || 'null');
      return {
        won: !!(q && q.state && q.state.auctionWon),
        caixa: q && q.state && q.state.caixa,
        player: blob && blob.player,
        phase: q && q.mail && q.mail.projectPhase
      };
    });
    if (!loaded.won) throw new Error('old save did not resume: ' + JSON.stringify(loaded));
    if (loaded.player && (loaded.player.nomeProprio || loaded.player.nomeEmpresa)) throw new Error('old save grew a player: ' + JSON.stringify(loaded.player));
    if (loaded.phase !== 'land') throw new Error('phase changed: ' + loaded.phase);
    await shot(page, 'old-save-' + tag);
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
  fs.writeFileSync(path.join(OUT, 'start-menu-report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
