/**
 * Câmara: quem escolhe «Marcar reunião» (meet) em mail-camara-01 não pode receber a carta
 * «Não vieste à reunião» (mail-camara-followup-01) nem o aviso de prazo do PIP falhado.
 *   WATT_BASE=http://127.0.0.1:<porta>/index.html node test/camara-reuniao.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const playwright = require(process.env.PLAYWRIGHT_PATH || (() => {
  try { require.resolve('playwright'); return 'playwright'; } catch (_) { return '/tmp/pwtest/node_modules/playwright'; }
})());
const { chromium } = playwright;
const BASE = process.env.WATT_BASE || 'http://127.0.0.1:8765/index.html';
let pass = 0; const fails = [];
function ok(c, l) { if (c) { pass++; console.log('OK  ', l); } else { fails.push(l); console.log('FAIL', l); } }

function save(month, tags) {
  const tm = {}; Object.keys(tags).forEach((k) => { tm[k] = 0; });
  return { v: 1, savedAt: '2026-10-31T10:00:00Z',
    state: { quarter: 1, year: 2027, caixa: 3.2, divida: 0, nav: 4, auctionWon: true, activeNodeId: 'ourique', minimized: [] },
    auctionState: { wonId: 'ourique', wonLots: ['ourique'], wave: 0 },
    mailLoop: { active: true, seId: 'ourique', month, projectPhase: 'land', tags, tagMonth: tm, firedDeadlines: { land_option: true } },
    mailState: { items: [], view: 'list', activeId: null, open: false },
    mandateState: { tier: 'boutique', acknowledged: true, letterRead: true, skip: false },
    flags: { onboardingDone: true } };
}

async function play(browser, startMonth, camaraChoice = 'meet') {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => { Math.random = () => 0.5; });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('watt-indeferido-onboarding-done', '1'); localStorage.setItem('watt.save.v1', s); }, JSON.stringify(save(startMonth, { land_option_open: 1, dd_started: 1 })));
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-menu="carregar"]').click();
  await page.locator('#startModal .slot button', { hasText: 'Continuar' }).first().click();
  await page.waitForFunction((m) => window.__tutApi && window.__tutApi.month() === m, startMonth, { timeout: 15000 });
  await page.waitForTimeout(800);
  const st = () => page.evaluate(() => ({ m: window.__tutApi.month(), tags: window.__wattQA.mail.tags || {},
    items: window.__tutApi.mailItems().map((x) => ({ id: x.id, sk: x.skeletonId || x.id, c: x.econChoiceId })) }));
  const seen = new Set(); let met = null; const texts = [];
  for (let i = 0; i < 9; i++) {
    for (let k = 0; k < 8; k++) {
      const s0 = await st();
      s0.items.forEach((x) => seen.add(x.sk));
      const pend = s0.items.filter((x) => !x.c);
      if (!pend.length) break;
      const L = pend[0];
      await page.evaluate((id) => window.__tutApi.openLetter(id), L.id); await page.waitForTimeout(300);
      texts.push(await page.locator('body').innerText());
      const btns = page.locator('[data-mail-choice]:not([disabled]):not([aria-disabled="true"])');
      const n = await btns.count(); if (!n) break;
      const ids = await btns.evaluateAll((bs) => bs.map((b) => b.getAttribute('data-mail-choice')));
      const pref = (String(L.sk).startsWith('mail-camara-01') ? [camaraChoice] : []).concat(['meet_now', 'accept_grid', 'reply', 'accept', 'ack']).find((x) => ids.includes(x));
      if (String(L.sk).startsWith('mail-camara-01') && pref === camaraChoice) met = s0.m;
      await btns.nth(pref ? ids.indexOf(pref) : 0).click({ force: true }); await page.waitForTimeout(400);
      const s1 = await st(); if (s1.items.find((x) => x.id === L.id && !x.c)) break;
    }
    await page.evaluate(() => window.__tutApi.closeInbox()); await page.waitForTimeout(150);
    await page.locator('#btnNextQ').dispatchEvent('pointerdown'); await page.waitForTimeout(1000);
  }
  const s = await st(); s.items.forEach((x) => seen.add(x.sk));
  const missed = await page.evaluate(() => (window.__wattQA.mail.missedDeadlines || {}).pip_camara);
  await page.close();
  return { met, seen: [...seen], tags: s.tags, missed, body: texts.join('\n') };
}

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' });
try {
  for (const m0 of [0, 1]) {
    const r = await play(browser, m0);
    console.log('start M' + m0, JSON.stringify({ met: r.met, missed: r.missed, camara: r.seen.filter((x) => /camara/.test(x)), rc: Object.keys(r.tags).filter((k) => /risk_camara/.test(k)).map((k) => k + '=' + r.tags[k]) }));
    ok(r.met != null, 'M' + m0 + ': a carta da Câmara chegou e escolheu-se «Marcar reunião»');
    ok(!r.seen.some((x) => String(x).startsWith('mail-camara-followup-01')), 'M' + m0 + ': sem carta «Segunda chamada» depois de marcar reunião');
    ok(!/Não vieste à reunião/.test(r.body), 'M' + m0 + ': sem texto «Não vieste à reunião»');
    ok(r.missed == null, 'M' + m0 + ': prazo do PIP não conta como falhado');
  }
  const ig = await play(browser, 1, 'ignore');
  ok(ig.met != null, 'ignorar: escolheu-se «Ignorar por agora»');
  ok(ig.seen.some((x) => String(x).startsWith('mail-camara-followup-01')), 'ignorar: a «Segunda chamada» continua a chegar');
} finally { await browser.close(); }
console.log(pass + ' ok, ' + fails.length + ' falhas');
process.exit(fails.length ? 1 : 0);
