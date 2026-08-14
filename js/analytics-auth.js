/* RetroDrive FM — owner gate via Google OAuth (no passwords)
   A single Google account-chooser/consent popup returns an access token
   for openid + email + GA4 analytics.readonly. The token is exchanged for
   the account email via the userinfo endpoint; only the single authorized
   owner email may enter. The popup only opens from a real click on the
   "Sign in with Google" button (browsers silently block gesture-less
   popups), and every step either completes, redirects, or falls back to a
   friendly status on the same button — it never hangs. */

(() => {
  const AUTHORIZED_EMAIL = 'atharvshinde13062005@gmail.com';
  const CLIENT_ID = '300793606413-jcupjq6h3ek4t1pk33afcimskqerbshr.apps.googleusercontent.com';
  const SCOPES = 'openid email https://www.googleapis.com/auth/analytics.readonly';
  const TOKEN_KEY = 'rd_ga_token';
  const USERINFO_TIMEOUT = 8000;

  let authorized = false;
  let busy = false;

  function $(id) { return document.getElementById(id); }

  function showGate(name) {
    ['auth-screen', 'denied-screen'].forEach(id => { $(id).hidden = true; });
    if (name) $(name).hidden = false;
  }

  function setBusy(msg) {
    $('auth-status').textContent = msg;
    $('auth-google-btn').disabled = true;
  }

  function setIdle(msg) {
    $('auth-status').textContent = msg;
    const btn = $('auth-google-btn');
    btn.disabled = false;
    const span = btn.querySelector('span');
    if (span) span.textContent = 'Sign in with Google';
  }

  // Restores a token left by a completed sign-in (page was redirected to
  // analytics.html), so the dashboard opens without showing the gate.
  function restoreToken() {
    try {
      const raw = sessionStorage.getItem(TOKEN_KEY);
      if (!raw) return false;
      const rec = JSON.parse(raw);
      if (!rec || !rec.t || (rec.exp && rec.exp < Date.now())) {
        sessionStorage.removeItem(TOKEN_KEY);
        return false;
      }
      authorized = true;
      if (window.GaApi) window.GaApi.setAccessToken(rec.t);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Loads the Google Identity Services client and waits until the token
  // API is actually ready (the script can load before google.accounts is
  // initialised, and it can also fail to reach Google entirely).
  function loadGsi() {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) return resolve();
      let s = document.getElementById('ga-gsi-script');
      if (!s) {
        s = document.createElement('script');
        s.id = 'ga-gsi-script';
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        document.head.appendChild(s);
      }
      s.addEventListener('load', () => {
        const t0 = Date.now();
        (function poll() {
          if (window.google && window.google.accounts && window.google.accounts.oauth2) return resolve();
          if (Date.now() - t0 > 5000) return reject(new Error('Google Identity Services timed out'));
          setTimeout(poll, 100);
        })();
      }, { once: true });
      s.addEventListener('error', () => reject(new Error('Google Identity Services failed to load')), { once: true });
    });
  }

  function onToken(resp) {
    if (!resp || resp.error) {
      const err = resp ? resp.error : 'no response';
      console.warn('[Analytics] token flow interrupted: ' + err);
      setIdle('Google sign-in was interrupted. Click the button to try again.');
      return;
    }
    if (!resp.access_token) {
      setIdle('Google sign-in did not return an access token. Try again.');
      return;
    }
    verifyEmail(resp.access_token, resp.expires_in);
  }

  async function verifyEmail(token, expiresIn) {
    setBusy('Verifying your account…');
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), USERINFO_TIMEOUT);
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: 'Bearer ' + token },
        signal: ctl.signal
      });
      if (!res.ok) throw new Error('userinfo HTTP ' + res.status);
      const info = await res.json();
      const email = String(info.email || '').toLowerCase();
      if (email === AUTHORIZED_EMAIL) {
        authorized = true;
        try {
          sessionStorage.setItem(TOKEN_KEY, JSON.stringify({
            t: token,
            exp: Date.now() + (Number(expiresIn) || 3600) * 1000
          }));
        } catch (e) { }
        if (window.GaApi) window.GaApi.setAccessToken(token);
        location.href = 'analytics.html';
      } else {
        authorized = false;
        $('denied-detail').textContent = email ? 'Signed in as ' + email + ' — this account is not authorized.' : 'The selected account could not be verified.';
        showGate('denied-screen');
      }
    } catch (e) {
      console.warn('[Analytics] email verification failed', e);
      setIdle('Could not verify the Google account. Click the button to try again.');
    } finally {
      clearTimeout(t);
    }
  }

  // Runs from the button click — a real user gesture, so the popup is
  // never blocked. A fresh token client is created per attempt so a
  // previous interrupted flow can never leave it dead.
  function start() {
    if (busy) return;
    busy = true;
    setBusy('Loading Google sign-in…');
    loadGsi().then(() => {
      setBusy('Preparing secure sign-in…');
      try {
        const tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: onToken
        });
        tokenClient.requestAccessToken({ prompt: 'select_account' });
      } catch (e) {
        console.warn('[Analytics] token client failed', e);
        setIdle('Google sign-in could not start. Click the button to try again.');
      }
    }).catch(() => {
      setIdle('Google sign-in could not load. Check your connection and try again.');
    }).finally(() => {
      busy = false;
    });
  }

  function wire() {
    $('auth-google-btn').addEventListener('click', start);
    $('auth-return-btn').addEventListener('click', () => { location.href = 'index.html'; });
    $('denied-return-btn').addEventListener('click', () => { location.href = 'index.html'; });
    $('denied-switch-btn').addEventListener('click', () => { showGate('auth-screen'); setIdle('Sign in with a different Google account to continue.'); });
    if (restoreToken()) {
      if (window.AnalyticsDashboard) window.AnalyticsDashboard.unlock();
      return;
    }
    setIdle('Sign in with your Google account to continue.');
  }

  function reset() {
    authorized = false;
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { }
  }

  document.addEventListener('DOMContentLoaded', wire);

  window.AnalyticsAuth = {
    isAuthorized: () => authorized,
    launch: start,
    reset: reset,
    AUTHORIZED_EMAIL
  };
})();