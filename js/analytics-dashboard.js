/* RetroDrive FM — analytics dashboard controller
   Renders real Google Analytics 4 data through GaApi (js/ga-api.js).
   Realtime section auto-refreshes every 30 seconds; historical data
   loads on page load, on manual refresh, and on time-filter change.
   No placeholder values: sections stay hidden until real data arrives. */

(() => {
  let currentRange = 'realtime';
  let rtTimer = null;
  let loading = false;

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fmtNum(n) {
    return (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-US');
  }

  function fmtDur(s) {
    if (s == null || isNaN(s)) return '—';
    s = Math.round(s);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
    return m + 'm ' + String(sec).padStart(2, '0') + 's';
  }

  function fmtHours(s) {
    if (s == null || isNaN(s)) return '—';
    return (Number(s) / 3600).toFixed(1) + 'h';
  }

  function fmtUpdated() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
  }

  function setStatus(text, ok) {
    const c = $('conn-status');
    c.textContent = text;
    c.className = 'status-chip ' + (ok ? 'status-on' : 'status-off');
  }

  function emptyRow(tbody, msg) {
    tbody.innerHTML = '<tr><td colspan="2" class="empty-note">' + escapeHtml(msg) + '</td></tr>';
  }

  function fillTable(tbody, rows, labelKey, valueKey, fmt, limit) {
    if (!rows || !rows.length) {
      emptyRow(tbody, 'No data in this period');
      return;
    }
    const list = limit ? rows.slice(0, limit) : rows;
    const max = Math.max(1, ...list.map(r => Number(r[valueKey]) || 0));
    tbody.innerHTML = list.map(r => {
      const label = r[labelKey] && String(r[labelKey]).length ? String(r[labelKey]) : '(not set)';
      const v = Number(r[valueKey]) || 0;
      const bar = '<i class="tbar" style="width:' + Math.max(4, Math.round((v / max) * 100)) + '%"></i>';
      return '<tr><td class="dim">' + bar + escapeHtml(label) + '</td><td class="num">' + fmt(v) + '</td></tr>';
    }).join('');
  }

  function hideAllSections() {
    ['live-section', 'visitors-section', 'traffic-section', 'audience-section', 'events-section'].forEach(id => {
      $(id).classList.add('hidden');
    });
  }

  function showSections() {
    ['live-section', 'visitors-section', 'traffic-section', 'audience-section', 'events-section'].forEach(id => {
      $(id).classList.remove('hidden');
    });
    $('live-section').classList.toggle('hidden', currentRange !== 'realtime');
  }

  function noteError(e) {
    console.warn('[Analytics] ' + (e && e.message ? e.message : String(e)));
    setStatus('Error: ' + (e && e.message ? e.message.slice(0, 60) : 'request failed'));
  }

  async function loadRealtime() {
    if (!GaApi.isSignedIn()) return;
    try {
      const [liveUsers, totals, pageViews, countries, devices] = await Promise.allSettled([
        GaApi.realtimeReport(['activeUsers'], []),
        GaApi.realtimeReport(['activeUsers'], []),
        GaApi.realtimeReport(['eventCount'], [], { filter: { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'page_view' } } } }),
        GaApi.realtimeReport(['activeUsers'], ['country'], { limit: 5 }),
        GaApi.realtimeReport(['activeUsers'], ['deviceCategory'], { limit: 5 })
      ]);
      if (liveUsers.status === 'fulfilled') $('live-users').textContent = fmtNum(liveUsers.value[0] ? liveUsers.value[0].activeUsers : 0);
      if (totals.status === 'fulfilled') $('live-active30').textContent = fmtNum(totals.value[0] ? totals.value[0].activeUsers : 0);
      if (pageViews.status === 'fulfilled') $('live-pageviews').textContent = fmtNum(pageViews.value[0] ? pageViews.value[0].eventCount : 0);
      if (countries.status === 'fulfilled') fillTable($('live-countries'), countries.value, 'country', 'activeUsers', fmtNum);
      if (devices.status === 'fulfilled') fillTable($('live-devices'), devices.value, 'deviceCategory', 'activeUsers', fmtNum);
      const failed = [liveUsers, totals, pageViews, countries, devices].some(r => r.status === 'rejected');
      if (failed) {
        const firstErr = [liveUsers, totals, pageViews, countries, devices].find(r => r.status === 'rejected');
        noteError(firstErr.reason);
      } else {
        setStatus('Connected — live', true);
        $('live-updated').textContent = fmtUpdated();
      }
    } catch (e) {
      noteError(e);
    }
  }

  async function loadHistorical(range) {
    if (!GaApi.isSignedIn()) return;
    try {
      const [visitors, pageViews, topPages, sources, campaigns, countries, cities, devices, browsers, os, res, events] = await Promise.allSettled([
        GaApi.runReport(range, ['activeUsers', 'newUsers', 'sessions', 'engagedSessions', 'averageSessionDuration'], []),
        GaApi.runReport(range, ['screenPageViews'], []),
        GaApi.runReport(range, ['screenPageViews'], ['pagePath'], { orderBy: 'screenPageViews', limit: 8 }),
        GaApi.runReport(range, ['sessions'], ['sessionDefaultChannelGroup'], { orderBy: 'sessions', limit: 8 }),
        GaApi.runReport(range, ['sessions'], ['sessionCampaignName'], { orderBy: 'sessions', limit: 8 }),
        GaApi.runReport(range, ['activeUsers'], ['country'], { orderBy: 'activeUsers', limit: 8 }),
        GaApi.runReport(range, ['activeUsers'], ['city'], { orderBy: 'activeUsers', limit: 8 }),
        GaApi.runReport(range, ['activeUsers'], ['deviceCategory'], { orderBy: 'activeUsers', limit: 8 }),
        GaApi.runReport(range, ['activeUsers'], ['browser'], { orderBy: 'activeUsers', limit: 8 }),
        GaApi.runReport(range, ['activeUsers'], ['operatingSystem'], { orderBy: 'activeUsers', limit: 8 }),
        GaApi.runReport(range, ['activeUsers'], ['screenResolution'], { orderBy: 'activeUsers', limit: 8 }),
        GaApi.runReport(range, ['eventCount'], ['eventName'], {
          orderBy: 'eventCount', limit: 12,
          filter: { filter: { fieldName: 'eventName', inListFilter: { values: ['song_started', 'song_completed', 'song_skipped', 'playlist_selected', 'car_selected', 'fullscreen_used', 'wake_lock_activated', 'listening_time'] } } }
        })
      ]);
      const results = [visitors, pageViews, topPages, sources, campaigns, countries, cities, devices, browsers, os, res, events];
      const firstFail = results.find(r => r.status === 'rejected');
      if (firstFail) { noteError(firstFail.reason); return; }
      const rows = results.map(r => r.value);

      const v = rows[0][0] || {};
      $('v-total').textContent = fmtNum(v.activeUsers);
      $('v-new').textContent = fmtNum(v.newUsers);
      $('v-returning').textContent = fmtNum(Math.max(0, (v.activeUsers || 0) - (v.newUsers || 0)));
      $('v-sessions').textContent = fmtNum(v.sessions);
      $('v-engaged').textContent = fmtNum(v.engagedSessions);
      $('v-duration').textContent = fmtDur(v.averageSessionDuration);

      $('t-pageviews').textContent = fmtNum(rows[1][0] ? rows[1][0].screenPageViews : 0);
      fillTable($('t-top-pages'), rows[2], 'pagePath', 'screenPageViews', fmtNum);
      fillTable($('t-sources'), rows[3], 'sessionDefaultChannelGroup', 'sessions', fmtNum);
      fillTable($('t-campaigns'), rows[4], 'sessionCampaignName', 'sessions', fmtNum);
      fillTable($('a-countries'), rows[5], 'country', 'activeUsers', fmtNum);
      fillTable($('a-cities'), rows[6], 'city', 'activeUsers', fmtNum);
      fillTable($('a-devices'), rows[7], 'deviceCategory', 'activeUsers', fmtNum);
      fillTable($('a-browsers'), rows[8], 'browser', 'activeUsers', fmtNum);
      fillTable($('a-os'), rows[9], 'operatingSystem', 'activeUsers', fmtNum);
      fillTable($('a-res'), rows[10], 'screenResolution', 'activeUsers', fmtNum);

      const eventRows = rows[11];
      const counts = {};
      (eventRows || []).forEach(r => { counts[r.eventName] = r.eventCount; });
      document.querySelectorAll('#e-counts tr[data-event]').forEach(tr => {
        const name = tr.dataset.event;
        const num = counts[name];
        tr.querySelector('.num').textContent = num != null ? fmtNum(num) : '0';
      });
      if (counts.listening_time) {
        const tr = document.querySelector('#e-counts tr[data-event="listening_time"]');
        tr.querySelector('.num').textContent = fmtNum(counts.listening_time) + ' × 30s';
      }

      await loadCustomDimensions(range);
      setStatus('Connected', true);
    } catch (e) {
      noteError(e);
    }
  }

  async function loadCustomDimensions(range) {
    const songsEl = $('e-most-songs');
    const carsEl = $('e-most-cars');
    emptyRow(songsEl, 'No song_title custom dimension data');
    emptyRow(carsEl, 'No car_name custom dimension data');
    try {
      const [songs, cars] = await Promise.allSettled([
        GaApi.runReport(range, ['eventCount'], ['customEvent:song_title'], {
          orderBy: 'eventCount', limit: 8,
          filter: { filter: { fieldName: 'eventName', inListFilter: { values: ['song_started', 'song_completed'] } } }
        }),
        GaApi.runReport(range, ['eventCount'], ['customEvent:car_name'], {
          orderBy: 'eventCount', limit: 8,
          filter: { filter: { fieldName: 'eventName', inListFilter: { values: ['car_selected'] } } }
        })
      ]);
      if (songs.status === 'fulfilled') {
        fillTable(songsEl, songs.value, 'customEvent:song_title', 'eventCount', fmtNum);
      } else {
        emptyRow(songsEl, 'Register the song_title custom dimension in GA4 to see this');
      }
      if (cars.status === 'fulfilled') {
        fillTable(carsEl, cars.value, 'customEvent:car_name', 'eventCount', fmtNum);
      } else {
        emptyRow(carsEl, 'Register the car_name custom dimension in GA4 to see this');
      }
    } catch (e) {
      emptyRow(songsEl, 'Register the song_title custom dimension in GA4 to see this');
      emptyRow(carsEl, 'Register the car_name custom dimension in GA4 to see this');
    }
  }

  async function loadCurrent() {
    if (loading) return;
    loading = true;
    if (currentRange === 'realtime') {
      await loadRealtime();
    } else {
      await loadHistorical(currentRange);
    }
    loading = false;
  }

  function applyRange(range) {
    currentRange = range;
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.range === range);
    });
    showSections();
    stopRt();
    if (range === 'realtime') {
      $('live-section').classList.remove('hidden');
      if (GaApi.isSignedIn()) loadRealtime();
      startRt();
    } else {
      $('live-section').classList.add('hidden');
      if (GaApi.isSignedIn()) loadHistorical(range);
    }
  }

  function startRt() {
    if (rtTimer || currentRange !== 'realtime' || !GaApi.isSignedIn()) return;
    rtTimer = setInterval(() => {
      if (document.hidden || currentRange !== 'realtime' || !GaApi.isSignedIn()) return;
      loadRealtime();
    }, 30000);
  }

  function stopRt() {
    if (rtTimer) { clearInterval(rtTimer); rtTimer = null; }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopRt();
    else startRt();
  });

  async function updateConnection() {
    const configured = GaApi.isConfigured();
    $('setup-card').hidden = configured;
    if (!configured) {
      setStatus('Not connected');
      $('ga-connect-btn').hidden = true;
      hideAllSections();
      return;
    }
    if (!GaApi.isSignedIn()) {
      setStatus('Awaiting Google sign-in');
      $('ga-connect-btn').hidden = false;
      hideAllSections();
      return;
    }
    $('ga-connect-btn').hidden = true;
    showSections();
    await loadCurrent();
  }

  function unlock() {
    if (!window.AnalyticsAuth || !window.AnalyticsAuth.isAuthorized()) return;
    $('auth-screen').hidden = true;
    $('denied-screen').hidden = true;
    $('dashboard').hidden = false;
    applyRange('realtime');
    updateConnection();
  }

  function logout() {
    stopRt();
    if (window.GaApi) window.GaApi.signOut();
    if (window.AnalyticsAuth && window.AnalyticsAuth.reset) window.AnalyticsAuth.reset();
    $('dashboard').hidden = true;
    $('denied-screen').hidden = true;
    $('auth-screen').hidden = false;
    const retry = $('auth-google-btn');
    retry.disabled = false;
    const span = retry.querySelector('span');
    if (span) span.textContent = 'Sign in with Google';
    $('auth-status').textContent = 'Signed out — sign in again to continue.';
  }

  function wire() {
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.addEventListener('click', () => applyRange(b.dataset.range));
    });
    $('ga-connect-btn').addEventListener('click', async () => {
      $('ga-connect-btn').textContent = 'Signing in…';
      try {
        await GaApi.signIn();
        $('ga-connect-btn').textContent = 'Connect Google Analytics';
        await updateConnection();
      } catch (e) {
        $('ga-connect-btn').textContent = 'Connect Google Analytics';
        noteError(e);
      }
    });
    $('refresh-btn').addEventListener('click', () => {
      if (GaApi.isSignedIn()) loadCurrent();
    });
    $('logout-btn').addEventListener('click', logout);
  }

  document.addEventListener('DOMContentLoaded', wire);

  window.AnalyticsDashboard = { unlock, logout, applyRange, refreshConnection: updateConnection };
})();