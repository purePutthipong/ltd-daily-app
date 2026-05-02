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
      morning:  { wakeTime: '', mood: 0, tasks: ['', '', ''], tasksDone: [false, false, false] },
      night:    { sleepTime: '', energy: 0, reflection: '' }
    };
  }
  if (!data[date].morning.tasksDone) data[date].morning.tasksDone = [false, false, false];
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
    if (tasks.length) {
      const doneCount = (log.morning.tasksDone || []).filter((d, i) => d && log.morning.tasks[i].trim()).length;
      parts.push(`${doneCount}/${tasks.length} task ✅`);
    }
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
    syncTaskCbUI(log);
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
  log.morning.wakeTime  = document.getElementById('wake-time').value;
  log.morning.mood      = currentMood;
  log.morning.tasks     = [
    document.getElementById('task-1').value.trim(),
    document.getElementById('task-2').value.trim(),
    document.getElementById('task-3').value.trim()
  ];
  // preserve tasksDone as-is (already updated by toggleTaskCb)
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
  if (tab === 'history')  renderHistory();
  if (tab === 'insights') renderInsights();
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

// ─── TASK COMPLETION ─────────────────────────────────────────────────────────

function toggleTaskCb(idx) {
  const log = getLog(getToday());
  log.morning.tasksDone[idx] = !log.morning.tasksDone[idx];
  save();
  syncTaskCbUI(log);
  renderHome();
}

function syncTaskCbUI(log) {
  const done = log.morning.tasksDone || [false, false, false];
  [0, 1, 2].forEach(i => {
    const btn = document.getElementById(`tcb-${i}`);
    const inp = document.getElementById(`task-${i + 1}`);
    if (!btn) return;
    btn.textContent = done[i] ? '✅' : '○';
    btn.classList.toggle('checked', done[i]);
    if (inp) inp.style.textDecoration = done[i] ? 'line-through' : 'none';
    if (inp) inp.style.color = done[i] ? 'var(--muted)' : '';
  });
}

// ─── SLEEP ANALYSIS ───────────────────────────────────────────────────────────

function analyzeSleep() {
  const dates = Object.keys(data).sort((a, b) => b.localeCompare(a)).slice(0, 7);
  const entries = dates.map(date => {
    const log    = data[date];
    const sleepT = log.night?.sleepTime;
    const wakeT  = log.morning?.wakeTime;
    let duration = null, sleepHour = null;

    if (sleepT && wakeT) {
      const [sh, sm] = sleepT.split(':').map(Number);
      const [wh, wm] = wakeT.split(':').map(Number);
      const sleepMins = sh * 60 + sm;
      const wakeMins  = wh * 60 + wm;
      duration  = wakeMins >= sleepMins
        ? (wakeMins - sleepMins) / 60
        : (1440 - sleepMins + wakeMins) / 60;
      sleepHour = sh;
    }
    return { date, duration, sleepHour, wakeTime: wakeT, energy: log.night?.energy || 0 };
  });

  const withData = entries.filter(e => e.duration !== null && e.duration > 2 && e.duration < 16);
  if (!withData.length) return null;

  const avgDuration = withData.reduce((s, e) => s + e.duration, 0) / withData.length;

  const wakeMinsArr = entries.filter(e => e.wakeTime).map(e => {
    const [h, m] = e.wakeTime.split(':').map(Number);
    return h * 60 + m;
  });
  const avgWakeMins = wakeMinsArr.length
    ? wakeMinsArr.reduce((s, m) => s + m, 0) / wakeMinsArr.length : null;
  const wakeVariance = wakeMinsArr.length > 1
    ? wakeMinsArr.reduce((s, m) => s + Math.pow(m - avgWakeMins, 2), 0) / wakeMinsArr.length : 0;
  const wakeStdDev = Math.sqrt(wakeVariance);

  // past midnight = sleep hour 0-4
  const lateNights = withData.filter(e => e.sleepHour !== null && e.sleepHour < 5).length;

  return { avgDuration, avgWakeMins, wakeStdDev, lateNights, count: withData.length };
}

function formatMins(mins) {
  if (mins === null || mins === undefined) return '-';
  const h = Math.floor(mins / 60) % 24;
  const m = Math.round(mins % 60);
  return `${pad(h)}:${pad(m)}`;
}

function generatePersonalTips(a) {
  if (!a || a.count < 2) return [];
  const tips = [];

  if (a.avgDuration < 7) {
    tips.push({ level: 'warn', icon: '⏰', title: 'นอนน้อยเกินไป',
      detail: `เฉลี่ย ${a.avgDuration.toFixed(1)} ชม./คืน — เป้าหมายควรเป็น 7-9 ชม.`,
      action: 'ลองนอนเร็วขึ้น 30 นาที ทดลองต่อเนื่อง 1 สัปดาห์' });
  } else if (a.avgDuration > 9) {
    tips.push({ level: 'info', icon: '⏰', title: 'นอนนานเกินไป',
      detail: `เฉลี่ย ${a.avgDuration.toFixed(1)} ชม./คืน`,
      action: 'นอนมากเกินไปอาจทำให้ง่วงกลางวัน ลองลดเป็น 7-8 ชม.' });
  }

  if (a.lateNights >= 3) {
    tips.push({ level: 'warn', icon: '🌙', title: 'นอนดึกบ่อย',
      detail: `${a.lateNights} ใน ${a.count} คืน นอนหลังเที่ยงคืน`,
      action: 'ตั้งเป้าเข้านอนก่อน 23:30 — ร่างกายหลั่ง melatonin สูงสุดช่วง 22-23 น.' });
  }

  if (a.wakeStdDev > 60) {
    tips.push({ level: 'warn', icon: '📅', title: 'เวลาตื่นไม่สม่ำเสมอ',
      detail: `เวลาตื่นต่างกันเฉลี่ย ${Math.round(a.wakeStdDev)} นาที`,
      action: 'ตื่นเวลาเดิมทุกวัน (รวมวันหยุด) — Matthew Walker: "Regularity is king"' });
  } else if (a.wakeStdDev > 30) {
    tips.push({ level: 'info', icon: '📅', title: 'เวลาตื่นยังไม่นิ่งพอ',
      detail: `เวลาตื่นต่างกัน ${Math.round(a.wakeStdDev)} นาที`,
      action: 'พยายามให้เวลาตื่นต่างกันไม่เกิน 30 นาทีในแต่ละวัน' });
  }

  return tips;
}

const SLEEP_TIPS = [
  { icon: '🌅', title: 'รับแสงแดดเช้าภายใน 1 ชั่วโมงแรก',
    detail: 'แสงแดดช่วง 7-9 น. reset circadian clock ให้แม่นยำ ทำให้ง่วงตรงเวลาตอนกลางคืน',
    action: 'เปิดม่านหรือออกไปข้างนอกหลังตื่นทันที แม้แค่ 10 นาที' },
  { icon: '📱', title: 'ลดหน้าจอก่อนนอน 30-60 นาที',
    detail: 'แสงสีฟ้าจากมือถือกด melatonin ได้นานถึง 3 ชม. ทำให้นอนหลับยากขึ้น',
    action: 'ตั้ง Do Not Disturb และวางมือถือไว้นอกห้องนอน หรือเปิด Night Mode' },
  { icon: '🌡️', title: 'ห้องเย็น = นอนหลับดีกว่า',
    detail: 'ร่างกายต้องลดอุณหภูมิ 1-2°C เพื่อเข้าสู่การนอนหลับลึก (Deep Sleep)',
    action: 'ตั้งแอร์ 20-22°C หรือใช้พัดลมช่วยระบาย' },
  { icon: '☕', title: 'คาเฟอีนมีครึ่งชีวิต 6 ชั่วโมง',
    detail: 'กาแฟบ่าย 3 โมง ยังค้างในร่างกาย 50% จนถึงตี 3 ลด deep sleep ได้ 20-40%',
    action: 'หลีกเลี่ยงคาเฟอีนทุกชนิด (กาแฟ ชา น้ำอัดลม) หลัง 14:00 น.' },
  { icon: '🏃', title: 'ออกกำลังกายช่วงเช้า-บ่าย ดีกว่าเย็น',
    detail: 'การออกกำลังกายช่วยให้นอนหลับลึกขึ้น แต่ถ้าทำก่อนนอนจะทำให้ตื่นตัวมากเกิน',
    action: 'หยุดออกกำลังกายหนักอย่างน้อย 3 ชม. ก่อนเข้านอน' },
  { icon: '🛏️', title: 'ถ้านอนไม่หลับเกิน 25 นาที ให้ลุกขึ้น',
    detail: 'นอนดิ้นรนทำให้สมองจำว่า "เตียง = ที่นอนไม่หลับ" — ยิ่งแย่ลงเรื่อยๆ',
    action: 'ลุกไปทำอะไรที่ผ่อนคลายในแสงหรี่ แล้วค่อยกลับมานอนเมื่อง่วง' },
];

// ─── RENDER INSIGHTS ─────────────────────────────────────────────────────────

function renderInsights() {
  const container   = document.getElementById('insights-content');
  const analysis    = analyzeSleep();
  const personalTips = generatePersonalTips(analysis);
  let html = '';

  // Stats card
  if (analysis) {
    const durClass = analysis.avgDuration < 7 ? 'stat-warn' : analysis.avgDuration > 9 ? 'stat-info' : 'stat-ok';
    const conClass = analysis.wakeStdDev > 60 ? 'stat-warn' : analysis.wakeStdDev > 30 ? 'stat-info' : 'stat-ok';
    html += `
      <div class="card">
        <div class="card-title">${analysis.count} คืนที่บันทึกไว้ · 7 วันล่าสุด</div>
        <div class="stat-row">
          <div class="stat-box ${durClass}">
            <div class="stat-val">${analysis.avgDuration.toFixed(1)}<span class="stat-unit"> ชม.</span></div>
            <div class="stat-label">นอนเฉลี่ย</div>
          </div>
          <div class="stat-box">
            <div class="stat-val">${formatMins(analysis.avgWakeMins)}</div>
            <div class="stat-label">ตื่นเฉลี่ย</div>
          </div>
          <div class="stat-box ${conClass}">
            <div class="stat-val">${Math.round(analysis.wakeStdDev)}<span class="stat-unit"> นาที</span></div>
            <div class="stat-label">ความแปรปรวน</div>
          </div>
        </div>
      </div>`;
  } else {
    html += `
      <div class="card" style="text-align:center;padding:24px 16px;">
        <div style="font-size:40px;margin-bottom:10px;">💤</div>
        <div style="color:var(--muted);font-size:14px;line-height:1.6;">
          บันทึก Morning + Night Log อย่างน้อย 2 วัน<br>เพื่อดูการวิเคราะห์การนอนของคุณ
        </div>
      </div>`;
  }

  // Personalized tips
  if (personalTips.length) {
    html += `<div class="insights-section-title">⚠️ สิ่งที่ควรปรับ</div>`;
    personalTips.forEach(t => {
      html += `
        <div class="tip-card tip-${t.level}">
          <div class="tip-header">${t.icon} ${t.title}</div>
          <div class="tip-detail">${t.detail}</div>
          <div class="tip-action">💡 ${t.action}</div>
        </div>`;
    });
  }

  // General tips
  html += `<div class="insights-section-title">📚 หลักการนอนที่ดี</div>`;
  SLEEP_TIPS.forEach(t => {
    html += `
      <div class="tip-card">
        <div class="tip-header">${t.icon} ${t.title}</div>
        <div class="tip-detail">${t.detail}</div>
        <div class="tip-action">💡 ${t.action}</div>
      </div>`;
  });

  container.innerHTML = html;
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
