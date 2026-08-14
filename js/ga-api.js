/* RetroDrive FM — Google Analytics 4 Data API module
   Client-side access to the GA4 Data API v1beta via Google Identity
   Services OAuth (owner's Google account must have viewer access to
   the GA4 property). Configure GA4_PROPERTY_ID and OAUTH_CLIENT_ID
   below; until then the dashboard shows a "not connected" state. */

(() => {
  const GA4_PROPERTY_ID = '549943186';
  const OAUTH_CLIENT_ID = '300793606413-jcupjq6h3ek4t1pk33afcimskqerbshr.apps.googleusercontent.com';
  const API_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
  const API_BASE = 'https://analyticsdata.googleapis.com/v1beta';

  let tokenClient = null;
  let accessToken = null;

  function isConfigured() {
    return /^\d+$/.test(GA4_PROPERTY_ID) &&
      /^\d{10,}-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(OAUTH_CLIENT_ID);
  }

  function isSignedIn() {
    return !!accessToken;
  }

  function loadGsi() {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.accounts) return resolve();
      if (document.getElementById('ga-gsi-script')) {
        const s = document.getElementById('ga-gsi-script');
        s.addEventListener('load', resolve, { once: true });
        s.addEventListener('error', () => reject(new Error('Google Identity Services failed to load')), { once: true });
        return;
      }
      const s = document.createElement('script');
      s.id = 'ga-gsi-script';
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Google Identity Services failed to load'));
      document.head.appendChild(s);
    });
  }

  async function signIn() {
    await loadGsi();
    return new Promise((resolve, reject) => {
      tokenClient = tokenClient || google.accounts.oauth2.initTokenClient({
        client_id: OAUTH_CLIENT_ID,
        scope: API_SCOPE,
        callback: (resp) => {
          if (resp && resp.access_token) {
            accessToken = resp.access_token;
            resolve(accessToken);
          } else {
            reject(new Error('Google sign-in was cancelled'));
          }
        }
      });
      tokenClient.requestAccessToken();
    });
  }

  function signOut() {
    accessToken = null;
    if (window.google && window.google.accounts && window.google.accounts.oauth2 && tokenClient) {
      try {
        const hint = tokenClient;
        if (hint.revoke) hint.revoke(null, () => { });
      } catch (e) { }
    }
  }

  async function apiCall(endpoint, body) {
    if (!isConfigured()) throw new Error('GA4 credentials not configured');
    if (!accessToken) throw new Error('Not signed in to Google Analytics');
    const res = await fetch(API_BASE + '/properties/' + GA4_PROPERTY_ID + endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + accessToken
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      let detail = '';
      try {
        const err = await res.json();
        detail = (err.error && (err.error.message || err.error.status)) || JSON.stringify(err).slice(0, 200);
      } catch (e) { }
      throw new Error('GA4 API ' + res.status + ': ' + detail);
    }
    return res.json();
  }

  function rowsToMap(data) {
    const dims = (data.dimensionHeaders || []).map(h => h.name);
    const metrics = (data.metricHeaders || []).map(h => h.name);
    return (data.rows || []).map(r => {
      const obj = {};
      dims.forEach((d, i) => { obj[d] = r.dimensionValues[i] ? r.dimensionValues[i].value : ''; });
      metrics.forEach((m, i) => { obj[m] = Number(r.metricValues[i] ? r.metricValues[i].value : 0); });
      return obj;
    });
  }

  // Realtime: last 30 minutes of activity.
  async function realtimeReport(metrics, dimensions, extra) {
    const body = { metrics: metrics.map(m => ({ name: m })) };
    if (dimensions && dimensions.length) body.dimensions = dimensions.map(d => ({ name: d }));
    if (extra && extra.limit) body.limit = extra.limit;
    if (extra && extra.filter) body.dimensionFilter = extra.filter;
    const data = await apiCall(':runRealtimeReport', body);
    return rowsToMap(data);
  }

  // Historical report for a date range key ('today' | '7' | '30' | '90').
  async function runReport(rangeKey, metrics, dimensions, opts) {
    const ranges = {
      today: { startDate: 'today', endDate: 'today' },
      '7': { startDate: '7daysAgo', endDate: 'today' },
      '30': { startDate: '30daysAgo', endDate: 'today' },
      '90': { startDate: '90daysAgo', endDate: 'today' }
    };
    const body = {
      metrics: metrics.map(m => ({ name: m })),
      dateRanges: [ranges[rangeKey] || ranges['7']]
    };
    if (dimensions && dimensions.length) body.dimensions = dimensions.map(d => ({ name: d }));
    if (opts && opts.orderBy) body.orderBys = [typeof opts.orderBy === 'string' ? { metric: { metricName: opts.orderBy }, desc: true } : opts.orderBy];
    if (opts && opts.limit) body.limit = opts.limit;
    const data = await apiCall(':runReport', body);
    return rowsToMap(data);
  }

  window.GaApi = {
    isConfigured,
    isSignedIn,
    signIn,
    signOut,
    realtimeReport,
    runReport,
    config: { GA4_PROPERTY_ID, OAUTH_CLIENT_ID }
  };
})();