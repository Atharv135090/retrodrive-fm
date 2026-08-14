      async function loadSongsFromCSV() {
        try {
          const res = await fetch('songs.csv', { cache: 'no-store' });
          if (!res.ok) throw new Error('CSV request failed');
          const text = await res.text();
          const lines = text.split(/\r?\n/);
          const tracks = [];
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            if (i === 0 && line.toLowerCase().startsWith('name,')) continue;
            const comma = line.indexOf(',');
            const name = (comma >= 0 ? line.slice(0, comma) : line).trim();
            const url = (comma >= 0 ? line.slice(comma + 1) : '').trim();
            if (!name || !url) continue;
            if (!/\.(mp3|m4a|wav|flac|aac|ogg)$/i.test(name)) continue;
            const title = cleanSongName(name);
            if (!title) continue;
            tracks.push({
              title: title,
              artist: 'Unknown Artist',
              album: 'Cassette Archive',
              duration: null,
              src: url,
              cover: getProceduralArtwork(title)
            });
          }
          return tracks;
        } catch (err) {
          return null;
        }
      }

      // ==================== PLAYLIST INIT ====================
      // Playlist initializes in the background, after the UI is visible.
      // 1. Render UI immediately (loader is hidden on DOMContentLoaded).
      // 2. Load ONLY the first playable track (verified via probe).
      // 3. Everything else is validated lazily in the background by
      //    sweepTrackValidity() and broken tracks are skipped automatically.
      async function initPlaylist() {
        try {
          const rows = await loadSongsFromCSV();
          if (!rows || rows.length === 0) return;
          // Sort playlist alphabetically (A-Z) by song title for browsing UI
          rows.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }));
          playlist = rows.slice();
          buildPlaybackQueue();

          const first = await findFirstPlayableIndex();
          if (first >= 0) {
            syncQueueToTrack(first);
            loadTrack(first);
          }
          sweepTrackValidity();
        } catch (e) {
          // Catalog failed to load: boot with an empty playlist and let the
          // Play control no-op gracefully instead of injecting a bundled track.
        }
      }

      // Returns the index of the first track whose URL answers with a real
      // audio response (200/206 + audio content type). Failed tracks are
      // marked broken once and never retried. Checks tracks in shuffled queue order.
      async function findFirstPlayableIndex() {
        const order = playbackQueue.length ? playbackQueue : playlist.map((_, i) => i);
        for (let i = 0; i < order.length; i++) {
          const idx = order[i];
          const t = playlist[idx];
          if (isTrackInvalid(t)) continue;
          if (await verifyPlayableTrack(normalizeMediaUrl(t.src))) return idx;
          warnTrackBroken(t, 'unreachable');
          invalidTrackUrls.add(normalizeMediaUrl(t.src));
        }
        return -1;
      }

      function togglePlaylistTray() {
        const tray = $('pl-tray');
        if (!tray) return;
        const isOpen = tray.classList.contains('open');
        if (isOpen) {
          tray.classList.remove('open');
          return;
        }
        renderPlaylistTray();
        tray.classList.add('open');
      }

      // Single entry point for "play a playlist track". It syncs the queue to
      // the selected track, loads it through loadTrack(index) (the only place
      // audio.src is mutated), and starts playback directly so the clicked
      // track plays exactly as chosen. Bumping playToken invalidates any
      // in-flight doPlay() probe so a stale request can never override the
      // selected song or its currentTrackIndex.
      function playFromPlaylist(index) {
        if (playlist.length === 0) return;
        const idx = ((index % playlist.length) + playlist.length) % playlist.length;
        const t = playlist[idx];
        if (t) window.RDTrack('playlist_selected', { song_title: t.title, song_artist: t.artist });
        syncQueueToTrack(idx);
        loadTrack(idx);
        wantPlay = true;
        playToken++;
        try { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) { }
        const p = audio.play();
        if (p && p.catch) {
          p.then(() => updatePlayPauseUI(true)).catch(() => updatePlayPauseUI(false));
        } else {
          updatePlayPauseUI(true);
        }
        const tray = $('pl-tray');
        if (tray) tray.classList.remove('open');
        if (appState.playlistOpen) closePlaylistPopup();
      }

      // Keeps the active-track highlight in sync across the playlist tray and
      // popup. Called by loadTrack() so every track change re-marks the
      // currently playing row wherever it is rendered.
      function highlightActive() {
        const trayInner = $('pl-tray-inner');
        if (trayInner) {
          trayInner.querySelectorAll('.pl-tray-item').forEach((el, i) => {
            el.classList.toggle('active-tray', i === currentTrackIndex);
          });
        }
        const popupList = $('playlist-popup-list');
        if (popupList) {
          popupList.querySelectorAll('.playlist-popup-item').forEach((el, i) => {
            el.classList.toggle('active-item', i === currentTrackIndex);
          });
        }
      }

      function renderPlaylistTray() {
        const inner = $('pl-tray-inner');
        if (!inner) return;
        // Always clear first so each render attaches exactly one fresh click
        // listener per item â€” reopened decks never pile up stale handlers.
        inner.innerHTML = '';
        playlist.forEach((t, i) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'pl-tray-item' + (i === currentTrackIndex ? ' active-tray' : '');
          item.dataset.index = String(i);
          item.innerHTML = `
      <span class="pl-tray-num">${i + 1}</span>
      <img class="pl-tray-thumb" src="${t.cover}" alt="">
      <div class="pl-tray-meta">
        <div class="pl-tray-title">${escapeHtml(t.title)}</div>
        <div class="pl-tray-artist">${escapeHtml(t.artist)}</div>
      </div>
    `;
          item.onclick = () => { playFromPlaylist(Number(item.dataset.index)); };
          inner.appendChild(item);
        });
        // Scroll active item into view
        const active = inner.querySelector('.active-tray');
        if (active) setTimeout(() => active.scrollIntoView({ block: 'nearest' }), 50);
      }

      function openPlaylistPopup() {
        appState.playlistOpen = true;
        renderPlaylistPopup();
        const popup = $('playlist-popup');
        if (popup) popup.classList.add('on');
      }

      function closePlaylistPopup(evt) {
        if (evt) evt.stopPropagation();
        appState.playlistOpen = false;
        const popup = $('playlist-popup');
        if (popup) popup.classList.remove('on');
      }

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && appState.playlistOpen) {
          closePlaylistPopup();
        }
      });

      function renderPlaylistPopup() {
        const c = $('playlist-popup-list');
        if (!c) return;
        // Always clear first so each render attaches exactly one fresh click
        // listener per item â€” reopened decks never pile up stale handlers.
        c.innerHTML = '';
        playlist.forEach((t, i) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'playlist-popup-item' + (i === currentTrackIndex ? ' active-item' : '');
          item.dataset.index = String(i);
          item.onclick = () => { playFromPlaylist(Number(item.dataset.index)); };
          item.innerHTML = `
      <img class="playlist-popup-thumb" src="${t.cover}" alt="artwork">
      <div class="playlist-popup-meta">
        <div class="playlist-popup-title-row">${escapeHtml(t.title)}</div>
        <div class="playlist-popup-artist">${escapeHtml(t.artist)}</div>
      </div>
      <div class="playlist-popup-dur">${t.duration ? formatDuration(t.duration) : 'â€”'}</div>
    `;
          c.appendChild(item);
        });
      }