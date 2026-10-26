/**
 * Home: «O meu plantel» + «Os meus ativos» + «Prazos do contrato» na sala do ativo.
 *   WATT_BASE=http://127.0.0.1:<porta>/index.html node test/home-plantel-ativos.mjs
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
const OUT = process.env.HOME_SHOTS || process.env.WATT_SHOTS || '/opt/cursor/artifacts/screenshots';
fs.mkdirSync(OUT, { recursive: true });
let pass = 0; const fails = []; const errors = [];
function ok(c, l) { if (c) { pass++; console.log('OK  ', l); } else { fails.push(l); console.log('FAIL', l); } }
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesTxt = (n) => { const t = 2027 * 12 + n; return MESES[t % 12] + ' de ' + Math.floor(t / 12); }; // mês 0 do Correio = janeiro de 2027

function blob() {
  return { v: 1, savedAt: '2026-10-26T10:00:00.000Z',
    state: { quarter: 1, year: 2027, caixa: 3.2, divida: 0, nav: 4, auctionWon: true, activeNodeId: 'ourique', minimized: [] },
    auctionState: { wonId: 'ourique', wonLots: ['ourique'], wave: 0 },
    mailLoop: { active: true, seId: 'ourique', month: 1, projectPhase: 'trc_won' },
    mailState: { items: [], view: 'list', activeId: null, open: false },
    mandateState: { tier: 'boutique', acknowledged: true, letterRead: true, skip: false },
    player: { nomeProprio: 'Ana', apelido: 'Ferreira', nomeEmpresa: 'Sol do Sado', nacionalidade: 'Portuguesa', pais: 'portugal' },
    flags: { onboardingDone: true } };
}
async function intoGame(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('watt.save.v1', s); localStorage.setItem('wi.arranque.nomeEmpresa', 'Sol do Sado'); }, JSON.stringify(blob()));
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-menu="carregar"]').click();
  await page.waitForSelector('#startModal .slot');
  await page.locator('#startModal .slot button', { hasText: 'Continuar' }).first().click();
  await page.waitForFunction(() => !document.body.classList.contains('at-menu'), null, { timeout: 15000 });
  await page.waitForSelector('#homePa:not([hidden]) #homePlantelT tr', { timeout: 15000 });
}

async function run(browser, width, height) {
  const tag = String(width);
  const data = JSON.parse(fs.readFileSync(new URL('../content/data/home-plantel-ativos.json', import.meta.url)));
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', (e) => errors.push(tag + ' pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(tag + ' console: ' + m.text()); });
  await intoGame(page);
  if (width === 390) {
    await page.waitForTimeout(600);
    const cov = await page.evaluate(() => ['homeDisponivel', 'homeCustoFixo'].map((id) => {
      const e = document.getElementById(id); const r = e.getBoundingClientRect();
      const inView = r.top >= 0 && r.bottom <= innerHeight;
      const pts = [[r.left + 2, r.top + r.height / 2], [(r.left + r.right) / 2, r.top + r.height / 2], [r.right - 2, r.top + r.height / 2]];
      const bad = pts.map(([x, y]) => document.elementFromPoint(x, y)).filter((t) => !t || !e.contains(t)).map((t) => t ? (t.id || t.className) : 'fora');
      return { id, inView, bad };
    }));
    for (const c of cov) ok(c.inView && !c.bad.length, tag + ' ' + c.id + ' visível e sem «Continuar» por cima na abertura ' + JSON.stringify(c.bad));
    await page.screenshot({ path: path.join(OUT, 'viewport-390-abertura.png') });
  }
  const pl = (await page.locator('#homePlantel').innerText()).replace(/\s+/g, ' ');
  ok(/O MEU PLANTEL|O meu plantel/i.test(pl) && /OS MEUS ATIVOS|Os meus ativos/i.test(await page.locator('#homeAtivos').innerText()), tag + ' blocos plantel e ativos');
  for (const q of data.plantel.quadros) ok(pl.includes(q.e_o_jogador ? q.nome + ' (tu)' : q.nome) && pl.includes(q.cargo), tag + ' plantel tem ' + q.nome);
  const folha = data.plantel.quadros.reduce((a, q) => a + q.salario_keur_ano, 0);
  const disp = (await page.locator('#homeDisponivel').innerText()).replace(/\s+/g, ' ');
  ok(disp.startsWith((data.plantel.teto_keur_ano - folha).toLocaleString('pt-PT') + ' k€/ano'), tag + ' Disponível = teto − folha (' + disp + ')');
  const cf = (await page.locator('#homeCustoFixo').innerText()).replace(/\s+/g, ' ');
  ok(cf.startsWith((folha * data.plantel.fator_custo_fixo / 1000).toFixed(2).replace('.', ',') + ' M€/ano'), tag + ' custo fixo = folha × fator (' + cf + ')');
  const vagas = (await page.locator('#homePlantelT .home-pa-vaga').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
  ok(vagas.length === 2 && /Por contratar Técnica/.test(vagas[0]) && /Por contratar Institucional/.test(vagas[1]), tag + ' vagas Técnica e Institucional');
  ok(/HIPÓTESE/.test(pl), tag + ' valores marcados HIPÓTESE');
  // Ativos: estado real (Ourique, TRC ganho)
  const at = (await page.locator('#homeAtivosT').innerText()).replace(/\s+/g, ' ');
  const realName = await page.evaluate(() => window.__wattQA.nodes.find((n) => n.id === 'ourique').name);
  ok(at.includes(realName) && (await page.locator('#homeAtivosT [data-home-ativo]').count()) === 1, tag + ' ativo real: ' + realName);
  const m0 = 'Próximo marco: garantir os terrenos e provar à DGEG, até ' + mesTxt(data.prazos_contrato.meses_apos_trc.pecas_terrenos) + '.';
  // Prazo do motor aberto (land_option): mesmo rótulo e data que o cartão de Ourique
  const eng = await page.evaluate(() => { const ml = window.__wattQA.mail; const d = ml.deadlines && ml.deadlines.land_option; return d ? { at: d.atMonth, clock: ml.month | 0, fired: !!(ml.firedDeadlines || {}).land_option } : null; });
  ok(eng && !eng.fired, tag + ' land_option aberto no motor');
  const card = (await page.locator('.node-card .hud-next-crit').first().innerText()).replace(/\s+/g, ' ').trim();
  ok(at.includes('TRC ganho') && at.includes(card) && /^Próximo prazo: Prazo do terreno · /.test(card), tag + ' prazo aberto igual ao cartão: ' + card);
  ok(!at.includes(m0), tag + ' com prazo aberto não mostra a data do GM');
  // Cumprido: volta ao texto do GM com TRC+9
  await page.evaluate(() => { const ml = window.__wattQA.mail; ml.firedDeadlines = Object.assign({}, ml.firedDeadlines, { land_option: true }); window.__wattQA.renderHome(); });
  const at2 = (await page.locator('#homeAtivosT').innerText()).replace(/\s+/g, ' ');
  ok(at2.includes(m0) && !/Prazo do terreno/.test(at2), tag + ' cumprido: volta a «' + m0 + '»');
  // Fechado (já não existe no motor): também volta ao texto do GM
  await page.evaluate(() => { const ml = window.__wattQA.mail; delete ml.deadlines.land_option; delete ml.firedDeadlines.land_option; window.__wattQA.renderHome(); });
  ok((await page.locator('#homeAtivosT').innerText()).replace(/\s+/g, ' ').includes(m0), tag + ' fechado: texto do GM com TRC+9');
  if (width === 390 || width === 1440) await page.screenshot({ path: path.join(OUT, 'home-' + tag + '.png'), fullPage: true });
  // Fases: PIP e AIA sem data; LP e obras na mesma fase
  const marco = async (phase, tags) => {
    await page.evaluate(([p, t]) => { const ml = window.__wattQA.mail; ml.projectPhase = p; ml.tags = Object.assign({}, ml.tags || {}, t || {}); window.__wattQA.renderHome(); }, [phase, tags]);
    return (await page.locator('#homeAtivosT').innerText()).replace(/\s+/g, ' ');
  };
  let t = await marco('land');
  ok(/pedir à câmara a informação prévia \(PIP\)\./.test(t) && !/PIP\), até/.test(t), tag + ' PIP sem data');
  t = await marco('pip');
  ok(/entregar o pedido de avaliação ambiental\./.test(t) && !/ambiental, até/.test(t), tag + ' pedido ambiental sem data');
  t = await marco('aia');
  ok(/Pedido de licença/.test(t) ? /pedir a Licença de Produção à DGEG/.test(t) : (/Avaliação ambiental/.test(t) && /obter a decisão ambiental\./.test(t)), tag + ' fase aia: rota sem AIA ou decisão ambiental');
  t = await marco('aia', { env_path_aia_obrigatoria: 1, aia_sujeito: 1, apa_track_start: 1 });
  ok(/Avaliação ambiental/.test(t) && /obter a decisão ambiental\./.test(t) && !/decisão ambiental, até/.test(t), tag + ' AIA completa sem data');
  t = await marco('aia', { lp_request_submitted: 1 });
  ok(/Licença de produção/.test(t) && t.includes('obter a Licença de Produção, até ' + mesTxt(data.prazos_contrato.meses_apos_trc.pecas_lp)), tag + ' LP: passo 1 da fase Licença de produção');
  t = await marco('licenca_producao', { lp_request_submitted: 1 });
  ok(/Licença de produção/.test(t) && t.includes('obter a licença de obras e começar a construir, até ' + mesTxt(data.prazos_contrato.meses_apos_trc.pecas_obras)), tag + ' licença de obras: passo 2 da mesma fase');
  t = await marco('cod');
  ok(/Próximo marco: nenhum\. Tudo em dia\./.test(t), tag + ' em operação');
  await marco('trc_won');
  // Nome → ficha no motor
  await page.locator('#homePlantelT [data-home-pessoa="pessoas-p1"]').click();
  await page.waitForSelector('#motorPanel:not([hidden]) #moFicha');
  ok((await page.locator('#moTitulo').innerText()).trim() === 'Rui Matos (Sol do Sado)', tag + ' Rui Matos abre a ficha no motor');
  await page.screenshot({ path: path.join(OUT, 'ficha-plantel-' + tag + '.png') });
  await page.locator('#moInicio').click();
  await page.locator('#homePlantelT [data-home-jogador]').click();
  await page.waitForSelector('#moOrg');
  ok(/Sol do Sado/.test(await page.locator('#moOrg h2').innerText()) && (await page.locator('#moPlantel [data-mo-pessoa]').count()) === 3, tag + ' Ana abre a empresa do jogador (3 quadros)');
  await page.locator('#moInicio').click();
  // Ativo → sala do ativo
  await page.locator('#homeAtivosT [data-home-ativo="ourique"]').click();
  await page.waitForSelector('#assetRoom.open #assetPrazosContrato');
  const rows = (await page.locator('#assetPrazosContrato tr').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
  ok(rows.length === 4, tag + ' 4 prazos do contrato');
  ok(rows.every((x) => /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(x)), tag + ' cada linha começa por maiúscula: ' + rows.join(' | '));
  ok(rows[0].endsWith(mesTxt(data.prazos_contrato.meses_apos_trc.pecas_terrenos)) && rows[3].endsWith(mesTxt(data.prazos_contrato.meses_apos_trc.le_deadline)), tag + ' datas dos prazos a partir do TRC');
  await page.locator('#assetPrazosContrato').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, 'sala-ativo-' + tag + '.png') });
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), tag + ' sem scroll horizontal');
  await page.close();
}
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome' });
try { await run(browser, 1440, 900); await run(browser, 390, 844); } finally { await browser.close(); }
ok(errors.length === 0, 'sem erros na consola' + (errors.length ? ': ' + errors.join(' | ') : ''));
console.log('\n' + pass + ' OK, ' + fails.length + ' falhas');
if (fails.length) process.exit(1);
