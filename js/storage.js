      function loadUiPrefs() {
        appState.advancedMode = false;
        appState.engineOn = true;
        appState.nightTheme = true;
        let savedTheme = null, savedCar = null, savedSong = null;
        try {
          savedTheme = localStorage.getItem('retrodrive_theme');
          // savedCar = localStorage.getItem('retrodrive_car');
          savedSong = localStorage.getItem('retrodrive_song');
        } catch (e) { }
        if (savedTheme === 'night' || savedTheme === 'day') {
          appState.nightTheme = savedTheme === 'night';
        }
        if (savedCar && CAR_OPTIONS.some(car => car.id === savedCar)) {
          appState.selectedCar = savedCar;
        }
        const songNum = parseInt(savedSong, 10);
        appState.savedSongIndex = (!isNaN(songNum) && songNum >= 0) ? songNum : null;
      }

      function syncUiPrefs() {
        localStorage.setItem('retrodrive_mode', appState.advancedMode ? 'advanced' : 'cinematic');
        localStorage.setItem('retrodrive_theme', appState.nightTheme ? 'night' : 'day');
      }

      function readLocationCache() {
        for (const storage of [localStorage, sessionStorage]) {
          try {
            const raw = storage.getItem(LOC_CACHE_KEY);
            if (!raw) continue;
            const entry = JSON.parse(raw);
            if (entry && typeof entry.lat === 'number' && typeof entry.lon === 'number' &&
                Date.now() - (entry.ts || 0) < LOC_MAX_AGE_MS) {
              // Only the city belongs on the card: strip any legacy
              // "city, state, country" text left by older sessions.
              if (entry.text && entry.text.includes(',')) entry.text = entry.text.split(',')[0].trim();
              return entry;
            }
          } catch (e) { }
        }
        return null;
      }

      function writeLocationCache(entry) {
        try { localStorage.setItem(LOC_CACHE_KEY, JSON.stringify(entry)); } catch (e) { }
        try { sessionStorage.setItem(LOC_CACHE_KEY, JSON.stringify(entry)); } catch (e) { }
      }