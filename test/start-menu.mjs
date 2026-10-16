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

async function playToCod(browser, width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  track(page, 'cod-' + tag);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-menu="novo"]');
  await page.locator('[data-menu="novo"]').click();
  await page.waitForSelector('#newGameName');
  const preset = await page.locator('#newGameName').inputValue();
  if (!/Jogo de \d+ \w+ \d{4}/.test(preset)) throw new Error('default name: ' + preset);
  await shot(page, 'novo-jogo-' + tag);
  await page.locator('#newGameStart').click();
  await page.waitForSelector('#phase0Welcome', { timeout: 15000 });
  const welcome = await page.locator('#phase0Welcome').innerText();
  if (!/PLACEHOLDER GM/.test(welcome)) throw new Error('phase0 welcome is not marked placeholder');
  await shot(page, 'phase0-welcome-' + tag);
  await page.locator('#phase0Welcome button').click();
  await page.waitForSelector('#inboxDrawer.open');
  const title = await page.locator('#inboxTitle').innerText();
  if (title.trim() !== 'Caixa de entrada') throw new Error('inbox title: ' + title);
  const mail = await page.locator('#inboxBody').innerText();
  if (!/PLACEHOLDER GM/.test(mail)) throw new Error('mandato 0 mail missing placeholder');
  if (!/Mandato 0: Ganhar o leilão/.test(mail)) throw new Error('mandato 0 subject');
  await shot(page, 'caixa-entrada-' + tag);
  const fabBlue = await page.locator('#btnNextQ').evaluate((el) => getComputedStyle(el).backgroundColor);
  if (fabBlue !== 'rgb(0, 122, 255)') throw new Error('body CTA color ' + fabBlue);
  if (await page.locator('#startMenu').isVisible()) throw new Error('menu still visible in game');
  if (!(await page.locator('#btnSettings').isVisible())) throw new Error('gear hidden during the game');

  await page.locator('.mail-row').first().click();
  await page.waitForSelector('[data-mail-choice="ir_leilao"]');
  await page.locator('[data-mail-choice="ir_leilao"]').click();
  await page.waitForSelector('#mandateBriefing.open, #auctionRoom.open', { timeout: 10000 });
  await dismissLayers(page);
  await dismissLayers(page);
  await page.waitForSelector('#auctionRoom.open', { timeout: 10000 });
  const tipOff = page.locator('.tut-root.open .tut-off');
  try { await tipOff.waitFor({ state: 'visible', timeout: 2500 }); await tipOff.click(); } catch (_) {}
  await page.waitForFunction(() => {
    const q = window.__wattQA;
    if (!q || !q.econAt) return false;
    const e = q.econAt('ourique', 30);
    return !!(e && e.win);
  }, { timeout: 20000 });
  await dismissLayers(page);
  const lot = page.locator('#auction-lot-ourique, [data-lot="ourique"]').first();
  if (await lot.count() && (await lot.getAttribute('aria-selected')) !== 'true') {
    await lot.click({ force: true });
  }
  const slider = page.locator('#auctionBidSlider');
  await slider.evaluate((el) => {
    el.value = '30';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#auction-confirm').click();
  await page.waitForSelector('[data-screen="trap"].active', { timeout: 10000 });
  try { await page.locator('.tut-root.open .tut-off').click({ timeout: 1000 }); } catch (_) {}
  const trap = await page.locator('#auctionTrapDone').innerText();
  if (!/Aceitar/.test(trap)) throw new Error('did not win the lot: ' + trap);
  await page.locator('#auctionTrapDone').click();
  await page.waitForFunction(() => window.__wattQA && window.__wattQA.state && window.__wattQA.state.auctionWon, { timeout: 15000 });

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

const browser = await chromium.launch({ headless: true });
const report = { ok: false, errors: [], shots: [] };
try {
  if (process.env.WATT_ONLY !== 'cod') {
  await openEmptyMenu(browser, 390, 844, '390');
  await openEmptyMenu(browser, 1440, 900, '1440');
  await migrationAndDelete(browser, 390, 844, '390');
  await migrationAndDelete(browser, 1440, 900, '1440');
  }
  const cod1440 = await playToCod(browser, 1440, 900, '1440');
  console.log('COD 1440', JSON.stringify(cod1440.reached));
  const cod390 = await playToCod(browser, 390, 844, '390');
  console.log('COD 390', JSON.stringify(cod390.reached));
  report.cod = { w1440: cod1440.reached, w390: cod390.reached };
  report.ok = errors.length === 0;
  report.errors = errors.slice();
  if (errors.length) {
    console.error('CONSOLE ERRORS\n' + errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('PASS no console errors');
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
