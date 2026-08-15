/* RetroDrive FM — Supabase analytics dashboard controller
   Reads the visitor_events table directly through the shared Supabase
   client (js/analytics-supabase.js, anon key only). Overview KPIs, recent
   visitors, most active users, song analytics, a live activity feed
   (auto-refresh 15s), and filterable complete history. Every load fails
   gracefully to a friendly status message. */

(() => {
  let refreshTimer = null;
  let historyOffset = 0;
  const HISTORY_PAGE = 200;

  const ALL_EVENTS = [
    'website_open', 'page_refresh',
    'song_play', 'song_pause', 'song_change',
    'next_track', 'previous_track',
    'shuffle_toggle', 'repeat_toggle',
    'sleep_timer_start', 'sleep_timer_cancel',
    'sport_mode_on', 'sport_mode_off',
    'spotify_open', 'download_song',
    'theme_day', 'theme_night',
    'engine_on', 'engine_off'
  ];

  const EVENT_LABELS = {
    website_open: 'Website Open', page_refresh: 'Page Refresh',
    song_play: 'Song Play', song_pause: 'Song Pause', song_change: 'Song Change',
    next_track: 'Next Track', previous_track: 'Previous Track',
    shuffle_toggle: 'Shuffle Toggle', repeat_toggle: 'Repeat Toggle',
    sleep_timer_start: 'Sleep Timer Start', sleep_timer_cancel: 'Sleep Timer Cancel',
    sport_mode_on: 'Sport Mode On', sport_mode_off: 'Sport Mode Off',
    spotify_open: 'Spotify Open', download_song: 'Download Song',
    theme_day: 'Theme Day', theme_night: 'Theme Night',
    engine_on: 'Engine On', engine_off: 'Engine Off'
  };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fmtNum(n) {
    return (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-US');
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const diff = Date.now() - d.getTime();
    if (diff >= 0) {
      const m = Math.floor(diff / 60000);
      if (m < 1) return 'just now';
      if (m < 60) return m + 'm ago';
      const h = Math.floor(m / 60);
      if (h < 24) return h + 'h ago';
    }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function fmtFull(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function setStatus(text, ok) {
    const c = $('conn-status');
    if (!c) return;
    c.textContent = text;
    c.className = 'status-chip ' + (ok ? 'status-on' : 'status-off');
  }

  function emptyRow(msg) {
    return '<tr><td colspan="10" class="empty-note">' + escapeHtml(msg) + '</td></tr>';
  }

  function eventBadge(ev) {
    return '<span class="ev-badge">' + escapeHtml(EVENT_LABELS[ev] || ev) + '</span>';
  }

  // ---------- Supabase REST helpers (via the shared client) ----------

  async function fetchRows(path) {
    const res = await window.RDSupa.request(path);
    return res.json();
  }

  async function fetchCount(path) {
    const sep = path.indexOf('?') >= 0 ? '&' : '?';
    const res = await window.RDSupa.request(path + sep + 'select=count', { headers: { 'Prefer': 'count=exact' } });
    const body = await res.json();
    if (Array.isArray(body) && body[0] && typeof body[0].count === 'number') return body[0].count;
    const cr = res.headers.get('content-range') || '';
    const m = /\/\s*(\d+)\s*$/.exec(cr);
    return m ? Number(m[1]) : (Array.isArray(body) ? body.length : 0);
  }

  // ---------- overview cards ----------

  async function loadOverview() {
    const jobs = await Promise.allSettled([
      fetchCount('?event=eq.website_open'),
      fetchRows('?select=device_id&event=eq.website_open&limit=10000')
        .then(rows => new Set(rows.map(r => r.device_id).filter(Boolean)).size),
      fetchCount('?event=eq.song_play'),
      fetchCount('?event=eq.sport_mode_on'),
      fetchCount('?event=eq.spotify_open'),
      fetchCount('?event=eq.download_song')
    ]);
    const vals = [
      jobs[0].status === 'fulfilled' ? jobs[0].value : null,
      jobs[1].status === 'fulfilled' ? jobs[1].value : null,
      jobs[2].status === 'fulfilled' ? jobs[2].value : null,
      jobs[3].status === 'fulfilled' ? jobs[3].value : null,
      jobs[4].status === 'fulfilled' ? jobs[4].value : null,
      jobs[5].status === 'fulfilled' ? jobs[5].value : null
    ];
    ['kpi-opens', 'kpi-devices', 'kpi-plays', 'kpi-sport', 'kpi-spotify', 'kpi-downloads'].forEach((id, i) => {
      $(id).textContent = fmtNum(vals[i]);
    });
    return jobs.some(j => j.status === 'fulfilled');
  }

  // ---------- recent visitors (newest event per device) ----------

  async function loadRecentVisitors() {
    const rows = await fetchRows('?select=device_id,profile_name,device_type,browser,event,created_at&order=created_at.desc&limit=500');
    const byDev = new Map();
    rows.forEach(r => {
      if (!byDev.has(r.device_id)) byDev.set(r.device_id, r);
    });
    const list = Array.from(byDev.values()).slice(0, 10);
    $('recent-visitors').innerHTML = list.length
      ? list.map(r =>
        '<tr>' +
        '<td class="td-name">' + escapeHtml(r.profile_name || '—') + '</td>' +
        '<td>' + escapeHtml(r.device_type || '—') + '</td>' +
        '<td>' + escapeHtml(r.browser || '—') + '</td>' +
        '<td class="td-dim">' + escapeHtml(fmtTime(r.created_at)) + '</td>' +
        '<td>' + eventBadge(r.event) + '</td>' +
        '</tr>').join('')
      : emptyRow('No visitors recorded yet');
  }

  // ---------- most active users (grouped by device) ----------

  async function loadActiveUsers() {
    const rows = await fetchRows('?select=device_id,profile_name,event,created_at&order=created_at.desc&limit=2000');
    const map = new Map();
    rows.forEach(r => {
      let u = map.get(r.device_id);
      if (!u) {
        u = { name: r.profile_name || '', visits: 0, songs: 0, sport: 0, lastSeen: r.created_at };
        map.set(r.device_id, u);
      }
      if (r.profile_name) u.name = r.profile_name;
      if (r.event === 'website_open') u.visits++;
      else if (r.event === 'song_play') u.songs++;
      else if (r.event === 'sport_mode_on') u.sport++;
      if ((r.created_at || '') > (u.lastSeen || '')) u.lastSeen = r.created_at;
    });
    const list = Array.from(map.values())
      .sort((a, b) => b.visits - a.visits || b.songs - a.songs)
      .slice(0, 10);
    const maxVisits = Math.max(1, list[0] ? list[0].visits : 1);
    $('active-users').innerHTML = list.length
      ? list.map(u =>
        '<tr>' +
        '<td class="td-name">' + escapeHtml(u.name || 'Anonymous') + '</td>' +
        '<td class="num">' + fmtNum(u.visits) + '<i class="tbar" style="width:' + Math.max(4, Math.round((u.visits / maxVisits) * 100)) + '%"></i></td>' +
        '<td class="num">' + fmtNum(u.songs) + '</td>' +
        '<td class="num">' + fmtNum(u.sport) + '</td>' +
        '<td class="td-dim">' + escapeHtml(fmtTime(u.lastSeen)) + '</td>' +
        '</tr>').join('')
      : emptyRow('No user activity yet');
  }

  // ---------- song analytics ----------

  async function loadSongs() {
    const rows = await fetchRows('?select=song_title,created_at&event=eq.song_play&order=created_at.desc&limit=2000');
    const counts = new Map();
    const recent = new Map();
    rows.forEach(r => {
      const title = r.song_title && String(r.song_title).trim() ? String(r.song_title).trim() : '(untitled)';
      counts.set(title, (counts.get(title) || 0) + 1);
      if (!recent.has(title)) recent.set(title, r.created_at);
    });
    const byCount = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const most = byCount.slice(0, 10);
    const top10 = byCount.slice(0, 10);
    const recentList = Array.from(recent.entries()).slice(0, 10);
    const maxCount = Math.max(1, most[0] ? most[0][1] : 1);

    $('songs-most').innerHTML = most.length
      ? most.map(([title, n]) =>
        '<tr><td class="dim">' + escapeHtml(title) + '</td><td class="num"><i class="tbar" style="width:' + Math.max(4, Math.round((n / maxCount) * 100)) + '%"></i>' + fmtNum(n) + '</td></tr>').join('')
      : emptyRow('No song plays yet');

    $('songs-top10').innerHTML = top10.length
      ? top10.map(([title, n], i) =>
        '<tr><td class="dim"><span class="rank">' + (i + 1) + '</span>' + escapeHtml(title) + '</td><td class="num">' + fmtNum(n) + '</td></tr>').join('')
      : emptyRow('No song plays yet');

    $('songs-recent').innerHTML = recentList.length
      ? recentList.map(([title, ts]) =>
        '<tr><td class="dim">' + escapeHtml(title) + '</td><td class="num">' + escapeHtml(fmtTime(ts)) + '</td></tr>').join('')
      : emptyRow('No song plays yet');
  }

  // ---------- live activity feed ----------

  async function loadLive() {
    const rows = await fetchRows('?select=*&order=created_at.desc&limit=20');
    const feed = $('live-feed');
    feed.innerHTML = rows.length
      ? rows.map(r =>
        '<li class="feed-item">' +
        eventBadge(r.event) +
        '<span class="feed-name">' + escapeHtml(r.profile_name || 'Anonymous') + '</span>' +
        '<span class="feed-meta">' + escapeHtml(r.device_type || '—') + ' · ' + escapeHtml(r.browser || '—') + '</span>' +
        (r.song_title ? '<span class="feed-song">' + escapeHtml(r.song_title) + '</span>' : '') +
        '<span class="feed-page">' + escapeHtml(r.page || '') + '</span>' +
        '<span class="feed-time" title="' + escapeHtml(fmtFull(r.created_at)) + '">' + escapeHtml(fmtTime(r.created_at)) + '</span>' +
        '</li>').join('')
      : '<li class="feed-empty">No activity yet — open the site to start tracking</li>';
  }

  // ---------- complete history (filterable, paginated) ----------

  function historyQuery(offset) {
    let q = '?order=created_at.desc&limit=' + HISTORY_PAGE + '&offset=' + offset;
    const ev = $('filter-event').value;
    if (ev) q += '&event=eq.' + encodeURIComponent(ev);
    const pr = $('filter-profile').value;
    if (pr) q += '&profile_name=eq.' + encodeURIComponent(pr);
    const dt = $('filter-device').value;
    if (dt) q += '&device_type=eq.' + encodeURIComponent(dt);
    const from = $('filter-from').value;
    const to = $('filter-to').value;
    if (from) q += '&created_at=gte.' + encodeURIComponent(from + 'T00:00:00.000Z');
    if (to) q += '&created_at=lte.' + encodeURIComponent(to + 'T23:59:59.999Z');
    return q;
  }

  function historyRowHtml(r) {
    return '<tr>' +
      '<td class="td-dim" title="' + escapeHtml(fmtFull(r.created_at)) + '">' + escapeHtml(fmtTime(r.created_at)) + '</td>' +
      '<td>' + eventBadge(r.event) + '</td>' +
      '<td class="td-name">' + escapeHtml(r.profile_name || '—') + '</td>' +
      '<td>' + escapeHtml(r.device_type || '—') + '</td>' +
      '<td>' + escapeHtml(r.browser || '—') + '</td>' +
      '<td class="td-song" title="' + escapeHtml(r.song_title || '') + '">' + escapeHtml(r.song_title || '—') + '</td>' +
      '<td class="td-page">' + escapeHtml(r.page || '—') + '</td>' +
      '</tr>';
  }

  async function loadHistory(append) {
    const tbody = $('history-rows');
    if (!append) historyOffset = 0;
    const rows = await fetchRows(historyQuery(historyOffset));
    if (!append) tbody.innerHTML = '';
    if (!rows.length) {
      if (!append) tbody.innerHTML = emptyRow('No events match the current filters');
      $('history-more').hidden = true;
      return;
    }
    tbody.insertAdjacentHTML('beforeend', rows.map(historyRowHtml).join(''));
    historyOffset += rows.length;
    $('history-more').hidden = rows.length < HISTORY_PAGE;
  }

  async function populateProfileFilter() {
    try {
      const rows = await fetchRows('?select=profile_name&order=created_at.desc&limit=2000');
      const names = [];
      const seen = new Set();
      rows.forEach(r => {
        const n = (r.profile_name || '').trim();
        if (n && !seen.has(n)) { seen.add(n); names.push(n); }
      });
      $('filter-profile').innerHTML = '<option value="">All profiles</option>' +
        names.map(n => '<option value="' + escapeHtml(n) + '">' + escapeHtml(n) + '</option>').join('');
    } catch (e) { }
  }

  // ---------- orchestration ----------

  async function loadAll() {
    if (!window.RDSupa || !window.RDSupa.config.isConfigured) {
      setStatus('Not configured', false);
      $('setup-card').hidden = false;
      return;
    }
    $('setup-card').hidden = true;
    try {
      const [overview, recent, users, songs, live] = await Promise.allSettled([
        loadOverview(),
        loadRecentVisitors(),
        loadActiveUsers(),
        loadSongs(),
        loadLive()
      ]);
      const ok = overview.status === 'fulfilled' ||
        recent.status === 'fulfilled' ||
        live.status === 'fulfilled';
      if (ok) {
        setStatus('Connected — live', true);
      } else {
        const err = [overview, recent, users, songs, live].find(r => r.status === 'rejected');
        setStatus('Error: ' + (err && err.reason && err.reason.message ? err.reason.message.slice(0, 48) : 'request failed'), false);
      }
    } catch (e) {
      setStatus('Error: ' + (e && e.message ? e.message.slice(0, 48) : 'request failed'), false);
    }
  }

  function startAutoRefresh() {
    if (refreshTimer) return;
    refreshTimer = setInterval(() => {
      if (document.hidden) return;
      loadLive();
      loadOverview();
      loadRecentVisitors();
      loadActiveUsers();
      loadSongs();
    }, 15000);
  }

  function stopAutoRefresh() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  }

  function wire() {
    $('filter-event').innerHTML = '<option value="">All events</option>' +
      ALL_EVENTS.map(ev => '<option value="' + ev + '">' + escapeHtml(EVENT_LABELS[ev] || ev) + '</option>').join('');

    $('refresh-btn').addEventListener('click', () => { loadAll(); });
    $('filter-apply').addEventListener('click', () => { loadHistory(false); });
    $('filter-reset').addEventListener('click', () => {
      $('filter-event').value = '';
      $('filter-profile').value = '';
      $('filter-device').value = '';
      $('filter-from').value = '';
      $('filter-to').value = '';
      loadHistory(false);
    });
    $('history-more').addEventListener('click', () => { loadHistory(true); });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopAutoRefresh();
      else startAutoRefresh();
    });

    loadAll();
    populateProfileFilter();
    startAutoRefresh();
  }

  document.addEventListener('DOMContentLoaded', wire);
})();