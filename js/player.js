      // ==================== AUDIO ====================
      // The ONLY place that touches audio.src and the visible track metadata.
      // Every music control (next, previous, ended, playlist click) goes
      // through this single load function so the UI and the <audio> element
      // can never drift out of sync.
      function loadTrack(index) {
        if (playlist.length === 0) return;
        currentTrackIndex = ((index % playlist.length) + playlist.length) % playlist.length;
        const t = playlist[currentTrackIndex];
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        audio.src = normalizeMediaUrl(t.src);
        audio.load();
        $('now-title').textContent = t.title;
        $('now-artist').textContent = t.artist + (t.album ? ' â€¢ ' + t.album : '');
        const cassetteTrackLabel = $('cassette-track-lbl');
        if (cassetteTrackLabel) cassetteTrackLabel.textContent = t.title;
        $('album-cover-img').src = t.cover;
        $('seek').value = 0;
        $('seek').style.setProperty('--seek-progress', '0%');
        $('t-cur').textContent = '00:00';
        if (t.duration) {
          $('t-dur').textContent = formatDuration(t.duration);
        } else {
          $('t-dur').textContent = '00:00';
        }
        if (typeof highlightActive === 'function') highlightActive();
        if (appState.playlistOpen) renderPlaylistPopup();
        if ($('pl-tray').classList.contains('open')) renderPlaylistTray();
        try { localStorage.setItem('retrodrive_song', String(currentTrackIndex)); } catch (e) { }
      }

      function isTrackInvalid(t) {
        return !t || !t.src || invalidTrackUrls.has(normalizeMediaUrl(t.src));
      }

      // Probes a URL with a tiny range GET. Supabase public storage answers
      // with 206/200 + audio/mpeg; anything else (404 page, HTML error) is
      // rejected before the <audio> element ever sees it.
      async function probeMediaUrl(url) {
        try {
          const res = await fetch(url, {
            method: 'GET',
            headers: { Range: 'bytes=0-1023' },
            cache: 'no-store'
          });
          if (!res.ok) return false;
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          if (!ct) return true;
          return ct.includes('audio') || ct.includes('mpeg') || ct.includes('octet-stream');
        } catch (e) {
          try {
            const res = await fetch(url, { method: 'GET', cache: 'no-store' });
            if (!res.ok) return false;
            const ct = (res.headers.get('content-type') || '').toLowerCase();
            if (!ct) return true;
            return ct.includes('audio') || ct.includes('mpeg') || ct.includes('octet-stream');
          } catch (e2) {
            return false;
          }
        }
      }

      async function verifyPlayableTrack(url) {
        if (!url) return false;
        const cached = urlHealth.get(url);
        if (cached && (Date.now() - cached.ts) < URL_HEALTH_TTL_MS) return cached.ok;
        const ok = await probeMediaUrl(url);
        urlHealth.set(url, { ok, ts: Date.now() });
        return ok;
      }

      // Scans all catalog URLs up front (in small batches to stay polite to
      // the origin) and keeps a playlist containing only working tracks.
      // Lazily sweeps the playlist in idle time and marks unreachable tracks
      // so they are skipped automatically (the current track is verified
      // eagerly by doPlay before it ever reaches the <audio> element).
      function sweepTrackValidity() {
        if (!playlist.length) return;
        let i = 0;
        const step = () => {
          const until = performance.now() + 40;
          do {
            if (i >= playlist.length) return;
            const t = playlist[i];
            if (!isTrackInvalid(t)) {
              verifyPlayableTrack(normalizeMediaUrl(t.src)).then(ok => {
                if (!ok) {
                  warnTrackBroken(t);
                  invalidTrackUrls.add(normalizeMediaUrl(t.src));
                  purgeInvalidFromQueue();
                }
              });
            }
            i++;
          } while (performance.now() < until && i < playlist.length);
          if (i < playlist.length) {
            if (window.requestIdleCallback) {
              window.requestIdleCallback(() => step(), { timeout: 800 });
            } else {
              setTimeout(step, 150);
            }
          }
        };
        step();
      }

      // Logs a single warning per failed track (suppressed for repeats) and
      // removes it from the session so it is never retried or queued again.
      function warnTrackBroken(t, reason) {
        if (!t || invalidTrackUrls.has(normalizeMediaUrl(t.src))) return;
        console.warn('[RetroDrive] Skipping unavailable track "' + (t.title || 'Unknown') + '"' + (reason ? ' (' + reason + ')' : ''));
      }

      function markTrackBroken(t, reason) {
        if (!isTrackInvalid(t)) {
          warnTrackBroken(t, reason);
          invalidTrackUrls.add(normalizeMediaUrl(t.src));
        }
        purgeInvalidFromQueue();
        nextTrack();
      }

      function purgeInvalidFromQueue() {
        if (!playbackQueue.length) return;
        playbackQueue = playbackQueue.filter(i => i >= 0 && i < playlist.length && !isTrackInvalid(playlist[i]));
        if (queuePos >= playbackQueue.length) queuePos = Math.max(0, playbackQueue.length - 1);
      }

      function haltPlayback() {
        audio.pause();
        playing = false;
        playbackQueue = [];
        queuePos = 0;
        syncUI();
        const titleEl = $('now-title');
        const artistEl = $('now-artist');
        if (titleEl) titleEl.textContent = 'No playable tracks';
        if (artistEl) artistEl.textContent = 'All songs are currently unavailable';
      }

      function buildPlaybackQueue(startIndex = null) {
        if (!playlist.length) {
          playbackQueue = [];
          queuePos = 0;
          return;
        }
        let valid = playlist.map((_, i) => i).filter(i => !isTrackInvalid(playlist[i]));
        if (!valid.length) {
          playbackQueue = [];
          queuePos = 0;
          return;
        }
        for (let i = valid.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [valid[i], valid[j]] = [valid[j], valid[i]];
        }
        if (startIndex !== null && valid.includes(startIndex)) {
          valid = valid.filter(i => i !== startIndex);
          valid.unshift(startIndex);
        }
        playbackQueue = valid;
        queuePos = 0;
      }

      function syncQueueToTrack(trackIndex) {
        if (isTrackInvalid(playlist[trackIndex])) return;
        if (!playbackQueue.length) {
          buildPlaybackQueue(trackIndex);
          return;
        }
        const found = playbackQueue.indexOf(trackIndex);
        if (found >= 0) {
          queuePos = found;
        } else {
          buildPlaybackQueue(trackIndex);
        }
      }

      function reshuffleQueueFromCurrent() {
        if (!playlist.length) return;
        buildPlaybackQueue(currentTrackIndex);
      }


      async function doPlay() {
        if (playlist.length === 0) return;
        const token = ++playToken;
        wantPlay = true;
        try {
          if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
          const t = playlist[currentTrackIndex];
          const url = normalizeMediaUrl(t.src);

          // 1) Verify the URL is reachable BEFORE touching the audio element.
          if (!url || !(await verifyPlayableTrack(url))) {
            if (token === playToken) markTrackBroken(t, 'unreachable');
            return;
          }

          // A newer play request (or a pause) happened while the probe was
          // in flight â€” stop here so we never resurrect a stale track.
          if (token !== playToken || !wantPlay) return;

          // 2) Single play attempt â€” never retry a broken track.
          try {
            await audio.play();
            if (token === playToken && wantPlay) {
              playing = true;
              updatePlayPauseUI(true);
            }
          } catch (error) {
            const isAbort = error && (error.name === 'AbortError' || error.name === 'NotAllowedError');
            // Only act when the failure belongs to the track we started: a
            // previous load's error may surface after loadTrack() moved on.
            const movedOn = token !== playToken || playlist[currentTrackIndex] !== t || normalizeMediaUrl((audio.currentSrc) || '') !== url;
            if (!isAbort && !movedOn) {
              markTrackBroken(t, (error && error.name) === 'NotSupportedError' ? 'unsupported media (load failed)' : 'playback failed');
              return;
            }
            playing = false;
            updatePlayPauseUI(false);
          }
        } finally {
          // Nothing to unlock: the token guarantees at most the latest
          // request performs any side effect.
        }
      }
      function doPause() { wantPlay = false; playToken++; audio.pause(); playing = false; updatePlayPauseUI(false); }
      function togglePP() { playing ? doPause() : doPlay(); }

      function nextTrack(fromAutoEnd) {
        if (playlist.length === 0) return;
        const t = playlist[currentTrackIndex];
        if (!fromAutoEnd && t) window.RDTrack('song_skipped', { song_title: t.title, song_artist: t.artist, playlist: t.playlist || 'Hindi Old' });
        if (!playbackQueue.length) buildPlaybackQueue(currentTrackIndex);
        // Never advance to a track that has been marked invalid.
        purgeInvalidFromQueue();
        if (playbackQueue.length === 0) { haltPlayback(); return; }
        queuePos += 1;
        if (queuePos >= playbackQueue.length) {
          const lastTrack = currentTrackIndex;
          buildPlaybackQueue();
          purgeInvalidFromQueue();
          if (playbackQueue.length === 0) { haltPlayback(); return; }
          if (playbackQueue.length > 1 && playbackQueue[0] === lastTrack) {
            [playbackQueue[0], playbackQueue[1]] = [playbackQueue[1], playbackQueue[0]];
          }
          queuePos = 0;
        }
        loadTrack(playbackQueue[queuePos]);
        doPlay();
      }
      function prevTrack() {
        if (playlist.length === 0) return;
        const t = playlist[currentTrackIndex];
        if (t) window.RDTrack('song_skipped', { song_title: t.title, song_artist: t.artist, playlist: t.playlist || 'Hindi Old' });
        if (!playbackQueue.length) buildPlaybackQueue(currentTrackIndex);
        queuePos = Math.max(0, queuePos - 1);
        loadTrack(playbackQueue[queuePos]);
        doPlay();
      }

      function toggleShuf() {
        shuffled = true;
        reshuffleQueueFromCurrent();
        const btn = $('btn-shuf2');
        if (btn) {
          btn.classList.add('active-btn');
          window.setTimeout(() => btn.classList.remove('active-btn'), 650);
        }
      }

      // Repeat Song: repeat only the current track. While enabled the track
      // auto-replays on 'ended' (handled in the audio listener) and the
      // keyboard/UI toggles stay perfectly in sync with the indicator chip.
      function setRepeatSong(force) {
        repMode = (force != null ? !!force : repMode !== 2) ? 2 : 0;
        const fallback = { classList: { add: () => { }, remove: () => { }, toggle: () => { } } };
        const b = $('btn-rep') || fallback;
        const b2 = $('btn-queue') || fallback;
        const on = repMode === 2;
        b.classList.toggle('active-opt', on);
        b2.classList.toggle('active-btn', on);
        const chip = $('repeat-indicator');
        if (chip) chip.hidden = !on;
        const state = $('pm-state-repeat');
        if (state) {
          state.textContent = on ? 'On' : 'Off';
          state.classList.toggle('on', on);
        }
        closePlayerMenu();
      }

      function toggleRep() {
        setRepeatSong(repMode !== 2);
      }

      // Syncs the play/pause button state, album cover pulse, and mini EQ
      // animation. Called by every play/pause/load path so the visible state
      // always matches the actual playing flag.
      function updatePlayPauseUI(isPlaying) {
        const wasPlaying = playing;
        playing = !!isPlaying;
        if (playing && !wasPlaying) {
          const t = playlist[currentTrackIndex];
          if (t) window.RDTrack('song_started', { song_title: t.title, song_artist: t.artist, playlist: t.playlist || 'Hindi Old' });
        }
        if (!playing && window.RDProfile) window.RDProfile.onPause();
        document.body.classList.toggle('playing', playing);
        $('btn-pp').innerHTML = playing ? '&#9646;&#9646;' : '&#9654;';
        $('bottom-container').classList.toggle('playing', playing);
        $('btn-pp').classList.toggle('playing', playing);
        $('seek').classList.toggle('playing', playing);
        $('album-cover-img').classList.toggle('playing', playing);

        // Toggle mini EQ animation
        document.querySelectorAll('.mini-eq-bar').forEach(b => {
          b.classList.toggle('animating', playing);
        });

        if (window.WakeLockSync) WakeLockSync(playing);
      }

      function syncUI() { updatePlayPauseUI(playing); }

      let lastListenTick = 0;
      let listenAccumMs = 0;

      function updatePlaybackTime() {
        const now = performance.now();
        if (playing) {
          if (lastListenTick) {
            listenAccumMs += now - lastListenTick;
            if (listenAccumMs >= 30000) {
              const t = playlist[currentTrackIndex];
              if (t) window.RDTrack('listening_time', { value: 30, song_title: t.title });
              listenAccumMs -= 30000;
            }
          }
          lastListenTick = now;
        } else {
          lastListenTick = 0;
          listenAccumMs = 0;
        }
        const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
        const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
        const seek = $('seek');
        const progress = duration ? Math.min(100, Math.max(0, (current / duration) * 100)) : 0;
        if (seek) {
          seek.value = String(progress);
          seek.style.setProperty('--seek-progress', `${progress}%`);
        }
        const currentLabel = $('t-cur');
        const durationLabel = $('t-dur');
        if (currentLabel) currentLabel.textContent = formatDuration(current);
        if (durationLabel && duration) durationLabel.textContent = formatDuration(duration);
      }

      function onSeek(value) {
        const duration = audio.duration;
        if (Number.isFinite(duration) && duration > 0) {
          audio.currentTime = (Number(value) / 100) * duration;
          updatePlaybackTime();
        } else {
          const seek = $('seek');
          if (seek) seek.style.setProperty('--seek-progress', `${Number(value) || 0}%`);
        }
      }

      function setVol(value) {
        audio.volume = Math.max(0, Math.min(1, Number(value) / 100));
        const slider = $('vol');
        if (slider) slider.style.setProperty('--vol-progress', `${value}%`);
        try { localStorage.setItem('retrodrive_vol', String(value)); } catch (e) { }
      }

      function toggleMute() {
        audio.muted = !audio.muted;
        const icon = $('vol-icon');
        if (icon) icon.textContent = audio.muted ? 'ðŸ”‡' : 'ðŸ”Š';
      }

      audio.addEventListener('loadedmetadata', updatePlaybackTime);
      audio.addEventListener('durationchange', updatePlaybackTime);
      audio.addEventListener('timeupdate', updatePlaybackTime);
      audio.addEventListener('error', () => {
        const t = playlist[currentTrackIndex];
        if (!t || isTrackInvalid(t)) return;
        // Drop stale errors from a source that has already been replaced.
        const currentSrc = audio.currentSrc || audio.getAttribute('src');
        if (currentSrc && normalizeMediaUrl(currentSrc) !== normalizeMediaUrl(t.src)) return;
        markTrackBroken(t);
      });
      audio.addEventListener('ended', () => {
        const done = playlist[currentTrackIndex];
        if (done) window.RDTrack('song_completed', { song_title: done.title, song_artist: done.artist, playlist: done.playlist || 'Hindi Old' });
        if (repMode === 2) { audio.currentTime = 0; doPlay(); }
        else nextTrack(true);
      });

      // ==================== ENGINE EQUALIZER (rAF-driven) ====================
      // Desktop animates the engine waveform with requestAnimationFrame so
      // all work stops completely when the engine is off. Mobile keeps the
      // lightweight CSS keyframes from the stylesheet.
      const eqReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      let eqBars = [];
      let eqRafId = null;

      function collectEqBars() {
        const wrap = $('engine-waveform');
        eqBars = wrap ? Array.from(wrap.querySelectorAll('.wave-bar')) : [];
      }

      function stopEqualizerLoop() {
        if (eqRafId) { cancelAnimationFrame(eqRafId); eqRafId = null; }
        eqBars.forEach(bar => { bar.style.height = ''; });
      }

      function startEqualizerLoop() {
        if (eqReduceMotion.matches || window.innerWidth <= 900) return;
        if (eqRafId) return;
        collectEqBars();
        if (!eqBars.length) return;
        const phases = eqBars.map((_, i) => i * 1.7 + Math.random() * 0.6);
        const bases = eqBars.map(() => 5 + Math.random() * 3);
        const tick = () => {
          if (!appState.engineOn) { stopEqualizerLoop(); return; }
          const t = performance.now() / 1000;
          const boost = sportMode ? 1.4 : 1;
          const rate = sportMode ? 1.3 : 1;
          eqBars.forEach((bar, i) => {
            const v1 = 0.5 + 0.5 * Math.sin(t * 5.2 * rate + phases[i]);
            const v2 = 0.5 + 0.5 * Math.sin(t * 8.7 * rate + phases[i] * 2.1);
            const h = Math.max(4, Math.round(bases[i] + (0.42 * v1 + 0.38 * v2) * 18 * boost));
            bar.style.height = h + 'px';
          });
          eqRafId = requestAnimationFrame(tick);
        };
        eqRafId = requestAnimationFrame(tick);
      }

      // ==================== ENGINE SOUND (Defender) ====================
      // assets/audio/defender_engine_start.mp3. Tied to the power-button
      // cycle: 1st click starts it, 2nd click stops it, and so on.
      const engineSound = new Audio('assets/audio/defender_engine_start.mp3');
      engineSound.volume = 0.9;
      let engineSoundPlaying = false;

      function playEngineSound() {
        if (engineSoundPlaying) return;
        engineSoundPlaying = true;
        try {
          if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
          engineSound.pause();
          engineSound.currentTime = 0;
          const p = engineSound.play();
          if (p && p.catch) p.catch(() => { });
        } catch { }
      }

      function stopEngineSound() {
        engineSoundPlaying = false;
        engineSound.pause();
        engineSound.currentTime = 0;
      }

      function toggleEngineSound() {
        const state = $('engine-side-state');
        const btn = $('engine-power-btn');
        const wave = $('engine-waveform');
        const currentState = state ? state.textContent.trim() : (appState.engineOn ? 'ON' : 'OFF');

        if (currentState === 'ON') {
          // 1st click: ON -> OFF, defender engine sound starts
          appState.engineOn = false;
          if (state) {
            state.textContent = 'OFF';
            state.classList.add('off');
          }
          if (btn) btn.classList.add('off');
          if (wave) wave.classList.remove('active');
          stopEqualizerLoop();
          playEngineSound();
          return;
        }

        // 2nd click: OFF -> ON, defender engine sound stops
        appState.engineOn = true;
        if (state) {
          state.textContent = 'ON';
          state.classList.remove('off');
        }
        if (btn) btn.classList.remove('off');
        if (wave) wave.classList.add('active');
        startEqualizerLoop();
        stopEngineSound();
      }

      function toggleSportMode() {
        sportMode = !sportMode;
        document.body.classList.toggle('sport-mode', sportMode);
        updatePlayerMenuStates();
        closePlayerMenu();
      }

      // â”€â”€ LUXURY THREE-DOT MENU â”€â”€
      function togglePlayerMenu(evt) {
        if (evt) evt.stopPropagation();
        const menu = $('player-menu');
        const scrim = $('player-menu-scrim');
        if (!menu) return;
        const willOpen = !menu.classList.contains('open');
        menu.classList.toggle('open', willOpen);
        if (scrim) scrim.classList.toggle('on', willOpen);
        if (willOpen) {
          setPlayerMenuView('main');
          updatePlayerMenuStates();
        } else {
          closeSleepCustom();
        }
      }

      function closePlayerMenu() {
        const menu = $('player-menu');
        const scrim = $('player-menu-scrim');
        if (menu) menu.classList.remove('open');
        if (scrim) scrim.classList.remove('on');
        closeSleepCustom();
      }

      function setPlayerMenuView(view) {
        const main = $('pm-main');
        const sleep = $('pm-sleep');
        if (main) main.classList.toggle('active', view === 'main');
        if (sleep) sleep.classList.toggle('active', view === 'sleep');
      }

      function updatePlayerMenuStates() {
        const r = $('pm-state-repeat');
        if (r) {
          r.textContent = repMode === 2 ? 'On' : 'Off';
          r.classList.toggle('on', repMode === 2);
        }
        const s = $('pm-state-sleep');
        if (s) {
          const active = sleepTimer.endAt > 0;
          s.textContent = active ? 'On' : 'Off';
          s.classList.toggle('on', active);
        }
        const sp = $('pm-state-sport');
        if (sp) {
          sp.textContent = sportMode ? 'On' : 'Off';
          sp.classList.toggle('on', sportMode);
        }
      }

      function renderSleepBadge() {
        const el = $('sleep-countdown');
        if (!el) return;
        if (sleepTimer.endAt > 0) {
          el.hidden = false;
          el.textContent = 'â± ' + formatTimerMs(sleepTimer.endAt - Date.now());
        } else {
          el.hidden = true;
        }
      }

      function armSleepTimer(ms) {
        clearInterval(sleepTimer.intervalId);
        sleepTimer.endAt = Date.now() + ms;
        sleepTimer.intervalId = setInterval(updateSleepCountdown, 500);
        updateSleepCountdown();
        updatePlayerMenuStates();
        closePlayerMenu();
      }

      function startSleepTimer(minutes) {
        armSleepTimer(minutes * 60 * 1000);
      }

      function updateSleepCountdown() {
        if (sleepTimer.endAt <= 0) return;
        if (Date.now() >= sleepTimer.endAt) {
          finishSleepTimer();
          return;
        }
        renderSleepBadge();
      }

      function finishSleepTimer() {
        clearInterval(sleepTimer.intervalId);
        sleepTimer.intervalId = null;
        sleepTimer.endAt = 0;
        sleepTimer.fadeStartVol = audio.volume || 0.8;
        const from = audio.volume;
        const start = performance.now();
        const DUR = 5000;
        const step = now => {
          const t = Math.min(1, (now - start) / DUR);
          audio.volume = Math.max(0, from * (1 - t));
          if (t < 1) {
            sleepTimer.fadeRafId = requestAnimationFrame(step);
          } else {
            doPause();
            audio.volume = sleepTimer.fadeStartVol;
            sleepTimer.fadeStartVol = null;
            renderSleepBadge();
            updatePlayerMenuStates();
          }
        };
        sleepTimer.fadeRafId = requestAnimationFrame(step);
      }

      function cancelSleepTimer() {
        clearInterval(sleepTimer.intervalId);
        if (sleepTimer.fadeRafId) cancelAnimationFrame(sleepTimer.fadeRafId);
        sleepTimer.intervalId = null;
        sleepTimer.endAt = 0;
        if (sleepTimer.fadeStartVol != null && audio.volume < sleepTimer.fadeStartVol - 0.001) {
          audio.volume = sleepTimer.fadeStartVol;
        }
        sleepTimer.fadeStartVol = null;
        renderSleepBadge();
        updatePlayerMenuStates();
        closePlayerMenu();
      }

      // â”€â”€ CUSTOM TIMER MODAL â”€â”€
      function openSleepCustom() {
        const modal = $('sleep-custom-modal');
        if (modal) modal.classList.add('on');
      }

      function closeSleepCustom() {
        const modal = $('sleep-custom-modal');
        if (modal) modal.classList.remove('on');
      }

      function startSleepCustom() {
        const h = Math.max(0, Math.min(23, parseInt($('sleep-hours').value, 10) || 0));
        const m = Math.max(0, Math.min(59, parseInt($('sleep-mins').value, 10) || 0));
        let totalSec = h * 3600 + m * 60;
        if (totalSec < 60) totalSec = 60;
        armSleepTimer(totalSec * 1000);
      }

      async function downloadSong() {
        const t = playlist[currentTrackIndex];
        if (!t || !t.src) return;
        closePlayerMenu();
        const extMatch = /\.([a-z0-9]{2,5})(?:$|[?#])/i.exec(t.src);
        const ext = extMatch ? '.' + extMatch[1] : '.mp3';
        const name = sanitizeFilename(t.title) + ext;

        const downloadBtnState = $('pm-state-download');
        if (downloadBtnState) downloadBtnState.textContent = 'Saving...';

        // 1. Try direct fetch + blob object URL download
        try {
          const res = await fetch(t.src, { mode: 'cors' });
          if (res.ok) {
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
            if (downloadBtnState) downloadBtnState.textContent = 'Saved!';
            setTimeout(() => { if (downloadBtnState) downloadBtnState.textContent = 'Save'; }, 2500);
            return;
          }
        } catch (e) {
          console.warn('Direct blob fetch failed, triggering attachment download...', e);
        }

        // 2. Supabase Storage attachment query param fallback (`?download=filename.mp3`)
        let downloadUrl = t.src;
        if (downloadUrl.includes('supabase.co/storage/v1/object/public/')) {
          const sep = downloadUrl.includes('?') ? '&' : '?';
          downloadUrl += `${sep}download=${encodeURIComponent(name)}`;
        }

        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = name;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        a.remove();

        if (downloadBtnState) downloadBtnState.textContent = 'Saved!';
        setTimeout(() => { if (downloadBtnState) downloadBtnState.textContent = 'Save'; }, 2500);
      }

      // â”€â”€ MENU WIRING â”€â”€
      document.addEventListener('click', evt => {
        const menu = $('player-menu');
        if (!menu || !menu.classList.contains('open')) return;
        if (menu.contains(evt.target)) return;
        const icon = evt.target.closest && evt.target.closest('.player-menu-icon');
        if (icon) return;
        closePlayerMenu();
      });

      document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
          closePlayerMenu();
          closeSleepCustom();
        }
      });