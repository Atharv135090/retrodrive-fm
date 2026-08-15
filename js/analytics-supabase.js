// ==================== RETRODRIVE — SUPABASE VISITOR ANALYTICS ====================
// Single reusable Supabase REST client (anon key only) + fire-and-forget event
// tracker. Anonymous: a persistent device UUID + the current drive profile name
// are attached to every event. Inserts are batched (2.5s debounce / max 10 rows)
// and never block or throw, so playback and the UI are completely unaffected.
// Also exposes window.RDSupa.request() so analytics.html can read the same table
// with the exact same client.

(() => {
  const SUPABASE_URL = 'https://yahvtknxmmanxaepxzry.supabase.co';
  // Public "publishable" key (Project Settings -> API Keys). Safe for
  // client-side use; the secret/service key must never appear here.
  const SUPABASE_ANON_KEY = 'sb_publishable_sqzZIMpsUfoKkrnDA-FPUA_hO6VBwGc';
  const TABLE = 'visitor_events';
  const ENDPOINT = SUPABASE_URL + '/rest/v1/' + TABLE;

  const DEVICE_KEY = 'retrodrive_device_id';
  const PROFILE_KEY = 'retrodrive_profile_name';
  const SESSION_KEY = 'retrodrive_session_active';
  const FLUSH_DELAY_MS = 2500;
  const FLUSH_MAX_BATCH = 10;

  const ALLOWED_EVENTS = new Set([
    'website_open', 'page_refresh',
    'song_play', 'song_pause', 'song_change',
    'next_track', 'previous_track',
    'shuffle_toggle', 'repeat_toggle',
    'sleep_timer_start', 'sleep_timer_cancel',
    'sport_mode_on', 'sport_mode_off',
    'spotify_open', 'download_song',
    'theme_day', 'theme_night',
    'engine_on', 'engine_off'
  ]);

  const isConfigured = SUPABASE_ANON_KEY.indexOf('PASTE_') === -1 &&
    (SUPABASE_ANON_KEY.startsWith('sb_publishable_') || SUPABASE_ANON_KEY.startsWith('eyJ'));

  let queue = [];
  let flushTimer = null;
  let warned = false;
  let cachedProfileName = null;

  // ---------- device identity (persistent UUID in localStorage) ----------

  function uuidv4() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    } catch (e) { }
    try {
      if (window.crypto && window.crypto.getRandomValues) {
        const b = window.crypto.getRandomValues(new Uint8Array(16));
        b[6] = (b[6] & 0x0f) | 0x40;
        b[8] = (b[8] & 0x3f) | 0x80;
        const h = Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
        return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
      }
    } catch (e) { }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  let cachedDeviceId = null;

  function getDeviceId() {
    if (cachedDeviceId) return cachedDeviceId;
    try {
      const existing = localStorage.getItem(DEVICE_KEY);
      if (existing && /^[0-9a-fA-F-]{20,}$/.test(existing)) {
        cachedDeviceId = existing;
        return cachedDeviceId;
      }
    } catch (e) { }
    cachedDeviceId = uuidv4();
    try { localStorage.setItem(DEVICE_KEY, cachedDeviceId); } catch (e) { }
    return cachedDeviceId;
  }

  // ---------- profile name (mirrors the drive profile system) ----------

  function syncProfileName() {
    try {
      if (window.RDProfile && window.RDProfile.profiles && window.RDProfile.profiles.get) {
        const p = window.RDProfile.profiles.get();
        if (p && typeof p.name === 'string' && p.name.trim()) {
          cachedProfileName = p.name.trim();
          try { localStorage.setItem(PROFILE_KEY, cachedProfileName); } catch (e) { }
          return cachedProfileName;
        }
      }
    } catch (e) { }
    if (cachedProfileName === null) {
      try { cachedProfileName = localStorage.getItem(PROFILE_KEY) || ''; } catch (e) { cachedProfileName = ''; }
    }
    return cachedProfileName;
  }

  // ---------- environment fingerprint (computed once) ----------

  const deviceType = (() => {
    try {
      const ua = navigator.userAgent || '';
      const uad = navigator.userAgentData;
      if (uad && uad.mobile) return 'mobile';
      if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet';
      if (/Mobi|Android|iPhone|iPod/i.test(ua)) return 'mobile';
    } catch (e) { }
    return 'desktop';
  })();

  const browser = (() => {
    try {
      const ua = navigator.userAgent || '';
      if (/EdgA?\/|Edge\//i.test(ua)) return 'Edge';
      if (/OPR\/|Opera/i.test(ua)) return 'Opera';
      if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
      if (/CriOS/i.test(ua)) return 'Chrome iOS';
      if (/Chrome\/|Chromium\/|HeadlessChrome/i.test(ua)) return /Android/i.test(ua) ? 'Chrome Android' : 'Chrome';
      if (/FxiOS/i.test(ua)) return 'Firefox iOS';
      if (/Firefox\/|Fennec\/|Focus\//i.test(ua)) return 'Firefox';
      if (/MSIE|Trident/i.test(ua)) return 'Internet Explorer';
      if (/Version\/[\d.]+.*Safari|Safari\//i.test(ua)) return 'Safari';
    } catch (e) { }
    return 'Unknown';
  })();

  const page = (() => {
    try {
      let p = window.location.pathname || '/';
      if (p.length > 1 && p.slice(-11) === '/index.html') p = p.slice(0, -11);
      if (p.length > 1 && p.slice(-5) === '.html') p = p.slice(0, -5);
      if (p.length > 1 && p.slice(-1) === '/') p = p.slice(0, -1);
      return p || '/';
    } catch (e) { return '/'; }
  })();

  function currentSongTitle() {
    try {
      if (typeof playlist !== 'undefined' && playlist.length > 0 &&
          typeof currentTrackIndex === 'number' && playlist[currentTrackIndex] &&
          playlist[currentTrackIndex].title) {
        return playlist[currentTrackIndex].title;
      }
    } catch (e) { }
    return '';
  }

  // ---------- event payload ----------

  function buildMetadata(params) {
    const meta = {};
    try {
      Object.keys(params).forEach(k => {
        if (k === 'song_title') return;
        const v = params[k];
        if (v === undefined || v === null) return;
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || Array.isArray(v)) {
          meta[k] = v;
        }
      });
    } catch (e) { }
    return meta;
  }

  function track(event, params) {
    try {
      if (!ALLOWED_EVENTS.has(event)) return;
      if (!isConfigured) {
        if (!warned) {
          warned = true;
          try { console.warn('[RetroDrive] Analytics disabled: paste the Supabase anon key in js/analytics-supabase.js'); } catch (e) { }
        }
        return;
      }
      params = params || {};
      queue.push({
        device_id: getDeviceId(),
        profile_name: syncProfileName(),
        event: event,
        song_title: String(params.song_title || currentSongTitle() || '').slice(0, 300),
        device_type: deviceType,
        browser: browser,
        page: page,
        metadata: buildMetadata(params),
        created_at: new Date().toISOString()
      });
      scheduleFlush();
    } catch (e) { }
  }

  // ---------- batching (rapid events coalesce into one POST) ----------

  function scheduleFlush() {
    if (flushTimer) return;
    if (queue.length >= FLUSH_MAX_BATCH) { flush(); return; }
    flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
  }

  function flush() {
    flushTimer = null;
    if (!queue.length) return;
    const batch = queue;
    queue = [];
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(batch),
        keepalive: true
      }).catch(() => { });
    } catch (e) { }
  }

  try {
    window.addEventListener('pagehide', () => { if (queue.length) flush(); });
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && queue.length) flush();
    });
  } catch (e) { }

  // ---------- boot: website_open vs page_refresh (per same-tab session) ----------
  // Deferred to DOMContentLoaded so the drive profile name is available and
  // the very first website_open already carries it.

  let bootOpenFired = false;

  function bootOpenTracking() {
    try {
      if (bootOpenFired) return;
      if (!document.body || document.body.getAttribute('data-auto-track-open') !== 'true') return;
      bootOpenFired = true;
    } catch (e) { }
    let isRefresh = false;
    try {
      isRefresh = sessionStorage.getItem(SESSION_KEY) === '1';
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch (e) { }
    track(isRefresh ? 'page_refresh' : 'website_open', {});
  }

  function init() {
    wireProfileSync();
    bootOpenTracking();
  }

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  } catch (e) { }

  // ---------- spotify_open (any external Spotify link clicked on the site) ----------

  try {
    document.addEventListener('click', evt => {
      try {
        const t = evt.target;
        const a = t && t.closest ? t.closest('a[href*="spotify.com"], a[href*="open.spotify"]') : null;
        if (a) track('spotify_open', {});
      } catch (e) { }
    }, true);
  } catch (e) { }

  // ---------- profile change sync (updates stored name immediately) ----------

  function wireProfileSync() {
    const attach = () => {
      try {
        if (window.RDProfile && window.RDProfile.profiles && window.RDProfile.profiles.addListener) {
          window.RDProfile.profiles.addListener(syncProfileName);
          syncProfileName();
          return true;
        }
      } catch (e) { }
      return false;
    };
    if (!attach()) {
      try {
        window.addEventListener('DOMContentLoaded', attach);
      } catch (e) { }
    }
  }

  // ---------- dashboard read API (same client, same anon key) ----------

  function request(path, options) {
    const opts = options || {};
    return fetch(ENDPOINT + path, {
      method: opts.method || 'GET',
      headers: Object.assign({
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      }, opts.headers || {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(res => {
      if (!res.ok) {
        const err = new Error('Supabase request failed (HTTP ' + res.status + ')');
        err.status = res.status;
        throw err;
      }
      return res;
    });
  }

  window.RDSupa = {
    config: {
      url: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      table: TABLE,
      isConfigured: isConfigured
    },
    track: track,
    request: request
  };
})();