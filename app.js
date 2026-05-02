// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const STORAGE_KEY    = 'ltd-daily-v1';
const MAX_WATER      = 8;
const GOOGLE_CLIENT_ID = '125209458743-96tf37mk9j35sjnb3e46pe41o0d34buc.apps.googleusercontent.com';

const MOODS = { 1:'😴 ง่วง', 2:'😕 แย่', 3:'😐 ปกติ', 4:'🙂 ดี', 5:'😄 ดีมาก' };

const MONTH_TH = [
  'มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'
];
const DAY_TH = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];

// ─── STATE ───────────────────────────────────────────────────────────────────

let data         = {};
let currentMood  = 0;
let currentEnergy = 0;

// ─── STORAGE ─────────────────────────────────────────────────────────────────

function loadData() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────

function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function parseDate(str) {
  // parse YYYY-MM-DD in local time (avoid UTC offset issues)
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m-1, d);
}

function formatDate(str) {
  const d = parseDate(str);
  return {
    day:  DAY_TH[d.getDay()],
    full: `${d.getDate()} ${MONTH_TH[d.getMonth()]} ${d.getFullYear()}`
  };
}

// ─── LOG HELPERS ──────────────────────────────────────────────────────────────

function getLog(date) {
  if (!data[date]) {
    data[date] = {
      date,
      water:    0,
      exercise: false,
      morning:  { wakeTime: '', mood: 0, tasks: ['', '', ''] },
      night:    { sleepTime: '', energy: 0, reflection: '' }
    };
  }
  return data[date];
}

// ─── RENDER HOME ─────────────────────────────────────────────────────────────

function renderHome() {
  const today = getToday();
  const log   = getLog(today);
  const { day, full } = formatDate(today);

  document.getElementById('date-day').textContent  = day;
  document.getElementById('date-full').textContent = full;

  // Water dots
  const dotsEl = document.getElementById('water-dots');
  dotsEl.innerHTML = '';
  for (let i = 1; i <= MAX_WATER; i++) {
    const dot = document.createElement('div');
    dot.className = 'dot' + (i <= log.water ? ' filled' : '');
    dot.onclick = () => setWater(i);
    dotsEl.appendChild(dot);
  }
  document.getElementById('water-label').textContent = `${log.water} / ${MAX_WATER} แก้ว`;

  // Exercise toggle
  document.getElementById('exercise-toggle').className =
    'toggle' + (log.exercise ? ' on' : '');

  // Morning card
  const mDone = log.morning.mood > 0 || !!log.morning.wakeTime;
  const mBadge = document.getElementById('morning-badge');
  mBadge.textContent = mDone ? '✓ บันทึกแล้ว' : '+ Log';
  mBadge.className   = 'log-badge' + (mDone ? ' done' : '');

  const mPreview = document.getElementById('morning-preview');
  if (mDone) {
    const parts = [];
    if (log.morning.wakeTime) parts.push(`ตื่น ${log.morning.wakeTime}`);
    if (log.morning.mood)     parts.push(MOODS[log.morning.mood]);
    const tasks = log.morning.tasks.filter(t => t.trim());
    if (tasks.length)         parts.push(`${tasks.length} task`);
    mPreview.textContent = parts.join('  ·  ');
  } else {
    mPreview.textContent = 'ยังไม่ได้บันทึก';
  }

  // Night card
  const nDone = !!log.night.sleepTime || log.night.energy > 0;
  const nBadge = document.getElementById('night-badge');
  nBadge.textContent = nDone ? '✓ บันทึกแล้ว' : '+ Log';
  nBadge.className   = 'log-badge' + (nDone ? ' done' : '');

  const nPreview = document.getElementById('night-preview');
  if (nDone) {
    const parts = [];
    if (log.night.sleepTime) parts.push(`นอน ${log.night.sleepTime}`);
    if (log.night.energy)    parts.push(`Energy ${log.night.energy}/5`);
    nPreview.textContent = parts.join('  ·  ');
  } else {
    nPreview.textContent = 'ยังไม่ได้บันทึก';
  }
}

// ─── WATER ───────────────────────────────────────────────────────────────────

function addWater() {
  const log = getLog(getToday());
  if (log.water < MAX_WATER) {
    log.water++;
    save();
    renderHome();
    showToast(`💧 ${log.water} / ${MAX_WATER} แก้ว`);
  }
}

function removeWater() {
  const log = getLog(getToday());
  if (log.water > 0) {
    log.water--;
    save();
    renderHome();
  }
}

function setWater(n) {
  const log = getLog(getToday());
  log.water = (log.water === n) ? n - 1 : n;
  save();
  renderHome();
}

// ─── EXERCISE ─────────────────────────────────────────────────────────────────

function toggleExercise() {
  const log = getLog(getToday());
  log.exercise = !log.exercise;
  save();
  renderHome();
  showToast(log.exercise ? '🏃 ออกกำลังกายแล้ว!' : '🏃 ยกเลิก');
}

// ─── OVERLAY ──────────────────────────────────────────────────────────────────

function openOverlay(name) {
  const log = getLog(getToday());

  if (name === 'morning') {
    document.getElementById('wake-time').value = log.morning.wakeTime || '';
    document.getElementById('task-1').value    = log.morning.tasks[0] || '';
    document.getElementById('task-2').value    = log.morning.tasks[1] || '';
    document.getElementById('task-3').value    = log.morning.tasks[2] || '';
    currentMood = log.morning.mood;
    syncMoodUI();
    document.getElementById('overlay-morning').classList.add('open');
  } else {
    document.getElementById('sleep-time').value  = log.night.sleepTime || '';
    document.getElementById('reflection').value  = log.night.reflection || '';
    currentEnergy = log.night.energy;
    syncEnergyUI();
    document.getElementById('overlay-night').classList.add('open');
  }
}

function closeOverlay() {
  document.querySelectorAll('.overlay').forEach(o => o.classList.remove('open'));
}

// ─── MOOD ─────────────────────────────────────────────────────────────────────

function selectMood(n) {
  currentMood = n;
  syncMoodUI();
}

function syncMoodUI() {
  document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.classList.toggle('selected', +btn.dataset.mood === currentMood);
  });
}

// ─── ENERGY ───────────────────────────────────────────────────────────────────

function selectEnergy(n) {
  currentEnergy = n;
  syncEnergyUI();
}

function syncEnergyUI() {
  document.querySelectorAll('.energy-btn').forEach(btn => {
    btn.classList.toggle('selected', +btn.dataset.e === currentEnergy);
  });
}

// ─── SAVE ─────────────────────────────────────────────────────────────────────

function saveMorning() {
  const log = getLog(getToday());
  log.morning.wakeTime = document.getElementById('wake-time').value;
  log.morning.mood     = currentMood;
  log.morning.tasks    = [
    document.getElementById('task-1').value.trim(),
    document.getElementById('task-2').value.trim(),
    document.getElementById('task-3').value.trim()
  ];
  save();
  closeOverlay();
  renderHome();
  showToast('🌅 Morning บันทึกแล้ว!');
}

function saveNight() {
  const log = getLog(getToday());
  log.night.sleepTime  = document.getElementById('sleep-time').value;
  log.night.energy     = currentEnergy;
  log.night.reflection = document.getElementById('reflection').value.trim();
  save();
  closeOverlay();
  renderHome();
  showToast('🌙 Night บันทึกแล้ว!');
}

// ─── TAB SWITCHING ────────────────────────────────────────────────────────────

function switchTab(tab) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${tab}`).classList.add('active');
  document.getElementById(`nav-${tab}`).classList.add('active');
  if (tab === 'history') renderHistory();
}

// ─── HISTORY ─────────────────────────────────────────────────────────────────

function renderHistory() {
  const container = document.getElementById('history-list');
  const dates = Object.keys(data).sort((a, b) => b.localeCompare(a));

  if (!dates.length) {
    container.innerHTML = `
      <div class="empty">
        <div class="empty-icon">📋</div>
        <div class="empty-text">ยังไม่มีข้อมูล<br>เริ่มบันทึกวันแรกได้เลย!</div>
      </div>`;
    return;
  }

  container.innerHTML = dates.map(date => {
    const log = data[date];
    const { day, full } = formatDate(date);

    const chips = [];
    if (log.water > 0)    chips.push(`💧 ${log.water}/${MAX_WATER}`);
    if (log.exercise)     chips.push('🏃 ออกกำลังกาย');
    if (log.morning.mood) chips.push(MOODS[log.morning.mood]);
    if (log.night.energy) chips.push(`⚡ ${log.night.energy}/5`);

    const chipsHtml = chips.map(c => `<span class="chip">${c}</span>`).join('');

    return `
      <div class="history-card">
        <div class="history-card-header" onclick="toggleDetail('${date}')">
          <div>
            <div class="history-date">${day} ${full}</div>
            <div class="history-chips">${chipsHtml || '<span class="chip">ว่าง</span>'}</div>
          </div>
          <div class="expand-icon" id="ei-${date}">▾</div>
        </div>
        <div class="history-detail" id="detail-${date}">
          <pre class="md-preview">${esc(toMarkdown(log))}</pre>
          <button class="btn-copy" onclick="copyMd('${date}')">📋 Copy Markdown</button>
        </div>
      </div>`;
  }).join('');
}

function toggleDetail(date) {
  document.getElementById(`detail-${date}`).classList.toggle('open');
  document.getElementById(`ei-${date}`).classList.toggle('open');
}

function copyMd(date) {
  const log = data[date];
  if (!log) return;
  navigator.clipboard.writeText(toMarkdown(log))
    .then(() => showToast('📋 Copy แล้ว!'))
    .catch(() => showToast('❌ กด Copy ไม่ได้'));
}

// ─── MARKDOWN EXPORT ─────────────────────────────────────────────────────────

function toMarkdown(log) {
  const tasks = log.morning.tasks.filter(t => t.trim());
  return `# Session Log — ${log.date}

## 🌅 Morning
- เวลาตื่น: ${log.morning.wakeTime || '-'}
- Mood: ${log.morning.mood ? MOODS[log.morning.mood] : '-'}

## ✅ Tasks
${tasks.length ? tasks.map(t => `- [ ] ${t}`).join('\n') : '- (ว่าง)'}

## 💧 Health
- น้ำ: ${log.water}/${MAX_WATER} แก้ว
- ออกกำลังกาย: ${log.exercise ? 'Yes ✅' : 'No ❌'}

## 🌙 Night
- เวลานอน: ${log.night.sleepTime || '-'}
- Energy: ${log.night.energy ? `${log.night.energy}/5` : '-'}
- Reflection: ${log.night.reflection || '-'}
`;
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── TOAST ───────────────────────────────────────────────────────────────────

let toastTimer = null;

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ─── GOOGLE CALENDAR ─────────────────────────────────────────────────────────

let gTokenClient = null;
let gAccessToken = null;

function getTokenClient() {
  if (!gTokenClient) {
    gTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/calendar.readonly',
      callback: () => {}
    });
  }
  return gTokenClient;
}

function requestToken() {
  return new Promise((resolve, reject) => {
    if (GOOGLE_CLIENT_ID === 'YOUR_CLIENT_ID_HERE') {
      reject(new Error('no-client-id'));
      return;
    }
    const client = getTokenClient();
    client.callback = (res) => {
      if (res.error) { reject(new Error(res.error)); return; }
      gAccessToken = res.access_token;
      resolve(gAccessToken);
    };
    if (gAccessToken) { resolve(gAccessToken); return; }
    client.requestAccessToken({ prompt: '' });
  });
}

async function fetchLatestSleepEvent() {
  const token = await requestToken();
  const now  = new Date();
  const from = new Date(now);
  from.setHours(from.getHours() - 20);

  const params = new URLSearchParams({
    timeMin: from.toISOString(),
    timeMax: now.toISOString(),
    orderBy: 'startTime',
    singleEvents: 'true',
    maxResults: '30'
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (res.status === 401) { gAccessToken = null; throw new Error('token-expired'); }
  if (!res.ok) throw new Error('api-error');

  const data   = await res.json();
  const events = data.items || [];

  return events.find(e => {
    const title = (e.summary || '').toLowerCase();
    return title.includes('sleep') || title.includes('นอน') || title.includes('หลับ');
  }) || null;
}

async function autoFillWake() {
  showToast('⏳ กำลังดึงข้อมูล...');
  try {
    const ev = await fetchLatestSleepEvent();
    if (!ev) { showToast('❌ ไม่พบ Sleep event ใน Calendar'); return; }
    const end = new Date(ev.end.dateTime || ev.end.date);
    const t   = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
    document.getElementById('wake-time').value = t;
    showToast(`🌅 ดึงเวลาตื่น ${t} แล้ว!`);
  } catch (e) {
    if (e.message === 'no-client-id') showToast('⚠️ ยังไม่ได้ตั้ง Google Client ID');
    else showToast('❌ ดึงข้อมูลไม่ได้ ลองใหม่');
  }
}

async function autoFillSleep() {
  showToast('⏳ กำลังดึงข้อมูล...');
  try {
    const ev = await fetchLatestSleepEvent();
    if (!ev) { showToast('❌ ไม่พบ Sleep event ใน Calendar'); return; }
    const start = new Date(ev.start.dateTime || ev.start.date);
    const t     = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
    document.getElementById('sleep-time').value = t;
    showToast(`🌙 ดึงเวลานอน ${t} แล้ว!`);
  } catch (e) {
    if (e.message === 'no-client-id') showToast('⚠️ ยังไม่ได้ตั้ง Google Client ID');
    else showToast('❌ ดึงข้อมูลไม่ได้ ลองใหม่');
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

function init() {
  data = loadData();
  renderHome();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);
