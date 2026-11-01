/**
 * Painel de Finanças dos objetivos: só valores (o que é preciso e o que há), sem veredito
 * «Chega»/«Não chega» nem cores verde/vermelho de conclusão. O julgamento é do jogador.
 *   WATT_BASE=http://127.0.0.1:<porta>/index.html node test/sem-veredito-painel.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const playwright = require(process.env.PLAYWRIGHT_PATH || (() => {
  try { require.resolve('playwright'); return 'playwright'; } catch (_) { return '/tmp/pwtest/node_modules/playwright'; }
})());
const { chromium } = playwright;
const BASE = process.env.WATT_BASE || 'http://127.0.0.1:8765/index.html';
const OUT = process.env.WATT_SHOTS || '/opt/cursor/artifacts/screenshots';
let pass = 0; const fails = [];
function ok(c, l) { if (c) { pass++; console.log('OK  ', l); } else { fails.push(l); console.log('FAIL', l); } }
const SAVE = { v: 1, savedAt: '2026-10-31T10:00:00Z',
  state: { quarter: 1, year: 2027, caixa: 3.2, divida: 0, nav: 4, auctionWon: true, activeNodeId: 'ourique', minimized: [] },
  auctionState: { wonId: 'ourique', wonLots: ['ourique'], wave: 0 },
  mailLoop: { active: true, seId: 'ourique', month: 1, projectPhase: 'land', tags: {}, tagMonth: {}, firedDeadlines: {} },
  mailState: { items: [], view: 'list', activeId: null, open: false },
  mandateState: { tier: 'boutique', acknowledged: true, letterRead: true, skip: false },
  flags: { onboardingDone: true } };
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: width > 500 ? 900 : 844 } });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('watt-indeferido-onboarding-done', '1'); localStorage.setItem('watt.save.v1', s); }, JSON.stringify(SAVE));
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-menu="carregar"]').click();
    await page.locator('#startModal .slot button', { hasText: 'Continuar' }).first().click();
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.__wattQA.openFinancas());
    await page.waitForTimeout(500);
    const txt = await page.locator('#objBody').innerText();
    ok(/Necessidade na decisão final/i.test(txt) && /Investidores/i.test(txt), width + ': mostra o que é preciso e o que há');
    ok(/Ainda por gastar/i.test(txt) && /Caixa para desenvolver/i.test(txt), width + ': caixa e gasto previsto visíveis');
    ok(!/Chega|Não chega|sobra |faltam /i.test(txt), width + ': sem veredito «Chega»/«Não chega»');
    ok(await page.locator('#objBody .obj-verd').count() === 0, width + ': sem bloco .obj-verd');
    const cols = await page.locator('#objBody .obj-bar i').evaluateAll((b) => b.map((e) => e.style.background));
    ok(cols.length > 0 && cols.every((c) => !/22, 163, 74|245, 158, 11/.test(c)), width + ': barras sem verde/laranja de conclusão');
    ok(await page.locator('#objBody .obj-fl.tot .obj-ok, #objBody .obj-fl.tot .obj-no').count() === 0, width + ': folga sem cor de veredito');
    await page.screenshot({ path: OUT + '/painel-financas-' + width + '.png', fullPage: false });
    await page.close();
  }
} finally { await browser.close(); }
console.log(pass + ' OK, ' + fails.length + ' FAIL');
if (fails.length) process.exit(1);
