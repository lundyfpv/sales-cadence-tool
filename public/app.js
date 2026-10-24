/* ============ helpers ============ */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
function toD(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); }
function fmt(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function addDays(s, n) { const d = toD(s); d.setDate(d.getDate() + n); return fmt(d); }
function dow(s) { return toD(s).getDay(); }
function today() { return fmt(new Date()); }
function mondayOf(s) { const w = dow(s); return addDays(s, w === 0 ? -6 : 1 - w); }
// calendar weeks start on Sunday unless the user picks Monday; planning weeks stay Monday-based
function weekStartOf(s) { const st = +S.settings.weekStart === 1 ? 1 : 0; return addDays(s, -((dow(s) - st + 7) % 7)); }
function diffDays(a, b) { return Math.round((toD(b) - toD(a)) / 86400000); }
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function nice(s) { return s ? toD(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : ''; }
function niceShort(s) { return s ? toD(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''; }
function toMin(t) { if (!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); }
function fromMin(n) { n = Math.max(0, Math.min(23 * 60 + 45, Math.round(n))); return pad(Math.floor(n / 60)) + ':' + pad(n % 60); }
function t12(t) { if (!t) return ''; let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + pad(m) + ' ' + ap; }
function t12s(t) { if (!t) return ''; let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'p' : 'a'; h = h % 12 || 12; return h + (m ? ':' + pad(m) : '') + ap; }
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

const KINDS = { visit: 'Visit', call: 'Call', email: 'Email', text: 'Text' };
const ICON = {
  visit: '<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 14.5s5-4.6 5-8.3A5 5 0 0 0 3 6.2c0 3.7 5 8.3 5 8.3Z"/><circle cx="8" cy="6.3" r="1.8"/></svg>',
  call: '<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3.2 2.5h2.6l1.2 3-1.6 1.1a8 8 0 0 0 4 4l1.1-1.6 3 1.2v2.6a1.2 1.2 0 0 1-1.3 1.2A11.5 11.5 0 0 1 2 3.8a1.2 1.2 0 0 1 1.2-1.3Z"/></svg>',
  email: '<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="3.5" width="12" height="9" rx="1.5"/><path d="m2.5 4.5 5.5 4 5.5-4"/></svg>',
  text: '<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2.5 4a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 13.5 4v5.5A1.5 1.5 0 0 1 12 11H7l-3 2.5V11H4a1.5 1.5 0 0 1-1.5-1.5Z"/></svg>',
  clip: '<svg class="ico clip" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10.5 4.5 5.8 9.2a1.4 1.4 0 0 0 2 2l5-5a2.8 2.8 0 0 0-4-4l-5 5a4.2 4.2 0 0 0 6 6l4.2-4.2"/></svg>',
  check: '<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="m3.5 8.5 3 3 6-7"/></svg>',
};
const isTouch = k => k && k !== 'visit';
const ACCENTS = [['slate', 'Slate blue', '#34558b'], ['navy', 'Navy', '#1f3a68'], ['teal', 'Teal', '#0e6b74'], ['plum', 'Plum', '#6e3e7e'], ['rust', 'Rust', '#a14a24'], ['graphite', 'Graphite', '#3a3f48'], ['pine', 'Pine green', '#1d6b52']];
function applyTheme() { const th = { ...DEFAULT_SETTINGS.theme, ...(S.settings.theme || {}) }; window.cbTheme && window.cbTheme.apply(th.mode, th.accent); }

const DEFAULT_SETTINGS = {
  visitDays: [2, 3, 4], officeDays: [1, 5], dayStart: '08:30', dayEnd: '17:00', visitLength: 60, buffer: 30,
  maxVisitsPerDay: 5, defaultCadence: 3, defaultUnit: 'weeks', autoNext: true, blackouts: [], gridStart: 7, gridEnd: 18,
  signature: '',
  confirmTemplate: 'Hi {first}, just confirming our {kind} on {day} at {time}. Let me know if anything changes. Thanks, {me}',
  recapTemplate: 'Hi {first},\n\nThanks for your time on {day}. Quick recap:\n{recap}\n\nI\'ll touch base again around {next}.\n\nThanks,\n{me}',
  theme: { mode: 'system', accent: 'slate' }, weekStart: 0,
  prospectCadence: 2, coldAfter: 4, productCategories: ['Equipment', 'Accessories', 'Minisplits', 'Crossover', 'Samsung'], competitors: [],
};

/* ============ state ============ */
const S = {
  db: null, dl: null, status: 'connecting', customers: new Map(), appts: new Map(), settings: { ...DEFAULT_SETTINGS },
  view: 'week', anchor: today(), monthAnchor: today(), planWeek: null, confirmWeek: null,
  q: '', filter: 'all', sort: 'next', loaded: { c: false, a: false, s: false }, mobile: false, fileCounts: {}, user: null,
};
const VIEWS = [['week', 'Week'], ['month', 'Month'], ['plan', 'Recap and Plan', 'Fri'], ['confirm', 'Confirm', 'Mon'], ['customers', 'Customers'], ['settings', 'Settings']];
try { const v = localStorage.getItem('cb.view'); if (v && VIEWS.some(x => x[0] === v)) S.view = v; } catch (e) {}

const set = () => S.settings;
const custName = c => c ? (c.name || c.contact || 'Unnamed') : 'Removed customer';
const apptName = a => { const c = S.customers.get(a.customerId); return c ? custName(c) : (a.name || 'Removed customer'); };
const isOpen = a => a.status === 'proposed' || a.status === 'confirmed';
const firstName = c => (c?.contact || c?.name || '').trim().split(/\s+/)[0] || 'there';
const lines = s => String(s || '').split('\n').map(l => l.trim().replace(/^[-•*]\s*/, '')).filter(Boolean);
// My action items for an upcoming appointment: those logged at the customer's last meeting before it, plus any added to it directly.
// A missed or cancelled meeting with no items of its own doesn't clear the ones from before it.
function actionItems(a) {
  const prev = [...S.appts.values()].filter(x => x.customerId === a.customerId && x.id !== a.id && !isOpen(x) && x.date <= a.date && (x.status === 'completed' || lines(x.actions).length)).sort((x, y) => y.date.localeCompare(x.date))[0];
  const mk = from => lines(from.actions).map(t => ({ t, from, done: (from.actionsDone || []).includes(t) }));
  return [...(prev ? mk(prev) : []), ...mk(a)];
}
// Done items are stored by their text on the appointment they were written on (actionsDone). Pass live = false where there's no click handler.
const taskList = (items, live = true) => items.length ? `<ul class="tasks">${items.map(i => `<li class="${i.done ? 'done' : ''}">${live ? `<label><input type="checkbox" data-act="task-toggle" data-id="${i.from.id}" data-t="${esc(i.t)}" ${i.done ? 'checked' : ''}><span>${esc(i.t)}</span></label>` : `<span>${esc(i.t)}</span>`}</li>`).join('')}</ul>` : '';

/* ============ cadence engine ============ */
function isBlackout(s) { return (set().blackouts || []).some(b => s >= b.start && s <= (b.end || b.start)); }
function blackoutLabel(s) { const b = (set().blackouts || []).find(b => s >= b.start && s <= (b.end || b.start)); return b ? (b.label || 'Blocked') : ''; }
function allowedDay(s, kind) {
  if (isBlackout(s)) return false;
  const w = dow(s);
  if (kind === 'visit' || !kind) return set().visitDays.includes(w);
  return w >= 1 && w <= 5;
}
// nearest allowed day: tries +1, -1, +2, -2 … so Mon → Tue, Fri → Thu
function snap(s, kind) {
  if (allowedDay(s, kind)) return s;
  for (let i = 1; i <= 21; i++) for (const o of [i, -i]) { const c = addDays(s, o); if (allowedDay(c, kind)) return c; }
  return s;
}
function firstAllowedFrom(s, kind) { for (let i = 0; i < 28; i++) { const c = addDays(s, i); if (allowedDay(c, kind)) return c; } return s; }
function cadenceDays(c) { const n = Math.max(1, +c.cadence || set().defaultCadence || 3); return c.unit === 'days' ? n : n * 7; }
function hasHome(c) { return c.homeDay !== null && c.homeDay !== undefined && c.homeDay !== ''; }
function nextDueFrom(c, base) {
  let d = addDays(base, cadenceDays(c));
  if (c.unit !== 'days' && hasHome(c)) d = addDays(mondayOf(d), ((+c.homeDay) + 6) % 7);
  return snap(d, c.kind);
}
function dueDate(c) { return c.rhythmDate ? nextDueFrom(c, c.rhythmDate) : null; }
function openApptFor(cid, exceptId) {
  let best = null;
  for (const a of S.appts.values()) if (a.customerId === cid && a.id !== exceptId && isOpen(a) && (!best || a.date < best.date)) best = a;
  return best;
}
// Calendar color group: prospects yellow, assigned accounts green, everyone else blue
const custGroup = c => c?.prospect ? 'prospect' : c?.assigned ? 'assigned' : 'open';
// A prospect is going cold once they've had coldAfter follow-ups (done or missed) since becoming a prospect
function isCold(c) {
  if (!c?.prospect || c.active === false) return false;
  const n = [...S.appts.values()].filter(a => a.customerId === c.id && (a.status === 'completed' || a.status === 'missed') && a.date >= (c.prospectSince || '')).length;
  return n >= (+set().coldAfter || 4);
}
const custTags = c => `${c.prospect ? ' <span class="pill prospect">Prospect</span>' : c.assigned ? ' <span class="pill assigned">Assigned</span>' : ''}${isCold(c) ? ' <span class="pill bad">Going cold</span>' : ''}`;
const competitorNames = () => [...new Set([...(set().competitors || []), ...[...S.customers.values()].map(c => (c.competitor || '').trim())].filter(Boolean))].sort((a, b) => a.localeCompare(b));
function cadenceLabel(c) { const n = +c.cadence || set().defaultCadence; return c.unit === 'days' ? `Every ${n} day${n == 1 ? '' : 's'}` : `Every ${n} wk${n == 1 ? '' : 's'}`; }
function customerState(c) {
  const t = today();
  if (c.active === false) return { cls: '', text: 'Paused', rank: 9, sortDate: '9999' };
  const open = openApptFor(c.id);
  if (open) {
    if (open.date < t) return { cls: 'bad', text: 'Log outcome · ' + niceShort(open.date), rank: 0, sortDate: open.date };
    return { cls: open.status === 'confirmed' ? 'ok' : '', text: (open.status === 'confirmed' ? 'Confirmed ' : 'Proposed ') + niceShort(open.date), rank: 4, sortDate: open.date };
  }
  const due = dueDate(c);
  if (!due) return { cls: 'warn', text: 'Never touched', rank: 2, sortDate: '0000' };
  if (due < t) return { cls: 'bad', text: `Overdue ${diffDays(due, t)}d`, rank: 1, sortDate: due };
  if (due <= addDays(t, 13)) return { cls: 'warn', text: 'Due ' + niceShort(due), rank: 3, sortDate: due };
  return { cls: '', text: 'Due ' + niceShort(due), rank: 5, sortDate: due };
}
function visitsOn(date, extra = []) { return [...S.appts.values(), ...extra].filter(a => a.date === date && a.kind === 'visit' && a.status !== 'cancelled'); }
function findSlot(date, dur, pref, extra = [], exceptId) {
  const busy = [...S.appts.values(), ...extra].filter(a => a.date === date && a.time && a.status !== 'cancelled' && a.id !== exceptId)
    .map(a => [toMin(a.time), toMin(a.time) + (+a.duration || 60)]);
  const buf = +set().buffer || 0;
  const free = s => busy.every(([b, e]) => s + dur + buf <= b || s >= e + buf);
  if (pref && free(toMin(pref))) return pref;
  for (let s = toMin(set().dayStart); s + dur <= toMin(set().dayEnd); s += 15) if (free(s)) return fromMin(s);
  return pref || set().dayStart;
}
function dayWarnings(date, kind, exceptId) {
  const w = [];
  const bl = blackoutLabel(date);
  if (bl) w.push(`${nice(date)} is blocked: ${bl}.`);
  const d = dow(date);
  if (kind === 'visit' && !set().visitDays.includes(d)) w.push(set().officeDays.includes(d) ? `${DAYS_LONG[d]} is an office day.` : `${DAYS_LONG[d]} isn't one of your visit days.`);
  if (kind === 'visit') { const n = visitsOn(date).filter(a => a.id !== exceptId).length; if (n >= set().maxVisitsPerDay) w.push(`${nice(date)} already has ${n} visits (your limit is ${set().maxVisitsPerDay}).`); }
  return w;
}

/* ============ data writes ============ */
/* Talks to the server. Every write is followed by a live update from the server to all open devices. */
async function api(method, url, body, file) {
  const headers = { 'X-CB': '1' };
  let payload;
  if (file) { headers['Content-Type'] = file.type || 'application/octet-stream'; payload = file; }
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let r;
  try { r = await fetch(url, { method, headers, body: payload, credentials: 'same-origin' }); }
  catch (e) { setOnline(false); throw { code: 'offline', message: 'Can\'t reach the server.' }; }
  setOnline(true);
  if (r.status === 401 && !url.startsWith('/api/login')) { location.href = '/login'; throw { code: 'unauth', message: 'Signed out.' }; }
  let data = null; try { data = await r.json(); } catch (e) {}
  if (!r.ok) throw { code: data?.code || 'error', message: data?.error || `Server error (${r.status}).` };
  return data;
}
function docRef(coll, id) {
  const u = `/api/docs/${coll}/${encodeURIComponent(id)}`;
  return { id, set: d => api('PUT', u, d).then(refreshSoon), update: d => api('PATCH', u, d).then(refreshSoon), delete: () => api('DELETE', u).then(refreshSoon) };
}
S.db = { collection: c => ({ doc: id => docRef(c, id) }), doc: p => { const [c, id] = p.split('/'); return docRef(c, id); } };
const cRef = id => S.db.collection('customers').doc(id);
const aRef = id => S.db.collection('appointments').doc(id);
function needDb() { return true; }
async function guard(p, okMsg) { try { await p; if (okMsg) toast(okMsg); return true; } catch (e) { console.error(e); toast(e?.code === 'offline' ? 'Couldn\'t reach the server, so this wasn\'t saved. Try again.' : (e?.message || 'Couldn\'t save.')); return false; } }

async function createAppt(o) {
  if (!needDb()) return null;
  const c = S.customers.get(o.customerId);
  const kind = o.kind || c?.kind || 'visit';
  const doc = {
    customerId: o.customerId, name: c ? custName(c) : '', kind, date: o.date, time: o.time || '',
    duration: +(o.duration || c?.duration || set().visitLength), status: o.status || 'proposed',
    rhythmDate: o.rhythmDate || o.date, notes: o.notes || '', recap: o.recap || '', actions: o.actions || '', recapSent: false, createdAt: Date.now(),
  };
  if (c?.example) doc.example = true;
  const id = uid();
  const ok = await guard(aRef(id).set(doc));
  if (ok) S.appts.set(id, { id, ...doc });
  return ok ? id : null;
}

async function proposeNext(c, base, opts = {}) {
  const d = opts.date || nextDueFrom(c, base);
  const dur = +(c.duration || set().visitLength);
  const time = c.kind === 'visit' ? findSlot(d, dur, opts.time || c.preferredTime) : (opts.time || '');
  await createAppt({ customerId: c.id, date: d, time, rhythmDate: opts.rhythmDate || d });
  return d;
}

// Record an outcome and roll the cadence forward from the ORIGINAL rhythm date.
async function setOutcome(a, status, o = {}) {
  if (!needDb()) return;
  const patch = { status, outcomeAt: Date.now() };
  if (o.notes !== undefined) patch.notes = o.notes;
  if (o.recap !== undefined) patch.recap = o.recap;
  if (o.actions !== undefined) patch.actions = o.actions;
  if (!await guard(aRef(a.id).update(patch))) return;
  const c = S.customers.get(a.customerId);
  if (!c) { toast('Saved.'); return; }
  const rhythm = a.rhythmDate || a.date;
  const cp = { rhythmDate: rhythm };
  if (status === 'completed') cp.lastTouch = a.date;
  if (!hasHome(c) && c.unit !== 'days') cp.homeDay = dow(rhythm);
  await guard(cRef(c.id).update(cp));
  const cc = { ...c, ...cp };
  let msg = status === 'completed' ? 'Marked done.' : status === 'missed' ? 'Marked missed.' : 'Cancelled.';
  if (!o.skipNext && set().autoNext !== false && c.active !== false && !openApptFor(c.id, a.id)) {
    let nextRhythm, nextDate = o.nextDate;
    if (nextDate && o.newRhythm) {
      nextRhythm = nextDate;
      const up = { rhythmDate: addDays(nextDate, -cadenceDays(cc)) };
      if (cc.unit !== 'days') up.homeDay = dow(nextDate);
      await guard(cRef(c.id).update(up));
    } else nextRhythm = nextDueFrom(cc, rhythm);
    const d = await proposeNext(cc, rhythm, { date: nextDate || nextRhythm, rhythmDate: nextRhythm, time: o.nextTime || a.time });
    msg += ' Next proposed for ' + nice(d) + '.';
  }
  toast(msg);
}

async function moveAppt(a, date, time, scope) {
  if (!needDb()) return;
  const patch = { date, time: time ?? a.time };
  const c = S.customers.get(a.customerId);
  if (scope === 'future') {
    patch.rhythmDate = date;
    if (c) { const up = {}; if (c.unit !== 'days') up.homeDay = dow(date); if (a.kind === 'visit' && patch.time) up.preferredTime = patch.time; if (Object.keys(up).length) await guard(cRef(c.id).update(up)); }
  }
  if (await guard(aRef(a.id).update(patch))) {
    S.appts.set(a.id, { ...a, ...patch });
    toast(scope === 'future' ? `Moved. ${DAYS_LONG[dow(date)]} is now ${custName(c)}'s day.` : 'Moved. Their rhythm stays the same.');
    render();
  }
}
function requestMove(a, date, time) {
  if (date === a.date) { if (time !== a.time) moveAppt(a, date, time, 'once'); return; }
  const c = S.customers.get(a.customerId);
  const warns = dayWarnings(date, a.kind, a.id);
  const orig = a.rhythmDate || a.date;
  const nextKeep = c ? nextDueFrom(c, orig) : null;
  const nextFuture = c ? nextDueFrom({ ...c, homeDay: c.unit !== 'days' ? dow(date) : c.homeDay }, date) : null;
  openDialog(`
    <div class="dlg-h"><h2>Move ${esc(apptName(a))} to ${esc(nice(date))}${time && a.kind === 'visit' ? ' at ' + t12(time) : ''}?</h2><button class="x" data-close aria-label="Close">×</button></div>
    <div class="dlg-b">
      ${warns.map(w => `<div class="note warn">${esc(w)}</div>`).join('')}
      <div class="choice">
        <button data-scope="once"><b>Just this one</b><span class="muted small">Keep their rhythm. The next one is still due ${esc(nice(nextKeep))}.</span></button>
        ${c ? `<button data-scope="future"><b>This and future ones</b><span class="muted small">${c.unit !== 'days' ? DAYS_LONG[dow(date)] + ' becomes their day. ' : ''}The next one is due ${esc(nice(nextFuture))}.</span></button>` : ''}
      </div>
    </div>
    <div class="dlg-f"><span class="spacer"></span><button class="btn" data-close>Don't move</button></div>`,
    (el, close) => el.querySelectorAll('[data-scope]').forEach(b => b.onclick = () => { close(); moveAppt(a, date, time, b.dataset.scope); }),
    () => render());
}

/* ============ UI shell ============ */
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 3200); }
function renderTabs() {
  $('#tabs').innerHTML = VIEWS.map(([k, l, d]) => `<button class="tab" data-view="${k}" ${S.view === k ? 'aria-current="page"' : ''}>${l}${d ? `<span class="day">${d}</span>` : ''}</button>`).join('');
}
$('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (!b) return; S.view = b.dataset.view; try { localStorage.setItem('cb.view', S.view); } catch (er) {} render(); window.scrollTo(0, 0); });
function syncText() {
  const el = $('#sync');
  if (S.status === 'ready') el.textContent = `${S.customers.size} customer${S.customers.size === 1 ? '' : 's'} · saved`;
  else if (S.status === 'offline') el.textContent = 'Not saving';
  else el.textContent = 'Connecting…';
}
let renderQueued = false, dragging = null, pendingRender = false;
function requestRender() { if (dragging) { pendingRender = true; return; } if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => { renderQueued = false; render(); }); }

function render() {
  if (dragging) { pendingRender = true; return; }
  S.mobile = window.matchMedia('(max-width: 760px)').matches;
  renderTabs(); syncText();
  const ae = document.activeElement, aid = ae && ae.id && $('#main').contains(ae) ? ae.id : null;
  let sel = null; try { if (aid && ae.selectionStart != null) sel = [ae.selectionStart, ae.selectionEnd]; } catch (e) {}
  const main = $('#main');
  main.innerHTML = ({ week: viewWeek, month: viewMonth, plan: viewPlan, confirm: viewConfirm, customers: viewCustomers, settings: viewSettings }[S.view] || viewWeek)();
  if (aid) { const el = document.getElementById(aid); if (el) { el.focus(); try { sel && el.setSelectionRange(sel[0], sel[1]); } catch (e) {} } }
  if (S.view === 'week' && !S.mobile) { const sc = $('.cal-body'); if (sc && !render._scrolled) { render._scrolled = true; } }
}
window.matchMedia('(max-width: 760px)').addEventListener('change', () => render());

/* ============ chip / event markup ============ */
function evClass(a) { return `g-${custGroup(S.customers.get(a.customerId))} s-${a.status}`; }
function evTitle(a) { return `${KINDS[a.kind] || 'Visit'}: ${apptName(a)} · ${a.status}${a.time ? ' · ' + t12(a.time) : ''}`; }
function chip(a, extra = '') {
  return `<button class="chip ${evClass(a)}" data-appt="${a.id}" title="${esc(evTitle(a))}" ${extra}>${a.status === 'completed' ? ICON.check : ICON[a.kind] || ICON.visit}<span>${a.time ? t12s(a.time) + ' ' : ''}${esc(apptName(a))}</span>${S.fileCounts[a.id] ? ICON.clip : ''}</button>`;
}

/* ============ WEEK ============ */
function weekDays(start) { if (!S.settings.showWeekend) start = mondayOf(addDays(start, 1)); const n = S.settings.showWeekend ? 7 : 5; return Array.from({ length: n }, (_, i) => addDays(start, i)); }
function apptsOn(date) { return [...S.appts.values()].filter(a => a.date === date && (a.status !== 'cancelled')); }
function viewWeek() {
  const ws = weekStartOf(S.anchor), days = weekDays(ws), t = today();
  const thisW = weekStartOf(t), nextW = addDays(thisW, 7);
  const label = `${toD(days[0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${toD(days[days.length - 1]).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const tb = `<div class="toolbar">
    <h2 class="wtitle">${ws === thisW ? 'This week' : ws === nextW ? 'Next week' : 'Week of ' + niceShort(ws)}</h2>
    <div class="seg"><button data-act="wk" data-d="-7" aria-label="Previous week">‹</button><button data-act="wk-this" aria-pressed="${ws === thisW}">This week</button><button data-act="wk-next" aria-pressed="${ws === nextW}">Next week</button><button data-act="wk" data-d="7" aria-label="Following week">›</button></div>
    <span class="muted small">${label}</span><span class="spacer"></span>
    <button class="btn" data-act="export-week">Export to calendar</button>
    <button class="btn primary" data-act="new-appt" data-date="${firstAllowedFrom(ws < t ? t : ws, 'visit')}">+ Appointment</button>
  </div>`;
  const side = weekSide(ws, days);
  if (S.mobile) return tb + `<div class="week-wrap">${agenda(days)}${side}</div>`;
  return tb + `<div class="week-wrap"><div class="cal">${weekGrid(days)}${legend()}</div>${side}</div>`;
}
function legend(hint = 'Drag to move · click an empty slot to add') {
  return `<div class="legend"><span><i class="g-assigned"></i>Assigned account</span><span><i class="g-open"></i>Not assigned</span><span><i class="g-prospect"></i>Prospect</span><span><i class="g-open s-proposed"></i>Proposed</span><span><i style="background:var(--surface-2)"></i>Done</span><span><i style="background:var(--red-soft)"></i>Missed</span><span><i style="background:var(--office)"></i>Office day</span><span class="spacer"></span><span>${hint}</span></div>`;
}
const PX = 44;
function weekGrid(days) {
  const gs = +set().gridStart || 7, ge = +set().gridEnd || 18, t = today();
  const cols = `56px repeat(${days.length}, minmax(0,1fr))`;
  let h = `<div class="cal-scroll"><div class="cal-grid" style="grid-template-columns:${cols}">`;
  h += `<div class="corner"></div>`;
  for (const d of days) {
    const w = dow(d), office = set().officeDays.includes(w), bl = blackoutLabel(d);
    const nv = visitsOn(d).length, cap = +set().maxVisitsPerDay;
    const meter = office ? '' : `<div class="meter ${nv > cap ? 'over' : ''}" title="${nv} of ${cap} visits">${Array.from({ length: Math.max(cap, nv) }, (_, i) => `<i class="${i < nv ? 'on' : ''}"></i>`).join('')}</div>`;
    h += `<div class="dh ${office ? 'office' : ''} ${d === t ? 'today' : ''}"><div class="dname"><span>${DAYS[w]}</span><span>${office ? 'Office' : ''}</span></div><span class="dnum">${toD(d).getDate()}</span>${bl ? `<div class="dtag bad">${esc(bl)}</div>` : meter}</div>`;
  }
  h += `<div class="corner" style="font-size:.7rem;color:var(--muted);padding:6px 4px;text-align:right;border-bottom:1px solid var(--line)">All day</div>`;
  for (const d of days) {
    const w = dow(d), items = apptsOn(d).filter(a => !a.time).sort((a, b) => apptName(a).localeCompare(apptName(b)));
    h += `<div class="allday ${set().officeDays.includes(w) ? 'office' : ''} ${isBlackout(d) ? 'blk' : ''} ${d === t ? 'today' : ''}" data-allday="${d}">${items.map(a => chip(a)).join('')}</div>`;
  }
  h += `<div class="hours" style="height:${(ge - gs) * PX}px">${Array.from({ length: ge - gs }, (_, i) => i ? `<span style="top:${i * PX}px">${t12s(pad(gs + i) + ':00')}</span>` : '').join('')}</div>`;
  for (const d of days) {
    const w = dow(d);
    const evs = apptsOn(d).filter(a => a.time).map(a => ({ a, s: toMin(a.time), e: toMin(a.time) + Math.max(20, +a.duration || 60) })).sort((x, y) => x.s - y.s || y.e - x.e);
    // lane layout for overlaps
    let cluster = [], cEnd = -1; const out = [];
    const flush = () => { const lanes = []; for (const ev of cluster) { let li = lanes.findIndex(end => end <= ev.s); if (li < 0) { li = lanes.length; lanes.push(0); } lanes[li] = ev.e; ev.lane = li; } for (const ev of cluster) { ev.n = lanes.length; out.push(ev); } cluster = []; };
    for (const ev of evs) { if (ev.s >= cEnd && cluster.length) flush(); cluster.push(ev); cEnd = Math.max(cEnd, ev.e); }
    flush();
    let col = `<div class="col ${set().officeDays.includes(w) ? 'office' : ''} ${isBlackout(d) ? 'blk' : ''} ${d === t ? 'today' : ''}" data-col="${d}" style="height:${(ge - gs) * PX}px">`;
    if (d === t) { const now = new Date(); const m = now.getHours() * 60 + now.getMinutes(); if (m >= gs * 60 && m <= ge * 60) col += `<div class="nowline" style="top:${(m - gs * 60) / 60 * PX}px"></div>`; }
    for (const { a, s, e, lane, n } of out) {
      const top = Math.max(0, (s - gs * 60) / 60 * PX), ht = Math.max(22, (e - s) / 60 * PX - 2);
      const left = `calc(${(lane / n) * 100}% + 2px)`, width = `calc(${100 / n}% - 4px)`;
      col += `<button class="ev ${evClass(a)}" data-appt="${a.id}" title="${esc(evTitle(a))}" style="top:${top}px;height:${ht}px;left:${left};width:${width}"><b>${a.status === 'completed' ? ICON.check + ' ' : isTouch(a.kind) ? ICON[a.kind] + ' ' : ''}${esc(apptName(a))}${S.fileCounts[a.id] ? ' ' + ICON.clip : ''}</b><span class="t">${t12s(a.time)}${a.status === 'proposed' ? ' · proposed' : a.status === 'missed' ? ' · missed' : ''}</span></button>`;
    }
    h += col + `</div>`;
  }
  return h + `</div></div>`;
}
function agenda(days) {
  return `<div class="agenda">${days.map(d => {
    const w = dow(d), office = set().officeDays.includes(w), bl = blackoutLabel(d);
    const items = apptsOn(d).sort((a, b) => (a.time || '00') < (b.time || '00') ? -1 : 1);
    const nv = visitsOn(d).length;
    return `<section class="aday ${office ? 'office' : ''} ${d === today() ? 'today' : ''}"><div class="aday-h"><span class="dnum">${toD(d).getDate()}</span><b>${DAYS_LONG[w]}</b><span class="muted small">${office ? 'Office day' : nv + ' visit' + (nv === 1 ? '' : 's')}</span>${bl ? `<span class="pill bad">${esc(bl)}</span>` : ''}${nv > set().maxVisitsPerDay ? '<span class="pill bad">Over limit</span>' : ''}<span class="spacer"></span><button class="btn sm ghost" data-act="new-appt" data-date="${d}" aria-label="Add on ${nice(d)}">+</button></div>
      ${items.length ? items.map(a => `<button class="aitem" data-act="open-appt" data-id="${a.id}"><span class="tm">${a.time ? t12(a.time) : 'Any time'}</span><span class="swatch ${evClass(a)}"></span><span class="grow"><b>${esc(apptName(a))}</b><br><span class="muted small">${KINDS[a.kind]} · ${a.status}</span></span></button>`).join('') : `<div class="aitem muted small" style="cursor:default">Nothing scheduled</div>`}
    </section>`;
  }).join('')}</div>`;
}
// Active customers with nothing scheduled between today and one default cadence from now
function unscheduledPanel() {
  const t = today(), n = +set().defaultCadence || 3, end = addDays(t, set().defaultUnit === 'days' ? n : n * 7);
  const rows = [...S.customers.values()].filter(c => c.active !== false && ![...S.appts.values()].some(a => a.customerId === c.id && isOpen(a) && a.date >= t && a.date <= end))
    .map(c => { const due = dueDate(c), later = openApptFor(c.id); return { c, due, later: later && later.date > end ? later : null }; })
    .sort((x, y) => (x.due || '0000').localeCompare(y.due || '0000') || custName(x.c).localeCompare(custName(y.c)));
  const when = ({ due, later }) => later ? `<span class="pill">Next ${niceShort(later.date)}</span>` : !due ? '<span class="pill warn">Never touched</span>' : due < t ? `<span class="pill bad">Overdue since ${niceShort(due)}</span>` : `<span class="pill">Due ${niceShort(due)}</span>`;
  return `<div class="panel"><div class="row"><h3>Not scheduled</h3><span class="spacer"></span><span class="pill ${rows.length ? 'warn' : 'ok'}">${rows.length}</span></div>
    <p class="muted small" style="margin:0">Nothing booked between today and ${niceShort(end)} (your ${n}-${set().defaultUnit === 'days' ? 'day' : 'week'} default cadence).</p>
    ${rows.length ? `<div class="list unsched">${rows.map(x => `<div class="li"><div class="grow"><button class="linkbtn nm" data-act="open-cust" data-id="${x.c.id}">${esc(custName(x.c))}</button><div class="row small" style="gap:4px">${when(x)}${custTags(x.c)}</div></div><button class="btn sm" data-act="sched-cust" data-id="${x.c.id}">Schedule</button></div>`).join('')}</div>
    <button class="btn" data-act="goto" data-view="plan">Open Recap and Plan</button>` : '<div class="empty">Everyone has something booked.</div>'}
  </div>`;
}
function weekSide(ws, days) {
  const end = addDays(ws, 6), t = today();
  const touches = [...S.appts.values()].filter(a => isTouch(a.kind) && a.date >= ws && a.date <= end && a.status !== 'cancelled').sort((a, b) => a.date.localeCompare(b.date));
  const stale = [...S.appts.values()].filter(a => isOpen(a) && a.date < t).sort((a, b) => a.date.localeCompare(b.date));
  return `<aside class="side">
    <div class="panel"><div class="row"><h3>Calls, emails & texts</h3><span class="spacer"></span><span class="pill touch">${touches.filter(a => a.status !== 'completed').length} open</span></div>
      <div class="list">${touches.length ? touches.map(a => {
        const c = S.customers.get(a.customerId);
        const done = a.status === 'completed';
        return `<div class="li"><button class="check" data-act="${done ? 'open-appt' : 'quick-done'}" data-id="${a.id}" aria-label="${done ? 'Done' : 'Mark done'}" style="${done ? 'background:var(--accent);border-color:var(--accent);color:var(--accent-ink)' : ''}">${done ? ICON.check : ''}</button><div class="grow"><button class="linkbtn nm" data-act="open-appt" data-id="${a.id}" style="${done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(apptName(a))}</button><div class="muted small">${ICON[a.kind]} ${KINDS[a.kind]} · ${DAYS[dow(a.date)]}${c?.phone && a.kind !== 'email' ? ' · <span class="copyable">' + esc(c.phone) + '</span>' : ''}${c?.email && a.kind === 'email' ? ' · <span class="copyable">' + esc(c.email) + '</span>' : ''}</div></div></div>`;
      }).join('') : '<div class="empty">No calls or emails due this week.</div>'}</div></div>
    ${stale.length ? `<div class="panel"><div class="row"><h3>Needs an outcome</h3><span class="spacer"></span><span class="pill bad">${stale.length}</span></div><p class="muted small" style="margin:0">These dates have passed but weren't marked done or missed. Until you log them, the next one won't be scheduled.</p>
      <div class="list">${stale.slice(0, 8).map(a => `<div class="li"><div class="grow"><div class="nm">${esc(apptName(a))}</div><div class="muted small">${KINDS[a.kind]} · ${nice(a.date)}</div></div><button class="btn sm" data-act="outcome" data-id="${a.id}">Log</button></div>`).join('')}</div></div>` : ''}
    ${unscheduledPanel()}
  </aside>`;
}

/* ============ MONTH ============ */
function viewMonth() {
  const a = toD(S.monthAnchor), first = fmt(new Date(a.getFullYear(), a.getMonth(), 1, 12));
  const start = weekStartOf(first), t = today(), m = a.getMonth();
  let h = `<div class="toolbar"><h2 class="mtitle">${a.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2><div class="seg"><button data-act="mo" data-d="-1" aria-label="Previous month">‹</button><button data-act="mo-today">Today</button><button data-act="mo" data-d="1" aria-label="Next month">›</button></div></div><div class="week-wrap"><div class="cal"><div class="month">`;
  h += Array.from({ length: 7 }, (_, i) => DAYS[dow(addDays(start, i))]).map(d => `<div class="mh">${d}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i), w = dow(d), items = apptsOn(d).sort((x, y) => (x.time || '') < (y.time || '') ? -1 : 1);
    const bl = blackoutLabel(d);
    h += `<div class="mc ${toD(d).getMonth() !== m ? 'out' : ''} ${set().officeDays.includes(w) ? 'office' : ''} ${bl ? 'blk' : ''} ${d === t ? 'today' : ''}" data-act="mo-day" data-date="${d}" role="button" tabindex="0" aria-label="${nice(d)}, ${items.length} items"><span class="n">${toD(d).getDate()}${bl ? ` <span class="pill bad" style="font-size:.62rem">${esc(bl)}</span>` : ''}</span>${items.slice(0, 4).map(x => chip(x, 'tabindex="-1"')).join('')}${items.length > 4 ? `<span class="muted small">+${items.length - 4} more</span>` : ''}</div>`;
  }
  return h + `</div>${legend('Click a day to open its week')}</div><aside class="side">${unscheduledPanel()}</aside></div>`;
}

/* ============ PLAN (Friday) ============ */
function planCandidates(ws) {
  const we = addDays(ws, 6);
  return [...S.customers.values()].filter(c => c.active !== false && !openApptFor(c.id))
    .map(c => ({ c, due: dueDate(c) })).filter(x => !x.due || x.due <= we)
    .map(x => ({ ...x, day: suggestDay(x.c, ws, x.due) }))
    .sort((x, y) => (x.due || '0000').localeCompare(y.due || '0000'));
}
function suggestDay(c, ws, due) {
  const we = addDays(ws, 4), floor = ws < today() ? today() : ws;
  let d;
  if (due && due >= floor && due <= we) d = due;
  else if (hasHome(c)) d = addDays(ws, ((+c.homeDay) + 6) % 7);
  else d = addDays(ws, 1);
  d = snap(d, c.kind);
  if (d < floor || d > addDays(ws, 6)) d = firstAllowedFrom(floor, c.kind);
  return d;
}
function viewPlan() {
  const t = today(), thisW = mondayOf(t);
  const ws = S.planWeek || (dow(t) >= 4 || dow(t) === 0 ? addDays(thisW, 7) : addDays(thisW, 7));
  S.planWeek = ws;
  const days = Array.from({ length: 5 }, (_, i) => addDays(ws, i)), cap = +set().maxVisitsPerDay;
  const cands = planCandidates(ws);
  const stale = [...S.appts.values()].filter(a => isOpen(a) && a.date < t).sort((a, b) => a.date.localeCompare(b.date));
  const recapFrom = addDays(ws, -7), recapTo = addDays(ws, -1);
  const recaps = [...S.appts.values()].filter(a => a.status === 'completed' && a.kind === 'visit' && a.date >= recapFrom && a.date <= recapTo).sort((a, b) => a.date.localeCompare(b.date));
  const loads = days.map(d => ({ d, v: visitsOn(d).length, tc: apptsOn(d).filter(a => isTouch(a.kind)).length }));
  const we = addDays(ws, 6), farEnd = addDays(ws, 27), byWhen = (x, y) => (x.date + (x.time || '')).localeCompare(y.date + (y.time || ''));
  const upcoming = [...S.appts.values()].filter(a => isOpen(a) && a.date >= ws && a.date <= we).sort(byWhen);
  // Further out: the three weeks after the plan week, scheduled or just due, wherever you owe them something
  const further = [...S.appts.values()].filter(a => isOpen(a) && a.date > we && a.date <= farEnd).map(a => ({ a, c: S.customers.get(a.customerId), date: a.date, time: a.time, items: actionItems(a) }))
    .concat([...S.customers.values()].filter(c => c.active !== false && !openApptFor(c.id)).map(c => ({ c, date: dueDate(c) })).filter(x => x.date && x.date > we && x.date <= farEnd)
      .map(x => ({ ...x, items: actionItems({ customerId: x.c.id, id: '', date: x.date }) })))
    .filter(x => x.items.length).sort(byWhen);
  const taskCount = upcoming.reduce((n, a) => n + actionItems(a).filter(i => !i.done).length, 0);
  const candRows = cands.map(({ c, due, day }) => {
    const st = !due ? '<span class="pill warn">Never touched</span>' : due < ws ? `<span class="pill bad">Overdue since ${niceShort(due)}</span>` : `<span class="pill">Due ${nice(due)}</span>`;
    const opts = days.concat(addDays(ws, 5), addDays(ws, 6)).filter(d => d >= (ws < t ? t : ws)).map(d => `<option value="${d}" ${d === day ? 'selected' : ''}>${DAYS[dow(d)]} ${niceShort(d)}${!allowedDay(d, c.kind) ? ' (office)' : ''}</option>`).join('');
    return `<div class="li"><span class="pill ${isTouch(c.kind) ? 'touch' : 'ok'}">${ICON[c.kind || 'visit']} ${KINDS[c.kind || 'visit']}</span><div class="grow"><button class="linkbtn nm" data-act="open-cust" data-id="${c.id}">${esc(custName(c))}</button><div class="row small">${st}${custTags(c)}<span class="muted">${cadenceLabel(c)}</span></div>${taskList(actionItems({ customerId: c.id, id: '', date: we }))}</div><select class="inp" style="width:auto" id="pd-${c.id}" aria-label="Day for ${esc(custName(c))}">${opts}</select><button class="btn sm" data-act="plan-one" data-id="${c.id}">Add</button></div>`;
  }).join('');
  return `<div class="toolbar"><h2>Recap and Plan</h2><div class="seg"><button data-act="pw" data-d="-7" aria-label="Previous week">‹</button><button aria-pressed="true" disabled style="opacity:1">Week of ${niceShort(ws)}</button><button data-act="pw" data-d="7" aria-label="Following week">›</button></div></div>
  <p class="lead"><b>Recap</b> wraps up the week that's ending: log what happened and send recaps. <b>Plan</b> sets up the week ahead and shows the action items you owe each customer. Suggested days follow each customer's rhythm, and if a day is full, Add all moves visits to the lightest day between Tuesday and Thursday.</p>
  <div class="cols plan-cols">
    <div class="side">
      <div class="colhead recap"><h2>Recap</h2><span class="muted small">Week of ${niceShort(recapFrom)}</span></div>
      <div class="panel"><div class="row"><h3>1 · Log what happened</h3><span class="spacer"></span>${stale.length ? `<span class="pill bad">${stale.length}</span>` : '<span class="pill ok">All logged</span>'}</div>
        ${stale.length ? `<div class="list">${stale.map(a => `<div class="li"><div class="grow"><div class="nm">${esc(apptName(a))}</div><div class="muted small">${KINDS[a.kind]} · ${nice(a.date)}${a.time ? ' · ' + t12(a.time) : ''}</div></div><button class="btn sm" data-act="quick-done" data-id="${a.id}">Done</button><button class="btn sm" data-act="outcome" data-id="${a.id}">More…</button></div>`).join('')}</div>` : '<div class="empty">Every past appointment has an outcome.</div>'}
      </div>
      <div class="panel"><div class="row"><h3>2 · Recaps to send</h3><span class="spacer"></span><span class="muted small">Visits ${niceShort(recapFrom)}–${niceShort(recapTo)}</span></div>
        ${recaps.length ? `<div class="list">${recaps.map(a => { const c = S.customers.get(a.customerId); return `<div class="li"><button class="check" data-act="recap-toggle" data-id="${a.id}" aria-label="${a.recapSent ? 'Recap sent' : 'Mark recap sent'}" style="${a.recapSent ? 'background:var(--accent);border-color:var(--accent);color:var(--accent-ink)' : ''}">${a.recapSent ? ICON.check : ''}</button><div class="grow"><div class="nm" style="${a.recapSent ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(apptName(a))}</div><div class="muted small">${DAYS[dow(a.date)]} · ${a.recap ? 'recap written' : '<span style="color:var(--amber)">no recap yet</span>'} · ${c?.email ? '<span class="copyable">' + esc(c.email) + '</span>' : 'no email on file'}</div></div>${a.recap ? `<button class="btn sm" data-act="copy-recap" data-id="${a.id}">Copy email</button>` : ''}<button class="btn sm ${a.recap ? '' : 'primary'}" data-act="open-appt" data-id="${a.id}">${a.recap ? 'Edit' : 'Write recap'}</button></div>`; }).join('')}</div>` : '<div class="empty">No completed visits that week yet.</div>'}
      </div>
    </div>
    <div class="side">
      <div class="colhead plan"><h2>Plan</h2><span class="muted small">Week of ${niceShort(ws)}</span></div>
      <div class="panel"><h3>3 · Week of ${niceShort(ws)}</h3>
        <div class="loadbars">${loads.map(({ d, v, tc }) => { const office = set().officeDays.includes(dow(d)); return `<div class="lb ${office ? 'office' : ''} ${v > cap ? 'over' : ''}"><div class="label">${DAYS[dow(d)]}</div><div class="big">${v}</div><div class="muted small">${office ? 'office' : 'of ' + cap}${tc ? ' · ' + tc + ' calls' : ''}</div>${office ? '' : `<div class="bar"><i style="width:${Math.min(100, v / cap * 100)}%"></i></div>`}${isBlackout(d) ? `<div class="pill bad" style="margin-top:4px">${esc(blackoutLabel(d))}</div>` : ''}</div>`; }).join('')}</div>
        <button class="btn sm" data-act="goto-week" data-date="${ws}">Open this week on the calendar</button>
      </div>
      <div class="panel"><div class="row"><h3>Upcoming appointments</h3><span class="spacer"></span>${taskCount ? `<span class="pill warn">${taskCount} action item${taskCount === 1 ? '' : 's'}</span>` : ''}</div>
        ${upcoming.length ? `<div class="list">${upcoming.map(a => { const items = actionItems(a); return `<div class="li start"><span class="pill ${isTouch(a.kind) ? 'touch' : 'ok'}">${ICON[a.kind] || ICON.visit}</span><div class="grow"><button class="linkbtn nm" data-act="open-appt" data-id="${a.id}">${esc(apptName(a))}</button><div class="muted small">${nice(a.date)}${a.time ? ' · ' + t12(a.time) : ''}${a.status === 'proposed' ? ' · proposed' : ''}</div>${items.length ? taskList(items) : '<div class="muted small">No action items</div>'}</div></div>`; }).join('')}</div>` : '<div class="empty">Nothing scheduled that week yet.</div>'}
      </div>
      <div class="panel"><div class="row"><h3>Further out</h3><span class="spacer"></span><span class="muted small">${niceShort(addDays(we, 1))}–${niceShort(farEnd)}</span></div>
        ${further.length ? `<div class="list">${further.map(x => `<div class="li start"><div class="grow"><button class="linkbtn nm" data-act="${x.a ? 'open-appt' : 'open-cust'}" data-id="${x.a ? x.a.id : x.c.id}">${esc(x.a ? apptName(x.a) : custName(x.c))}</button><div class="muted small">${x.a ? nice(x.date) + (x.time ? ' · ' + t12(x.time) : '') : 'Due ' + nice(x.date) + ' · not scheduled'}</div>${taskList(x.items)}</div></div>`).join('')}</div>` : '<div class="empty">No action items for the following three weeks.</div>'}
      </div>
      <div class="panel"><div class="row"><h3>4 · Due, not scheduled</h3><span class="spacer"></span>${cands.length ? `<button class="btn primary sm" data-act="plan-all">Add all ${cands.length}</button>` : ''}</div>
        ${cands.length ? `<div class="list">${candRows}</div>` : '<div class="empty">Nothing is waiting. Everyone due this week has something scheduled.</div>'}
      </div>
    </div>
  </div>`;
}
async function planAdd(items) {
  if (!needDb()) return;
  const extra = [], cap = +set().maxVisitsPerDay, ws = S.planWeek;
  const floor = ws < today() ? today() : ws;
  let moved = 0, n = 0;
  for (const { c, due, day } of items) {
    let d = day;
    if (c.kind === 'visit' && visitsOn(d, extra).length >= cap) {
      const opts = Array.from({ length: 5 }, (_, i) => addDays(ws, i)).filter(x => x >= floor && allowedDay(x, 'visit'));
      const best = opts.sort((x, y) => visitsOn(x, extra).length - visitsOn(y, extra).length)[0];
      if (best && visitsOn(best, extra).length < visitsOn(d, extra).length) { d = best; moved++; }
    }
    const dur = +(c.duration || set().visitLength);
    const time = c.kind === 'visit' ? findSlot(d, dur, c.preferredTime, extra) : '';
    const rhythm = due && due >= ws ? due : d;
    const id = await createAppt({ customerId: c.id, date: d, time, rhythmDate: rhythm });
    if (id) { extra.push({ id, date: d, time, duration: dur, kind: c.kind, status: 'proposed' }); n++; }
  }
  toast(`Added ${n} proposed appointment${n === 1 ? '' : 's'}${moved ? `, ${moved} moved to lighter days` : ''}.`);
  render();
}

/* ============ CONFIRM (Monday) ============ */
function viewConfirm() {
  const t = today(), thisW = mondayOf(t);
  const ws = S.confirmWeek || (dow(t) === 5 || dow(t) === 6 || dow(t) === 0 ? addDays(thisW, 7) : thisW);
  S.confirmWeek = ws;
  const days = Array.from({ length: 5 }, (_, i) => addDays(ws, i));
  const all = days.flatMap(d => apptsOn(d).filter(a => a.kind === 'visit' || a.time).sort((a, b) => (a.time || '') < (b.time || '') ? -1 : 1));
  const open = all.filter(isOpen), conf = open.filter(a => a.status === 'confirmed').length;
  return `<div class="toolbar"><h2>Monday confirmations</h2><div class="seg"><button data-act="cw" data-d="-7" aria-label="Previous week">‹</button><button aria-pressed="true" disabled style="opacity:1">Week of ${niceShort(ws)}</button><button data-act="cw" data-d="7" aria-label="Following week">›</button></div><span class="spacer"></span><span class="pill ${conf === open.length && open.length ? 'ok' : 'warn'}">${conf} of ${open.length} confirmed</span></div>
  <p class="lead">Reach out to each proposed visit, then tap Confirmed. If they need a different day, use Move and choose whether it's just this once or their new day.</p>
  <div class="cols">${days.map(d => {
    const items = all.filter(a => a.date === d);
    if (!items.length) return '';
    return `<div class="panel"><div class="row"><h3>${DAYS_LONG[dow(d)]} ${niceShort(d)}</h3><span class="spacer"></span><span class="muted small">${items.length} item${items.length === 1 ? '' : 's'}</span></div>${items.map(a => {
      const c = S.customers.get(a.customerId) || {};
      return `<div class="card"><div class="row"><b style="flex:1;min-width:0">${esc(apptName(a))}</b><span class="pill ${a.status === 'confirmed' ? 'ok' : a.status === 'proposed' ? 'warn' : a.status === 'completed' ? '' : 'bad'}">${a.status}</span></div>
        <div class="meta"><span>${ICON[a.kind]} ${KINDS[a.kind]}${a.time ? ' · ' + t12(a.time) : ''}</span>${c.contact ? `<span>${esc(c.contact)}</span>` : ''}${c.phone ? `<span class="copyable">${esc(c.phone)}</span>` : ''}${c.email ? `<span class="copyable">${esc(c.email)}</span>` : ''}</div>
        ${isOpen(a) ? taskList(actionItems(a)) : ''}
        ${isOpen(a) ? `<div class="row"><button class="btn sm" data-act="copy-confirm" data-id="${a.id}">Copy message</button>${a.status === 'proposed' ? `<button class="btn sm primary" data-act="confirm" data-id="${a.id}">Confirmed</button>` : `<button class="btn sm" data-act="unconfirm" data-id="${a.id}">Undo confirm</button>`}<button class="btn sm" data-act="open-appt" data-id="${a.id}">Move…</button><button class="btn sm danger" data-act="outcome" data-id="${a.id}" data-status="cancelled">Cancel</button></div>` : ''}
      </div>`;
    }).join('')}</div>`;
  }).join('') || '<div class="panel"><div class="empty">Nothing is scheduled that week yet. Fill it from Recap and Plan.</div><button class="btn" data-act="goto" data-view="plan">Open Recap and Plan</button></div>'}</div>`;
}

/* ============ CUSTOMERS ============ */
function viewCustomers() {
  const q = S.q.trim().toLowerCase();
  let list = [...S.customers.values()].map(c => ({ c, st: customerState(c) }));
  if (q) list = list.filter(({ c }) => [c.name, c.custId, c.contact, c.email, c.phone, c.address, c.notes, c.competitor, (c.products || []).join(' ')].some(v => String(v || '').toLowerCase().includes(q)));
  if (S.filter === 'visit') list = list.filter(x => (x.c.kind || 'visit') === 'visit');
  if (S.filter === 'touch') list = list.filter(x => isTouch(x.c.kind));
  if (S.filter === 'attn') list = list.filter(x => x.st.rank <= 3);
  if (S.filter === 'prospect') list = list.filter(x => x.c.prospect);
  if (S.filter === 'assigned') list = list.filter(x => x.c.assigned && !x.c.prospect);
  if (S.sort === 'name') list.sort((a, b) => custName(a.c).localeCompare(custName(b.c)));
  else list.sort((a, b) => a.st.rank - b.st.rank || a.st.sortDate.localeCompare(b.st.sortDate) || custName(a.c).localeCompare(custName(b.c)));
  const ex = [...S.customers.values()].some(c => c.example);
  const attn = [...S.customers.values()].filter(c => customerState(c).rank <= 3).length;
  return `<div class="toolbar"><h2>Customers</h2><input class="search" id="cust-q" type="search" placeholder="Search name, ID, contact, city…" value="${esc(S.q)}" aria-label="Search customers">
    <div class="seg">${[['all', 'All'], ['attn', `Needs attention${attn ? ' (' + attn + ')' : ''}`], ['prospect', 'Prospects'], ['assigned', 'Assigned'], ['visit', 'Visits'], ['touch', 'Calls & emails']].map(([k, l]) => `<button data-act="cfilter" data-f="${k}" aria-pressed="${S.filter === k}">${l}</button>`).join('')}</div>
    <span class="spacer"></span><button class="btn" data-act="import">Import</button><button class="btn" data-act="export-cust">Export</button><button class="btn primary" data-act="new-cust">+ Customer</button></div>
  ${ex ? `<div class="note warn row" style="margin-bottom:12px"><span style="flex:1;min-width:0">The customers marked “example” are sample data so you can see how things work. Delete them when you're ready to bring in your own.</span><button class="btn sm" data-act="clear-examples">Delete examples</button></div>` : ''}
  ${S.customers.size === 0 ? `<div class="panel" style="max-width:560px"><h3>No customers yet</h3><p class="muted" style="margin:0">Import a spreadsheet or CSV from your CRM, paste rows copied from Excel, or add customers one at a time. Everyone starts on a ${set().defaultCadence}-week cadence, and you can change any of them.</p><div class="row"><button class="btn primary" data-act="import">Import customers</button><button class="btn" data-act="new-cust">Add one</button></div></div>` : `
  <div class="tbl-wrap"><table><thead><tr><th><button class="linkbtn label" data-act="csort" data-s="name">Customer${S.sort === 'name' ? ' ↓' : ''}</button></th><th>Type</th><th>Cadence</th><th>Day</th><th>Last touch</th><th><button class="linkbtn label" data-act="csort" data-s="next">Next${S.sort === 'next' ? ' ↓' : ''}</button></th></tr></thead><tbody>
  ${list.map(({ c, st }) => `<tr data-act="open-cust" data-id="${c.id}" class="${c.active === false ? 'paused' : ''}"><td><b>${esc(custName(c))}</b>${custTags(c)}${c.example ? ' <span class="pill">example</span>' : ''}<div class="sub">${esc([c.custId && '#' + c.custId, c.contact, c.address, (c.products || []).join(', ')].filter(Boolean).join(' · '))}</div></td><td><span class="pill ${isTouch(c.kind) ? 'touch' : 'ok'}">${ICON[c.kind || 'visit']} ${KINDS[c.kind || 'visit']}</span></td><td>${cadenceLabel(c)}</td><td>${hasHome(c) ? DAYS[+c.homeDay] : '<span class="muted">—</span>'}</td><td>${c.lastTouch ? niceShort(c.lastTouch) : '<span class="muted">—</span>'}</td><td><span class="pill ${st.cls}">${st.text}</span></td></tr>`).join('')}
  </tbody></table>${list.length ? '' : '<div class="empty" style="padding:14px">No customers match.</div>'}</div>`}`;
}

/* ============ SETTINGS ============ */
function viewSettings() {
  const s = set();
  const ws = +s.weekStart === 1 ? 1 : 0;
  const dp = (name, arr) => `<div class="daypick">${Array.from({ length: 7 }, (_, i) => (i + ws) % 7).map(d => `<label><input type="checkbox" data-set-arr="${name}" value="${d}" ${arr.includes(d) ? 'checked' : ''}>${DAYS[d]}</label>`).join('')}</div>`;
  const bl = (s.blackouts || []).slice().sort((a, b) => a.start.localeCompare(b.start));
  const th = { ...DEFAULT_SETTINGS.theme, ...(s.theme || {}) };
  return `<div class="toolbar"><h2>Settings</h2><span class="spacer"></span><a class="btn" href="/admin">Admin: login, HTTPS, backups</a></div><div class="settings">
    <div class="panel"><h3>Appearance</h3>
      <div class="fld"><span>Theme</span><div class="seg">${[['system', 'Match device'], ['light', 'Light'], ['dark', 'Dark'], ['oled', 'OLED black']].map(([k, l]) => `<button data-act="theme-mode" data-v="${k}" aria-pressed="${th.mode === k}">${l}</button>`).join('')}</div></div>
      <div class="fld"><span>Accent color</span><div class="swatches">${ACCENTS.map(([k, l, c]) => `<button class="swatch-btn" data-act="theme-accent" data-v="${k}" aria-pressed="${th.accent === k}" title="${l}" aria-label="${l}" style="background:${c}"></button>`).join('')}</div></div>
      <div class="fld"><span>Calendar weeks start on</span><div class="seg">${[[0, 'Sunday'], [1, 'Monday']].map(([k, l]) => `<button data-act="week-start" data-v="${k}" aria-pressed="${ws === k}">${l}</button>`).join('')}</div></div>
      <p class="muted small" style="margin:0">Saved to your account, so your phone and computer match.</p>
    </div>
    <div class="panel"><h3>Your week</h3>
      <div class="fld"><span>Visit days (suggested dates land on these)</span>${dp('visitDays', s.visitDays)}</div>
      <div class="fld"><span>Office days (shaded; moving a visit here shows a warning)</span>${dp('officeDays', s.officeDays)}</div>
      <div class="form"><label class="fld"><span>Day starts</span><input type="time" id="s-dayStart" data-set="dayStart" value="${s.dayStart}"></label><label class="fld"><span>Day ends</span><input type="time" id="s-dayEnd" data-set="dayEnd" value="${s.dayEnd}"></label>
      <label class="fld"><span>Visit length (min)</span><input type="number" min="15" step="15" id="s-vl" data-set="visitLength" data-num value="${s.visitLength}"></label><label class="fld"><span>Drive time between visits (min)</span><input type="number" min="0" step="5" id="s-buf" data-set="buffer" data-num value="${s.buffer}"></label>
      <label class="fld"><span>Most visits per day</span><input type="number" min="1" id="s-cap" data-set="maxVisitsPerDay" data-num value="${s.maxVisitsPerDay}"></label><label class="fld"><span>Show weekends on calendar</span><select id="s-we" data-set="showWeekend" data-bool><option value="false">No</option><option value="true" ${s.showWeekend ? 'selected' : ''}>Yes</option></select></label></div>
    </div>
    <div class="panel"><h3>Cadence</h3>
      <div class="form"><label class="fld"><span>Default cadence for new customers</span><div class="inline"><input type="number" min="1" id="s-dc" data-set="defaultCadence" data-num value="${s.defaultCadence}"><select id="s-du" data-set="defaultUnit"><option value="weeks">weeks</option><option value="days" ${s.defaultUnit === 'days' ? 'selected' : ''}>days</option></select></div></label>
      <label class="fld"><span>When you log an outcome</span><select id="s-an" data-set="autoNext" data-bool><option value="true">Propose the next one</option><option value="false" ${s.autoNext === false ? 'selected' : ''}>Don't schedule anything</option></select></label>
      <label class="fld"><span>Prospect follow-up (weeks)</span><input type="number" min="1" id="s-pc" data-set="prospectCadence" data-num value="${s.prospectCadence}"></label>
      <label class="fld"><span>Prospect is “going cold” after this many follow-ups</span><input type="number" min="1" id="s-cold" data-set="coldAfter" data-num value="${s.coldAfter}"></label></div>
      <p class="muted small" style="margin:0">The next date is counted from the original appointment date, even if the visit was missed or moved just that once. A day-based cadence that lands on an office day moves to the nearest visit day: Monday moves to Tuesday and Friday moves to Thursday.</p>
    </div>
    <div class="panel"><h3>Product categories</h3><p class="muted small" style="margin:0">The “Currently buying” checkboxes on each customer. Add more with the + on any customer.</p>
      <div class="list">${(s.productCategories || []).map(p => `<div class="li"><div class="grow">${esc(p)}</div><button class="btn sm danger" data-act="cat-del" data-v="${esc(p)}">Remove</button></div>`).join('') || '<div class="empty">None yet.</div>'}</div>
    </div>
    <div class="panel"><h3>Holidays & time off</h3><p class="muted small" style="margin:0">Blocked days are shaded on the calendar and skipped when suggesting dates.</p>
      <div class="list">${bl.length ? bl.map((b, i) => `<div class="li"><div class="grow"><b>${esc(b.label || 'Blocked')}</b><div class="muted small">${nice(b.start)}${b.end && b.end !== b.start ? ' – ' + nice(b.end) : ''}</div></div><button class="btn sm danger" data-act="bl-del" data-start="${b.start}" data-label="${esc(b.label || '')}">Remove</button></div>`).join('') : '<div class="empty">None yet.</div>'}</div>
      <div class="form"><label class="fld"><span>From</span><input type="date" id="bl-start"></label><label class="fld"><span>To (optional)</span><input type="date" id="bl-end"></label><label class="fld full"><span>Label</span><input id="bl-label" placeholder="Thanksgiving, PTO, sales meeting…"></label></div>
      <div><button class="btn" data-act="bl-add">Add blocked dates</button></div>
    </div>
    <div class="panel"><h3>Message templates</h3><p class="muted small" style="margin:0">Fill-ins: {first} {name} {kind} {day} {time} {notes} {next} {me}</p>
      <label class="fld"><span>Your name (for {me})</span><input id="s-sig" data-set="signature" value="${esc(s.signature)}"></label>
      <label class="fld"><span>Monday confirmation</span><textarea id="s-ct" data-set="confirmTemplate" rows="3">${esc(s.confirmTemplate)}</textarea></label>
      <label class="fld"><span>Friday recap</span><textarea id="s-rt" data-set="recapTemplate" rows="6">${esc(s.recapTemplate)}</textarea></label>
    </div>
  </div>`;
}
async function saveSettings(patch, quiet) {
  S.settings = { ...S.settings, ...patch };
  if (!needDb()) return;
  const { showWeekend, ...rest } = S.settings;
  await guard(S.db.doc('config/settings').set({ ...rest, showWeekend: !!showWeekend }), patch.theme || quiet ? null : 'Settings saved.');
}

/* ============ dialogs ============ */
function openDialog(html, bind, onClose, wide) {
  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.innerHTML = `<div class="dlg ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  $('#dlgs').appendChild(ov);
  const prev = document.activeElement;
  const close = () => { ov.remove(); document.removeEventListener('keydown', key); try { prev && prev.focus(); } catch (e) {} };
  const key = e => { if (e.key === 'Escape' && $('#dlgs').lastElementChild === ov) { close(); onClose && onClose(); } };
  document.addEventListener('keydown', key);
  ov.addEventListener('mousedown', e => { if (e.target === ov) { close(); onClose && onClose(); } });
  ov.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { close(); onClose && onClose(); });
  bind && bind(ov, close);
  const f = ov.querySelector('[autofocus]') || ov.querySelector('input, select, textarea, button:not(.x)');
  f && f.focus();
  return close;
}
function customerOptions(sel) {
  return [...S.customers.values()].sort((a, b) => custName(a).localeCompare(custName(b))).map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(custName(c))}${c.active === false ? ' (paused)' : ''}</option>`).join('');
}
function fmtBytes(n) { return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }
function filesBlock(apptId) {
  return `<div class="fld"><span>Files <span class="muted">(photos, quotes, order forms…)</span></span>
    <div class="files" id="fl-list"><div class="empty">Loading…</div></div>
    <div class="drop-zone" id="fl-drop"><label for="fl-in">Choose files</label> or drop them here<input type="file" id="fl-in" multiple hidden></div>
    <div class="muted small" id="fl-msg"></div></div>`;
}
function bindFiles(el, apptId) {
  const list = el.querySelector('#fl-list'), msg = el.querySelector('#fl-msg'), input = el.querySelector('#fl-in'), drop = el.querySelector('#fl-drop');
  const draw = async () => {
    try {
      const { files } = await api('GET', '/api/files?appt=' + encodeURIComponent(apptId));
      list.innerHTML = files.length ? files.map(f => {
        const img = /^image\/(png|jpe?g|gif|webp)$/i.test(f.mime);
        const ext = (f.name.split('.').pop() || '').slice(0, 4).toUpperCase();
        return `<div class="file">${img ? `<img class="thumb" src="/api/files/${f.id}" alt="" loading="lazy">` : `<span class="thumb">${esc(ext || 'FILE')}</span>`}<div class="grow"><a href="/api/files/${f.id}" target="_blank" rel="noopener">${esc(f.name)}</a><div class="muted small">${fmtBytes(f.size)} · ${new Date(f.created).toLocaleDateString()}</div></div><a class="btn sm" href="/api/files/${f.id}?download" download>Save</a><button class="btn sm danger" data-fdel="${f.id}">Remove</button></div>`;
      }).join('') : '<div class="empty">No files yet.</div>';
      list.querySelectorAll('[data-fdel]').forEach(b => b.onclick = async () => {
        if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = 'Confirm'; b.classList.add('solid'); return; }
        try { await api('DELETE', '/api/files/' + b.dataset.fdel); draw(); } catch (e) { msg.textContent = e.message || 'Couldn\'t remove it.'; }
      });
    } catch (e) { list.innerHTML = '<div class="empty">Couldn\'t load files.</div>'; }
  };
  const upload = async fileList => {
    for (const f of fileList) {
      msg.textContent = `Uploading ${f.name}…`;
      try { await api('POST', `/api/files?appt=${encodeURIComponent(apptId)}&name=${encodeURIComponent(f.name)}`, undefined, f); }
      catch (e) { msg.textContent = `${f.name}: ${e.message || 'upload failed'}`; return draw(); }
    }
    msg.textContent = ''; input.value = ''; draw();
  };
  input.onchange = () => upload([...input.files]);
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); upload([...e.dataTransfer.files]); };
  draw();
}
function apptDialog(a, preset = {}) {
  const isNew = !a;
  const cid = a?.customerId || preset.customerId || '';
  const c0 = S.customers.get(cid);
  const kind = a?.kind || c0?.kind || 'visit';
  const date = a?.date || preset.date || today();
  const time = a ? a.time : (preset.time || (kind === 'visit' ? findSlot(date, +(c0?.duration || set().visitLength), c0?.preferredTime) : ''));
  if (!S.customers.size) { toast('Add a customer first.'); return; }
  const prevTasks = a && isOpen(a) ? actionItems(a).filter(i => i.from !== a) : [];
  openDialog(`
    <div class="dlg-h"><h2>${isNew ? 'New appointment' : esc(apptName(a))}</h2>${a ? `<span class="pill ${a.status === 'confirmed' ? 'ok' : a.status === 'proposed' ? 'warn' : a.status === 'completed' ? '' : 'bad'}">${a.status}</span>` : ''}<button class="x" data-close aria-label="Close">×</button></div>
    <div class="dlg-b">
      <div class="form">
        <label class="fld full"><span>Customer</span><select id="ad-c">${isNew ? '<option value="">Choose…</option>' : ''}${customerOptions(cid)}</select></label>
        <label class="fld"><span>Type</span><select id="ad-k">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}" ${k === kind ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="fld"><span>Status</span><select id="ad-s">${['proposed', 'confirmed', 'completed', 'missed', 'cancelled'].map(s => `<option ${s === (a?.status || 'proposed') ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label class="fld"><span>Date</span><input type="date" id="ad-d" value="${date}"></label>
        <label class="fld"><span>Time <span class="muted">(blank = any time that day)</span></span><input type="time" id="ad-t" value="${time || ''}" step="900"></label>
        <label class="fld"><span>Length (min)</span><input type="number" id="ad-l" min="10" step="5" value="${a?.duration || c0?.duration || set().visitLength}"></label>
        <div class="fld"><span>Their rhythm</span><div class="small muted" id="ad-r" style="padding-top:6px"></div></div>
        <label class="fld full"><span>Agenda / prep notes</span><textarea id="ad-n" placeholder="What you plan to cover…">${esc(a?.notes || '')}</textarea></label>
        <label class="fld full"><span>Recap <span class="muted">(after the meeting; one point per line becomes a bullet in your Friday email)</span></span><textarea id="ad-rc" rows="5" placeholder="Reviewed Q4 order&#10;Wants pricing on bulk pallets&#10;Follow up with samples">${esc(a?.recap || '')}</textarea></label>
        ${prevTasks.length ? `<div class="note full"><div class="label" style="margin-bottom:4px">My action items from the ${KINDS[prevTasks[0].from.kind].toLowerCase()} on ${nice(prevTasks[0].from.date)}</div>${taskList(prevTasks, false)}</div>` : ''}
        <label class="fld full"><span>My action items <span class="muted">(what you'll do for them before the next meeting; one per line)</span></span><textarea id="ad-ai" rows="3" placeholder="e.g. Send bulk pallet pricing">${esc(a?.actions || '')}</textarea></label>
      </div>
      <div id="ad-w"></div>
      ${a ? filesBlock(a.id) : '<div class="note small">You can attach files after the appointment is added.</div>'}
    </div>
    <div class="dlg-f">${a ? `<button class="btn danger" id="ad-del">Delete</button>` : ''}<span class="spacer"></span>${a && a.recap ? '<button class="btn" id="ad-copy">Copy recap email</button>' : ''}${a && isOpen(a) ? '<button class="btn" id="ad-out">Log outcome…</button>' : ''}<button class="btn" data-close>Close</button><button class="btn primary" id="ad-save">${isNew ? 'Add' : 'Save'}</button></div>`,
    (el, close) => {
      const g = id => el.querySelector(id);
      if (a) bindFiles(el, a.id);
      const upd = () => {
        const c = S.customers.get(g('#ad-c').value);
        g('#ad-r').textContent = c ? `${cadenceLabel(c)}${hasHome(c) ? ', ' + DAYS_LONG[+c.homeDay] + 's' : ''}${a?.rhythmDate && a.rhythmDate !== a.date ? ' · originally ' + niceShort(a.rhythmDate) : ''}` : '—';
        const w = dayWarnings(g('#ad-d').value || date, g('#ad-k').value, a?.id);
        g('#ad-w').innerHTML = w.map(x => `<div class="note warn">${esc(x)}</div>`).join('');
      };
      g('#ad-c').onchange = () => { const c = S.customers.get(g('#ad-c').value); if (c && isNew) { g('#ad-k').value = c.kind || 'visit'; g('#ad-l').value = c.duration || set().visitLength; const due = dueDate(c); if (due && !preset.date) g('#ad-d').value = due < today() ? firstAllowedFrom(today(), c.kind) : due; if ((c.kind || 'visit') === 'visit' && !preset.time) g('#ad-t').value = findSlot(g('#ad-d').value, +g('#ad-l').value, c.preferredTime); } upd(); };
      g('#ad-d').onchange = upd; g('#ad-k').onchange = upd; upd();
      const cp = g('#ad-copy'); if (cp) cp.onclick = () => copyText(fill(set().recapTemplate, { ...a, recap: g('#ad-rc').value }), 'Recap copied. Paste it into your email.');
      g('#ad-save').onclick = async () => {
        const cid2 = g('#ad-c').value; if (!cid2) { toast('Choose a customer.'); return; }
        const d = g('#ad-d').value; if (!d) { toast('Pick a date.'); return; }
        const t = g('#ad-t').value, k = g('#ad-k').value, st = g('#ad-s').value, dur = +g('#ad-l').value || set().visitLength, notes = g('#ad-n').value, recap = g('#ad-rc').value, actions = g('#ad-ai').value;
        if (isNew) {
          close();
          const c = S.customers.get(cid2);
          if (c && !hasHome(c) && c.unit !== 'days' && k === 'visit') await guard(cRef(c.id).update({ homeDay: dow(d) }));
          const id = await createAppt({ customerId: cid2, date: d, time: t, kind: k, status: st === 'completed' ? 'proposed' : st, duration: dur, notes, recap, actions });
          if (id && st === 'completed') await setOutcome(S.appts.get(id), 'completed', { notes, recap, actions });
          else if (id) { toast('Added. Open it again to attach files.'); render(); }
          return;
        }
        close();
        const base = { kind: k, duration: dur, notes, recap, actions, actionsDone: (a.actionsDone || []).filter(x => lines(actions).includes(x)), customerId: cid2 };
        if (st !== a.status && ['completed', 'missed', 'cancelled'].includes(st) && isOpen(a)) {
          await guard(aRef(a.id).update({ ...base, date: d, time: t }));
          await setOutcome({ ...a, ...base, date: d, time: t }, st, { notes, recap, actions });
          return;
        }
        await guard(aRef(a.id).update({ ...base, status: st, time: d === a.date ? t : a.time }), d === a.date ? 'Saved.' : null);
        if (d !== a.date) requestMove({ ...a, ...base, status: st }, d, t);
      };
      if (a) {
        const del = g('#ad-del');
        del.onclick = async () => {
          if (del.dataset.armed) { close(); await guard(aRef(a.id).delete(), 'Deleted.'); S.appts.delete(a.id); render(); return; }
          del.dataset.armed = 1; del.textContent = S.fileCounts[a.id] ? 'Click again: deletes it and its files' : 'Click again to delete'; del.classList.add('solid');
        };
        const out = g('#ad-out'); if (out) out.onclick = () => { close(); outcomeDialog({ ...a, recap: g('#ad-rc').value, notes: g('#ad-n').value, actions: g('#ad-ai').value }); };
      }
    }, null, true);
}
function outcomeDialog(a, preStatus) {
  const c = S.customers.get(a.customerId);
  const rhythm = a.rhythmDate || a.date;
  const nextD = c ? nextDueFrom({ ...c, homeDay: hasHome(c) ? c.homeDay : (c.unit !== 'days' ? dow(rhythm) : '') }, rhythm) : '';
  openDialog(`
    <div class="dlg-h"><h2>${esc(apptName(a))}: ${KINDS[a.kind]} on ${nice(a.date)}</h2><button class="x" data-close aria-label="Close">×</button></div>
    <div class="dlg-b">
      <div class="fld"><span>What happened?</span><div class="seg" id="oc-s">${[['completed', 'Done'], ['missed', 'Missed / no-show'], ['cancelled', 'Cancelled']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${k === (preStatus || 'completed')}">${l}</button>`).join('')}</div></div>
      <label class="fld"><span>Recap <span class="muted">(one point per line; used in your Friday email)</span></span><textarea id="oc-n" rows="5" placeholder="What you covered, next steps…">${esc(a.recap || '')}</textarea></label>
      <label class="fld"><span>My action items <span class="muted">(what you'll do before the next meeting; one per line)</span></span><textarea id="oc-ai" rows="3" placeholder="Send bulk pallet pricing">${esc(a.actions || '')}</textarea></label>
      <p class="muted small" style="margin:0">To attach files, open the appointment after saving.</p>
      ${c ? `<div class="panel" style="padding:12px;background:var(--surface-2);border:0">
        <label class="cb"><input type="checkbox" id="oc-skip" ${set().autoNext === false || openApptFor(c.id, a.id) ? 'checked' : ''}><span>Don't schedule the next one${openApptFor(c.id, a.id) ? ' (they already have ' + nice(openApptFor(c.id, a.id).date) + ')' : ''}</span></label>
        <div id="oc-next" class="form">
          <label class="fld"><span>Next ${KINDS[c.kind || 'visit'].toLowerCase()}</span><input type="date" id="oc-d" value="${nextD}"></label>
          ${(c.kind || 'visit') === 'visit' ? `<label class="fld"><span>Time</span><input type="time" id="oc-t" step="900" value="${a.time || c.preferredTime || ''}"></label>` : '<div></div>'}
          <p class="muted small full" style="margin:0">Based on the original date (${nice(rhythm)}) plus ${cadenceLabel(c).toLowerCase()}.</p>
          <label class="cb full" id="oc-nr-wrap" hidden><input type="checkbox" id="oc-nr"><span>Make this their new rhythm going forward</span></label>
        </div>
      </div>` : ''}
    </div>
    <div class="dlg-f"><span class="spacer"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="oc-save">Save</button></div>`,
    (el, close) => {
      let st = preStatus || 'completed';
      el.querySelectorAll('#oc-s button').forEach(b => b.onclick = () => { st = b.dataset.v; el.querySelectorAll('#oc-s button').forEach(x => x.setAttribute('aria-pressed', x === b)); });
      const skip = el.querySelector('#oc-skip'), nx = el.querySelector('#oc-next'), d = el.querySelector('#oc-d');
      const sync = () => { if (nx) nx.hidden = skip.checked; };
      if (skip) { skip.onchange = sync; sync(); }
      if (d) d.onchange = () => { el.querySelector('#oc-nr-wrap').hidden = d.value === nextD; };
      el.querySelector('#oc-save').onclick = async () => {
        close();
        const o = { recap: el.querySelector('#oc-n').value, actions: el.querySelector('#oc-ai').value };
        if (a.notes !== undefined) o.notes = a.notes;
        if (c) {
          o.skipNext = skip.checked;
          if (!o.skipNext && d.value && d.value !== nextD) { o.nextDate = d.value; o.newRhythm = el.querySelector('#oc-nr').checked; }
          const tt = el.querySelector('#oc-t'); if (tt) o.nextTime = tt.value;
        }
        await setOutcome(a, st, o);
        render();
      };
    });
}
function customerDialog(c) {
  const isNew = !c;
  c = c || { kind: 'visit', cadence: set().defaultCadence, unit: set().defaultUnit, homeDay: '', active: true, duration: set().visitLength };
  const hist = isNew ? [] : [...S.appts.values()].filter(a => a.customerId === c.id).sort((a, b) => b.date.localeCompare(a.date));
  const st = isNew ? null : customerState(c);
  const due = isNew ? null : dueDate(c);
  openDialog(`
    <div class="dlg-h"><h2>${isNew ? 'New customer' : esc(custName(c))}</h2>${isNew ? '' : custTags(c)}${st ? `<span class="pill ${st.cls}">${st.text}</span>` : ''}<button class="x" data-close aria-label="Close">×</button></div>
    <div class="dlg-b">
      <div class="form">
        <label class="fld full"><span>Account / customer name</span><input id="cd-name" value="${esc(c.name)}" autofocus></label>
        <label class="fld"><span>Customer ID</span><input id="cd-custid" value="${esc(c.custId)}"></label>
        <label class="fld"><span>Contact person</span><input id="cd-contact" value="${esc(c.contact)}"></label>
        <label class="fld"><span>Phone</span><input id="cd-phone" type="tel" value="${esc(c.phone)}"></label>
        <label class="fld"><span>Email</span><input id="cd-email" type="email" value="${esc(c.email)}"></label>
        <label class="fld"><span>Address / city</span><input id="cd-address" value="${esc(c.address)}"></label>
        <label class="fld"><span>Competitor equipment brand</span><input id="cd-comp" list="cd-comp-list" autocomplete="off" value="${esc(c.competitor || '')}"><datalist id="cd-comp-list">${competitorNames().map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
        <label class="cb"><input type="checkbox" id="cd-prospect" ${c.prospect ? 'checked' : ''}><span>Prospect <span class="muted">(follow up every ${+set().prospectCadence || 2} weeks)</span></span></label>
        <label class="cb"><input type="checkbox" id="cd-assigned" ${c.assigned ? 'checked' : ''}><span>Assigned account</span></label>
        <div class="fld full"><span>Currently buying</span><div class="daypick" id="cd-prods"></div>
          <div class="row" id="cd-cat-add" hidden><input class="inp" id="cd-cat-new" placeholder="New category" style="max-width:220px"><button class="btn sm" id="cd-cat-ok" type="button">Add</button></div></div>
        <label class="fld"><span>How you touch them</span><select id="cd-kind">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}" ${k === (c.kind || 'visit') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="fld"><span>Cadence</span><div class="inline"><input type="number" min="1" id="cd-cad" value="${c.cadence || set().defaultCadence}" style="width:80px"><select id="cd-unit"><option value="weeks">weeks</option><option value="days" ${c.unit === 'days' ? 'selected' : ''}>days</option></select></div></label>
        <label class="fld"><span>Their day</span><select id="cd-home"><option value="">Not set (taken from first visit)</option>${[1, 2, 3, 4, 5].map(d => `<option value="${d}" ${String(c.homeDay) === String(d) ? 'selected' : ''}>${DAYS_LONG[d]}</option>`).join('')}</select></label>
        <label class="fld"><span>Preferred time</span><input type="time" id="cd-time" step="900" value="${esc(c.preferredTime || '')}"></label>
        <label class="fld"><span>Visit length (min)</span><input type="number" min="10" step="5" id="cd-dur" value="${c.duration || set().visitLength}"></label>
        <label class="fld"><span>Last on-rhythm date</span><input type="date" id="cd-rhythm" value="${esc(c.rhythmDate || '')}"></label>
        <label class="fld full"><span>Notes</span><textarea id="cd-notes">${esc(c.notes || '')}</textarea></label>
        <label class="cb full"><input type="checkbox" id="cd-active" ${c.active !== false ? 'checked' : ''}><span>Active. Uncheck to pause, which hides them from due lists without deleting anything.</span></label>
      </div>
      ${isNew ? '' : `<div class="note">${due ? `Next due <b>${nice(due)}</b>, counted from ${nice(c.rhythmDate)}.` : 'No visits logged yet. Schedule the first one, or set a last on-rhythm date above.'}${c.lastTouch ? ` Last touched ${nice(c.lastTouch)}.` : ''}</div>
      <div><div class="label" style="margin-bottom:4px">History</div><div class="list hist">${hist.length ? hist.map(a => `<div class="li"><span class="swatch ${evClass(a)}"></span><div class="grow"><button class="linkbtn" data-hist="${a.id}">${nice(a.date)}${a.time ? ' · ' + t12(a.time) : ''}</button><div class="muted small">${KINDS[a.kind]} · ${a.status}${(a.recap || a.notes) ? ' · ' + esc((a.recap || a.notes).slice(0, 80)) : ''}${S.fileCounts[a.id] ? ' · ' + ICON.clip + S.fileCounts[a.id] : ''}</div></div></div>`).join('') : '<div class="empty">Nothing yet.</div>'}</div></div>`}
    </div>
    <div class="dlg-f">${isNew ? '' : '<button class="btn danger" id="cd-del">Delete</button>'}<span class="spacer"></span>${!isNew && c.prospect ? '<button class="btn" id="cd-convert">Convert to customer</button>' : ''}${isNew ? '' : '<button class="btn" id="cd-sched">Schedule next</button><button class="btn" id="cd-log">Log a touch</button>'}<button class="btn" data-close>Close</button><button class="btn primary" id="cd-save">${isNew ? 'Add customer' : 'Save'}</button></div>`,
    (el, close) => {
      const g = id => el.querySelector(id);
      const read = () => ({
        name: g('#cd-name').value.trim(), custId: g('#cd-custid').value.trim(), contact: g('#cd-contact').value.trim(), phone: g('#cd-phone').value.trim(), email: g('#cd-email').value.trim(), address: g('#cd-address').value.trim(),
        kind: g('#cd-kind').value, cadence: Math.max(1, +g('#cd-cad').value || 3), unit: g('#cd-unit').value, homeDay: g('#cd-home').value === '' ? '' : +g('#cd-home').value,
        preferredTime: g('#cd-time').value, duration: +g('#cd-dur').value || set().visitLength, rhythmDate: g('#cd-rhythm').value, notes: g('#cd-notes').value, active: g('#cd-active').checked,
        prospect: g('#cd-prospect').checked, assigned: g('#cd-assigned').checked, competitor: g('#cd-comp').value.trim(),
        products: [...el.querySelectorAll('#cd-prods input:checked')].map(x => x.value),
      });
      // product checkboxes: your categories plus anything this customer already has, and a + to add one
      const drawProds = (checked = c.products || []) => {
        const cats = [...new Set([...(set().productCategories || []), ...checked])];
        g('#cd-prods').innerHTML = cats.map(p => `<label><input type="checkbox" value="${esc(p)}" ${checked.includes(p) ? 'checked' : ''}>${esc(p)}</label>`).join('') + '<button class="btn sm" id="cd-cat-plus" type="button" aria-label="Add a category" title="Add a category">+</button>';
        g('#cd-cat-plus').onclick = () => { g('#cd-cat-add').hidden = false; g('#cd-cat-new').focus(); };
      };
      drawProds();
      const addCat = async () => {
        const v = g('#cd-cat-new').value.trim(); if (!v) return;
        const cats = set().productCategories || [], have = [...el.querySelectorAll('#cd-prods input:checked')].map(x => x.value);
        const name = cats.find(x => x.toLowerCase() === v.toLowerCase()) || v;
        if (!cats.includes(name)) await saveSettings({ productCategories: [...cats, name] }, true);
        g('#cd-cat-new').value = ''; g('#cd-cat-add').hidden = true; drawProds([...have, name]);
      };
      g('#cd-cat-ok').onclick = addCat;
      g('#cd-cat-new').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addCat(); } };
      // ticking Prospect switches the cadence to prospect follow-ups; unticking puts back your default
      g('#cd-prospect').onchange = () => {
        const p = g('#cd-prospect').checked;
        g('#cd-cad').value = p ? (+set().prospectCadence || 2) : set().defaultCadence; g('#cd-unit').value = p ? 'weeks' : set().defaultUnit;
      };
      const cv = g('#cd-convert'); if (cv) cv.onclick = () => { g('#cd-prospect').checked = false; g('#cd-prospect').onchange(); g('#cd-save').click(); };
      g('#cd-save').onclick = async () => {
        const d = read(); if (!d.name) { toast('Add a name.'); return; }
        if (!needDb()) return;
        close();
        if (d.prospect && (isNew || !c.prospect)) d.prospectSince = today();
        if (d.competitor && !competitorNames().some(n => n.toLowerCase() === d.competitor.toLowerCase())) await saveSettings({ competitors: [...(set().competitors || []), d.competitor] }, true);
        if (isNew) { const id = uid(); if (await guard(cRef(id).set({ ...d, lastTouch: '', createdAt: Date.now() }), 'Customer added.')) S.customers.set(id, { id, ...d }); }
        else if (await guard(cRef(c.id).update(d), 'Saved.')) S.customers.set(c.id, { ...c, ...d });
        render();
      };
      if (!isNew) {
        el.querySelectorAll('[data-hist]').forEach(b => b.onclick = () => { close(); apptDialog(S.appts.get(b.dataset.hist)); });
        g('#cd-sched').onclick = () => { close(); const cc = { ...c, ...read() }; const dd = dueDate(cc); apptDialog(null, { customerId: c.id, date: dd && dd >= today() ? dd : firstAllowedFrom(today(), cc.kind) }); };
        g('#cd-log').onclick = () => { close(); logTouchDialog(c); };
        const del = g('#cd-del');
        del.onclick = async () => {
          if (!del.dataset.armed) { del.dataset.armed = 1; del.textContent = 'Click again: deletes customer and their upcoming appointments'; del.classList.add('solid'); return; }
          close();
          for (const a of [...S.appts.values()].filter(a => a.customerId === c.id && isOpen(a))) { await guard(aRef(a.id).delete()); S.appts.delete(a.id); }
          await guard(cRef(c.id).delete(), 'Customer deleted.'); S.customers.delete(c.id); render();
        };
      }
    });
}
function logTouchDialog(c) {
  openDialog(`
    <div class="dlg-h"><h2>Log a touch: ${esc(custName(c))}</h2><button class="x" data-close aria-label="Close">×</button></div>
    <div class="dlg-b"><p class="muted small" style="margin:0">For a call, email or drop-in that wasn't on the calendar.</p>
      <div class="form"><label class="fld"><span>Type</span><select id="lt-k">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}" ${k === (c.kind || 'visit') ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label class="fld"><span>Date</span><input type="date" id="lt-d" value="${today()}"></label>
      <label class="fld full"><span>Recap</span><textarea id="lt-n" placeholder="What you talked about…"></textarea></label>
      <label class="fld full"><span>My action items <span class="muted">(one per line)</span></span><textarea id="lt-ai" rows="3" placeholder="What you'll do before the next meeting…"></textarea></label>
      <label class="cb full"><input type="checkbox" id="lt-r" checked><span>Restart their cadence from this date${openApptFor(c.id) && openApptFor(c.id).status === 'proposed' ? ' and move their proposed ' + nice(openApptFor(c.id).date) + ' appointment to match' : ''}</span></label></div>
    </div>
    <div class="dlg-f"><span class="spacer"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="lt-save">Log it</button></div>`,
    (el, close) => {
      el.querySelector('#lt-save').onclick = async () => {
        if (!needDb()) return;
        close();
        const d = el.querySelector('#lt-d').value || today(), k = el.querySelector('#lt-k').value, restart = el.querySelector('#lt-r').checked;
        const doc = { customerId: c.id, name: custName(c), kind: k, date: d, time: '', duration: 30, status: 'completed', rhythmDate: d, notes: '', recap: el.querySelector('#lt-n').value, actions: el.querySelector('#lt-ai').value, recapSent: false, createdAt: Date.now(), outcomeAt: Date.now() };
        if (c.example) doc.example = true;
        const id = uid();
        await guard(aRef(id).set(doc)); S.appts.set(id, { id, ...doc });
        const cp = { lastTouch: d > (c.lastTouch || '') ? d : c.lastTouch };
        if (restart) cp.rhythmDate = d;
        await guard(cRef(c.id).update(cp));
        if (restart) {
          const cc = { ...c, ...cp }, nd = nextDueFrom(cc, d), open = openApptFor(c.id);
          if (open && open.status === 'proposed') { const t = open.kind === 'visit' ? findSlot(nd, +open.duration || 60, open.time, [], open.id) : open.time; await guard(aRef(open.id).update({ date: nd, time: t, rhythmDate: nd })); toast('Logged. Next moved to ' + nice(nd) + '.'); }
          else if (!open && set().autoNext !== false) { await proposeNext(cc, d); toast('Logged. Next proposed for ' + nice(nd) + '.'); }
          else toast('Logged.');
        } else toast('Logged.');
        render();
      };
    });
}

/* ============ templates / clipboard / export ============ */
function bullets(t) { return t ? t.split('\n').map(l => l.trim() ? '- ' + l.trim().replace(/^[-•*]\s*/, '') : '').filter(Boolean).join('\n') : '- '; }
function fill(tpl, a) {
  const c = S.customers.get(a.customerId) || {};
  const nextOpen = openApptFor(a.customerId, a.id);
  const next = nextOpen ? nice(nextOpen.date) : (c.rhythmDate ? nice(dueDate(c)) : 'a few weeks');
  return tpl.replace(/\{(\w+)\}/g, (m, k) => ({ first: firstName(c), name: apptName(a), kind: (KINDS[a.kind] || 'visit').toLowerCase(), day: DAYS_LONG[dow(a.date)] + ' ' + niceShort(a.date), time: a.time ? t12(a.time) : 'a time that works for you', recap: bullets(a.recap || a.notes), notes: a.notes ? a.notes.split('\n').map(l => l.trim() ? '- ' + l.trim().replace(/^[-•]\s*/, '') : '').filter(Boolean).join('\n') : '- ', next, me: set().signature || '' }[k] ?? m));
}
async function copyText(text, label) {
  try { await navigator.clipboard.writeText(text); toast(label || 'Copied.'); }
  catch (e) {
    openDialog(`<div class="dlg-h"><h2>Copy this text</h2><button class="x" data-close aria-label="Close">×</button></div><div class="dlg-b"><textarea class="inp" id="cp-t" rows="10">${esc(text)}</textarea></div><div class="dlg-f"><span class="spacer"></span><button class="btn" data-close>Done</button></div>`, el => { const t = el.querySelector('#cp-t'); setTimeout(() => { t.focus(); t.select(); }, 30); });
  }
}
const csvCell = v => { v = String(v ?? ''); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const usDate = s => { const d = toD(s); return pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + '/' + d.getFullYear(); };
function offerFile(filename, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
function exportWeek() {
  const ws = weekStartOf(S.anchor), we = addDays(ws, 6);
  const rows = [...S.appts.values()].filter(a => a.date >= ws && a.date <= we && isOpen(a)).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  if (!rows.length) { toast('Nothing open to export that week.'); return; }
  const head = ['Subject', 'Start Date', 'Start Time', 'End Date', 'End Time', 'All Day Event', 'Description', 'Location'];
  const lines = [head.join(',')].concat(rows.map(a => {
    const c = S.customers.get(a.customerId) || {};
    const end = a.time ? fromMin(toMin(a.time) + (+a.duration || 60)) : '';
    return [`${KINDS[a.kind]}: ${apptName(a)}${a.status === 'proposed' ? ' (tentative)' : ''}`, usDate(a.date), a.time ? t12(a.time) : '', usDate(a.date), end ? t12(end) : '', a.time ? 'False' : 'True',
      [c.contact, c.phone, c.email, a.notes, a.recap].filter(Boolean).join(' | '), c.address || ''].map(csvCell).join(',');
  }));
  offerFile(`cadence-week-${ws}.csv`, lines.join('\r\n'));
}
function exportCustomers() {
  const head = ['Name', 'Customer ID', 'Prospect', 'Assigned', 'Currently buying', 'Competitor brand', 'Contact', 'Phone', 'Email', 'Address', 'Type', 'Cadence', 'Unit', 'Day', 'Preferred time', 'Last touch', 'Last on-rhythm date', 'Next due', 'Active', 'Notes'];
  const lines = [head.join(',')].concat([...S.customers.values()].sort((a, b) => custName(a).localeCompare(custName(b))).map(c => [c.name, c.custId, c.prospect ? 'Yes' : 'No', c.assigned ? 'Yes' : 'No', (c.products || []).join('; '), c.competitor, c.contact, c.phone, c.email, c.address, KINDS[c.kind || 'visit'], c.cadence, c.unit || 'weeks', hasHome(c) ? DAYS_LONG[+c.homeDay] : '', c.preferredTime, c.lastTouch, c.rhythmDate, dueDate(c) || '', c.active === false ? 'No' : 'Yes', c.notes].map(csvCell).join(',')));
  offerFile(`customers-${today()}.csv`, lines.join('\r\n'));
}

/* ============ import ============ */
const IMPORT_FIELDS = [
  ['custId', 'Customer ID', ['customer id', 'cust id', 'customer #', 'cust #', 'customer number', 'customer no', 'account id', 'account number', 'account #', 'acct', 'id']],
  ['prospect', 'Prospect (yes/no)', ['prospect', 'stage']],
  ['assigned', 'Assigned account (yes/no)', ['assigned', 'assigned account']],
  ['products', 'Currently buying', ['currently buying', 'products', 'buying', 'product lines', 'categories']],
  ['competitor', 'Competitor brand', ['competitor', 'competitor brand', 'competition']],
  ['email', 'Email', ['email', 'e-mail']],
  ['phone', 'Phone', ['phone', 'mobile', 'cell', 'tel']],
  ['contact', 'Contact person', ['contact', 'first name', 'person', 'buyer', 'owner']],
  ['name', 'Account / customer name *', ['account', 'customer', 'company', 'business', 'name', 'client']],
  ['address', 'Address / city', ['address', 'street', 'city', 'location', 'territory']],
  ['kind', 'Visit / call / email', ['type', 'method', 'touch', 'channel', 'mode']],
  ['cadence', 'Cadence', ['cadence', 'frequency', 'freq', 'interval', 'weeks', 'cycle']],
  ['lastTouch', 'Last visit date', ['last', 'previous', 'date']],
  ['homeDay', 'Their day', ['day']],
  ['notes', 'Notes', ['note', 'comment', 'remarks']],
];
function parseDelimited(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/)[0] || '';
  const delim = (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? '\t' : ((firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',');
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"' && cell === '') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => String(v).trim() !== ''));
}
function guessMap(headers) {
  const used = new Set(), map = {};
  for (const [f, , keys] of IMPORT_FIELDS) {
    let idx = -1;
    for (const k of keys) { idx = headers.findIndex((h, i) => !used.has(i) && String(h).toLowerCase().trim() === k); if (idx >= 0) break; }
    if (idx < 0) for (const k of keys.filter(k => k.length > 2)) { idx = headers.findIndex((h, i) => !used.has(i) && String(h).toLowerCase().includes(k)); if (idx >= 0) break; }
    if (idx >= 0) { map[f] = idx; used.add(idx); } else map[f] = -1;
  }
  return map;
}
function normYes(v) { return /^(y|yes|true|1|x|✓|prospect|assigned)/i.test(String(v || '').trim()); }
function normProducts(v) { const cats = set().productCategories || []; return [...new Set(String(v).split(/[;,|\n]/).map(x => x.trim()).filter(Boolean).map(x => cats.find(k => k.toLowerCase() === x.toLowerCase()) || x))]; }
function normKind(v) { v = String(v || '').toLowerCase(); if (!v) return null; if (/e-?mail/.test(v)) return 'email'; if (/text|sms/.test(v)) return 'text'; if (/call|phone/.test(v)) return 'call'; if (/visit|in.?person|onsite|on-site|f2f|face/.test(v)) return 'visit'; return null; }
function normCadence(v) { v = String(v || '').toLowerCase(); const n = parseFloat(v); if (!n) return null; return { cadence: Math.round(n), unit: /day|\bd\b/.test(v) ? 'days' : 'weeks' }; }
function normDay(v) { v = String(v || '').toLowerCase().trim(); if (!v) return ''; const i = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].findIndex(d => v.startsWith(d)); return i >= 1 && i <= 5 ? i : ''; }
function normDate(v) {
  v = String(v || '').trim(); if (!v) return '';
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/); if (m) { let y = +m[3]; if (y < 100) y += 2000; return `${y}-${pad(+m[1])}-${pad(+m[2])}`; }
  if (/^\d{5}$/.test(v)) { const d = new Date(Math.round((+v - 25569) * 86400000)); return fmt(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12)); }
  const d = new Date(v); return isNaN(d) ? '' : fmt(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12));
}
function importDialog() {
  let rows = null, headers = [], map = {};
  const close = openDialog(`
    <div class="dlg-h"><h2>Import customers</h2><button class="x" data-close aria-label="Close">×</button></div>
    <div class="dlg-b" id="im-b">
      <div class="note">Use a spreadsheet (.xlsx) or CSV exported from your CRM, or copy rows from Excel and paste them below. The first row should hold column names. Only a name column is required.</div>
      <label class="fld"><span>Choose a file</span><input type="file" id="im-f" accept=".csv,.tsv,.txt,.xlsx"></label>
      <label class="fld"><span>…or paste rows</span><textarea id="im-p" rows="5" placeholder="Account&#9;Contact&#9;Phone&#9;Type&#9;Cadence&#10;Harlan Feed&#9;Dana Ruiz&#9;555-0134&#9;Visit&#9;3 weeks"></textarea></label>
      <div><button class="btn" id="im-read">Read pasted rows</button></div>
      <div id="im-map"></div>
    </div>
    <div class="dlg-f"><span class="muted small" id="im-count"></span><span class="spacer"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="im-go" disabled>Import</button></div>`,
    (el, close) => {
      const g = id => el.querySelector(id);
      const load = data => {
        if (!data || data.length < 2) { toast('Need a header row plus at least one customer.'); return; }
        headers = data[0].map(h => String(h ?? '').trim()); rows = data.slice(1); map = guessMap(headers); drawMap();
      };
      g('#im-f').onchange = async () => {
        const f = g('#im-f').files[0]; if (!f) return;
        try {
          if (/\.xls$/i.test(f.name)) { toast('That\'s an old .xls file. In Excel, use Save As → .xlsx or CSV, then import that.'); return; }
          if (/\.xlsx$/i.test(f.name)) load(await readXlsx(await f.arrayBuffer()));
          else load(parseDelimited(await f.text()));
        } catch (e) { console.error(e); toast('Couldn\'t read that file. Try saving it as CSV.'); }
      };
      g('#im-read').onclick = () => load(parseDelimited(g('#im-p').value));
      function drawMap() {
        const sel = f => `<select data-map="${f}"><option value="-1">— skip —</option>${headers.map((h, i) => `<option value="${i}" ${map[f] === i ? 'selected' : ''}>${esc(h || 'Column ' + (i + 1))}</option>`).join('')}</select>`;
        g('#im-map').innerHTML = `<h3>Match your columns</h3>
          <div class="tbl-wrap"><table class="maptbl"><tbody>${IMPORT_FIELDS.slice().sort((a, b) => a[0] === 'name' ? -1 : b[0] === 'name' ? 1 : 0).map(([f, l]) => `<tr><td>${l}</td><td>${sel(f)}</td></tr>`).join('')}</tbody></table></div>
          <div class="form"><label class="fld"><span>If no type is given, use</span><select id="im-dk">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
          <label class="fld"><span>If no cadence is given, use</span><div class="inline"><input type="number" id="im-dc" min="1" value="${set().defaultCadence}" style="width:80px"><select id="im-du"><option value="weeks">weeks</option><option value="days" ${set().defaultUnit === 'days' ? 'selected' : ''}>days</option></select></div></label>
          <label class="cb full"><input type="checkbox" id="im-up" checked><span>If a customer with the same ID or name already exists, update it instead of adding a duplicate</span></label></div>
          <div class="label">Preview</div><div class="prev" id="im-prev"></div>`;
        g('#im-map').querySelectorAll('[data-map]').forEach(s => s.onchange = () => { map[s.dataset.map] = +s.value; preview(); });
        ['#im-dk', '#im-dc', '#im-du'].forEach(id => g(id).onchange = preview);
        preview();
      }
      function build() {
        const dk = g('#im-dk').value, dc = Math.max(1, +g('#im-dc').value || 3), du = g('#im-du').value;
        const val = (r, f) => map[f] >= 0 ? String(r[map[f]] ?? '').trim() : '';
        return rows.map(r => {
          const name = val(r, 'name') || val(r, 'contact'); if (!name) return null;
          const prospect = map.prospect >= 0 ? normYes(val(r, 'prospect')) : undefined;
          const cad = normCadence(val(r, 'cadence')) || (prospect ? { cadence: +set().prospectCadence || 2, unit: 'weeks' } : { cadence: dc, unit: du });
          const last = normDate(val(r, 'lastTouch'));
          let home = normDay(val(r, 'homeDay'));
          if (home === '' && last && cad.unit === 'weeks') { const w = dow(last); if (w >= 1 && w <= 5) home = w; }
          return { name, custId: val(r, 'custId'), contact: val(r, 'contact') !== name ? val(r, 'contact') : '', phone: val(r, 'phone'), email: val(r, 'email'), address: val(r, 'address'), kind: normKind(val(r, 'kind')) || dk, ...cad, homeDay: home, lastTouch: last, rhythmDate: last, notes: val(r, 'notes'), competitor: val(r, 'competitor'),
            // only set flags and products when that column was matched, so an update doesn't wipe them
            ...(prospect !== undefined ? { prospect } : {}), ...(map.assigned >= 0 ? { assigned: normYes(val(r, 'assigned')) } : {}),
            ...(val(r, 'products') ? { products: normProducts(val(r, 'products')) } : {}) };
        }).filter(Boolean);
      }
      function preview() {
        if (map.name < 0 && map.contact < 0) { g('#im-prev').innerHTML = '<div class="empty" style="padding:8px">Pick which column holds the customer name.</div>'; g('#im-go').disabled = true; g('#im-count').textContent = ''; return; }
        const b = build();
        g('#im-prev').innerHTML = `<table><thead><tr><th>Name</th><th>ID</th><th>Contact</th><th>Type</th><th>Cadence</th><th>Day</th><th>Last visit</th></tr></thead><tbody>${b.slice(0, 6).map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.custId)}</td><td>${esc(c.contact)}</td><td>${KINDS[c.kind]}</td><td>${cadenceLabel(c)}</td><td>${c.homeDay !== '' ? DAYS[c.homeDay] : '—'}</td><td>${c.lastTouch ? niceShort(c.lastTouch) : '—'}</td></tr>`).join('')}</tbody></table>`;
        g('#im-count').textContent = `${b.length} customer${b.length === 1 ? '' : 's'} ready`;
        g('#im-go').disabled = !b.length;
      }
      g('#im-go').onclick = async () => {
        if (!needDb()) return;
        const b = build(), upd = g('#im-up').checked;
        const newCats = [...new Set(b.flatMap(c => c.products || []))].filter(x => !(set().productCategories || []).includes(x));
        if (newCats.length) await saveSettings({ productCategories: [...(set().productCategories || []), ...newCats] }, true);
        const byName = new Map([...S.customers.values()].map(c => [custName(c).toLowerCase(), c]));
        const byId = new Map([...S.customers.values()].filter(c => c.custId).map(c => [String(c.custId).toLowerCase(), c]));
        g('#im-go').disabled = true;
        let added = 0, updated = 0, failed = 0, i = 0;
        const jobs = b.map(c => async () => {
          const ex = upd ? (c.custId && byId.get(c.custId.toLowerCase())) || byName.get(c.name.toLowerCase()) : null;
          try {
            if (ex) { const patch = {}; for (const [k, v] of Object.entries(c)) if (v !== '' && v != null) patch[k] = v; await cRef(ex.id).update(patch); updated++; }
            else { await cRef(uid()).set({ ...c, preferredTime: '', duration: set().visitLength, active: true, createdAt: Date.now() }); added++; }
          } catch (e) { failed++; }
          g('#im-count').textContent = `Importing… ${++i} of ${b.length}`;
        });
        for (let k = 0; k < jobs.length; k += 8) await Promise.all(jobs.slice(k, k + 8).map(j => j()));
        close();
        toast(`Imported: ${added} added${updated ? ', ' + updated + ' updated' : ''}${failed ? ', ' + failed + ' failed' : ''}.`);
      };
    }, null, true);
}

/* ============ events ============ */
$('#main').addEventListener('click', async e => {
  if (suppressClick) { suppressClick = false; return; }
  const ap = e.target.closest('[data-appt]');
  if (ap && !e.target.closest('[data-act]')) { const a = S.appts.get(ap.dataset.appt); if (a) apptDialog(a); return; }
  const t = e.target.closest('[data-act]');
  if (!t) {
    const col = e.target.closest('[data-col]');
    if (col && !e.target.closest('.ev')) {
      const r = col.getBoundingClientRect(), gs = +set().gridStart || 7;
      const m = Math.floor(((e.clientY - r.top) / PX * 60 + gs * 60) / 30) * 30;
      apptDialog(null, { date: col.dataset.col, time: fromMin(m) });
      return;
    }
    const ad = e.target.closest('[data-allday]');
    if (ad) apptDialog(null, { date: ad.dataset.allday, time: '' });
    return;
  }
  const act = t.dataset.act, id = t.dataset.id;
  const a = id ? S.appts.get(id) : null;
  switch (act) {
    case 'wk': S.anchor = addDays(weekStartOf(S.anchor), +t.dataset.d); render(); break;
    case 'wk-this': S.anchor = today(); render(); break;
    case 'wk-next': S.anchor = addDays(weekStartOf(today()), 7); render(); break;
    case 'mo': { const d = toD(S.monthAnchor); S.monthAnchor = fmt(new Date(d.getFullYear(), d.getMonth() + +t.dataset.d, 1, 12)); render(); break; }
    case 'mo-today': S.monthAnchor = today(); render(); break;
    case 'mo-day': S.anchor = t.dataset.date; S.view = 'week'; render(); break;
    case 'goto': S.view = t.dataset.view; render(); window.scrollTo(0, 0); break;
    case 'goto-week': S.anchor = t.dataset.date; S.view = 'week'; render(); window.scrollTo(0, 0); break;
    case 'pw': S.planWeek = addDays(S.planWeek, +t.dataset.d); render(); break;
    case 'cw': S.confirmWeek = addDays(S.confirmWeek, +t.dataset.d); render(); break;
    case 'new-appt': apptDialog(null, { date: t.dataset.date }); break;
    case 'open-appt': if (a) apptDialog(a); break;
    case 'outcome': if (a) outcomeDialog(a, t.dataset.status); break;
    case 'quick-done': if (a) { await setOutcome(a, 'completed'); render(); } break;
    case 'confirm': if (a && needDb()) { await guard(aRef(a.id).update({ status: 'confirmed' }), 'Confirmed.'); } break;
    case 'unconfirm': if (a && needDb()) { await guard(aRef(a.id).update({ status: 'proposed' })); } break;
    case 'task-toggle': if (a && needDb()) {
      const done = new Set(a.actionsDone || []); if (t.checked) done.add(t.dataset.t); else done.delete(t.dataset.t);
      a.actionsDone = [...done]; render(); await guard(aRef(a.id).update({ actionsDone: a.actionsDone }));
    } break;
    case 'recap-toggle': if (a && needDb()) await guard(aRef(a.id).update({ recapSent: !a.recapSent })); break;
    case 'copy-recap': if (a) copyText(fill(set().recapTemplate, a), 'Recap copied. Paste it into your email.'); break;
    case 'copy-confirm': if (a) copyText(fill(set().confirmTemplate, a), 'Message copied.'); break;
    case 'export-week': exportWeek(); break;
    case 'theme-mode': await saveSettings({ theme: { ...DEFAULT_SETTINGS.theme, ...(set().theme || {}), mode: t.dataset.v } }); applyTheme(); render(); break;
    case 'week-start': await saveSettings({ weekStart: +t.dataset.v }); render(); break;
    case 'theme-accent': await saveSettings({ theme: { ...DEFAULT_SETTINGS.theme, ...(set().theme || {}), accent: t.dataset.v } }); applyTheme(); render(); break;
    case 'export-cust': exportCustomers(); break;
    case 'sched-cust': { const c = S.customers.get(id); if (c) { const dd = dueDate(c); apptDialog(null, { customerId: c.id, date: dd && dd >= today() ? dd : firstAllowedFrom(today(), c.kind) }); } break; }
    case 'open-cust': { const c = S.customers.get(id); if (c) customerDialog(c); break; }
    case 'new-cust': customerDialog(null); break;
    case 'import': importDialog(); break;
    case 'cat-del': await saveSettings({ productCategories: (set().productCategories || []).filter(p => p !== t.dataset.v) }); render(); break;
    case 'cfilter': S.filter = t.dataset.f; render(); break;
    case 'csort': S.sort = t.dataset.s; render(); break;
    case 'plan-one': { const c = S.customers.get(id); const sel = document.getElementById('pd-' + id); if (c) await planAdd([{ c, due: dueDate(c), day: sel ? sel.value : suggestDay(c, S.planWeek, dueDate(c)) }]); break; }
    case 'plan-all': { const items = planCandidates(S.planWeek).map(x => { const sel = document.getElementById('pd-' + x.c.id); return { ...x, day: sel ? sel.value : x.day }; }); await planAdd(items); break; }
    case 'clear-examples': {
      if (!t.dataset.armed) { t.dataset.armed = 1; t.textContent = 'Click again to delete examples'; t.classList.add('danger', 'solid'); return; }
      if (!needDb()) return;
      const as = [...S.appts.values()].filter(x => x.example || S.customers.get(x.customerId)?.example), cs = [...S.customers.values()].filter(x => x.example);
      for (const x of as) await guard(aRef(x.id).delete());
      for (const x of cs) await guard(cRef(x.id).delete());
      toast('Examples deleted.'); break;
    }
    case 'bl-add': {
      const s = $('#bl-start').value, en = $('#bl-end').value, l = $('#bl-label').value.trim();
      if (!s) { toast('Pick a start date.'); return; }
      await saveSettings({ blackouts: [...(set().blackouts || []), { start: s, end: en && en > s ? en : s, label: l || 'Blocked' }] }); render(); break;
    }
    case 'bl-del': await saveSettings({ blackouts: (set().blackouts || []).filter(b => !(b.start === t.dataset.start && (b.label || '') === t.dataset.label)) }); render(); break;
  }
});
$('#main').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.mc')) { e.preventDefault(); e.target.click(); } });
$('#main').addEventListener('input', e => { if (e.target.id === 'cust-q') { S.q = e.target.value; render(); } });
$('#main').addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.set) {
    let v = el.value; if ('num' in el.dataset) v = Math.max(0, +v || 0); if ('bool' in el.dataset) v = v === 'true';
    saveSettings({ [el.dataset.set]: v });
  } else if (el.dataset.setArr) {
    const name = el.dataset.setArr, vals = [...document.querySelectorAll(`[data-set-arr="${name}"]:checked`)].map(x => +x.value);
    saveSettings({ [name]: vals }).then(render);
  }
});

/* drag and drop on the week grid */
let suppressClick = false;
$('#main').addEventListener('pointerdown', e => {
  if (S.view !== 'week' || S.mobile || e.button !== 0) return;
  const el = e.target.closest('.cal [data-appt]'); if (!el) return;
  const a = S.appts.get(el.dataset.appt); if (!a) return;
  dragging = { a, el, x: e.clientX, y: e.clientY, moved: false, offY: e.clientY - el.getBoundingClientRect().top, pid: e.pointerId, over: null };
});
window.addEventListener('pointermove', e => {
  const d = dragging; if (!d) return;
  const dx = e.clientX - d.x, dy = e.clientY - d.y;
  if (!d.moved && Math.hypot(dx, dy) < 6) return;
  if (!d.moved) { d.moved = true; d.el.classList.add('dragging'); try { d.el.setPointerCapture(d.pid); } catch (er) {} }
  d.el.style.transform = `translate(${dx}px, ${dy}px)`;
  const tgt = document.elementsFromPoint(e.clientX, e.clientY).find(x => x !== d.el && (x.dataset.col || x.dataset.allday));
  if (d.over !== tgt) { d.over && d.over.classList.remove('drop'); d.over = tgt; tgt && tgt.classList.add('drop'); }
});
window.addEventListener('pointerup', e => {
  const d = dragging; if (!d) return;
  dragging = null;
  if (!d.moved) { if (pendingRender) { pendingRender = false; requestRender(); } return; }
  suppressClick = true; setTimeout(() => suppressClick = false, 50);
  d.over && d.over.classList.remove('drop');
  const tgt = d.over;
  d.el.style.transform = ''; d.el.classList.remove('dragging');
  if (tgt) {
    let date, time = d.a.time;
    if (tgt.dataset.col) {
      date = tgt.dataset.col;
      const r = tgt.getBoundingClientRect(), gs = +set().gridStart || 7;
      time = fromMin(Math.round(((e.clientY - d.offY - r.top) / PX * 60 + gs * 60) / 15) * 15);
    } else { date = tgt.dataset.allday; if (isTouch(d.a.kind)) time = ''; }
    requestMove(d.a, date, time);
  }
  pendingRender = false; render();
});
window.addEventListener('pointercancel', () => { if (dragging) { dragging.el.style.transform = ''; dragging = null; render(); } });

/* ============ boot ============ */
let online = true;
function setOnline(v) {
  if (v === online) return; online = v;
  const b = $('#banner'); b.hidden = v; b.textContent = v ? '' : 'Can\'t reach the server. Changes won\'t save until the connection is back.';
  S.status = v ? 'ready' : 'offline'; syncText();
}
let refreshTimer = null;
function refreshSoon() { clearTimeout(refreshTimer); refreshTimer = setTimeout(loadState, 120); }
async function loadState() {
  try {
    const st = await api('GET', '/api/state');
    S.customers = new Map(st.customers.map(c => [c.id, c]));
    S.appts = new Map(st.appointments.map(a => [a.id, a]));
    S.settings = { ...DEFAULT_SETTINGS, ...(st.settings || {}) };
    S.fileCounts = st.fileCounts || {};
    S.user = st.user; S.status = 'ready';
    applyTheme(); requestRender();
  } catch (e) { if (e.code !== 'unauth') console.error(e); }
}
function listen() {
  if (!window.EventSource) { setInterval(loadState, 30000); return; }
  let last = null;
  const es = new EventSource('/api/events');
  es.onmessage = ev => { if (ev.data !== last) { last = ev.data; loadState(); } setOnline(true); };
  es.onerror = () => { setOnline(false); fetch('/api/session', { credentials: 'same-origin' }).then(r => r.json()).then(s => { setOnline(true); if (!s.user) location.href = '/login'; }).catch(() => {}); };
}
/* account menu */
const menuBtn = $('#menu-btn'), menuPop = $('#menu-pop');
menuBtn.onclick = e => { e.stopPropagation(); menuPop.hidden = !menuPop.hidden; menuBtn.setAttribute('aria-expanded', !menuPop.hidden); if (!menuPop.hidden) { $('#menu-who').textContent = 'Signed in as ' + (S.user?.username || ''); drawThemeMenu(); } };
document.addEventListener('click', e => { if (!menuPop.hidden && !menuPop.contains(e.target)) { menuPop.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); } });
const THEME_MODES = [['system', 'Match device'], ['light', 'Light'], ['dark', 'Dark'], ['oled', 'OLED black']];
const drawThemeMenu = () => {
  const mode = { ...DEFAULT_SETTINGS.theme, ...(set().theme || {}) }.mode;
  $('#menu-themes').innerHTML = THEME_MODES.map(([k, l]) => `<button data-mode="${k}" aria-pressed="${mode === k}"><span class="tick">${mode === k ? ICON.check : ''}</span>${l}</button>`).join('');
};
$('#menu-themes').onclick = async e => {
  const b = e.target.closest('[data-mode]'); if (!b) return;
  await saveSettings({ theme: { ...DEFAULT_SETTINGS.theme, ...(set().theme || {}), mode: b.dataset.mode } }); applyTheme(); drawThemeMenu(); render();
};
$('#menu-out').onclick = async () => { try { await api('POST', '/api/logout'); } catch (e) {} location.href = '/login'; };
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
// Install as an app: use the browser's own prompt when it offers one, otherwise explain how
let installPrompt = null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
if (standalone()) $('#menu-install').hidden = true;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; });
addEventListener('appinstalled', () => { installPrompt = null; $('#menu-install').hidden = true; toast('Installed. Open it from your home screen.'); });
$('#menu-install').onclick = async () => {
  menuPop.hidden = true;
  if (installPrompt) { installPrompt.prompt(); const { outcome } = await installPrompt.userChoice; if (outcome === 'accepted') installPrompt = null; return; }
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  openDialog(`
    <div class="dlg-h"><h2>Install the app</h2><button class="x" data-close aria-label="Close">×</button></div>
    <div class="dlg-b">
      ${!isSecureContext ? `<div class="note warn">You're on a plain <b>http://</b> address, so your phone can only add a shortcut, not install the app. Open the app at its <b>https://</b> address instead. You can set that up under Admin → HTTPS.</div>` : ''}
      ${ios ? `<ol class="steps"><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button.</li><li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol>`
        : `<ol class="steps"><li>Open this page in <b>Chrome</b>.</li><li>Tap the <b>⋮</b> menu at the top right.</li><li>Tap <b>Install app</b> (or <b>Add to Home screen</b>, then <b>Install</b>).</li></ol><p class="muted small" style="margin:0">If you don't see Install app, the app may already be installed. Check your home screen and app drawer for Sales Cadence Tool.</p>`}
    </div>
    <div class="dlg-f"><span class="spacer"></span><button class="btn primary" data-close>Got it</button></div>`, () => {});
};
render();
loadState().then(listen);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadState(); });
setInterval(() => { if (S.view === 'week' && !dragging && !document.querySelector('.ov')) requestRender(); }, 5 * 60 * 1000);
