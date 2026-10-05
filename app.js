'use strict';

// ---------- storage ----------
const S = {
  get(k, d) { try { const v = localStorage.getItem('lb.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('lb.' + k, JSON.stringify(v)); } catch (e) { toast('Could not save - storage is full or blocked'); } }
};
const KEYS = ['user', 'entries', 'routine', 'schedule', 'holidays', 'settings', 'suggest'];
const state = {
  user: S.get('user', ''),
  entries: S.get('entries', {}),
  routine: S.get('routine', DEFAULT_ROUTINE),
  schedule: S.get('schedule', []),
  holidays: S.get('holidays', DEFAULT_HOLIDAYS),
  settings: S.get('settings', {}),
  suggest: S.get('suggest', {})
};
const save = (...keys) => keys.forEach(k => S.set(k, state[k]));

// ---------- helpers ----------
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const today = () => ymd(new Date());
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtDate = s => { const d = parse(s); return `${WD[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`; };
const fmtMonth = m => { const [y, mo] = m.split('-').map(Number); return `${MON[mo - 1]} ${y}`; };
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };
const catOf = c => CATS[c] || CATS.other;

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------- schedule and day logic ----------
function normEvent(e) {
  let date = String(e.date || '').trim();
  const m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/.exec(date);
  if (m) date = `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = '';
  const ev = {
    src: String(e.src || ''), date, time: String(e.time || '').trim(),
    cat: CATS[e.cat] ? e.cat : 'other', batch: String(e.batch || '').trim(),
    title: String(e.title || '').trim(), faculty: String(e.faculty || '').trim(), jr: String(e.jr || '').trim()
  };
  ev.id = e.id || hash([ev.cat, ev.batch, ev.date, ev.time, ev.title].join('|'));
  return ev;
}

// Built-in schedules apply until a provider publishes the same type, batch and month.
const BUILTIN = BUILTIN_SCHEDULE.map(normEvent);
function allEvents() {
  const published = new Set(state.schedule.map(e => e.src + '@' + e.date.slice(0, 7)));
  return BUILTIN.filter(e => !published.has(e.src + '@' + e.date.slice(0, 7))).concat(state.schedule);
}
const eventsOn = date => allEvents().filter(e => e.date === date).sort((a, b) => timeRank(a.time) - timeRank(b.time));
function timeRank(t) {
  const m = /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i.exec(t || '');
  if (!m) return 9999;
  let h = +m[1] % 12;
  if (/pm/i.test(m[3] || '')) h += 12;
  return h * 60 + (+m[2] || 0);
}

function holidayOn(date) {
  const h = state.holidays.find(x => x.date === date);
  if (h) return h.title;
  const e = allEvents().find(x => x.date === date && x.cat === 'holiday');
  return e ? e.title || 'Holiday' : '';
}
const entryOf = date => state.entries[date] || { items: [] };
const isFilled = date => entryOf(date).items.length > 0;
function isWorking(date) {
  const wd = parse(date).getDay();
  if (wd === 0 || (wd === 6 && state.settings.satOff)) return false;
  if (holidayOn(date)) return false;
  return entryOf(date).mark !== 'leave';
}
const isMissed = date => date < today() && date >= (state.settings.startDate || today()) && isWorking(date) && !isFilled(date);

const firstName = () => state.user.replace(/^dr\.?\s*/i, '').split(/\s+/)[0];
// Schedules use short names ("Dr Karan" for Karansen), so match on the start of the first name.
function isMine(e) {
  const first = firstName().toLowerCase();
  if (first.length < 3) return false;
  return e.jr.toLowerCase().replace(/\bdr\.?/g, ' ').split(/[^a-z]+/).some(t => t.length >= 4 && (first.startsWith(t) || t.startsWith(first)));
}
const eventLabel = e => `${catOf(e.cat).short}${e.batch ? ' (' + e.batch + ')' : ''}${e.title ? ': ' + e.title : ''}`;

function plan(date) {
  const d = parse(date), out = [];
  if (isWorking(date)) {
    for (const r of state.routine) {
      if (r.days.includes(d.getDay()) && !(r.skipMonths || []).includes(d.getMonth() + 1)) out.push({ key: 'r:' + r.id, label: r.label, cat: r.cat });
    }
  }
  for (const e of eventsOn(date)) {
    if (e.cat === 'holiday') continue;
    const sub = [e.time, e.faculty && 'Faculty: ' + e.faculty, e.jr && (e.cat === 'nursing' ? 'Facilitator: ' : 'JR: ') + e.jr].filter(Boolean).join(' | ');
    out.push({ key: 'ev:' + e.id, label: eventLabel(e) + (e.time ? ` [${e.time}]` : ''), show: eventLabel(e), sub, cat: e.cat, mine: isMine(e) });
  }
  return out;
}

function setItem(date, item, on) {
  const en = state.entries[date] || (state.entries[date] = { items: [] });
  const i = en.items.findIndex(x => x.key === item.key);
  if (on && i < 0) en.items.push({ key: item.key, label: item.label, cat: item.cat, note: '' });
  if (!on && i >= 0) en.items.splice(i, 1);
  if (!en.items.length && !en.mark) delete state.entries[date];
}

// ---------- sync with the shared Google Sheet ----------
async function sync(manual) {
  if (!CONFIG.SYNC_URL) { if (manual) toast('Sharing is not set up yet'); return; }
  try {
    const j = await (await fetch(CONFIG.SYNC_URL)).json();
    if (!j.ok) throw new Error(j.error || 'bad reply');
    state.schedule = j.events.map(normEvent).filter(e => e.date);
    state.settings.lastSync = Date.now();
    save('schedule', 'settings');
    if (manual) toast(`Schedule updated (${state.schedule.length} entries)`);
    render();
  } catch (e) { if (manual) toast('Could not update - check internet'); }
}

async function publish(src, months, rows) {
  rows = rows.map(r => normEvent({ ...r, src, id: '' })).filter(r => r.date);
  if (!CONFIG.SYNC_URL) {
    state.schedule = state.schedule.filter(e => !(e.src === src && months.includes(e.date.slice(0, 7)))).concat(rows);
    save('schedule');
    return true;
  }
  await callScript({ action: 'replace', src, months, rows });
  await sync(false);
  return true;
}

async function callScript(body) {
  // text/plain keeps the browser from sending a pre-flight request that Apps Script cannot answer.
  const res = await fetch(CONFIG.SYNC_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ pin: state.settings.pin, ...body }) });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || 'The shared script reported a problem');
  return j;
}

// Asks the shared script to read a schedule picture or Word text with the AI model.
async function aiRead(input) {
  const j = await callScript({ action: 'read', ...input });
  return { rows: (j.rows || []).map(r => ({ date: normEvent(r).date, time: r.time || '', title: r.title || '', faculty: r.faculty || '', jr: r.jr || '', batch: [j.batch, r.group].filter(Boolean).join(' - ') })).filter(r => r.date), meta: { batch: j.batch || '' } };
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- UI state ----------
const ui = { tab: 'day', date: today(), month: today().slice(0, 7), sumMonth: today().slice(0, 7) };
const prov = { type: 'ug_theory', batch: '', rows: [], busy: '' };
const PROV_TYPES = {
  ug_theory: { label: 'UG theory classes', cats: ['ug_theory'] },
  ug_practical: { label: 'UG practical classes', cats: ['ug_practical'] },
  nursing: { label: 'Nursing classes', cats: ['nursing'] },
  pg: { label: 'PG activity (practical, seminar, journal club)', cats: ['pg_practical', 'seminar', 'journal', 'pg_activity'] },
  events: { label: 'Conferences and exams', cats: ['conference', 'exam'] },
  holidays: { label: 'Extra holidays', cats: ['holiday'] }
};

function render() {
  const app = document.getElementById('app');
  if (!state.user) { app.innerHTML = viewWelcome(); document.getElementById('nav').hidden = true; return; }
  document.getElementById('nav').hidden = false;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === (ui.tab === 'prov' ? 'more' : ui.tab)));
  app.innerHTML = { day: viewDay, cal: viewCal, sum: viewSum, more: viewMore, prov: viewProvider }[ui.tab]();
}

function viewWelcome() {
  return `<div class="welcome"><h1>PG Logbook</h1><p class="muted">${esc(CONFIG.DEPARTMENT)}</p>
    <h2>Welcome. What is your name?</h2>
    <form data-form="name" class="stack"><input name="t" placeholder="e.g. Dr. Debopam Das" autocomplete="name" required><button>Start my logbook</button></form>
    <p class="muted">Your name is printed on your PDF and used to highlight the classes you are in charge of. Your logbook stays on this phone.</p></div>`;
}

function greeting() {
  const h = new Date().getHours(), part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const n = plan(today()).length, mine = plan(today()).filter(i => i.mine).length;
  return `<div class="greet"><b>${part}, Dr. ${esc(firstName())}</b><span>${n ? `${n} item${n > 1 ? 's' : ''} lined up today${mine ? `, ${mine} with you in charge` : ''}.` : 'Nothing scheduled today.'}</span></div>`;
}

function banners(date) {
  const out = [], hol = holidayOn(date), en = entryOf(date);
  if (hol) out.push(`<div class="banner hol">Holiday: ${esc(hol)}</div>`);
  else if (parse(date).getDay() === 0) out.push('<div class="banner sun">Sunday</div>');
  else if (parse(date).getDay() === 6) out.push('<div class="banner sun">Saturday - half day, till 1 PM</div>');
  for (const e of eventsOn(date)) if (e.cat === 'conference' || e.cat === 'exam') out.push(`<div class="banner ${e.cat === 'exam' ? 'exam' : 'conf'}">${esc(catOf(e.cat).short)}: ${esc(e.title)}</div>`);
  if (en.mark) out.push(`<div class="banner ${en.mark}">Marked as ${esc({ leave: 'Leave', conference: 'Conference', exam: 'Exam' }[en.mark])}${en.markNote ? ': ' + esc(en.markNote) : ''}</div>`);
  return out.join('');
}

function viewDay() {
  const date = ui.date, en = entryOf(date), items = plan(date);
  const done = k => en.items.find(x => x.key === k);
  const planned = new Set(items.map(i => i.key));
  const extras = en.items.filter(x => !planned.has(x.key));
  const missed = Object.keys(missedInMonth(today().slice(0, 7))).length;
  const sugg = Object.entries(state.suggest).sort((a, b) => b[1] - a[1]).slice(0, 8).map(x => x[0]).filter(t => !en.items.some(x => x.label === t));
  const chip = (it, d) => `<div class="chip ${d ? 'on' : ''} ${it.mine ? 'mine' : ''}" data-act="toggle" data-key="${esc(it.key)}">
      <i class="box">${d ? '&#10003;' : ''}</i><span><b>${esc(it.show || it.label)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}${it.mine ? '<small class="tag">You are in charge</small>' : ''}${d && d.note ? `<small class="note">Note: ${esc(d.note)}</small>` : ''}</span>
      ${d ? `<button class="mini" data-act="note" data-key="${esc(it.key)}">${d.note ? 'Edit note' : '+ Note'}</button>` : ''}</div>`;
  return `<header class="top"><button data-act="prev" aria-label="Previous day">&#8249;</button>
      <div><div class="dt">${fmtDate(date)}</div><div class="muted">${date === today() ? 'Today' : `<a href="#" data-act="goto-today">Back to today</a>`}</div></div>
      <button data-act="next" aria-label="Next day">&#8250;</button></header>
    ${date === today() ? greeting() : ''}
    ${date === today() && missed ? `<div class="banner warn" data-act="tab" data-tab="cal">${missed} working day${missed > 1 ? 's' : ''} this month not filled - tap to see</div>` : ''}
    ${banners(date)}
    <section><div class="row"><h2>Work for the day</h2>${items.length ? '<button class="btn" data-act="all">&#10003; Mark all</button>' : ''}</div>
      ${items.length ? items.map(it => chip(it, done(it.key))).join('') : '<p class="muted">Nothing scheduled. Add anything you did below.</p>'}</section>
    <section><h2>Other work</h2>
      ${extras.map(x => chip({ key: x.key, label: x.label }, x)).join('')}
      <form data-form="extra" class="inline"><input name="t" placeholder="e.g. Thesis work, ADR reporting" required><button>Add</button></form>
      ${sugg.length ? `<div class="sugg">${sugg.map(t => `<button data-act="sugg" data-v="${esc(t)}">+ ${esc(t)}</button>`).join('')}</div>` : ''}</section>
    <section class="actions"><button class="btn ghost" data-act="copy">Same as last filled day</button>
      <select data-change="mark"><option value="">Mark this day as...</option><option value="leave">Leave</option><option value="conference">Conference</option><option value="exam">Exam</option>${en.mark ? '<option value="clear">Remove mark</option>' : ''}</select></section>`;
}

function missedInMonth(month) {
  const out = {}, [y, m] = month.split('-').map(Number), n = new Date(y, m, 0).getDate();
  for (let d = 1; d <= n; d++) { const s = `${month}-${pad(d)}`; if (isMissed(s)) out[s] = 1; }
  return out;
}

function viewCal() {
  const [y, m] = ui.month.split('-').map(Number), n = new Date(y, m, 0).getDate(), first = new Date(y, m - 1, 1).getDay();
  let cells = '<i></i>'.repeat(first);
  const notes = [];
  for (let d = 1; d <= n; d++) {
    const s = `${ui.month}-${pad(d)}`, en = entryOf(s), evs = eventsOn(s), hol = holidayOn(s);
    const conf = en.mark === 'conference' || evs.some(e => e.cat === 'conference'), exam = en.mark === 'exam' || evs.some(e => e.cat === 'exam');
    const cls = [hol ? 'hol' : '', parse(s).getDay() === 0 ? 'sun' : '', conf ? 'conf' : '', exam ? 'exam' : '', en.mark === 'leave' ? 'leave' : '', s === today() ? 'today' : ''].join(' ');
    cells += `<button class="cell ${cls}" data-act="open-day" data-v="${s}"><span>${d}</span><em class="${isFilled(s) ? 'done' : isMissed(s) ? 'miss' : ''}"></em></button>`;
    if (hol) notes.push([s, 'hol', 'Holiday: ' + hol]);
    evs.filter(e => e.cat === 'conference' || e.cat === 'exam').forEach(e => notes.push([s, e.cat === 'exam' ? 'exam' : 'conf', `${catOf(e.cat).short}: ${e.title}`]));
    if (en.mark) notes.push([s, en.mark === 'conference' ? 'conf' : en.mark, { leave: 'Leave', conference: 'Conference', exam: 'Exam' }[en.mark] + (en.markNote ? ': ' + en.markNote : '')]);
  }
  return `<header class="top"><button data-act="cal-prev" aria-label="Previous month">&#8249;</button><div class="dt">${fmtMonth(ui.month)}</div><button data-act="cal-next" aria-label="Next month">&#8250;</button></header>
    <div class="cal">${WD.map(w => `<b>${w[0]}</b>`).join('')}${cells}</div>
    <div class="legend"><span><em class="done"></em>Filled</span><span><em class="miss"></em>Not filled</span><span><i class="sw hol"></i>Holiday</span><span><i class="sw conf"></i>Conference</span><span><i class="sw exam"></i>Exam</span><span><i class="sw leave"></i>Leave</span></div>
    <section><h2>This month</h2>${notes.length ? notes.map(x => `<div class="line" data-act="open-day" data-v="${x[0]}"><i class="sw ${x[1]}"></i><b>${parse(x[0]).getDate()} ${MON[m - 1].slice(0, 3)}</b> ${esc(x[2])}</div>`).join('') : '<p class="muted">No holidays, conferences or exams this month.</p>'}</section>`;
}

function monthData(month) {
  const dates = Object.keys(state.entries).filter(d => d.startsWith(month)).sort();
  const counts = {};
  for (const d of dates) for (const it of state.entries[d].items) { const k = catOf(it.cat).label; counts[k] = (counts[k] || 0) + 1; }
  return { dates, counts: Object.entries(counts).sort((a, b) => b[1] - a[1]) };
}

function viewSum() {
  const { dates, counts } = monthData(ui.sumMonth), missed = Object.keys(missedInMonth(ui.sumMonth)).length;
  const filled = dates.filter(isFilled);
  return `<header class="top"><button data-act="sum-prev" aria-label="Previous month">&#8249;</button><div class="dt">${fmtMonth(ui.sumMonth)}</div><button data-act="sum-next" aria-label="Next month">&#8250;</button></header>
    <div class="stats"><div><b>${filled.length}</b>days filled</div><div><b>${missed}</b>not filled</div><div><b>${filled.reduce((n, d) => n + state.entries[d].items.length, 0)}</b>activities</div></div>
    <section><div class="row"><h2>Counts</h2><span><button class="btn" data-act="pdf">Export PDF</button> <button class="btn ghost" data-act="copy-text">Copy</button></span></div>
      ${counts.length ? `<table>${counts.map(c => `<tr><td>${esc(c[0])}</td><td>${c[1]}</td></tr>`).join('')}</table>` : '<p class="muted">Nothing logged this month yet.</p>'}</section>
    <section><h2>Date-wise</h2>${dates.map(d => { const en = state.entries[d]; return `<div class="dayrow" data-act="open-day" data-v="${d}"><b>${fmtDate(d)}${en.mark ? ` - ${esc(en.mark)}` : ''}</b><ul>${en.items.map(it => `<li>${esc(it.label)}${it.note ? ` <i>- ${esc(it.note)}</i>` : ''}</li>`).join('')}</ul></div>`; }).join('')}</section>`;
}

function viewMore() {
  const st = state.settings, backupAge = st.lastBackup ? Math.floor((Date.now() - st.lastBackup) / 864e5) : null;
  return `<header class="top"><div class="dt">More</div></header>
    ${Object.keys(state.entries).length && (backupAge == null ? Object.keys(state.entries).sort()[0] < addDays(today(), -30) : backupAge > 30) ?'<div class="banner warn">No backup in the last month. Use "Save backup file" below.</div>' : ''}
    <details open><summary>Profile</summary><p>Logbook of <b>${esc(state.user)}</b></p>
      <form data-form="name" class="inline"><input name="t" value="${esc(state.user)}" required><button>Change name</button></form>
      <p class="muted">The name is printed on the PDF and used to highlight the classes you are in charge of.</p></details>
    <details><summary>Daily routine items</summary>
      ${state.routine.map(r => `<div class="line"><span>${esc(r.label)}<small class="muted"> ${r.days.map(d => WD[d]).join(' ')}</small></span><button class="mini danger" data-act="del-routine" data-v="${esc(r.id)}">Delete</button></div>`).join('')}
      <form data-form="routine" class="stack"><input name="t" placeholder="New routine item" required>
        <div class="days">${WD.map((w, i) => `<label><input type="checkbox" name="d${i}" ${i ? 'checked' : ''}>${w}</label>`).join('')}</div><button>Add routine item</button></form>
      <label class="check"><input type="checkbox" data-change="satoff" ${st.satOff ? 'checked' : ''}> Saturday is a non-working day</label></details>
    <details><summary>Holidays</summary>
      ${state.holidays.filter(h => h.date >= today().slice(0, 4)).map(h => `<div class="line"><span><b>${fmtDate(h.date)}</b> ${esc(h.title)}</span><button class="mini danger" data-act="del-hol" data-v="${h.date}">Delete</button></div>`).join('')}
      <form data-form="holiday" class="stack"><input type="date" name="d" required><input name="t" placeholder="Holiday name" required><button>Add holiday</button></form></details>
    <details><summary>Evening reminder</summary>
      <p class="muted">Adds a repeating event with an alert to your phone calendar. Open the downloaded file and save it.</p>
      <div class="inline"><input type="time" id="rem-time" value="${esc(st.reminderTime || '20:00')}"><button class="btn" data-act="reminder">Add to calendar</button></div></details>
    <details><summary>Backup</summary>
      <p class="muted">Your logbook lives only on this phone. ${backupAge == null ? 'No backup saved yet.' : `Last backup ${backupAge} day${backupAge === 1 ? '' : 's'} ago.`}</p>
      <button class="btn" data-act="backup">Save backup file</button>
      <label class="btn ghost">Restore from file<input type="file" accept=".json,application/json" data-change="restore" hidden></label></details>
    <details><summary>Schedule updates</summary>
      <p class="muted">${CONFIG.SYNC_URL ? (st.lastSync ? 'Last updated ' + new Date(st.lastSync).toLocaleString() : 'Not updated yet') : 'Sharing is not set up yet. Schedules read here stay on this phone.'}</p>
      ${CONFIG.SYNC_URL ? '<button class="btn" data-act="sync">Update now</button>' : ''}</details>
    <section><h2>Provider portal</h2><p class="muted">For whoever uploads the monthly schedules, conferences, exams and holidays. Needs the passkey.</p>
      <button class="btn" data-act="prov-open">Open provider portal</button></section>
    <p class="muted center">PG Logbook v${CONFIG.VERSION}</p>`;
}

function viewProvider() {
  const pubs = {}, types = PROV_TYPES[prov.type];
  for (const e of state.schedule) { const k = e.src + '@' + e.date.slice(0, 7); pubs[k] = (pubs[k] || 0) + 1; }
  const builtin = [...new Set(BUILTIN.map(e => e.date.slice(0, 7)))].map(fmtMonth).join(', ');
  return `<header class="top"><button data-act="tab" data-tab="more" aria-label="Back">&#8249;</button><div class="dt">Provider portal</div><button data-act="prov-lock" aria-label="Lock" style="font-size:13px">Lock</button></header>
    <section><h2>Upload a schedule</h2>
      <p class="muted">Pick the PDF, photo or Word file. Check the rows it reads, fix any mistakes, then publish. ${CONFIG.SYNC_URL ? 'Publishing sends it to every phone.' : 'Sharing is not set up yet, so what you publish stays on this phone.'}</p>
      <div class="stack"><select data-change="prov-type">${Object.entries(PROV_TYPES).map(([k, v]) => `<option value="${k}" ${k === prov.type ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>
        <input data-input="prov-batch" value="${esc(prov.batch)}" placeholder="Batch or group, e.g. MBBS 2025 (optional)">
        <label class="btn">Choose PDF, photo or Word file<input type="file" accept="image/*,application/pdf,.docx" multiple data-change="prov-file" hidden></label>
        <button class="btn ghost" data-act="prow-add">Add a row by hand</button></div>
      ${prov.busy ? `<p class="busy">${esc(prov.busy)}</p>` : ''}
      ${prov.rows.map((r, i) => `<div class="prow" data-i="${i}">
        <div class="inline"><input type="date" data-f="date" value="${esc(r.date)}"><input data-f="time" value="${esc(r.time)}" placeholder="Time"><button class="mini danger" data-act="prow-del">Remove</button></div>
        ${types.cats.length > 1 ? `<select data-f="cat">${types.cats.map(c => `<option value="${c}" ${c === r.cat ? 'selected' : ''}>${esc(catOf(c).short)}</option>`).join('')}</select>` : ''}
        <input data-f="title" value="${esc(r.title)}" placeholder="Topic or name">
        ${['events', 'holidays'].includes(prov.type) ? '' : `<input data-f="batch" value="${esc(r.batch)}" placeholder="Batch"><input data-f="faculty" value="${esc(r.faculty)}" placeholder="Faculty"><input data-f="jr" value="${esc(r.jr)}" placeholder="JR in-charge or presenter">`}</div>`).join('')}
      ${prov.rows.length ? `<button class="btn wide" data-act="publish">Publish ${prov.rows.length} row${prov.rows.length > 1 ? 's' : ''}</button><p class="muted">Publishing replaces what was published earlier for the same type, batch and month.</p>` : ''}
      </section><section><h2>Published</h2>${builtin ? `<p class="muted">Built into the app: UG and Nursing schedules for ${builtin}. Publishing the same type, batch and month replaces them.</p>` : ''}${Object.keys(pubs).length ? Object.entries(pubs).sort().map(([k, n]) => { const [src, mo] = k.split('@'); const [t, b] = src.split('|'); return `<div class="line"><span>${esc((PROV_TYPES[t] || { label: t || 'Typed in sheet' }).label)}${b ? ' - ' + esc(b) : ''}<small class="muted"> ${fmtMonth(mo)}, ${n} rows</small></span><button class="mini danger" data-act="unpublish" data-v="${esc(k)}">Delete</button></div>`; }).join('') : '<p class="muted">Nothing published from this portal yet.</p>'}</section>`;
}

// ---------- actions ----------
const shiftMonth = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return ymd(d).slice(0, 7); };
const pdfSafe = s => String(s).replace(/[–—]/g, '-').replace(/β/g, 'beta').replace(/α/g, 'alpha').replace(/[^\x00-\xFF]/g, '');

function addExtra(text) {
  text = text.trim();
  if (!text) return;
  setItem(ui.date, { key: 'x:' + Date.now().toString(36), label: text, cat: 'other' }, true);
  state.suggest[text] = (state.suggest[text] || 0) + 1;
  save('entries', 'suggest');
}

function copyLast() {
  const prev = Object.keys(state.entries).filter(d => d < ui.date && isFilled(d)).sort().pop();
  if (!prev) return toast('No earlier filled day found');
  const allowed = new Set(plan(ui.date).map(i => i.key)), have = entryOf(ui.date).items;
  let n = 0;
  for (const it of state.entries[prev].items) {
    const extra = it.key.startsWith('x:');
    if (extra ? have.some(x => x.label === it.label) : !allowed.has(it.key) || have.some(x => x.key === it.key)) continue;
    setItem(ui.date, { ...it, key: extra ? 'x:' + Date.now().toString(36) + n : it.key }, true);
    n++;
  }
  save('entries');
  toast(n ? `Copied ${n} item${n > 1 ? 's' : ''} from ${fmtDate(prev)}` : 'Nothing new to copy');
}

function summaryText(month) {
  const { dates, counts } = monthData(month);
  return [`Logbook - ${state.user} - ${fmtMonth(month)}`, '', ...dates.map(d => `${fmtDate(d)}\n` + state.entries[d].items.map(it => `  - ${it.label}${it.note ? ' (' + it.note + ')' : ''}`).join('\n')), '', 'Counts', ...counts.map(c => `  ${c[0]}: ${c[1]}`)].join('\n');
}

async function exportPdf(month) {
  const { dates, counts } = monthData(month);
  if (!dates.length) return toast('Nothing logged this month');
  toast('Preparing PDF...');
  try {
    await Importer.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    await Importer.loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
  } catch (e) { return toast('Open the app once with internet to enable PDF export'); }
  const doc = new window.jspdf.jsPDF();
  doc.setFontSize(14); doc.text(`PG Logbook - ${fmtMonth(month)}`, 14, 16);
  doc.setFontSize(10); doc.text(pdfSafe(`${state.user} | ${CONFIG.DEPARTMENT}`), 14, 22);
  const body = dates.map(d => { const en = state.entries[d]; return [`${pad(parse(d).getDate())}-${d.slice(5, 7)}-${d.slice(0, 4)}`, WD[parse(d).getDay()], pdfSafe((en.mark ? `[${en.mark.toUpperCase()}${en.markNote ? ': ' + en.markNote : ''}]\n` : '') + en.items.map(it => `- ${it.label}${it.note ? ' (' + it.note + ')' : ''}`).join('\n'))]; });
  doc.autoTable({ startY: 28, head: [['Date', 'Day', 'Work done']], body, styles: { fontSize: 9, cellPadding: 2 }, columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 14 } }, headStyles: { fillColor: [15, 118, 110] } });
  doc.autoTable({ startY: doc.lastAutoTable.finalY + 8, head: [['Activity', 'Count']], body: counts, styles: { fontSize: 9, cellPadding: 2 }, headStyles: { fillColor: [15, 118, 110] }, tableWidth: 100 });
  doc.save(`Logbook_${state.user.replace(/[^A-Za-z]+/g, '_')}_${month}.pdf`);
}

function reminderFile(time) {
  const [h, m] = time.split(':'), d = today().replace(/-/g, '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PG Logbook//EN', 'BEGIN:VEVENT', `UID:pg-logbook-reminder-${Date.now()}@logbook`, `DTSTAMP:${d}T000000Z`, `DTSTART:${d}T${h}${m}00`, `DTEND:${d}T${h}${pad((+m + 5) % 60)}00`, 'RRULE:FREQ=DAILY', "SUMMARY:Fill today's PG logbook", 'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:Fill PG logbook', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

async function readProviderFiles(files) {
  const cats = PROV_TYPES[prov.type].cats;
  for (const f of files) {
    try {
      prov.busy = `Reading ${f.name}...`; render();
      const r = await Importer.readFile(f, p => { const el = document.querySelector('.busy'); if (el) el.textContent = `Reading ${f.name}... ${Math.round(p * 100)}%`; }, CONFIG.SYNC_URL ? aiRead : null);
      if (!prov.batch && r.meta.batch) prov.batch = r.meta.batch;
      prov.rows.push(...r.rows.map(row => ({ ...row, time: row.time || (prov.type === 'nursing' ? NURSING_TIME : ''), cat: guessCat(row, cats) })));
      toast(!r.rows.length ? 'No dated rows found in ' + f.name : r.how === 'ocr' ? `Read ${r.rows.length} rows, but scans and photos are often misread until AI reading is set up - check every row` : `Read ${r.rows.length} rows - check them against the sheet`);
    } catch (e) { toast(e.message || 'Could not read ' + f.name); }
  }
  prov.busy = ''; render();
}
function guessCat(row, cats) {
  if (cats.length === 1) return cats[0];
  const t = row.title.toLowerCase();
  if (cats.includes('journal') && /journal/.test(t)) return 'journal';
  if (cats.includes('seminar') && /seminar/.test(t)) return 'seminar';
  if (cats.includes('pg_practical') && /practical|experiment|exercise/.test(t)) return 'pg_practical';
  if (cats.includes('exam') && /exam|assessment|test/.test(t)) return 'exam';
  return cats[cats.length - 1] === 'pg_activity' ? 'pg_activity' : cats[0];
}

const ACT = {
  tab: el => { ui.tab = el.dataset.tab; if (ui.tab === 'day') ui.date = today(); },
  'prov-open': async () => {
    if (!state.settings.pin) {
      const p = prompt('Provider passkey');
      if (!p) return;
      if (await sha256(p.trim()) !== CONFIG.PASS_HASH) return toast('Wrong passkey');
      state.settings.pin = p.trim(); save('settings');
    }
    ui.tab = 'prov'; render();
  },
  'prov-lock': () => { delete state.settings.pin; save('settings'); ui.tab = 'more'; },
  prev: () => { ui.date = addDays(ui.date, -1); },
  next: () => { ui.date = addDays(ui.date, 1); },
  'goto-today': () => { ui.date = today(); },
  toggle: el => { const key = el.dataset.key, en = entryOf(ui.date), it = plan(ui.date).find(i => i.key === key) || en.items.find(i => i.key === key); setItem(ui.date, it, !en.items.some(x => x.key === key)); save('entries'); },
  all: () => { plan(ui.date).forEach(it => setItem(ui.date, it, true)); save('entries'); },
  note: el => { const it = entryOf(ui.date).items.find(x => x.key === el.dataset.key); const v = prompt('Note (topic, presenter, details)', it.note || ''); if (v != null) { it.note = v.trim(); save('entries'); } },
  sugg: el => addExtra(el.dataset.v),
  copy: copyLast,
  'open-day': el => { ui.date = el.dataset.v; ui.tab = 'day'; },
  'cal-prev': () => { ui.month = shiftMonth(ui.month, -1); },
  'cal-next': () => { ui.month = shiftMonth(ui.month, 1); },
  'sum-prev': () => { ui.sumMonth = shiftMonth(ui.sumMonth, -1); },
  'sum-next': () => { ui.sumMonth = shiftMonth(ui.sumMonth, 1); },
  pdf: () => { exportPdf(ui.sumMonth); },
  'copy-text': () => { navigator.clipboard.writeText(summaryText(ui.sumMonth)).then(() => toast('Copied'), () => toast('Could not copy')); },
  'del-routine': el => { state.routine = state.routine.filter(r => r.id !== el.dataset.v); save('routine'); },
  'del-hol': el => { state.holidays = state.holidays.filter(h => h.date !== el.dataset.v); save('holidays'); },
  reminder: () => { const t = document.getElementById('rem-time').value || '20:00'; state.settings.reminderTime = t; save('settings'); download('logbook-reminder.ics', reminderFile(t), 'text/calendar'); },
  backup: () => { const data = {}; KEYS.forEach(k => data[k] = state[k]); data.settings = { ...state.settings }; delete data.settings.pin; state.settings.lastBackup = Date.now(); save('settings'); download(`logbook-backup-${today()}.json`, JSON.stringify({ app: 'pg-logbook', data }), 'application/json'); },
  sync: () => { sync(true); },
  'prow-add': () => { prov.rows.push({ date: '', time: '', cat: PROV_TYPES[prov.type].cats[0], batch: prov.batch, title: '', faculty: '', jr: '' }); },
  'prow-del': el => { prov.rows.splice(+el.closest('.prow').dataset.i, 1); },
  publish: async () => {
    const rows = prov.rows.filter(r => r.date);
    if (!rows.length) return toast('Rows need a date');
    const months = [...new Set(rows.map(r => r.date.slice(0, 7)))];
    try { if (await publish(prov.type + '|' + prov.batch.trim(), months, rows)) { prov.rows = []; toast(CONFIG.SYNC_URL ? 'Published to everyone' : 'Saved on this phone'); } }
    catch (e) { toast(e.message); }
    render();
  },
  unpublish: async el => {
    const [src, mo] = el.dataset.v.split('@');
    if (!confirm(`Delete this schedule for ${fmtMonth(mo)}?`)) return;
    try { await publish(src, [mo], []); toast('Deleted'); } catch (e) { toast(e.message); }
    render();
  }
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || !ACT[el.dataset.act]) return;
  if (el.tagName === 'A') e.preventDefault();
  e.stopPropagation();
  const r = ACT[el.dataset.act](el);
  if (!(r instanceof Promise)) render();
});

document.addEventListener('submit', e => {
  const f = e.target.closest('[data-form]');
  if (!f) return;
  e.preventDefault();
  const v = n => (f.elements[n] ? f.elements[n].value.trim() : '');
  switch (f.dataset.form) {
    case 'extra': addExtra(v('t')); break;
    case 'name': {
      if (!v('t')) break;
      const first = !state.user;
      state.user = v('t');
      if (!state.settings.startDate) state.settings.startDate = today();
      save('user', 'settings');
      toast(first ? `Welcome, Dr. ${firstName()}! Your logbook is ready.` : 'Name updated');
      break;
    }
    case 'routine': { const days = WD.map((w, i) => i).filter(i => f.elements['d' + i].checked); if (days.length) { state.routine.push({ id: 'c' + Date.now().toString(36), label: v('t'), cat: 'other', days }); save('routine'); } break; }
    case 'holiday': state.holidays = state.holidays.filter(h => h.date !== v('d')).concat({ date: v('d'), title: v('t') }).sort((a, b) => a.date.localeCompare(b.date)); save('holidays'); break;
  }
  render();
});

document.addEventListener('change', e => {
  const el = e.target, c = el.dataset.change;
  if (c === 'mark') {
    const v = el.value; if (!v) return;
    const en = state.entries[ui.date] || (state.entries[ui.date] = { items: [] });
    if (v === 'clear') { delete en.mark; delete en.markNote; if (!en.items.length) delete state.entries[ui.date]; }
    else { en.mark = v; en.markNote = v === 'leave' ? '' : (prompt(`Name of the ${v} (optional)`) || '').trim(); }
    save('entries'); render();
  } else if (c === 'satoff') { state.settings.satOff = el.checked; save('settings'); }
  else if (c === 'restore') {
    const file = el.files[0]; if (!file) return;
    file.text().then(t => {
      const j = JSON.parse(t);
      if (j.app !== 'pg-logbook' || !j.data) throw new Error();
      if (!confirm('Replace everything on this phone with the backup?')) return;
      KEYS.forEach(k => { if (j.data[k] != null) { state[k] = j.data[k]; S.set(k, state[k]); } });
      toast('Backup restored'); render();
    }).catch(() => toast('That is not a logbook backup file'));
  } else if (c === 'prov-type') { prov.type = el.value; const cats = PROV_TYPES[prov.type].cats; prov.rows.forEach(r => { if (!cats.includes(r.cat)) r.cat = guessCat(r, cats); }); render(); }
  else if (c === 'prov-file') { readProviderFiles([...el.files]); }
  else if (el.dataset.f) { prov.rows[+el.closest('.prow').dataset.i][el.dataset.f] = el.value; }
});

document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.input === 'prov-batch') prov.batch = el.value;
  else if (el.dataset.f && el.closest('.prow')) prov.rows[+el.closest('.prow').dataset.i][el.dataset.f] = el.value;
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && Date.now() - (state.settings.lastSync || 0) > 36e5) sync(false);
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
sync(false);
