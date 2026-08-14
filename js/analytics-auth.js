/* RetroDrive FM — analytics auth (owner-only, client-side gate)
   Password is stored only as a SHA-256 hash so it is never visible
   in the UI or page source. Access is kept in sessionStorage (browser
   session only, never permanent), and the marker is cleared on every
   reload so a refresh always asks for the password again. */

(() => {
  const PASSWORD_HASH = 'aa5d6dd211177d969ad0f17066e1a5d3e6ec1ffc4181403a32ece56cb79816ff';
  const STORAGE_KEY = 'rd_analytics_unlocked';

  function clearUnlockOnReload() {
    let reloading = false;
    try {
      const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      reloading = nav ? nav.type === 'reload' : false;
      if (!reloading && performance.navigation) reloading = performance.navigation.type === 1;
    } catch (e) { }
    if (reloading) {
      try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { }
    }
  }

  function isUnlocked() {
    try { return sessionStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { return false; }
  }

  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function tryUnlock(password) {
    if (isUnlocked()) return true;
    if (!password) return false;
    const hash = await sha256(password);
    if (hash === PASSWORD_HASH) {
      try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch (e) { }
      return true;
    }
    return false;
  }

  function lock() {

    try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { }
  }

  function wireLoginForm() {
    const form = document.getElementById('login-form');
    const input = document.getElementById('password');
    const error = document.getElementById('login-error');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      error.hidden = true;
      if (!window.crypto || !window.crypto.subtle) {
        error.textContent = 'Secure context unavailable.';
        error.hidden = false;
        return;
      }
      const ok = await tryUnlock(input.value);
      if (ok) {
        input.value = '';
        window.AnalyticsDashboard.unlock();
      } else {
        input.value = '';
        error.textContent = 'Incorrect password.';
        error.hidden = false;
        input.focus();
      }
    });

    input.addEventListener('input', () => {
      error.hidden = true;
    });

    input.focus();
  }

  clearUnlockOnReload();
  document.addEventListener('DOMContentLoaded', wireLoginForm);

  window.AnalyticsAuth = { tryUnlock, isUnlocked, lock };
})();