// ==================== DRIVE PROFILE — LUXURY PANEL ====================
// Cassette icon = hidden trigger. Tap/click opens the Drive Profile. Hold 3s
// opens analytics.html (owner mode). Pure add-on: public UI stays untouched.
// Visible category tabs (fewer options per view, breathing room), hero with
// circular avatar + name + inline editing, streak & activity with the last
// 30 days strip, and an optional carbon/red sports mode.
(() => {
  const HOLD_MS = 3000;
  let holdTimer = null;
  let holdFired = false;
  let sportOn = false;
  let root = null;
  let tickTimer = null;
  let lastOpenedAt = 0;
  let currentView = 'listening';
  let pickAvatar = 0;

  // ---------- small helpers ----------

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }

  function fmtDur(secs) {
    secs = Math.max(0, Math.round(Number(secs) || 0));
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
    if (m > 0) return m + 'm ' + String(s).padStart(2, '0') + 's';
    return s + 's';
  }

  function fmtClock(ts) {
    if (ts === null || ts === undefined) return '—';
    const d = new Date();
    d.setHours(ts, 0, 0, 0);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function fmtMonth(m) {
    const p = String(m).split('-');
    const d = new Date(Number(p[0]), Number(p[1]) - 1, 1);
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  function fmtDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function initialOf(title) {
    const t = String(title || '?').replace(/[^\w\s]/g, ' ').trim();
    return (t[0] || '?').toUpperCase();
  }

  function artHue(title) {
    let n = 0;
    for (let i = 0; i < String(title).length; i++) n += String(title).charCodeAt(i);
    return n % 360;
  }

  function safeText(s) {
    return String(s === undefined || s === null ? '—' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function avatarGradient(idx) {
    const g = (window.RDProfile && window.RDProfile.profiles.avatarGradients) || [];
    const pal = g[idx] || ['#f3e5bd', '#d4af37', '#9a7b1e'];
    return 'linear-gradient(140deg,' + pal[0] + ',' + pal[1] + ' 55%,' + pal[2] + ')';
  }

  // ---------- animated counters ----------

  const rafMap = new WeakMap();

  function countUp(node, target, opts) {
    if (!node) return;
    opts = opts || {};
    const dec = opts.decimals || 0;
    const suffix = opts.suffix || '';
    const prefix = opts.prefix || '';
    const dur = opts.dur || 900;
    const from = Number(node.dataset.prev || 0) || 0;
    node.dataset.prev = target;
    const start = performance.now();
    if (rafMap.has(node)) cancelAnimationFrame(rafMap.get(node));
    (function step(now) {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      node.textContent = prefix + (from + (target - from) * eased).toFixed(dec) + suffix;
      if (p < 1) rafMap.set(node, requestAnimationFrame(step));
      else rafMap.delete(node);
    })(start);
  }

  // ---------- panel shell ----------

  function buildPanel() {
    root = el('div', 'drive-profile');
    root.id = 'drive-profile';
    root.setAttribute('aria-hidden', 'true');

    const scrim = el('div', 'dp-scrim');
    scrim.addEventListener('click', () => {
      if (Date.now() - lastOpenedAt < 500) return;
      closePanel();
    });

    const panel = el('aside', 'dp-panel');
    const hd = el('div', 'dp-hd');
    const hdLeft = el('div', 'dp-hd-left');
    hdLeft.appendChild(el('span', 'dp-hd-kicker', 'RetroDrive'));
    hdLeft.appendChild(el('h2', 'dp-hd-name', 'DRIVER PROFILE'));
    const hdActions = el('div', 'dp-hd-actions');
    const sportToggle = el('label', 'dp-sport-toggle');
    sportToggle.innerHTML =
      '<input type="checkbox" aria-label="Sports mode">' +
      '<span class="dp-sport-track"><span class="dp-sport-thumb"></span></span>' +
      '<span class="dp-sport-label">SPORT</span>';
    sportToggle.querySelector('input').addEventListener('change', ev => setSport(ev.target.checked));
    const closeBtn = el('button', 'dp-close');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close profile');
    closeBtn.innerHTML = '<svg class="dp-close-ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path class="dp-close-x" d="M6 6l12 12M18 6L6 18"/></svg>';
    closeBtn.addEventListener('click', closePanel);
    hdActions.appendChild(sportToggle);
    hdActions.appendChild(closeBtn);
    hd.appendChild(hdLeft);
    hd.appendChild(hdActions);

    const body = el('div', 'dp-body');
    body.appendChild(buildAmbient());

    const tabBar = el('div', 'dp-tabs');
    const tabDefs = [
      ['listening', 'LISTENING'], ['activity', 'ACTIVITY'],
      ['garage', 'GARAGE'], ['vault', 'VAULT'], ['wrapped', 'WRAPPED'],
      ['sport', 'SPORT', true]
    ];
    tabDefs.forEach(([id, label, hidden]) => {
      const b = el('button', 'dp-tab' + (id === currentView ? ' active' : '') + (hidden ? ' dp-sport-tab' : ''), label);
      b.type = 'button';
      b.dataset.tab = id;
      if (hidden) b.hidden = true;
      b.addEventListener('click', () => setView(id));
      tabBar.appendChild(b);
    });
    body.appendChild(tabBar);

    const scroll = el('div', 'dp-scroll');
    const views = el('div', 'dp-views');
    views.appendChild(buildListeningView());
    views.appendChild(buildActivityView());
    views.appendChild(buildGarageView());
    views.appendChild(buildVaultView());
    views.appendChild(buildWrappedView());
    views.appendChild(buildSportView());
    scroll.appendChild(views);
    body.appendChild(scroll);

    panel.appendChild(hd);
    panel.appendChild(body);

    root.appendChild(scrim);
    root.appendChild(panel);
    document.body.appendChild(root);

    root.addEventListener('transitionend', ev => {
      if (ev.target === root && ev.propertyName === 'visibility') {
        if (!root.classList.contains('open') && tickTimer) {
          clearInterval(tickTimer);
          tickTimer = null;
        }
      }
    });
  }

  // ---------- ambient luxury background ----------

  function buildAmbient() {
    const a = el('div', 'dp-ambient');
    a.appendChild(el('span', 'dp-blob dp-blob-1'));
    a.appendChild(el('span', 'dp-blob dp-blob-2'));
    a.appendChild(el('span', 'dp-blob dp-blob-3'));
    const wav = el('div', 'dp-wav');
    for (let i = 0; i < 9; i++) wav.appendChild(el('i', 'dp-wav-bar'));
    a.appendChild(wav);
    const dust = el('div', 'dp-dust');
    for (let i = 0; i < 8; i++) dust.appendChild(el('span', 'dp-dust-p'));
    a.appendChild(dust);
    return a;
  }

  // ---------- hero ----------

  function buildHero() {
    const hero = el('div', 'dp-hero');
    const editRow = el('div', 'dp-hero-edit');
    editRow.hidden = true;
    const nameInput = el('input', 'dp-edit-name');
    nameInput.type = 'text';
    nameInput.maxLength = 16;
    nameInput.setAttribute('aria-label', 'Profile name');
    const swatches = el('div', 'dp-avatar-swatches');
    for (let i = 0; i < 6; i++) {
      const s = el('button', 'dp-avatar-swatch');
      s.type = 'button';
      s.dataset.avatar = String(i);
      s.setAttribute('aria-label', 'Avatar style ' + (i + 1));
      s.style.background = avatarGradient(i);
      s.addEventListener('click', () => {
        swatches.querySelectorAll('.dp-avatar-swatch').forEach(x => x.classList.toggle('sel', x === s));
        pickAvatar = i;
      });
      swatches.appendChild(s);
    }
    const saveBtn = el('button', 'dp-edit-save', 'Save');
    saveBtn.type = 'button';
    const cancelBtn = el('button', 'dp-edit-cancel', 'Cancel');
    cancelBtn.type = 'button';
    editRow.appendChild(nameInput);
    editRow.appendChild(swatches);
    editRow.appendChild(saveBtn);
    editRow.appendChild(cancelBtn);

    hero.innerHTML =
      '<div class="dp-hero-art"><img alt="" class="dp-hero-car"><div class="dp-hero-shine"></div><div class="dp-hero-dark"></div></div>' +
      '<div class="dp-hero-main">' +
      '<div class="dp-avatar-ring"><span class="dp-avatar" id="dp-avatar">R</span>' +
      '<button class="dp-avatar-edit" id="dp-avatar-edit" type="button" aria-label="Edit profile">' +
      '<svg class="dp-edit-ic" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path class="dp-edit-pen" d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>' +
      '</button></div>' +
      '<div class="dp-hero-info">' +
      '<span class="dp-hero-kicker" id="dp-session-label">STANDBY</span>' +
      '<span class="dp-hero-session" id="dp-live-session">Ready when you are</span>' +
      '<span class="dp-hero-name" id="dp-hero-name">—</span>' +
      '<div class="dp-hero-hours"><b id="dp-hero-hours">0</b><span class="dp-hero-hours-unit">HOURS TOTAL</span></div>' +
      '<div class="dp-hero-meta" id="dp-hero-meta"></div>' +
      '</div>' +
      '<svg class="dp-ring" viewBox="0 0 120 120" aria-hidden="true">' +
      '<circle class="dp-ring-track" cx="60" cy="60" r="54" pathLength="100"/>' +
      '<circle class="dp-ring-fill" id="dp-ring-fill" cx="60" cy="60" r="54" pathLength="100"/>' +
      '</svg>' +
      '</div>';
    hero.appendChild(editRow);

    hero.querySelector('#dp-avatar-edit').addEventListener('click', () => {
      const prof = window.RDProfile.profiles.get();
      nameInput.value = prof.name;
      pickAvatar = prof.avatar;
      swatches.querySelectorAll('.dp-avatar-swatch').forEach(x => x.classList.toggle('sel', Number(x.dataset.avatar) === prof.avatar));
      editRow.hidden = !editRow.hidden;
      hero.classList.toggle('editing', !editRow.hidden);
    });
    saveBtn.addEventListener('click', () => {
      window.RDProfile.profiles.update({ name: nameInput.value || undefined, avatar: pickAvatar });
      editRow.hidden = true;
      hero.classList.remove('editing');
      renderHero();
    });
    cancelBtn.addEventListener('click', () => {
      editRow.hidden = true;
      hero.classList.remove('editing');
    });
    return hero;
  }

  function renderHero() {
    if (!window.RDProfile) return;
    const st = window.RDProfile.getStats();
    const prof = window.RDProfile.profiles.get();
    const favId = st.carRows[0] ? st.carRows[0].id : 'cinematic-defender-hero';
    const img = document.querySelector('.dp-hero-car');
    if (img) {
      img.onerror = function () { this.style.visibility = 'hidden'; };
      img.style.visibility = '';
      img.src = 'assets/' + favId + '.png';
    }
    const av = document.getElementById('dp-avatar');
    if (av) {
      av.textContent = String(prof.name).slice(0, 2).toUpperCase();
      av.style.background = avatarGradient(prof.avatar);
    }
    const name = document.getElementById('dp-hero-name');
    if (name) name.textContent = prof.name || st.favCar || 'THE FLEET AWAITS';
    countUp(document.getElementById('dp-hero-hours'), st.totals.listenSec / 3600, { decimals: 1, dur: 1100 });
    document.getElementById('dp-hero-meta').innerHTML =
      '<span class="dp-hero-meta-chip">Member since <b>' + fmtDate(st.memberSince) + '</b></span>' +
      '<span class="dp-meta-dot"></span>' +
      '<span class="dp-hero-meta-chip">' + st.streaks.activeDays + ' active days</span>' +
      '<span class="dp-meta-dot"></span>' +
      '<span class="dp-hero-meta-chip">Streak <b>' + st.streaks.current + '</b> days</span>';
    const weekProgress = Math.min(100, (st.weekSecs / 57600) * 100);
    const ring = document.getElementById('dp-ring-fill');
    if (ring) ring.style.strokeDashoffset = String(100 - weekProgress);
  }

  // ---------- listening view ----------

  function buildListeningView() {
    const v = el('div', 'dp-view active');
    v.dataset.view = 'listening';
    v.appendChild(buildHero());

    const stats = el('div', 'dp-stat-grid');
    stats.id = 'dp-stat-grid';
    const statDefs = [
      ['dp-stat-total', 'TOTAL LISTENING'], ['dp-stat-today', 'TODAY'],
      ['dp-stat-week', 'THIS WEEK'], ['dp-stat-complete', 'COMPLETION RATE']
    ];
    statDefs.forEach(([id, label]) => {
      const c = el('div', 'dp-stat');
      c.id = id;
      c.innerHTML = '<span class="dp-stat-label">' + label + '</span><span class="dp-stat-value" data-prev="0">0</span>';
      stats.appendChild(c);
    });
    v.appendChild(stats);

    v.appendChild(el('h3', 'dp-sec-hd', 'Music Lounge'));
    const lounge = el('div', 'dp-lounge');
    lounge.innerHTML =
      '<div class="dp-card dp-most" id="dp-most-played"></div>' +
      '<div class="dp-card" id="dp-top5"></div>';
    v.appendChild(lounge);
    return v;
  }

  function renderListening(st) {
    renderHero();
    countUp(document.getElementById('dp-stat-total').querySelector('.dp-stat-value'), st.totals.listenSec, { suffix: 's', dur: 1100 });
    countUp(document.getElementById('dp-stat-today').querySelector('.dp-stat-value'), st.todaySecs, { suffix: 's', dur: 900 });
    countUp(document.getElementById('dp-stat-week').querySelector('.dp-stat-value'), st.weekSecs, { suffix: 's', dur: 900 });
    countUp(document.getElementById('dp-stat-complete').querySelector('.dp-stat-value'), st.completionRate, { suffix: '%', dur: 700 });

    const most = document.getElementById('dp-most-played');
    const m = st.mostPlayed;
    most.innerHTML = m
      ? '<span class="dp-sec-hd small">Most Played</span>' +
        '<div class="dp-track">' +
        '<span class="dp-art" style="background:linear-gradient(135deg,hsl(' + artHue(m.title) + ' 55% 18%),hsl(' + artHue(m.title) + ' 55% 8%))">' + initialOf(m.title) + '</span>' +
        '<span class="dp-track-t"><b>' + safeText(m.title) + '</b><small>' + m.plays + ' plays · ' + fmtDur(m.secs) + '</small></span>' +
        '</div>'
      : '<span class="dp-sec-hd small">Most Played</span><span class="dp-empty">Start the engine — your soundtrack awaits.</span>';

    const top5 = document.getElementById('dp-top5');
    const topRows = st.top5.slice(0, 5);
    topRows.sort((a, b) => b.secs - a.secs);
    const maxTop = Math.max(1, topRows[0] ? topRows[0].secs : 1);
    top5.innerHTML = '<span class="dp-sec-hd small">Top 5 by Listening Time</span>' + (topRows.length
      ? topRows.map(r =>
        '<div class="dp-bar-row"><span class="dp-art mini" style="background:linear-gradient(135deg,hsl(' + artHue(r.title) + ' 55% 18%),hsl(' + artHue(r.title) + ' 55% 8%))">' + initialOf(r.title) + '</span>' +
        '<span class="dp-bar-track"><i style="width:' + Math.max(6, Math.round((r.secs / maxTop) * 100)) + '%"></i></span>' +
        '<span class="dp-bar-t">' + safeText(r.title) + '<small>' + fmtDur(r.secs) + '</small></span></div>'
      ).join('')
      : '<span class="dp-empty">No listening yet.</span>');
  }

  // ---------- activity view ----------

  function buildActivityView() {
    const v = el('div', 'dp-view');
    v.dataset.view = 'activity';
    v.appendChild(el('h3', 'dp-sec-hd', 'Streak &amp; Activity'));
    const grid = el('div', 'dp-streak-grid');
    const defs = [
      ['dp-streak-current', 'CURRENT STREAK', 'days'], ['dp-streak-longest', 'LONGEST STREAK', 'days'],
      ['dp-streak-days', 'ACTIVE DAYS', ''], ['dp-streak-since', 'MEMBER SINCE', '']
    ];
    defs.forEach(([id, label, unit]) => {
      const c = el('div', 'dp-stat streak');
      c.id = id;
      c.innerHTML = '<span class="dp-stat-label">' + label + '</span><span class="dp-stat-value" data-prev="0">0' + unit + '</span>';
      grid.appendChild(c);
    });
    v.appendChild(grid);
    const strip = el('div', 'dp-strip');
    strip.appendChild(el('span', 'dp-strip-hd', 'Last 30 Days'));
    const dots = el('div', 'dp-strip-dots');
    dots.id = 'dp-strip-dots';
    strip.appendChild(dots);
    v.appendChild(strip);
    return v;
  }

  function dayLabel(offset) {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function dayKeyToday() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function renderActivity(st) {
    countUp(document.getElementById('dp-streak-current').querySelector('.dp-stat-value'), st.streaks.current, { suffix: 'd', dur: 700 });
    countUp(document.getElementById('dp-streak-longest').querySelector('.dp-stat-value'), st.streaks.longest, { suffix: 'd', dur: 700 });
    countUp(document.getElementById('dp-streak-days').querySelector('.dp-stat-value'), st.streaks.activeDays, { dur: 700 });
    document.getElementById('dp-streak-since').querySelector('.dp-stat-value').textContent = fmtDate(st.memberSince);

    const dots = document.getElementById('dp-strip-dots');
    const daySecs = st.daySecs || {};
    let html = '';
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const secs = daySecs[key] || 0;
      const mins = Math.round(secs / 60);
      const lvl = mins <= 0 ? 0 : (mins < 15 ? 1 : mins < 60 ? 2 : 3);
      html += '<span class="dp-strip-d l' + lvl + (key === dayKeyToday() ? ' today' : '') + '" title="' + dayLabel(i) + ' — ' + (mins > 0 ? mins + ' min' : 'no listening') + '"></span>';
    }
    dots.innerHTML = html;
    dots.insertAdjacentHTML('beforeend', '<span class="dp-strip-days">' + stripDayLabels() + '</span>');
  }

  function stripDayLabels() {
    const names = [];
    for (let i = 29; i >= 0; i -= 7) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      names.push(d.toLocaleDateString(undefined, { month: 'short' }));
    }
    return names.join(' · ');
  }

  // ---------- garage view ----------

  function buildGarageView() {
    const v = el('div', 'dp-view');
    v.dataset.view = 'garage';
    v.appendChild(el('h3', 'dp-sec-hd', 'Garage Collection'));
    v.appendChild(el('div', 'dp-garage', '<span class="dp-empty">Loading…</span>'));
    return v;
  }

  function renderGarage(st) {
    const grid = document.querySelector('.dp-garage');
    const total = Math.max(1, st.carRows.reduce((s, c) => s + c.count, 0));
    const maxCount = Math.max(1, st.carRows[0] ? st.carRows[0].count : 1);
    grid.innerHTML = st.carRows.length ? st.carRows.map((c, i) => {
      const share = Math.round((c.count / total) * 100);
      return '<div class="dp-car' + (i === 0 ? ' fav' : '') + '">' +
        '<div class="dp-car-art"><img alt="' + safeText(c.name) + '" src="assets/' + safeText(c.id) + '.png" loading="lazy"><span class="dp-car-rank">' + (i === 0 ? 'FAVORITE' : 'NO.' + (i + 1)) + '</span></div>' +
        '<span class="dp-car-name">' + safeText(c.name) + '</span>' +
        '<div class="dp-car-row"><span>Usage</span><b>' + fmtDur(c.secs) + '</b></div>' +
        '<div class="dp-car-row"><span>Selections</span><b>' + c.count + '</b></div>' +
        '<div class="dp-bar-track gold"><i style="width:' + Math.round((c.count / maxCount) * 100) + '%"></i></div>' +
        '<span class="dp-car-share">' + share + '% of drives</span>' +
        '</div>';
    }).join('') : '<span class="dp-empty">Select a car to begin your collection.</span>';
  }

  // ---------- vault view ----------

  function buildVaultView() {
    const v = el('div', 'dp-view');
    v.dataset.view = 'vault';
    v.appendChild(el('h3', 'dp-sec-hd', 'Achievement Vault'));
    v.appendChild(el('div', 'dp-vault', '<span class="dp-empty">Loading…</span>'));
    return v;
  }

  function renderVault(st) {
    const vault = document.querySelector('.dp-vault');
    vault.innerHTML = st.achievements.map(a => {
      const ring = '<span class="dp-ach-ring" style="--p:' + a.progress + '"><span class="dp-ach-inner">' + (a.state === 'unlocked' ? '✦' : '<small>' + a.progress + '%</small>') + '</span></span>';
      return '<div class="dp-ach ' + a.state + '">' + ring +
        '<span class="dp-ach-t"><b>' + a.title + '</b><small>' + a.desc + '</small></span>' +
        '<span class="dp-ach-date">' + (a.unlockedAt ? 'Unlocked ' + fmtDate(a.unlockedAt) : 'In progress') + '</span>' +
        '</div>';
    }).join('');
  }

  // ---------- wrapped view ----------

  function buildWrappedView() {
    const v = el('div', 'dp-view');
    v.dataset.view = 'wrapped';
    v.appendChild(el('h3', 'dp-sec-hd', 'Monthly Retro Wrapped'));
    v.appendChild(el('div', 'dp-wrapped', '<span class="dp-empty">Loading…</span>'));
    return v;
  }

  function renderWrapped(st) {
    const w = st.wrapped;
    const wrap = document.querySelector('.dp-wrapped');
    wrap.innerHTML =
      '<div class="dp-wrapped-card">' +
      '<span class="dp-wrapped-kicker">THE OFFICIAL RETRODRIVE REPORT</span>' +
      '<span class="dp-wrapped-month">' + fmtMonth(w.month) + '</span>' +
      '<div class="dp-wrapped-hero"><span class="dp-wrapped-num" id="dp-wrapped-hours">0</span><span class="dp-wrapped-unit">hours listened</span></div>' +
      '<div class="dp-wrapped-divider"><i class="dp-wrapped-rule"></i>✦<i class="dp-wrapped-rule"></i></div>' +
      '<div class="dp-wrapped-rows">' +
      row('Top Song', w.topSong) + row('Favorite Car', w.favCar) + row('Favorite Playlist', w.favPlaylist) +
      row('Most Active Hour', w.activeHour !== null ? fmtClock(w.activeHour) : null) +
      row('Sessions', w.sessions) + row('Skips', w.skips) + row('Completion Rate', w.completionRate + '%') +
      '</div>' +
      (w.top5.length ? '<span class="dp-sec-hd small">Top 5 Tracks</span><div class="dp-wrapped-top5">' +
        w.top5.map((t, i) => '<span>' + (i + 1) + '. ' + safeText(t) + '</span>').join('') + '</div>' : '') +
      '</div>';
    countUp(document.getElementById('dp-wrapped-hours'), Math.round(w.hours * 10) / 10, { decimals: 1, dur: 1200 });
    function row(label, val) {
      return '<div class="dp-wrapped-row"><span>' + label + '</span><b>' + safeText(val) + '</b></div>';
    }
  }

  // ---------- sports view ----------

  function buildSportView() {
    const v = el('div', 'dp-view');
    v.dataset.view = 'sport';
    v.appendChild(el('h3', 'dp-sec-hd', 'Sports Dashboard'));
    const gauge = el('div', 'dp-gauge');
    gauge.innerHTML =
      '<svg viewBox="0 0 220 130" class="dp-gauge-svg">' +
      '<path class="dp-gauge-arc" d="M 20 120 A 90 90 0 0 1 200 120"/>' +
      '<path class="dp-gauge-arc red" d="M 173.6 183.6 A 90 90 0 0 1 200 120"/>' +
      '<g class="dp-gauge-tick">' +
      [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180].map(t => {
        const a = (Math.PI * (180 + t) * 2) / 360;
        const r1 = 90, r2 = t % 45 === 0 ? 78 : 84;
        const x1 = 110 + r1 * Math.cos(a), y1 = 120 - r1 * Math.sin(a);
        const x2 = 110 + r2 * Math.cos(a), y2 = 120 - r2 * Math.sin(a);
        return '<line class="dp-gauge-tick-line" x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '"/>';
      }).join('') +
      '</g>' +
      '<g class="dp-gauge-needle" id="dp-gauge-needle"><line class="dp-needle-line" x1="110" y1="120" x2="110" y2="38"/><circle class="dp-needle-cap" cx="110" cy="120" r="7"/></g>' +
      '<text class="dp-gauge-num" x="110" y="96" text-anchor="middle" id="dp-gauge-val">0</text>' +
      '<text class="dp-gauge-lbl" x="110" y="112" text-anchor="middle">INTENSITY</text>' +
      '</svg>';
    v.appendChild(gauge);
    const sgrid = el('div', 'dp-sport-grid');
    sgrid.id = 'dp-sport-grid';
    const sportDefs = [
      ['dp-sport-session', 'CURRENT SESSION'], ['dp-sport-sph', 'SONGS / HOUR'],
      ['dp-sport-skip', 'AVG SKIP SPEED'], ['dp-sport-switch', 'CAR SWITCH / HR'],
      ['dp-sport-peak', 'PEAK HOUR'], ['dp-sport-period', 'FAVORITE PERIOD'],
      ['dp-sport-daily', 'DAILY PROGRESS'], ['dp-sport-weekly', 'WEEKLY PROGRESS']
    ];
    sportDefs.forEach(([id, label]) => {
      const c = el('div', 'dp-stat sport');
      c.id = id;
      c.innerHTML = '<span class="dp-stat-label">' + label + '</span><span class="dp-stat-value" data-prev="0">0</span>';
      sgrid.appendChild(c);
    });
    v.appendChild(sgrid);
    return v;
  }

  function renderSport(st) {
    const sp = st.sports;
    const val = document.getElementById('dp-gauge-val');
    val.textContent = Math.round(sp.intensity) + '%';
    val.classList.remove('pop');
    void val.offsetWidth;
    val.classList.add('pop');
    const deg = -90 + sp.intensity * 1.8;
    const needle = document.getElementById('dp-gauge-needle');
    if (needle) needle.style.setProperty('--deg', deg.toFixed(1));

    countUp(document.getElementById('dp-sport-sph').querySelector('.dp-stat-value'), Math.round(sp.songsPerHour * 10) / 10, { decimals: 1, dur: 700 });
    countUp(document.getElementById('dp-sport-skip').querySelector('.dp-stat-value'), sp.avgSkipSpeedSec, { suffix: 's', dur: 700 });
    countUp(document.getElementById('dp-sport-switch').querySelector('.dp-stat-value'), Math.round(sp.carSwitchPerHour * 10) / 10, { decimals: 1, dur: 700 });
    document.getElementById('dp-sport-peak').querySelector('.dp-stat-value').textContent = sp.peakHour !== null ? fmtClock(sp.peakHour) : '—';
    document.getElementById('dp-sport-period').querySelector('.dp-stat-value').textContent = String(sp.period).toUpperCase();
    document.getElementById('dp-sport-daily').querySelector('.dp-stat-value').textContent = fmtDur(st.todaySecs);
    document.getElementById('dp-sport-weekly').querySelector('.dp-stat-value').textContent = fmtDur(st.weekSecs);
    updateLiveSession(st);
  }

  // ---------- navigation ----------

  function setSport(on) {
    sportOn = on;
    if (!root) return;
    root.classList.toggle('sport', on);
    const panel = root.querySelector('.dp-panel');
    if (panel) panel.classList.toggle('sport', on);
    const sportTab = root.querySelector('.dp-tab.dp-sport-tab');
    if (sportTab) sportTab.hidden = !on;
    if (on) {
      if (currentView !== 'sport') setView('sport');
    } else if (currentView === 'sport') {
      setView('listening');
    }
  }

  function setView(id) {
    if (!root) return;
    currentView = id;
    document.querySelectorAll('.dp-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
    document.querySelectorAll('.dp-view').forEach(v => v.classList.toggle('active', v.dataset.view === id));
    renderCurrent();
  }

  function renderCurrent() {
    if (!window.RDProfile) return;
    const st = window.RDProfile.getStats();
    if (currentView === 'listening') renderListening(st);
    else if (currentView === 'activity') renderActivity(st);
    else if (currentView === 'garage') renderGarage(st);
    else if (currentView === 'vault') renderVault(st);
    else if (currentView === 'wrapped') renderWrapped(st);
    else if (currentView === 'sport') renderSport(st);
  }

  const liveNodes = { label: null, timer: null, sTimer: null, sValue: null };

  function updateLiveSession(st) {
    const live = st.live;
    if (root) root.classList.toggle('session-live', live.open);
    if (!liveNodes.label) {
      liveNodes.label = document.getElementById('dp-session-label');
      liveNodes.timer = document.getElementById('dp-live-session');
      liveNodes.sTimer = document.getElementById('dp-sport-session');
    }
    if (liveNodes.label) liveNodes.label.textContent = live.open ? 'CURRENT SESSION' : 'STANDBY';
    if (liveNodes.timer) liveNodes.timer.textContent = live.open ? fmtDur(live.secs) : 'Ready when you are';
    if (liveNodes.sTimer) {
      const v = liveNodes.sValue || (liveNodes.sValue = liveNodes.sTimer.querySelector('.dp-stat-value'));
      if (v) v.textContent = live.open ? fmtDur(live.secs) : '0s';
    }
  }

  // ---------- open / close ----------

  function openPanel() {
    if (!root) return;
    lastOpenedAt = Date.now();
    root.classList.add('open');
    root.setAttribute('aria-hidden', 'false');
    if (!tickTimer) tickTimer = setInterval(() => {
      if (document.hidden || !root.classList.contains('open') || !window.RDProfile) return;
      if (currentView === 'listening' || currentView === 'sport') updateLiveSession(window.RDProfile.getStats());
    }, 1000);
    renderCurrent();
  }

  function closePanel() {
    if (!root) return;
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    root.classList.remove('open');
    root.setAttribute('aria-hidden', 'true');
  }

  // ---------- cassette trigger (click + 3s hold) ----------

  function openAnalytics() {
    try { location.href = 'analytics.html'; } catch (e) { }
  }

  function cancelHold(icon) {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    if (icon) icon.classList.remove('holding');
  }

  function wireTrigger() {
    const icon = document.querySelector('.cassette-hud-icon');
    if (!icon) return;
    icon.setAttribute('role', 'button');
    icon.setAttribute('tabindex', '0');
    icon.setAttribute('aria-label', 'Drive profile. Click to open, hold 3 seconds for analytics.');
    icon.style.cursor = 'pointer';

    icon.addEventListener('contextmenu', ev => ev.preventDefault());

    icon.addEventListener('pointerdown', ev => {
      if (ev.button !== undefined && ev.button !== 0) return;
      holdFired = false;
      icon.classList.add('holding');
      holdTimer = setTimeout(() => {
        holdFired = true;
        icon.classList.remove('holding');
        openAnalytics();
      }, HOLD_MS);
    });

    icon.addEventListener('pointerup', () => {
      if (holdFired) return;
      cancelHold(icon);
      if (root && root.classList.contains('open')) closePanel();
      else openPanel();
    });
    icon.addEventListener('pointercancel', () => { holdFired = false; cancelHold(icon); });
    icon.addEventListener('pointerleave', () => {
      if (!holdTimer) return;
      holdFired = false;
      cancelHold(icon);
    });

    icon.addEventListener('click', ev => {
      if (holdFired) { ev.preventDefault(); return; }
      ev.preventDefault();
    });

    icon.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        if (root && root.classList.contains('open')) closePanel();
        else openPanel();
      }
    });
  }

  // ---------- boot ----------

  document.addEventListener('DOMContentLoaded', () => {
    buildPanel();
    wireTrigger();
    if (sportOn) setSport(true);
  });
})();