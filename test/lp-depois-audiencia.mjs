/**
 * LP depois da audiência prévia + linha «À espera».
 * 3 caminhos: com AIA (LP ≈ M13), sem AIA (≈ M12), processo fraco → audiência → resposta → LP chega.
 *   WATT_BASE=http://127.0.0.1:<porta>/index.html WATT_SHOTS=<pasta> node test/lp-depois-audiencia.mjs
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
const LP_SK = ['mail-dgeg-lp-concedida-01', 'mail-dgeg-lp-condicionada-01'];

function save(tags) {
  const tm = {}; Object.keys(tags).forEach((k) => { tm[k] = k === 'lp_request_submitted' ? 8 : 4; });
  return { v: 1, savedAt: '2026-10-26T10:00:00Z',
    state: { quarter: 3, year: 2027, caixa: 3.2, divida: 0, nav: 4, auctionWon: true, activeNodeId: 'ourique', minimized: [] },
    auctionState: { wonId: 'ourique', wonLots: ['ourique'], wave: 0 },
    mailLoop: { active: true, seId: 'ourique', month: 8, projectPhase: 'aia', tags, tagMonth: tm },
    mailState: { items: [], view: 'list', activeId: null, open: false },
    mandateState: { tier: 'boutique', acknowledged: true, letterRead: true, skip: false },
    flags: { onboardingDone: true } };
}

async function play(browser, { name, tags, width, random, prefer, shots }) {
  const tag = name + '-' + width;
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
  page.on('pageerror', (e) => errors.push(tag + ' pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(tag + ' console: ' + m.text()); });
  if (random != null) await page.addInitScript((r) => { Math.random = () => r; }, random);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('watt-indeferido-onboarding-done', '1'); localStorage.setItem('watt.save.v1', s); }, JSON.stringify(save(tags)));
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-menu="carregar"]').click();
  await page.locator('#startModal .slot button', { hasText: 'Continuar' }).first().click();
  await page.waitForFunction(() => window.__tutApi && window.__tutApi.month() === 8, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const st = () => page.evaluate(() => ({ m: window.__tutApi.month(), ph: window.__tutApi.phase(), tags: window.__wattQA.mail.tags || {},
    items: window.__tutApi.mailItems().map((x) => ({ id: x.id, sk: x.skeletonId, c: x.econChoiceId, note: x.delivery === 'note' || !!x.note })) }));
  const espera = async () => { await page.evaluate(() => window.__tutApi.openSala('ourique')); await page.waitForTimeout(400); const t = await page.locator('#assetLpEspera').count() ? (await page.locator('#assetLpEspera').innerText()).replace(/\s+/g, ' ') : ''; await page.evaluate(() => window.__tutApi.closeSala()); await page.waitForTimeout(200); return t; };
  const res = { lpMonth: null, lpNote: null, hearing: null, reply: null, esperas: [], final: null };
  let shotEspera = false;
  for (let i = 0; i < 26; i++) {
    for (let k = 0; k < 8; k++) {
      const s0 = await st();
      const pend = s0.items.filter((x) => !x.c);
      if (!pend.length) break;
      const L = pend[0];
      if (LP_SK.some((p) => (L.sk || L.id).startsWith(p)) && res.lpMonth == null) { res.lpMonth = s0.m; res.lpNote = L.note; }
      await page.evaluate((id) => window.__tutApi.openLetter(id), L.id); await page.waitForTimeout(350);
      if (LP_SK.some((p) => (L.sk || L.id).startsWith(p)) && shots) await page.screenshot({ path: path.join(OUT, 'carta-lp-' + name + '-' + width + '.png') });
      const btns = page.locator('[data-mail-choice]:not([disabled]):not([aria-disabled="true"])');
      const n = await btns.count(); if (!n) break;
      const ids = await btns.evaluateAll((bs) => bs.map((b) => b.getAttribute('data-mail-choice')));
      const pref = (prefer || []).concat(['accept_grid', 'send_full', 'reply', 'accept_conditions', 'accept', 'ack', 'go_lp', 'submit_full']).find((x) => ids.includes(x));
      if ((L.sk || L.id).startsWith('mail-dgeg-lp-audiencia-01')) { res.hearing = s0.m; res.reply = pref || ids[0]; }
      await btns.nth(pref ? ids.indexOf(pref) : 0).click({ force: true }); await page.waitForTimeout(450);
      const s1 = await st(); if (s1.items.find((x) => x.id === L.id && !x.c)) break;
    }
    await page.evaluate(() => window.__tutApi.closeInbox()); await page.waitForTimeout(150);
    const s = await st();
    if ((s.tags.lp_granted | 0) > 0) { res.final = s; break; }
    const e = await espera(); if (e) res.esperas.push('M' + s.m + ' ' + e);
    if (e && shots && !shotEspera) {
      await page.evaluate(() => window.__tutApi.openSala('ourique')); await page.waitForTimeout(400);
      await page.locator('#assetLpEspera').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(OUT, 'a-espera-sala-' + name + '-' + width + '.png') });
      await page.evaluate(() => window.__tutApi.closeSala()); await page.waitForTimeout(200);
      await page.locator('.hud-lp-espera').first().scrollIntoViewIfNeeded().catch(() => {});
      await page.screenshot({ path: path.join(OUT, 'a-espera-cartao-' + name + '-' + width + '.png') });
      shotEspera = true;
    }
    if (s.m >= 30) { res.final = s; break; }
    await page.locator('#btnNextQ').dispatchEvent('pointerdown'); await page.waitForTimeout(1100);
  }
  res.final = res.final || await st();
  console.log(tag, JSON.stringify({ lpMonth: res.lpMonth, note: res.lpNote, hearing: res.hearing, reply: res.reply, phase: res.final.ph, m: res.final.m, esperas: res.esperas }));
  const body = await page.locator('body').innerText();
  ok(!/\brival/i.test(body), tag + ' sem «rival»');
  await page.close();
  return res;
}

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' });
const base = { land_option_open: 1, dd_started: 1, lp_request_submitted: 1 };
try {
  for (const width of [1440, 390]) {
    const aia = await play(browser, { name: 'com-aia', width, shots: true, tags: { ...base, apa_track_start: 1, aia_sujeito: 1, env_path_aia_obrigatoria: 1, dia_emitida: 1 } });
    ok(aia.lpMonth != null && aia.lpMonth >= 11 && aia.lpMonth <= 15, width + ' com AIA: LP chega em M' + aia.lpMonth + ' (≈ M13)');
    ok(aia.lpNote === false, width + ' com AIA: a LP chega como carta');
    ok(aia.final.ph === 'licenca_producao', width + ' com AIA: fase Licença de produção');
    ok(aia.esperas.length > 0 && aia.esperas.every((e) => /À espera: (resposta à REN|decisão da DGEG|DIA)/.test(e)), width + ' com AIA: «À espera» ' + aia.esperas.join(' | '));
    const sem = await play(browser, { name: 'sem-aia', width, random: 0.5, shots: width === 1440, tags: { ...base, nao_sujeicao: 1, pip_request_submitted: 1, pip_aprovado: 1, env_gate_ok: 1 } });
    ok(sem.lpMonth != null && sem.lpMonth >= 11 && sem.lpMonth <= 14, width + ' sem AIA: LP chega em M' + sem.lpMonth + ' (≈ M12)');
    ok(sem.lpNote === false && sem.final.ph === 'licenca_producao', width + ' sem AIA: carta e fase Licença de produção');
    const fraco = await play(browser, { name: 'fraco', width, random: 0.1, shots: true, tags: { ...base, nao_sujeicao: 1, pip_request_submitted: 1, pip_aprovado: 1, env_gate_ok: 1, lp_dossier_thin: 1, lp_elements_missing: 1 } });
    ok(fraco.hearing != null && fraco.reply === 'reply', width + ' fraco: audiência em M' + fraco.hearing + ', resposta «' + fraco.reply + '»');
    ok(fraco.lpMonth != null && fraco.lpMonth - fraco.hearing >= 3 && fraco.lpMonth - fraco.hearing <= 6, width + ' fraco: LP chega ' + (fraco.lpMonth - fraco.hearing) + ' meses depois da resposta');
    ok(fraco.final.ph === 'licenca_producao', width + ' fraco: fase Licença de produção');
    ok(fraco.esperas.some((e) => /À espera: decisão da DGEG/.test(e)), width + ' fraco: «À espera: decisão da DGEG» depois da resposta');
  }
} finally { await browser.close(); }
ok(errors.length === 0, 'sem erros na consola' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
console.log('\n' + pass + ' OK, ' + fails.length + ' falhas');
if (fails.length) process.exit(1);
