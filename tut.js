/* Watt Indeferido · dicas (tutorial v0.1).
 * Copy: content/events/tutorial.v01.json (manifest key "tutorial").
 * One tip at a time. Dimmed screen, clickable cut-out, arrow on the bubble.
 * Seen steps and the on/off flag live in localStorage and in watt.save.v1. */
(function () {
  'use strict';
  const LS = 'watt-tut-v01';
  const api = () => window.__tutApi || {};
  const qs = new URLSearchParams(location.search);
  let DATA = null;
  let ready = null;
  let st = { off: false, seen: {}, welcomeDone: false };
  try {
    const j = JSON.parse(localStorage.getItem(LS) || 'null');
    if (j && typeof j === 'object') st = Object.assign(st, j);
  } catch (_) {}
  if (window.__tutSaved && typeof window.__tutSaved === 'object') st = Object.assign(st, window.__tutSaved);

  const queue = [];
  let cur = null;
  let root = null;
  let targetEl = null;
  let welcomeEl = null;
  let welcomePending = false;

  function persist() {
    try { localStorage.setItem(LS, JSON.stringify(exportState())); } catch (_) {}
    try { if (api().save) api().save(); } catch (_) {}
    syncSettings();
  }
  function exportState() {
    return { off: !!st.off, seen: Object.assign({}, st.seen), welcomeDone: !!st.welcomeDone };
  }
  function importState(raw) {
    if (!raw || typeof raw !== 'object') return;
    st = { off: !!raw.off, seen: Object.assign({}, raw.seen || {}), welcomeDone: !!raw.welcomeDone };
    if (st.off) {
      queue.length = 0;
      dismissTip();
    }
    syncSettings();
    try { localStorage.setItem(LS, JSON.stringify(exportState())); } catch (_) {}
  }

  ready = loadData();
  function loadData() {
    const base = 'content/events';
    return fetch(base + '/manifest.json').then((r) => r.ok ? r.json() : {}).catch(() => ({})).then((man) => {
      const rel = man && typeof man.tutorial === 'string' ? man.tutorial : 'tutorial.v01.json';
      return fetch(base + '/' + rel.replace(/^\//, ''));
    }).then((r) => {
      if (!r.ok) throw new Error('tutorial ' + r.status);
      return r.json();
    }).then((j) => { DATA = j; return j; }).catch((err) => {
      console.warn('[tut] conteúdo', err && err.message ? err.message : err);
      DATA = DATA || { welcome: { title: 'Watt Indeferido', lines: [], buttons: [] }, steps: [] };
      return DATA;
    });
  }

  function visible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    let p = el;
    while (p && p !== document.body) {
      const c = getComputedStyle(p);
      if (c.display === 'none' || c.visibility === 'hidden' || Number(c.opacity) === 0) return false;
      p = p.parentElement;
    }
    return true;
  }
  function find(name) {
    return Array.prototype.slice.call(document.querySelectorAll('[data-tut="' + name + '"]')).find(visible) || null;
  }
  function currentScreen() {
    const a = api();
    const sala = a.salaOpen && a.salaOpen();
    const auction = a.auctionOpen && a.auctionOpen();
    const inbox = a.inboxOpen && a.inboxOpen();
    // The asset room paints above the auction. Correio paints above the asset room.
    if (sala) return inbox ? 'correio' : 'sala';
    if (auction) return 'auction';
    if (inbox) return 'correio';
    return 'home';
  }
  function goHome() {
    const a = api();
    if (a.auctionOpen && a.auctionOpen()) a.closeAuction();
    if (a.inboxOpen && a.inboxOpen()) a.closeInbox();
    if (a.salaOpen && a.salaOpen()) a.closeSala();
  }
  function opener(name) {
    const a = api();
    if (name.indexOf('auction.') === 0 || name === 'trc.accept' || name === 'npv.note') {
      if (!a.auctionOpen || !a.auctionOpen()) a.openAuction();
      return;
    }
    if (name === 'correio.first_choice') {
      if (!a.inboxOpen || !a.inboxOpen()) a.openInbox();
      const items = (a.mailItems && a.mailItems()) || [];
      const withChoice = (m) => m && !m.econChoiceId && Array.isArray(m.choices) && m.choices.length;
      const L = items.find((m) => withChoice(m) && !m.read) || items.find(withChoice);
      if (L && a.openLetter) a.openLetter(L.id);
      return;
    }
    if (name.indexOf('sala.') === 0) {
      if (!a.salaOpen || !a.salaOpen()) {
        if (a.auctionOpen && a.auctionOpen()) a.closeAuction();
        if (a.inboxOpen && a.inboxOpen()) a.closeInbox();
        if (a.openSala) a.openSala();
      }
      return;
    }
    goHome();
  }
  function screenOf(name) {
    if (name.indexOf('auction.') === 0 || name === 'trc.accept' || name === 'npv.note') return 'auction';
    if (name === 'correio.first_choice') return 'correio';
    if (name.indexOf('sala.') === 0 && name !== 'sala.open') return 'sala';
    if (name.indexOf('hud.') === 0 && api().salaOpen && api().salaOpen()) return 'sala';
    return 'home';
  }
  function sameScreen(name) { return !!name && screenOf(name) === currentScreen(); }
  /* Something the player can actually see: on this screen, in the viewport, not under another room. */
  function exposed(el) {
    if (!visible(el)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (r.bottom <= 1 || r.top >= innerHeight - 1 || r.right <= 1 || r.left >= innerWidth - 1) return false;
    const x = Math.max(0, Math.min(innerWidth - 1, r.left + r.width / 2));
    const y = Math.max(0, Math.min(innerHeight - 1, r.top + Math.min(r.height / 2, 36)));
    let stack;
    try { stack = document.elementsFromPoint(x, y); } catch (_) { return true; }
    if (!stack || !stack.length) return false;
    for (let i = 0; i < stack.length; i++) {
      const n = stack[i];
      if (!n || n === document.documentElement || n === document.body) continue;
      if (root && root.contains(n)) continue;
      if (n === el || el.contains(n)) return true;
      let cs;
      try { cs = getComputedStyle(n); } catch (_) { return false; }
      if (!cs || cs.pointerEvents === 'none' || cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      return false;
    }
    return false;
  }
  const PHASE_RANK = { trc_won: 0, land: 1, pip: 2, aia: 3, licenca_producao: 4, obra: 5, cod: 6 };
  function phasePassed(s) {
    const t = (s && s.trigger) || {};
    if (!t.phase || t.phase === 'trc_won') return false;
    const p = (api().phase && api().phase()) || '';
    if (!p || p === t.phase) return false;
    const pi = PHASE_RANK[p], ti = PHASE_RANK[t.phase];
    if (pi == null || ti == null) return false;
    return pi > ti;
  }
  const holdOff = {};
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function resolve(name) {
    if (!sameScreen(name)) return null;
    // Open the letter only when Correio is already the screen. Never switch rooms to force a tip.
    if (name === 'correio.first_choice' && !find(name)) {
      for (let i = 0; i < 8 && !find(name); i++) {
        if (!sameScreen(name)) return null;
        try { opener(name); } catch (e) { console.info('[tut] opener', name, e && e.message); }
        await wait(150);
      }
    }
    let el = find(name);
    const FB = { 'hud.value': ['npv.cause', 'sala.open'], 'hud.cod_date': ['deadlines'] };
    if (!el) (FB[name] || []).some((n) => { if (!sameScreen(n)) return false; el = find(n); return !!el; });
    if (el && !exposed(el)) {
      try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (_) {}
      await wait(60);
      if (!sameScreen(name) || !exposed(el)) el = null;
    }
    return el && exposed(el) ? el : null;
  }

  function phaseOk(s) {
    const t = s.trigger || {};
    if (t.phase) {
      const p = (api().phase && api().phase()) || '';
      // trc_won stays true after the project moves on (land, pip, …).
      if (t.on !== 'phase' && p !== t.phase && !(t.phase === 'trc_won' && p)) return false;
    }
    if (t.min_month && ((api().month && api().month()) || 0) < t.min_month) return false;
    return true;
  }
  /* An earlier first_open on another screen still ahead of this one: show that first
   * (Correio choice before Play, Play before the land letter). */
  function earlierScreenPending(s) {
    const t = s.trigger || {};
    if (t.on !== 'first_open') return false;
    return (DATA.steps || []).some((e) => {
      if (!e || e.order >= s.order || st.seen[e.id]) return false;
      const et = e.trigger || {};
      if (et.on !== 'first_open' || et.screen === t.screen) return false;
      if (queue.indexOf(e) !== -1 || cur === e) return true;
      return phaseOk(e);
    });
  }
  function toastUp() {
    const t = document.getElementById('toast');
    return !!(t && t.classList.contains('show'));
  }
  function welcomeUp() { return !!(welcomeEl && welcomeEl.isConnected); }

  function holdClock(on) {
    const next = !!on;
    if (window.__tutOpen === next) {
      if (next) { try { if (api().syncClock) api().syncClock(); } catch (_) {} }
      return;
    }
    window.__tutOpen = next;
    try { if (api().syncClock) api().syncClock(); } catch (_) {}
  }
  function targetWaiting(s) {
    if (!s || st.seen[s.id] || phasePassed(s) || earlierScreenPending(s)) return false;
    if (holdOff[s.id] && Date.now() < holdOff[s.id]) return false;
    return !!(s.target && sameScreen(s.target) && find(s.target));
  }
  function refreshClockHold() {
    const showable = queue.some(targetWaiting);
    holdClock(!!(cur || welcomeUp() || showable));
  }
  function dropPassed() {
    let dropped = false;
    for (let i = queue.length - 1; i >= 0; i--) {
      if (!phasePassed(queue[i])) continue;
      st.seen[queue[i].id] = 1;
      queue.splice(i, 1);
      dropped = true;
    }
    if (dropped) persist();
  }
  function requeue(s) {
    if (!s || st.seen[s.id]) return;
    holdOff[s.id] = Date.now() + 600;
    if (queue.indexOf(s) === -1) {
      queue.push(s);
      queue.sort((a, b) => a.order - b.order);
    }
  }

  function emit(kind, val) {
    if (!DATA) { ready.then(() => emit(kind, val)); return; }
    if (st.off || welcomeUp()) return;
    let added = false;
    (DATA.steps || []).forEach((s) => {
      const t = s.trigger || {};
      if (st.seen[s.id] || queue.indexOf(s) !== -1 || cur === s) return;
      let hit = false;
      if (kind === 'open' && t.on === 'first_open' && t.screen === val) hit = phaseOk(s);
      else if (kind === 'effect' && t.on === 'first_effect' && t.effect === val) hit = true;
      else if (kind === 'tag' && t.on === 'first_tag' && t.tag === val) hit = true;
      else if (kind === 'phase' && t.on === 'phase' && t.phase === val) hit = true;
      if (hit) { queue.push(s); added = true; }
    });
    if (added) queue.sort((a, b) => a.order - b.order);
    refreshClockHold();
    pump();
  }

  let pumping = false;
  async function pump() {
    if (cur || pumping || !queue.length || st.off || welcomeUp()) return;
    dropPassed();
    const s = queue.find(targetWaiting);
    if (!s) { refreshClockHold(); return; }
    pumping = true;
    for (let i = 0; i < 40 && toastUp(); i++) await wait(250);
    pumping = false;
    if (cur || st.off || welcomeUp() || !targetWaiting(s)) { refreshClockHold(); return; }
    const idx = queue.indexOf(s);
    if (idx !== -1) queue.splice(idx, 1);
    show(s);
  }

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function build() {
    root = el('div', 'tut-root');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'false');
    root.innerHTML = '<div class="tut-dim" data-p="t"></div><div class="tut-dim" data-p="l"></div><div class="tut-dim" data-p="r"></div><div class="tut-dim" data-p="b"></div><div class="tut-ring"></div>' +
      '<div class="tut-bubble" role="status" aria-live="polite"><div class="tut-arrow"></div><div class="tut-title"></div><div class="tut-body"></div>' +
      '<div class="tut-actions"><button type="button" class="tut-off">Desligar dicas</button><button type="button" class="tut-ok">Percebi</button></div></div>';
    document.body.appendChild(root);
    root.querySelector('.tut-ok').addEventListener('click', () => done(false));
    root.querySelector('.tut-off').addEventListener('click', () => done(true));
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
  }
  function parkTip() {
    const s = cur;
    cur = null;
    targetEl = null;
    if (root) root.classList.remove('open');
    if (!s) { refreshClockHold(); return; }
    if (phasePassed(s)) { st.seen[s.id] = 1; persist(); }
    else requeue(s);
    refreshClockHold();
  }
  setInterval(() => {
    if (st.off || welcomeUp()) return;
    if (cur) {
      const still = cur.target && sameScreen(cur.target) && targetEl && exposed(targetEl);
      if (still) { place(); return; }
      const again = cur.target && sameScreen(cur.target) ? find(cur.target) : null;
      if (again && exposed(again)) { targetEl = again; place(); return; }
      parkTip();
      return;
    }
    if (queue.length) pump();
  }, 400);
  function dismissTip() {
    cur = null;
    targetEl = null;
    if (root) root.classList.remove('open');
    refreshClockHold();
  }
  async function show(s) {
    cur = s;
    holdClock(true);
    targetEl = await resolve(s.target);
    if (cur !== s) return;
    if (!targetEl || !sameScreen(s.target) || !exposed(targetEl)) {
      cur = null;
      targetEl = null;
      if (phasePassed(s)) { st.seen[s.id] = 1; persist(); }
      else requeue(s);
      refreshClockHold();
      return;
    }
    if (!root) build();
    root.querySelector('.tut-title').textContent = s.title || '';
    root.querySelector('.tut-body').textContent = s.body || '';
    root.dataset.step = s.id;
    root.dataset.target = s.target;
    root.dataset.found = '1';
    root.classList.add('open');
    place();
  }
  function done(off) {
    if (!cur) return;
    st.seen[cur.id] = 1;
    if (off) { st.off = true; queue.length = 0; }
    cur = null;
    targetEl = null;
    if (root) root.classList.remove('open');
    refreshClockHold();
    persist();
    setTimeout(pump, 250);
  }

  function rect(e) { return e && e.getBoundingClientRect(); }
  function inter(a, b) {
    if (!a || !b) return 0;
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0 && h > 0 ? w * h : 0;
  }
  function avoidRects() {
    const out = [];
    const t = document.getElementById('toast');
    if (t && t.classList.contains('show')) out.push(rect(t));
    Array.prototype.forEach.call(document.querySelectorAll('.auction-actions'), (b) => {
      if (visible(b) && !(targetEl && b.contains(targetEl))) out.push(rect(b));
    });
    return out;
  }
  function place() {
    if (!root || !cur) return;
    const vw = innerWidth, vh = innerHeight, P = 6, G = 14;
    const bub = root.querySelector('.tut-bubble');
    const arrow = root.querySelector('.tut-arrow');
    const tr = targetEl && visible(targetEl) ? rect(targetEl) : null;
    const hole = tr ? {
      left: Math.max(0, tr.left - P), top: Math.max(0, tr.top - P),
      right: Math.min(vw, tr.right + P), bottom: Math.min(vh, tr.bottom + P)
    } : null;
    const h = hole || { left: vw / 2, top: vh / 2, right: vw / 2, bottom: vh / 2 };
    const set = (p, l, t, w, hh) => Object.assign(root.querySelector('[data-p="' + p + '"]').style, {
      left: l + 'px', top: t + 'px', width: Math.max(0, w) + 'px', height: Math.max(0, hh) + 'px'
    });
    if (hole) {
      set('t', 0, 0, vw, h.top);
      set('b', 0, h.bottom, vw, vh - h.bottom);
      set('l', 0, h.top, h.left, h.bottom - h.top);
      set('r', h.right, h.top, vw - h.right, h.bottom - h.top);
    } else {
      set('t', 0, 0, vw, vh);
      set('b', 0, 0, 0, 0);
      set('l', 0, 0, 0, 0);
      set('r', 0, 0, 0, 0);
    }
    const ring = root.querySelector('.tut-ring');
    ring.style.display = hole ? '' : 'none';
    if (hole) Object.assign(ring.style, { left: h.left + 'px', top: h.top + 'px', width: (h.right - h.left) + 'px', height: (h.bottom - h.top) + 'px' });
    bub.style.maxWidth = Math.min(340, vw - 24) + 'px';
    const bw = bub.offsetWidth, bh = bub.offsetHeight;
    let best = null;
    if (hole) {
      const cx = (h.left + h.right) / 2, cy = (h.top + h.bottom) / 2;
      const clampX = (x) => Math.max(12, Math.min(vw - bw - 12, x));
      const clampY = (y) => Math.max(12, Math.min(vh - bh - 12, y));
      const cands = [
        { side: 'below', x: clampX(cx - bw / 2), y: h.bottom + G },
        { side: 'above', x: clampX(cx - bw / 2), y: h.top - G - bh },
        { side: 'right', x: h.right + G, y: clampY(cy - bh / 2) },
        { side: 'left', x: h.left - G - bw, y: clampY(cy - bh / 2) }
      ];
      const av = avoidRects();
      cands.forEach((c) => {
        const r = { left: c.x, top: c.y, right: c.x + bw, bottom: c.y + bh };
        let pen = 0;
        if (r.left < 4 || r.top < 4 || r.right > vw - 4 || r.bottom > vh - 4) pen += 1e7;
        av.forEach((a) => { pen += inter(r, a) * 10; });
        pen += inter(r, h) * 5;
        c.pen = pen;
        if (!best || pen < best.pen) best = c;
      });
      if (best.pen >= 1e7) best = { side: 'over', x: clampX(cx - bw / 2), y: clampY(vh - bh - 24), pen: 0 };
    } else best = { side: 'center', x: (vw - bw) / 2, y: (vh - bh) / 2 };
    bub.style.left = best.x + 'px';
    bub.style.top = best.y + 'px';
    bub.dataset.side = best.side;
    if (hole && best.side !== 'over' && best.side !== 'center') {
      arrow.style.display = '';
      const cx = (h.left + h.right) / 2, cy = (h.top + h.bottom) / 2;
      if (best.side === 'below' || best.side === 'above') {
        arrow.style.left = Math.max(14, Math.min(bw - 26, cx - best.x - 6)) + 'px';
        arrow.style.top = '';
      } else {
        arrow.style.top = Math.max(14, Math.min(bh - 26, cy - best.y - 6)) + 'px';
        arrow.style.left = '';
      }
    } else arrow.style.display = 'none';
  }

  async function showWelcome() {
    if (welcomePending || (welcomeEl && welcomeEl.isConnected)) return;
    welcomePending = true;
    try {
    await ready;
    if (welcomeEl && welcomeEl.isConnected) return;
    const w = (DATA && DATA.welcome) || { title: 'Watt Indeferido', lines: [], buttons: [] };
    const lines = Array.isArray(w.lines) ? w.lines : [];
    const buttons = Array.isArray(w.buttons) ? w.buttons : [];
    const btn = (b) => '<button type="button" class="tut-w-btn' + (b.primary ? ' primary' : '') + '" data-w="' + esc(b.id) + '">' + esc(b.label) + '</button>';
    const m = el('div', 'tut-welcome');
    m.dataset.variant = 'welcome';
    m.innerHTML = '<div class="tut-w-card" role="dialog" aria-modal="true" aria-labelledby="tutWTitle"><h2 id="tutWTitle">' + esc(w.title) + '</h2><ul>' +
      lines.map((l) => '<li>' + esc(l) + '</li>').join('') + '</ul><div class="tut-w-actions">' + buttons.map(btn).join('') + '</div></div>';
    document.body.appendChild(m);
    welcomeEl = m;
    queue.length = 0;
    dismissTip();
    holdClock(true);
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-w]');
      if (!b) return;
      const withTips = b.dataset.w === 'start_tutorial';
      st.welcomeDone = true;
      st.off = !withTips;
      try { if (api().markOnboarded) api().markOnboarded(); } catch (_) {}
      m.remove();
      if (welcomeEl === m) welcomeEl = null;
      persist();
      if (withTips) {
        holdClock(true);
        try { if (api().openAuction) api().openAuction(); } catch (_) {}
      } else {
        holdClock(false);
      }
    });
    } finally {
      welcomePending = false;
    }
  }

  function syncSettings() {
    const t = document.getElementById('btnTutToggle');
    const s = document.getElementById('tutSettingsState');
    if (t) t.textContent = st.off ? 'Ligar dicas' : 'Desligar dicas';
    if (s) s.textContent = st.off ? 'Dicas desligadas.' : 'Dicas ligadas.';
  }
  function replay() {
    st.seen = {};
    st.off = false;
    st.welcomeDone = false;
    queue.length = 0;
    dismissTip();
    try { if (api().closeSettings) api().closeSettings(); } catch (_) {}
    persist();
    showWelcome();
  }
  function toggle() {
    st.off = !st.off;
    if (st.off) {
      queue.length = 0;
      dismissTip();
    }
    persist();
    refreshClockHold();
  }
  function wireSettings() {
    const r = document.getElementById('btnTutReplay');
    const t = document.getElementById('btnTutToggle');
    if (r && !r.dataset.tutWired) { r.dataset.tutWired = '1'; r.addEventListener('click', replay); }
    if (t && !t.dataset.tutWired) { t.dataset.tutWired = '1'; t.addEventListener('click', toggle); }
    syncSettings();
  }

  async function force(id) {
    await ready;
    const s = (DATA.steps || []).find((x) => x.id === id);
    if (!s) return;
    queue.length = 0;
    if (cur) done(false);
    delete st.seen[id];
    show(s);
  }

  window.__tut = {
    emit: emit,
    showWelcome: showWelcome,
    replay: replay,
    toggle: toggle,
    force: force,
    exportState: exportState,
    importState: importState,
    state: () => st,
    reset: () => {
      st = { off: false, seen: {}, welcomeDone: false };
      queue.length = 0;
      dismissTip();
      persist();
    }
  };

  function boot() {
    wireSettings();
    if (qs.get('welcome') === '1' || window.__tutWantWelcome) showWelcome();
    if (window.__tutWantReplay) replay();
    if (qs.get('tutstep')) setTimeout(() => force(qs.get('tutstep')), 400);
    setTimeout(() => {
      if (welcomeUp() || st.off) return;
      const note = document.getElementById('npvCauseNote');
      if (note && note.textContent && window.__tutNpvSeen !== note.textContent) {
        window.__tutNpvSeen = note.textContent;
        emit('effect', 'npv_note_shown');
      }
      emit('open', currentScreen());
    }, 700);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
