/**
 * Rescue fund is preferred equity: the stored project NPV is never diluted in place.
 * Player NPV is applied when the number is shown or judged. IRR stays on the project.
 *
 *   node test/rescue-dilution.mjs
 * Needs a static server on :8765 (WATT_BASE overrides the URL).
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const playwright = require(process.env.PLAYWRIGHT_PATH || (() => {
  try { require.resolve('playwright'); return 'playwright'; }
  catch (_) { return '/tmp/pwtest/node_modules/playwright'; }
})());
const { chromium } = playwright;

const BASE = process.env.WATT_BASE || 'http://127.0.0.1:8765/index.html';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function openPage(browser, label, errors) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (err) => errors.push(label + ' pageerror: ' + err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(label + ' console: ' + msg.text());
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__wattQA && typeof window.__wattQA.playerNpv === 'function');
  return page;
}

const ARM = `
  function armProject(van) {
    const qa = window.__wattQA;
    const n = qa.nodes.find((x) => x.id === 'ourique');
    n.van = van;
    const mail = qa.mail;
    mail.active = true;
    mail.seId = 'ourique';
    mail.projectPhase = 'cod';
    mail.month = 24;
    mail.tags = mail.tags || {};
    mail.tags.bess_dev_flag = 1;
    mail.tags.cod_reached = 1;
    mail.end_state = { status: 'won', reason: 'cod', month: 24 };
    qa.state.auctionWon = true;
    qa.auction.wonLots = ['ourique'];
    qa.auction.wonId = 'ourique';
    return n.van;
  }
`;

async function readScreens(page) {
  await page.evaluate(() => {
    document.body.classList.remove('at-menu');
    const menu = document.getElementById('startMenu');
    if (menu) menu.hidden = true;
    window.__tutApi.openSala('ourique');
    window.__wattQA.openFinancas();
    window.__wattQA.openEnd();
  });
  await page.waitForSelector('#assetZoneVital');
  return page.evaluate(() => ({
    sala: (document.querySelector('#assetZoneVital') || {}).innerText || '',
    big: ((document.querySelector('#assetZoneVital .asset-vital-card .v') || {}).textContent || '').trim(),
    fin: (document.getElementById('objBody') || {}).innerText || '',
    end: (document.getElementById('endScreenBody') || {}).innerText || '',
    van: window.__wattQA.nodes.find((x) => x.id === 'ourique').van,
    eco: window.__wattQA.npvIrr(),
    line: window.__wattQA.rescueLine(window.__wattQA.nodes.find((x) => x.id === 'ourique').van),
    profitable: window.__wattQA.profitable(),
    preferred: !!window.__wattQA.mail.rescuePreferred
  }));
}

const GAIN = 'NPV do projeto 10,0 M€ · a tua parte (85 %) 8,5 M€ · o fundo de resgate fica com 15 % do ganho';
const LOSS = 'NPV do projeto −4,0 M€ · o prejuízo é todo teu: o fundo de resgate recebe primeiro';

const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  // Negative at rescue, and still negative: the stored NPV is not made less negative.
  {
    const page = await openPage(browser, 'neg', errors);
    const snap = await page.evaluate(new Function(ARM + `
      const van = armProject(-4);
      const before = window.__wattQA.npvIrr().irr;
      window.WattDebug.addTags(['rescue_capital_dilution']);
      const n = window.__wattQA.nodes.find((x) => x.id === 'ourique');
      const eco = window.__wattQA.npvIrr();
      return {
        van: n.van,
        storedAtRescue: van,
        before: before,
        irr: eco.irr,
        player: eco.npvNow,
        project: eco.npvProject,
        line: window.__wattQA.rescueLine(n.van),
        profitable: window.__wattQA.profitable(),
        preferred: !!window.__wattQA.mail.rescuePreferred
      };
    `));
    assert(snap.van === -4, 'negative NPV was mutated: ' + snap.van);
    assert(snap.player === -4, 'player NPV should keep the whole loss, got ' + snap.player);
    assert(snap.project === -4, 'project NPV ' + snap.project);
    assert(snap.irr === snap.before, 'IRR changed on a negative rescue');
    assert(Math.abs(snap.irr - (8 + 0.16 * -4)) < 1e-9, 'IRR is not the project IRR: ' + snap.irr);
    assert(snap.line === LOSS, 'loss line: ' + snap.line);
    assert(snap.profitable === false, 'a loss should not open the next tenders');
    assert(snap.preferred === true, 'rescue flag');
    const ui = await readScreens(page);
    assert(ui.sala.includes(LOSS), 'sala missing the loss line: ' + ui.sala.slice(0, 400));
    assert(ui.fin.includes(LOSS), 'finanças missing the loss line');
    assert(ui.end.includes(LOSS), 'end screen missing the loss line: ' + ui.end.slice(0, 500));
    assert(ui.end.includes('TIR do projeto'), 'end screen IRR label: ' + ui.end.slice(0, 500));
    assert(!ui.end.includes('IRR do capital próprio'), 'old IRR label still shown');
    await page.close();
  }

  // Negative at rescue, later turns positive: dilution applies at that later reading, not at rescue time.
  {
    const page = await openPage(browser, 'later', errors);
    const snap = await page.evaluate(new Function(ARM + `
      armProject(-4);
      window.WattDebug.addTags(['rescue_capital_dilution']);
      const n = window.__wattQA.nodes.find((x) => x.id === 'ourique');
      const atRescue = { van: n.van, player: window.__wattQA.playerNpv(n.van), irr: window.__wattQA.npvIrr().irr };
      n.van = 10;
      const eco = window.__wattQA.npvIrr();
      return {
        atRescue: atRescue,
        van: n.van,
        player: eco.npvNow,
        project: eco.npvProject,
        irr: eco.irr,
        line: window.__wattQA.rescueLine(n.van),
        profitable: window.__wattQA.profitable(),
        helper: window.__wattQA.playerNpv(10)
      };
    `));
    assert(snap.atRescue.van === -4 && snap.atRescue.player === -4, 'at rescue the loss stayed with the player');
    assert(snap.van === 10, 'turning positive must not scale the stored NPV, got ' + snap.van);
    assert(snap.project === 10, 'project ' + snap.project);
    assert(snap.player === 8.5 && snap.helper === 8.5, 'later gain should be 85%, got ' + snap.player);
    assert(Math.abs(snap.irr - (8 + 0.16 * 10)) < 1e-9, 'later IRR used a diluted base: ' + snap.irr);
    assert(Math.abs(snap.irr - (8 + 0.16 * (10 / 0.85))) > 0.01, 'IRR still divides by 0.85');
    assert(snap.line === GAIN, 'later gain line: ' + snap.line);
    assert(snap.profitable === true, 'a later gain should count as the player making money');
    const ui = await readScreens(page);
    assert(ui.sala.includes(GAIN), 'sala missing the later gain line');
    assert(ui.fin.includes(GAIN), 'finanças missing the later gain line');
    assert(ui.end.includes(GAIN), 'COD balance missing the later gain line');
    assert(ui.end.includes('TIR do projeto'), 'TIR label missing after the gain');
    await page.close();
  }

  // Already positive at rescue. IRR is the same number before and after the rescue.
  {
    const page = await openPage(browser, 'pos', errors);
    const snap = await page.evaluate(new Function(ARM + `
      armProject(10);
      const before = window.__wattQA.npvIrr();
      window.WattDebug.addTags(['rescue_capital_dilution']);
      const n = window.__wattQA.nodes.find((x) => x.id === 'ourique');
      const after = window.__wattQA.npvIrr();
      return {
        van: n.van,
        beforeIrr: before.irr,
        afterIrr: after.irr,
        beforePlayer: before.npvNow,
        player: after.npvNow,
        project: after.npvProject,
        line: window.__wattQA.rescueLine(n.van)
      };
    `));
    assert(snap.van === 10, 'positive NPV was diluted in place: ' + snap.van);
    assert(snap.beforePlayer === 10, 'before rescue the player had the whole project');
    assert(snap.player === 8.5, 'player share ' + snap.player);
    assert(snap.project === 10, 'project ' + snap.project);
    assert(snap.beforeIrr === snap.afterIrr, 'rescue changed the IRR');
    assert(Math.abs(snap.afterIrr - (8 + 0.16 * 10)) < 1e-9, 'IRR ' + snap.afterIrr);
    assert(snap.line === GAIN, 'gain line: ' + snap.line);
    const ui = await readScreens(page);
    assert(ui.sala.includes('85 %') && ui.sala.includes('15 %'), 'sala percents');
    assert(ui.end.includes('TIR do projeto'), 'TIR label');
    await page.close();
  }

  // Partner 25 % and a rescue. 10 × 0,75 × 0,85 = 6,375, shown as the same figure in the sentence.
  {
    const page = await openPage(browser, 'partner-gain', errors);
    const snap = await page.evaluate(new Function(ARM + `
      armProject(10);
      window.__wattQA.mail.partnerStake = 0.25;
      window.WattDebug.addTags(['rescue_capital_dilution']);
      const n = window.__wattQA.nodes.find((x) => x.id === 'ourique');
      const eco = window.__wattQA.npvIrr();
      return {
        van: n.van,
        player: eco.npvNow,
        helper: window.__wattQA.playerNpv(10),
        project: eco.npvProject,
        line: window.__wattQA.rescueLine(n.van),
        irr: eco.irr
      };
    `));
    const raw = 10 * 0.75 * 0.85;
    assert(Math.abs(raw - 6.375) < 1e-9, 'expected 6.375 before cents, got ' + raw);
    assert(snap.player === +raw.toFixed(2) && snap.helper === snap.player, 'player NPV ' + snap.player);
    assert(snap.van === 10 && snap.project === 10, 'stored project NPV changed: ' + snap.van);
    assert(Math.abs(snap.irr - (8 + 0.16 * 10)) < 1e-9, 'partner rescue changed the project IRR: ' + snap.irr);
    const ui = await readScreens(page);
    const gain = 'NPV do projeto 10,0 M€ · a tua parte (64 %) ' + ui.big + ' · o fundo de resgate fica com 15 % do ganho · o sócio fica com 25 %';
    assert(ui.big === '6,4 M€', 'big figure ' + ui.big);
    assert(ui.line === gain, 'partner gain line: ' + ui.line);
    assert(ui.sala.includes(ui.line), 'sala sentence does not match the big figure');
    assert(ui.fin.includes(ui.line), 'finanças missing the partner line');
    assert(ui.end.includes(ui.line), 'end screen missing the partner line');
    assert(ui.end.includes('TIR do projeto'), 'TIR label');
    await page.close();
  }

  // Partner and a rescue while the project loses money: the loss sentence is unchanged, and the loss is all the player's.
  {
    const page = await openPage(browser, 'partner-loss', errors);
    const snap = await page.evaluate(new Function(ARM + `
      armProject(-4);
      window.__wattQA.mail.partnerStake = 0.25;
      window.WattDebug.addTags(['rescue_capital_dilution']);
      const n = window.__wattQA.nodes.find((x) => x.id === 'ourique');
      const eco = window.__wattQA.npvIrr();
      return {
        van: n.van,
        player: eco.npvNow,
        helper: window.__wattQA.playerNpv(n.van),
        line: window.__wattQA.rescueLine(n.van)
      };
    `));
    assert(snap.van === -4, 'negative project NPV was mutated: ' + snap.van);
    assert(snap.player === -4 && snap.helper === -4, 'partner shared the loss: ' + snap.player);
    assert(snap.line === LOSS, 'loss line changed: ' + snap.line);
    assert(!/sócio|a tua parte/.test(snap.line), 'loss line mentions a share');
    const ui = await readScreens(page);
    assert(ui.big === '−4,0 M€', 'big figure on a loss: ' + ui.big);
    assert(ui.line === LOSS, 'screen loss line: ' + ui.line);
    assert(ui.sala.includes(LOSS) && ui.end.includes(LOSS) && ui.fin.includes(LOSS), 'loss sentence missing on screen');
    assert(!/o sócio fica/.test(ui.sala + ui.end + ui.fin), 'partner share shown on a loss');
    await page.close();
  }

  // An old save already holds a mutated van. Load it, do not reverse it, do not dilute it again.
  {
    const page = await openPage(browser, 'old', errors);
    const wrote = await page.evaluate(() => {
      const qa = window.__wattQA;
      const n = qa.nodes.find((x) => x.id === 'ourique');
      n.van = 8.5;
      const mail = qa.mail;
      mail.active = true;
      mail.seId = 'ourique';
      mail.month = 8;
      mail.projectPhase = 'land';
      mail.dilution = 0.15;
      mail.dilutionApplied = true;
      mail.rescuePreferred = false;
      mail.end_state = { status: 'playing', reason: null, month: null };
      qa.state.auctionWon = true;
      qa.state.caixa = 1.2;
      let nodes;
      let mailLoop;
      try {
        nodes = JSON.parse(JSON.stringify(qa.nodes));
        mailLoop = JSON.parse(JSON.stringify(qa.mail));
      } catch (err) {
        return { ok: false, error: String(err) };
      }
      const blob = {
        v: 1,
        savedAt: '2026-10-01T12:00:00.000Z',
        state: {
          quarter: 1, year: 2027, caixa: 1.2, divida: 0, nav: 4,
          auctionWon: true, activeNodeId: 'ourique', minimized: []
        },
        nodes: nodes,
        auctionState: { wonId: 'ourique', wonLots: ['ourique'], wave: 0, taken: {} },
        mailLoop: mailLoop,
        mailState: { items: [], view: 'list', activeId: null, open: false },
        mandateState: { tier: 'boutique', acknowledged: true, letterRead: true, skip: true },
        flags: { onboardingDone: true }
      };
      localStorage.clear();
      localStorage.setItem('watt.save.v1', JSON.stringify(blob));
      return { ok: true };
    });
    assert(wrote.ok, 'could not snapshot the old save: ' + wrote.error);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#startMenu h1', { timeout: 15000 });
    await page.locator('[data-menu="carregar"]').click();
    await page.waitForSelector('#startModal [data-continue]', { timeout: 10000 });
    await page.locator('#startModal [data-continue]').click();
    await page.waitForFunction(() => {
      const qa = window.__wattQA;
      return !!(qa && qa.state && qa.state.auctionWon && qa.playerNpv);
    }, null, { timeout: 15000 });
    const loaded = await page.evaluate(() => {
      const qa = window.__wattQA;
      const n = qa.nodes.find((x) => x.id === 'ourique');
      return {
        van: n && n.van,
        player: qa.playerNpv(n && n.van),
        line: qa.rescueLine(n && n.van),
        preferred: !!qa.mail.rescuePreferred,
        applied: !!qa.mail.dilutionApplied,
        irr: qa.npvIrr().irr
      };
    });
    assert(loaded.van === 8.5, 'old mutated van was reversed or rewritten: ' + loaded.van);
    assert(loaded.player === 8.5, 'old save was diluted a second time: ' + loaded.player);
    assert(loaded.line === '', 'old save showed the new rescue sentence: ' + loaded.line);
    assert(loaded.preferred === false, 'old save gained rescuePreferred');
    assert(loaded.applied === true, 'old dilutionApplied was dropped');
    assert(Math.abs(loaded.irr - (8 + 0.16 * 8.5)) < 1e-9, 'old IRR tried to undo the stored van: ' + loaded.irr);
    await page.close();
  }

  if (errors.length) {
    console.error('CONSOLE ERRORS\n' + errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('PASS rescue dilution');
  }
} catch (err) {
  console.error(err && err.stack || err);
  if (errors.length) console.error('CONSOLE ERRORS\n' + errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
