/**
 * Motor de pesquisa · fase 1 (lupa única, secções, plantel, fichas, relatório).
 *   WATT_BASE=http://127.0.0.1:<porta>/index.html node test/motor-pesquisa.mjs
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
const SHOTS390 = process.env.MOTOR_SHOTS || OUT;
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(SHOTS390, { recursive: true });

let pass = 0; const fails = []; const errors = [];
function ok(cond, label) { if (cond) { pass++; console.log('OK  ', label); } else { fails.push(label); console.log('FAIL', label); } }

function blob() {
  return { v: 1, savedAt: '2026-10-25T18:00:00.000Z',
    state: { quarter: 1, year: 2027, caixa: 3.2, divida: 0, nav: 4, auctionWon: true, activeNodeId: 'ourique', minimized: [] },
    auctionState: { wonId: 'ourique', wonLots: ['ourique'], wave: 0 },
    mailLoop: { active: true, seId: 'ourique', month: 4, projectPhase: 'land' },
    mailState: { items: [], view: 'list', activeId: null, open: false },
    mandateState: { tier: 'boutique', acknowledged: true, letterRead: true, skip: false },
    flags: { onboardingDone: true } };
}

async function intoGame(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('watt.save.v1', s); localStorage.setItem('wi.arranque.nomeEmpresa', 'Sol do Sado'); }, JSON.stringify(blob()));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-menu="carregar"]');
  await page.locator('[data-menu="carregar"]').click();
  await page.waitForSelector('#startModal .slot');
  await page.locator('#startModal .slot button', { hasText: 'Continuar' }).first().click();
  await page.waitForFunction(() => !document.body.classList.contains('at-menu'), null, { timeout: 15000 });
  await page.waitForTimeout(600);
}

async function visText(page) { return page.locator('#motorPanel').innerText(); }

async function run(browser, width, height) {
  const tag = String(width);
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', (e) => errors.push(tag + ' pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(tag + ' console: ' + m.text()); });
  await intoGame(page);

  const lupas = await page.locator('header.header .header-search-btn:visible').count();
  ok(lupas === 1, tag + ' uma só lupa no cabeçalho');
  ok(await page.locator('#btnSearch').count() === 0, tag + ' pesquisa antiga (#btnSearch) saiu');
  if (width === 390) await page.screenshot({ path: path.join(SHOTS390, 'home-lupa-390.png') });

  await page.locator('#btnMotor').click();
  await page.waitForSelector('#motorPanel:not([hidden]) #moLista');
  ok(await page.locator('#entPanel:not([hidden])').count() === 0, tag + ' painel antigo não abre');
  const labels = await page.locator('#motorPanel .mo-glabel').allInnerTexts();
  ok(labels.slice(0, 2).join('|').toUpperCase() === 'PESSOAS|ORGANIZAÇÕES', tag + ' grupos PESSOAS e ORGANIZAÇÕES');
  const tabs = (await page.locator('#motorPanel .mo-tab').allInnerTexts()).map((s) => s.trim());
  ok(tabs.join('|') === 'Quadros|Consultores|Interlocutores|Promotores|Entidades públicas|Rede|Bancos|Fornecedores|Clientes PPA', tag + ' secções por ordem: ' + tabs.join(', '));
  ok(await page.locator('#motorPanel button:has-text("‹ Voltar")').count() === 1 && await page.locator('#motorPanel button:has-text("⌂ Início")').count() === 1, tag + ' ‹ Voltar e ⌂ Início');
  const t0 = await visText(page);
  ok(/Leonilde Barroca/.test(t0), tag + ' Quadros lista a Leonilde');
  if (width === 390) await page.screenshot({ path: path.join(SHOTS390, 'quadros-lista-390.png') });

  // Ficha da Leonilde
  await page.locator('#moLista [data-mo-pessoa="pessoas-l1"]').click();
  await page.waitForSelector('#moFicha');
  const tit = (await page.locator('#moTitulo').innerText()).trim();
  ok(tit === 'Leonilde Barroca (Finerge)', tag + ' cabeçalho «' + tit + '»');
  ok(await page.locator('#moTitulo a[data-mo-org="empresa:finerge"]').count() === 1, tag + ' empresa do cabeçalho é link');
  ok(await page.locator('#moQual .mo-col').count() === 3, tag + ' qualidades em 3 colunas');
  ok(await page.locator('#moQual h3, #moQual h4, #moQual .mo-glabel').count() === 0, tag + ' colunas sem títulos');
  const q1 = await page.locator('#moQual .mo-q').count();
  ok(q1 > 0, tag + ' qualidades escondidas com «?» (' + q1 + ')');
  const ficha = await visText(page);
  ok(!/rival|pechinch|\bnota\b|média|referência de mercado|equipa/i.test(ficha), tag + ' sem rival, pechincha, nota, referência ou equipa');
  const acoes = (await page.locator('#moAcoes button').allInnerTexts()).map((s) => s.trim());
  ok(acoes.join('|') === 'Pedir relatório', tag + ' Ações só com Pedir relatório');
  ok(!/contratar|proposta|renovar|salário|€/i.test(ficha), tag + ' sem contratar/propostas/salários/€');
  const blue = await page.locator('#moPedir').evaluate((el) => getComputedStyle(el).backgroundColor);
  ok(blue === 'rgb(0, 122, 255)', tag + ' botão #007AFF');
  if (width === 390) await page.screenshot({ path: path.join(SHOTS390, 'leonilde-ficha-390.png'), fullPage: false });

  // Relatório: pedir, avançar um mês no jogo, ver tudo
  await page.locator('#moPedir').click();
  ok(/Relatório pedido/.test(await page.locator('#moRep').innerText()), tag + ' relatório pedido');
  const saved = await page.evaluate(() => { const id = localStorage.getItem('watt.saves.active'); return id ? JSON.parse(localStorage.getItem('watt.save.slot.' + id) || 'null') : null; });
  await page.locator('#moInicio').click();
  ok(await page.locator('#motorPanel[hidden]').count() === 1, tag + ' ⌂ Início fecha o motor');
  const m0 = await page.evaluate(() => (window.WattTest && window.WattTest.mailLoopMonth) ? window.WattTest.mailLoopMonth() : null);
  const fab = page.locator('#btnNextQ:visible, #btnNextQMobile:visible').first();
  await fab.click();
  await page.waitForTimeout(2500);
  await page.locator('#btnMotor').click();
  await page.locator('#moLista [data-mo-pessoa="pessoas-l1"]').click();
  await page.waitForSelector('#moFicha');
  ok(/Relatório recebido/.test(await page.locator('#moFicha').innerText()), tag + ' relatório chega depois de avançar um mês');
  ok(await page.locator('#moQual .mo-q').count() === 0, tag + ' relatório revela todas as qualidades');
  const st = await page.evaluate(() => window.WIMotor.exportState());
  ok(st.done && st.done['p:pessoas-l1'] === true, tag + ' estado do relatório no save');
  // persiste no save
  await page.waitForTimeout(1200);
  const inSave = await page.evaluate(() => { const id = localStorage.getItem('watt.saves.active'); const b = JSON.parse(localStorage.getItem('watt.save.slot.' + id) || 'null'); return b && b.motor; });
  ok(inSave && (inSave.done['p:pessoas-l1'] || (inSave.reps && inSave.reps['p:pessoas-l1'] != null)), tag + ' relatório guardado no save');

  // Trava de 12 meses (valores de pessoas.json)
  const lim = await page.evaluate(() => fetch('content/data/pessoas.json').then((r) => r.json()).then((d) => d.limites_relatorio));
  ok(await page.locator('#moPedir').isDisabled(), tag + ' mesmo alvo bloqueado depois do relatório');
  const esperado = await page.evaluate((m) => { const st = window.WIMotor.exportState(); return 'Novo relatório disponível em ' + window.__wiMonthLabel(st.last['p:pessoas-l1'].at + m) + '.'; }, lim.repetir_mesmo_alvo_meses);
  const nota = (await page.locator('#moRepNota').innerText()).trim();
  ok(nota === esperado && /^Novo relatório disponível em (janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro) de \d{4}\.$/.test(nota), tag + ' nota da trava «' + nota + '»');
  await page.evaluate(() => window.WIMotor.setTrabalhaEm('pessoas-l1', 'empresa:akuo'));
  ok(!(await page.locator('#moPedir').isDisabled()) && /\(Akuo\)/.test(await page.locator('#moTitulo').innerText()), tag + ' trava levanta quando o «Trabalha em» muda');
  await page.evaluate(() => window.WIMotor.setTrabalhaEm('pessoas-l1', 'empresa:finerge'));
  ok(await page.locator('#moPedir').isDisabled(), tag + ' trava volta quando regressa à mesma empresa');
  // Limite de relatórios em curso
  const cont0 = (await page.locator('#moContador').innerText()).trim();
  ok(cont0 === '0/' + lim.max_em_curso + ' em curso', tag + ' contador «' + cont0 + '»');
  await page.locator('#moVoltar').click();
  const alvos = ['pessoas-1', 'pessoas-2', 'pessoas-x1', 'pessoas-x2'];
  for (let i = 0; i < alvos.length; i++) {
    await page.locator('[data-mo-sec="quadros"]').click();
    await page.locator('#moLista [data-mo-pessoa="' + alvos[i] + '"]').click();
    await page.waitForSelector('#moFicha');
    if (i < lim.max_em_curso) {
      await page.locator('#moPedir').click();
      const c = (await page.locator('#moContador').innerText()).trim();
      ok(c === (i + 1) + '/' + lim.max_em_curso + ' em curso', tag + ' contador sobe para ' + c);
    } else {
      ok(await page.locator('#moPedir').isDisabled(), tag + ' 4.º relatório desativado');
      ok((await page.locator('#moRepNota').innerText()).trim() === 'Já tens ' + lim.max_em_curso + ' relatórios em curso. Espera que um termine.', tag + ' nota do limite');
      if (width === 390) await page.screenshot({ path: path.join(OUT, 'limite-390.png') });
    }
    await page.locator('#moVoltar').click();
  }
  await page.locator('#moLista [data-mo-pessoa="pessoas-l1"]').click();
  // Cabeçalho → plantel do promotor
  await page.locator('#moTitulo a[data-mo-org]').click();
  await page.waitForSelector('#moPlantel');
  ok(await page.locator('#moPlantel [data-mo-pessoa="pessoas-l1"]').count() === 1, tag + ' plantel da Finerge tem a Leonilde');
  if (width === 390) await page.screenshot({ path: path.join(SHOTS390, 'plantel-promotor-390.png') });
  await page.locator('#moVoltar').click();
  ok(await page.locator('#moFicha').count() === 1, tag + ' ‹ Voltar regressa à ficha');

  // Livre
  await page.locator('#moVoltar').click(); await page.locator('#moVoltar').click();
  await page.locator('#btnMotor').click().catch(() => {});
  if (await page.locator('#motorPanel[hidden]').count()) await page.locator('#btnMotor').click();
  await page.locator('#moLista [data-mo-pessoa="pessoas-1"]').click();
  const tl = (await page.locator('#moTitulo').innerText()).trim();
  ok(tl === 'Teresa Valadares (Livre)' && await page.locator('#moTitulo a').count() === 0, tag + ' «(Livre)» sem link');
  await page.locator('#moVoltar').click();

  // Interlocutores: 2 colunas, sem relatório
  await page.locator('[data-mo-sec="interlocutores"]').click();
  await page.locator('#moLista [data-mo-pessoa="figuras-g1"]').click();
  ok((await page.locator('#moTitulo').innerText()).trim() === 'Graça Lobeira (DGEG)', tag + ' Graça Lobeira (DGEG)');
  ok(await page.locator('#moQual .mo-col').count() === 2, tag + ' interlocutor em 2 colunas');
  ok(await page.locator('#moPedir').count() === 0 && await page.locator('#moAcoes').count() === 0, tag + ' interlocutor sem relatório nem ações');
  await page.locator('#moVoltar').click();

  // Banco: relatório
  await page.locator('[data-mo-sec="bancos"]').click();
  const bancos = await page.locator('#moLista .mo-nome').count();
  ok(bancos >= 4, tag + ' bancos reais (' + bancos + ')');
  await page.locator('#moLista [data-mo-org="entidade:banco-cgd"]').click();
  ok(await page.locator('#moOrg #moPedir').count() === 1, tag + ' banco tem Pedir relatório');
  await page.locator('#moVoltar').click();
  for (const sec of ['promotores', 'publicas', 'rede']) {
    await page.locator('[data-mo-sec="' + sec + '"]').click();
    const first = page.locator('#moLista [data-mo-org]').first();
    await first.click();
    ok(await page.locator('#moOrg').count() === 1 && await page.locator('#moOrg #moPedir').count() === 0, tag + ' ' + sec + ' abre plantel, sem relatório');
    await page.locator('#moVoltar').click();
  }
  await page.locator('[data-mo-sec="promotores"]').click();
  ok(/Sol do Sado/.test(await visText(page)), tag + ' promotores incluem a empresa do jogador');
  await page.locator('[data-mo-sec="fornecedores"]').click();
  ok(/Gabinete Traço Fino/.test(await visText(page)), tag + ' projetistas dentro de Fornecedores');
  // Sem rival/pechincha em nenhuma secção
  let all = '';
  for (const s of ['quadros', 'consultores', 'interlocutores', 'promotores', 'publicas', 'rede', 'bancos', 'fornecedores', 'ppa']) { await page.locator('[data-mo-sec="' + s + '"]').click(); all += await visText(page); }
  ok(!/rival|pechinch|barato/i.test(all), tag + ' nenhuma secção diz rival/pechincha');
  const sw = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  ok(sw, tag + ' sem scroll horizontal');
  await page.keyboard.press('Escape');
  ok(await page.locator('#motorPanel[hidden]').count() === 1, tag + ' Esc fecha');
  // Plantel (Trabalha em = jogador): tudo visível, sem relatório; continua revelado depois de sair
  await page.evaluate(() => window.WIMotor.openPessoa('pessoas-p2')); await page.waitForSelector('#moFicha');
  ok(await page.locator('#moQual .mo-q').count() === 0 && await page.locator('#moFicha #moPedir').count() === 0, tag + ' plantel: qualidades visíveis e sem «Pedir relatório»');
  ok(/k€\/ano/.test(await page.locator('#moSalario').innerText()), tag + ' plantel: salário na ficha');
  await page.evaluate(() => window.WIMotor.setTrabalhaEm('pessoas-p2', 'livre'));
  ok(await page.locator('#moQual .mo-q').count() === 0 && await page.locator('#moSalario').count() === 0, tag + ' saiu: continua revelado, sem salário');
  ok(!!(await page.evaluate(() => window.WIMotor.exportState())).done['p:pessoas-p2'], tag + ' saiu: revelado fica no save');
  await page.evaluate(() => window.WIMotor.setTrabalhaEm('pessoas-p2', 'jogador'));
  await page.keyboard.press('Escape');
  // Novo jogo na mesma sessão limpa o motor
  ok(Object.keys((await page.evaluate(() => window.WIMotor.exportState())).reps).length > 0, tag + ' há relatórios antes do novo jogo');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__wattQA.startMenu());
  await page.locator('[data-menu="novo"]').click();
  await page.waitForSelector('#arranque[data-step="jogador"] #arranqueNext');
  await page.locator('#arranqueNext').click();
  await page.waitForSelector('#arranque[data-step="pais"]');
  await page.locator('#arranqueNext').click();
  await page.waitForSelector('#arranque[data-step="empresa"]', { timeout: 15000 });
  await page.locator('#arranqueNext').click();
  await page.waitForSelector('#arranque[data-step="ficha"]');
  await page.locator('#arranqueNext').click();
  await page.waitForSelector('#arranqueConfirm.open #arranqueConfirmYes');
  await page.locator('#arranqueConfirmYes').click();
  await page.waitForSelector('#inboxDrawer.open', { timeout: 15000 });
  const st2 = await page.evaluate(() => window.WIMotor.exportState());
  ok(!Object.keys(st2.reps).length && Object.keys(st2.done).every((k) => ['p:pessoas-p1', 'p:pessoas-p2', 'p:pessoas-p3'].includes(k)) && !Object.keys(st2.last).length && !Object.keys(st2.onde).length, tag + ' novo jogo limpa relatórios e trava');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.WIMotor.open());
  await page.waitForSelector('#motorPanel:not([hidden]) #moLista');
  ok((await page.locator('#moContador').innerText()).trim() === '0/' + lim.max_em_curso + ' em curso' && await page.locator('#moFicha').count() === 0, tag + ' novo jogo: contador a zero e motor no início');
  await page.close();
}

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' });
try {
  await run(browser, 1440, 900);
  await run(browser, 390, 844);
} finally { await browser.close(); }
ok(errors.length === 0, 'sem erros na consola' + (errors.length ? ': ' + errors.join(' | ') : ''));
console.log('\n' + pass + ' OK, ' + fails.length + ' falhas');
if (fails.length) { console.log('FALHAS:\n' + fails.join('\n')); process.exit(1); }
