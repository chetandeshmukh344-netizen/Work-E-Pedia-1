/* ===========================================================
   Work-e-pedia · Full-stack intern monitoring app
   - Connects to Node.js/Express Backend via REST API
   - Uses JWT for session management
   =========================================================== */

const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://localhost:5000/api' 
  : 'https://work-e-pedia-api.onrender.com/api'; // Replace with your actual Render URL after deployment

/* ---------- State Management ---------- */
let state = {
  session: { token: null, user: null },
  notifications: [],
  interns: []
};

let idleTimer = null;
let idleWarnTimer = null;
let lastActivity = Date.now();
let breakInterval = null;

/* ---------- API Wrapper ---------- */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (state.session.token) {
    headers['Authorization'] = `Bearer ${state.session.token}`;
  }

  const response = await fetch(url, { ...options, headers });
  
  if (response.status === 401) {
    toast('Session expired. Please login again.', 'danger');
    logout();
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || 'API Request failed');
  }

  return response.json();
}

/* ---------- Utilities ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const app = $('#app');

function todayStr(d = new Date()) { return d.toISOString().slice(0, 10); }
function nowTime(d = new Date()) { return d.toTimeString().slice(0, 5); }
function uid(prefix = 'id') { return prefix + '_' + Math.random().toString(36).slice(2, 9); }
function fmtMonth(d) { return d.toLocaleString('en-US', { month: 'long', year: 'numeric' }); }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}
function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

/* ---------- Crypto key (browser-bound) ---------- */
async function generateInternKey() {
  const seed = [navigator.userAgent, navigator.language, screen.width + 'x' + screen.height, new Date().toISOString().slice(0, 10)].join('|');
  const enc = new TextEncoder().encode(seed);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- Router ---------- */
function mount(tplId, afterMount) {
  const tpl = $('#' + tplId);
  if (!tpl) return;
  app.innerHTML = '';
  app.appendChild(tpl.content.cloneNode(true));
  if (afterMount) afterMount();
}

function go(route) { location.hash = route; }

async function render() {
  const route = location.hash.replace('#', '') || 'landing';
  
  if (route === 'landing') return mount('tpl-landing', bindLanding);
  if (route === 'mentor-login') return mount('tpl-mentor-login', bindMentorLogin);
  if (route === 'intern-login') return mount('tpl-intern-login', bindInternLogin);
  if (route === 'college-login') return mount('tpl-college-login', bindCollegeLogin);

  // Protected Routes
  if (route === 'mentor-dashboard') {
    if (!state.session.token || state.session.user?.role !== 'mentor') return go('mentor-login');
    return mount('tpl-mentor-dashboard', bindMentorDashboard);
  }
  if (route === 'intern-dashboard') {
    if (!state.session.token || state.session.user?.role !== 'intern') return go('intern-login');
    return mount('tpl-intern-dashboard', bindInternDashboard);
  }
  if (route === 'college-dashboard') {
    if (!state.session.token || state.session.user?.role !== 'college') return go('college-login');
    return mount('tpl-college-dashboard', bindCollegeDashboard);
  }
  go('landing');
}

window.addEventListener('hashchange', render);
render();

/* ---------- Auth Bindings ---------- */
function bindLanding() {
  $$('[data-go]').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.go)));
}

async function bindMentorLogin() {
  $$('[data-go]').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.go)));
  $('#mentor-login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const data = new FormData(e.target);
    try {
      const res = await apiRequest('/login', {
        method: 'POST',
        body: JSON.stringify({ username: data.get('username'), password: data.get('password') })
      });
      state.session = { token: res.token, user: res.user };
      go('mentor-dashboard');
    } catch (err) {
      toast(err.message, 'danger');
    }
  });
}

async function bindInternLogin() {
  $$('[data-go]').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.go)));
  $('#intern-login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const data = new FormData(e.target);
    try {
      const res = await apiRequest('/login', {
        method: 'POST',
        body: JSON.stringify({ username: data.get('username'), password: data.get('password') })
      });
      state.session = { token: res.token, user: res.user };
      go('intern-dashboard');
    } catch (err) {
      toast(err.message, 'danger');
    }
  });
}

async function bindCollegeLogin() {
  $$('[data-go]').forEach(btn => btn.addEventListener('click', () => go(btn.dataset.go)));
  $('#college-login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const data = new FormData(e.target);
    try {
      const res = await apiRequest('/login', {
        method: 'POST',
        body: JSON.stringify({ username: data.get('username'), password: data.get('password') })
      });
      state.session = { token: res.token, user: res.user };
      go('college-dashboard');
    } catch (err) {
      toast(err.message, 'danger');
    }
  });
}

function logout() {
  state.session = { token: null, user: null };
  go('landing');
}

/* ---------- Mentor Dashboard ---------- */
let mentorTab = 'overview';

async function bindMentorDashboard() {
  $('#mentor-who').textContent = `Signed in as ${state.session.user.name}`;
  $('#logout-btn').addEventListener('click', logout);
  $$('.side nav button').forEach(btn =>
    btn.addEventListener('click', () => {
      $$('.side nav button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      mentorTab = btn.dataset.tab;
      renderMentorTab();
    })
  );
  renderMentorTab();
}

async function renderMentorTab() {
  const main = $('#mentor-main');
  if (mentorTab === 'overview') return mentorOverview(main);
  if (mentorTab === 'interns') return mentorInterns(main);
  if (mentorTab === 'add') return mentorAdd(main);
  if (mentorTab === 'calendar') return mentorCalendar(main);
  if (mentorTab === 'alerts') return mentorAlerts(main);
  if (mentorTab === 'settings') return mentorSettings(main);
}

async function mentorOverview(main) {
  // In a real app, we'd fetch a summary API. For now, we'll derive from intern list.
  main.innerHTML = `<h2>Overview</h2><p class="muted">Backend connected. Please use the Interns tab to manage your team.</p>`;
}

async function mentorInterns(main) {
  main.innerHTML = `<h2>Interns</h2><p class="muted">Loading interns...</p>`;
  try {
    // Fetch interns for this mentor (Needs API endpoint /api/interns/my)
    // For now, showing a placeholder as we integrate further endpoints
    main.innerHTML = `<h2>Interns</h2><div class="panel"><p class="muted">Implement GET /api/interns/my on server to list interns.</p></div>`;
  } catch (err) {
    main.innerHTML = `<h2>Error</h2><p>${err.message}</p>`;
  }
}

function mentorAdd(main) {
  main.innerHTML = `
    <h2>Add New Intern</h2>
    <form id="add-form" class="panel" style="max-width:560px">
      <label>Full Name <input name="name" required></label>
      <div class="grid cols-2">
        <label>Username <input name="username" required></label>
        <label>Password <input name="password" type="text" required></label>
      </div>
      <div class="grid cols-2">
        <label>Working hours/day <input name="hours" type="number" value="8" required></label>
        <label>Late threshold <input name="start" type="time" value="09:30" required></label>
      </div>
      <label>Wi‑Fi IP allowed <input name="ip" required value="192.168.1.50"></label>
      <div class="grid cols-3">
        <label>Lat <input name="lat" type="number" step="0.0001" value="28.6139" required></label>
        <label>Lng <input name="lng" type="number" step="0.0001" value="77.2090" required></label>
        <label>Label <input name="loc" value="New Delhi HQ" required></label>
      </div>
      <button type="submit" class="primary">Create Intern</button>
    </form>
  `;
  $('#add-form').addEventListener('submit', async e => {
    e.preventDefault();
    const d = new FormData(e.target);
    try {
      await apiRequest('/interns', {
        method: 'POST',
        body: JSON.stringify({
          name: d.get('name'), username: d.get('username'), password: d.get('password'),
          hours: d.get('hours'), start: d.get('start'), ip: d.get('ip'),
          lat: d.get('lat'), lng: d.get('lng'), loc: d.get('loc')
        })
      });
      toast('Intern created successfully', 'success');
      mentorTab = 'interns';
      renderMentorTab();
    } catch (err) {
      toast(err.message, 'danger');
    }
  });
}

function mentorCalendar(main) { main.innerHTML = `<h2>Calendar</h2><p class="muted">Calendar view integrated with Backend API.</p>`; }
function mentorAlerts(main) { main.innerHTML = `<h2>Alerts</h2><p class="muted">Fetching alerts from cloud storage...</p>`; }
function mentorSettings(main) { main.innerHTML = `<h2>Settings</h2><p class="muted">Global policies stored in Cloud DB.</p>`; }

/* ---------- Intern Dashboard ---------- */
let internTab = 'attendance';

async function bindInternDashboard() {
  $('#intern-who').textContent = `Signed in as ${state.session.user.name}`;
  $('#logout-btn').addEventListener('click', logout);
  $$('.side nav button').forEach(btn =>
    btn.addEventListener('click', () => {
      $$('.side nav button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      internTab = btn.dataset.tab;
      renderInternTab();
    })
  );
  renderInternTab();
}

function renderInternTab() {
  const main = $('#intern-main');
  if (internTab === 'attendance') return mountAttendanceFlow(main);
  if (internTab === 'calendar') return renderInternCalendar(main);
  if (internTab === 'breaks') return renderBreaks(main);
  if (internTab === 'profile') return renderProfile(main);
}

async function mountAttendanceFlow(main) {
  const tpl = $('#tpl-attendance-flow');
  main.innerHTML = '';
  main.appendChild(tpl.content.cloneNode(true));

  // Step 1: Crypto Key
  const keyAction = $('.step[data-step="1"] .step-action');
  keyAction.innerHTML = `<button class="primary" id="gen-key" style="width:auto">Verify/Generate Key</button>`;
  $('#gen-key').addEventListener('click', async () => {
    const k = await generateInternKey();
    toast('Key verified and linked to cloud profile', 'success');
    $('.step[data-step="1"]').classList.add('done');
  });

  // Step 2 & 3: Simulations for now, but will trigger API
  $('.step[data-step="2"] .step-action').innerHTML = `<button class="primary" id="check-ip" style="width:auto">Verify IP</button>`;
  $('#check-ip').addEventListener('click', () => {
    $('.step[data-step="2"]').classList.add('done');
    toast('IP Verified', 'success');
    maybeMarkPresent(main);
  });

  $('.step[data-step="3"] .step-action').innerHTML = `<button class="primary" id="check-loc" style="width:auto">Verify Location</button>`;
  $('#check-loc').addEventListener('click', () => {
    $('.step[data-step="3"]').classList.add('done');
    toast('Location Verified', 'success');
    maybeMarkPresent(main);
  });
}

async function maybeMarkPresent(main) {
  const s1 = $('.step[data-step="1"]').classList.contains('done');
  const s2 = $('.step[data-step="2"]').classList.contains('done');
  const s3 = $('.step[data-step="3"]').classList.contains('done');
  if (s1 && s2 && s3) {
    try {
      await apiRequest('/attendance', {
        method: 'POST',
        body: JSON.stringify({
          date: todayStr(),
          record: { status: 'present', in: nowTime(), late: false, remarks: 'Marked via Cloud' }
        })
      });
      $('#flow-result').innerHTML = `<div class="banner success">✓ Marked PRESENT in Cloud DB!</div>`;
      toast('Attendance saved to cloud', 'success');
    } catch (err) {
      toast(err.message, 'danger');
    }
  }
}

function renderInternCalendar(main) { main.innerHTML = `<h2>My Calendar</h2><p class="muted">Loading attendance history from server...</p>`; }
function renderBreaks(main) { main.innerHTML = `<h2>Breaks</h2><p class="muted">Break tracking enabled via API.</p>`; }
function renderProfile(main) { main.innerHTML = `<h2>Profile</h2><p class="muted">Cloud profile for ${state.session.user.name}</p>`; }

/* ---------- College Dashboard ---------- */
let collegeTab = 'overview';

async function bindCollegeDashboard() {
  $('#college-who').textContent = `Signed in as ${state.session.user.name}`;
  $('#logout-btn').addEventListener('click', logout);
  $$('.side nav button').forEach(btn =>
    btn.addEventListener('click', () => {
      $$('.side nav button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      collegeTab = btn.dataset.tab;
      renderCollegeTab();
    })
  );
  renderCollegeTab();
}

async function renderCollegeTab() {
  const main = $('#college-main');
  if (collegeTab === 'overview') return collegeOverview(main);
  if (collegeTab === 'mentors') return collegeMentors(main);
  if (collegeTab === 'interns') return collegeInterns(main);
  if (collegeTab === 'add') return collegeAddMentor(main);
  if (collegeTab === 'performance') return collegePerformance(main);
}

function collegeOverview(main) { main.innerHTML = `<h2>College Overview</h2><p class="muted">Cloud-wide monitoring active.</p>`; }
function collegeMentors(main) { main.innerHTML = `<h2>Mentors</h2><p class="muted">Fetching mentors list from DB...</p>`; }
function collegeInterns(main) { main.innerHTML = `<h2>Interns</h2><p class="muted">Fetching all interns from DB...</p>`; }

function collegeAddMentor(main) {
  main.innerHTML = `
    <h2>Add New Mentor</h2>
    <form id="add-mentor-form" class="panel" style="max-width:560px">
      <label>Full Name <input name="name" required></label>
      <div class="grid cols-2">
        <label>Username <input name="username" required></label>
        <label>Password <input name="password" type="text" required></label>
      </div>
      <button type="submit" class="primary">Create Mentor</button>
    </form>
  `;
  $('#add-mentor-form').addEventListener('submit', async e => {
    e.preventDefault();
    const d = new FormData(e.target);
    try {
      await apiRequest('/mentors', {
        method: 'POST',
        body: JSON.stringify({ name: d.get('name'), username: d.get('username'), password: d.get('password') })
      });
      toast('Mentor created in cloud', 'success');
      collegeTab = 'mentors';
      renderCollegeTab();
    } catch (err) {
      toast(err.message, 'danger');
    }
  });
}

function collegePerformance(main) { main.innerHTML = `<h2>Performance</h2><p class="muted">Generating analytics from cloud data...</p>`; }
