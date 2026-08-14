// ==================== SCREEN WAKE LOCK ====================
      // Keeps the screen awake while music is playing on devices that
      // support the Wake Lock API (Android, Windows, macOS, tablets, etc).
      // Re-acquires the lock automatically when the browser drops it while
      // music is still playing, and releases it on pause/stop/tab close.
      // Fails silently when unsupported so playback is never affected.
      (() => {
        const supported = 'wakeLock' in navigator && typeof navigator.wakeLock.request === 'function';
        let sentinel = null;
        let wantLock = false;

        async function acquireWakeLock() {
          if (!supported || !wantLock || sentinel) return;
          try {
            const s = await navigator.wakeLock.request('screen');
            if (!wantLock) {
              try { s.release(); } catch (e) { }
              return;
            }
            sentinel = s;
            window.RDTrack('wake_lock_activated', { state: document.visibilityState });
            s.addEventListener('release', () => {
              sentinel = null;
              if (wantLock) acquireWakeLock();
            });
          } catch (e) {
            // Unsupported, permission denied, or hidden tab: playback
            // continues unaffected.
          }
        }

        function releaseWakeLock() {
          wantLock = false;
          if (sentinel) {
            const s = sentinel;
            sentinel = null;
            try { s.release(); } catch (e) { }
          }
        }

        // Single integration point with the player module: every play,
        // pause, stop, and track-change path mirrors the real playback
        // state through updatePlayPauseUI(), so this one hook keeps the
        // wake lock in sync without touching any playback logic.
        function syncWakeLock(playing) {
          wantLock = !!playing;
          if (wantLock) acquireWakeLock();
          else releaseWakeLock();
        }

        window.WakeLockSync = syncWakeLock;

        // Browsers auto-release the lock when the tab is hidden; re-acquire
        // on return while music is still playing.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') acquireWakeLock();
        });

        // Fullscreen transitions can drop the lock on some browsers; keep
        // the screen awake in both normal and fullscreen mode.
        ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(evtName => {
          document.addEventListener(evtName, () => {
            if (wantLock) acquireWakeLock();
          });
        });

        // Release when the page or tab is closed.
        window.addEventListener('pagehide', releaseWakeLock);
        window.addEventListener('beforeunload', releaseWakeLock);
      })();