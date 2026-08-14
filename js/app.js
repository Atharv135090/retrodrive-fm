      window.addEventListener('DOMContentLoaded', () => {
        hideLoadingOverlay();
        bootImmediateUI();
        bootBackground();
      });

      function bootImmediateUI() {
        loadUiPrefs();
        document.body.classList.toggle('advanced-mode', appState.advancedMode);
        document.body.classList.toggle('cinematic-mode', !appState.advancedMode);
        document.body.classList.toggle('theme-night', appState.nightTheme);
        document.body.classList.toggle('theme-day', !appState.nightTheme);
        const themeToggle = $('theme-mode-toggle');
        if (themeToggle) themeToggle.checked = appState.nightTheme;
        const themeLabel = $('theme-mode-label');
        if (themeLabel) themeLabel.textContent = appState.nightTheme ? 'DAY THEME' : 'NIGHT THEME';

        renderCarSelector();

        // Apply saved car selection to hero backdrop on page refresh, or default to Defender.
        // On mobile the selected car's composed portrait artwork fills the screen.
        const car = CAR_OPTIONS.find(c => c.id === appState.selectedCar) || CAR_OPTIONS.find(c => c.id === 'defender');
        if (car) {
          const backdrop = $('hero-backdrop');
          if (backdrop) {
            const isMobile = isMobileView();
            if (isMobile) {
              const portraitArt = car.portrait || car.scene1920 || car.src;
              backdrop.style.setProperty('--hero-img', `url("../${portraitArt}")`);
              backdrop.style.setProperty('--mobile-bg', `url("../${portraitArt}")`);
              document.documentElement.style.setProperty('--hero-img', `url("../${portraitArt}")`);
              document.documentElement.style.setProperty('--mobile-bg', `url("../${portraitArt}")`);
              applyMobilePortrait(car);
            } else {
              backdrop.style.setProperty('--car-bg', `url("../${car.scene1920 || car.src}")`);
            }
            // Hide vehicle-stage and selected-car-img (no floating car image)
            const vehicleStage = document.getElementById('vehicle-stage');
            const selectedCarImg = document.getElementById('selected-car-img');
            if (vehicleStage) {
              vehicleStage.style.display = 'none';
            }
            if (selectedCarImg) {
              selectedCarImg.style.display = 'none';
            }
          }
        }

        rearrangeMobileHud();

        // Load the default hero scene so the mobile hero always shows a car
        // (desktop keeps the stage hidden, so this is a no-op there).
        const heroCarImg = $('selected-car-img');
        if (heroCarImg) {
          heroCarImg.onerror = function () {
            this.style.display = 'none';
          };
          const defaultCar = getSelectedCar();
        }

        // Restore the saved volume level.
        try {
          const savedVol = localStorage.getItem('retrodrive_vol');
          if (savedVol !== null) {
            const pct = Math.max(0, Math.min(100, Number(savedVol) || 80));
            audio.volume = pct / 100;
            const volSlider = $('vol');
            if (volSlider) {
              volSlider.value = pct;
              volSlider.style.setProperty('--vol-progress', `${pct}%`);
            }
          }
        } catch (e) { }
        window.addEventListener('resize', scheduleResponsiveUpdate, { passive: true });

        $('intro').classList.add('gone');
        toggleThemeMode(appState.nightTheme);
        updateSceneStyles();
        initDriverCount();
        startClock();

        // Cached weather appears instantly; network refresh happens later.
        applyCachedWeather();

        const engineStateEl = $('engine-side-state');
        const enginePowerBtn = $('engine-power-btn');
        const engineWave = $('engine-waveform');
        if (appState.engineOn) {
          if (engineStateEl) engineStateEl.textContent = 'ON';
          if (engineStateEl) engineStateEl.classList.remove('off');
          if (enginePowerBtn) enginePowerBtn.classList.remove('off');
          if (engineWave) engineWave.classList.add('active');
        } else {
          if (engineStateEl) engineStateEl.textContent = 'OFF';
          if (engineStateEl) engineStateEl.classList.add('off');
          if (enginePowerBtn) enginePowerBtn.classList.add('off');
          if (engineWave) engineWave.classList.remove('active');
        }
        startEqualizerLoop();
      }

      function bootBackground() {
        // Small staggered timeouts keep startup work off the critical path.
        const later = (fn, ms) => setTimeout(fn, ms);
        later(initDeviceTelemetry, 60);
        later(() => { preloadCriticalAssets(); generateDayBackdrop(); }, 200);
        later(preloadCars, 1200);
        later(initLocation, 350);
        later(initPlaylist, 200);

        // First user gesture unlocks audio for playback (browser autoplay
        // policy requires a gesture before any AudioContext can run).
        const unlockAudio = () => {
          if (audioCtx && audioCtx.state === 'suspended') { try { audioCtx.resume(); } catch { } }
          window.removeEventListener('pointerdown', unlockAudio);
          window.removeEventListener('touchstart', unlockAudio);
          window.removeEventListener('keydown', unlockAudio);
        };
        window.addEventListener('pointerdown', unlockAudio, { once: true });
        window.addEventListener('touchstart', unlockAudio, { once: true });
        window.addEventListener('keydown', unlockAudio, { once: true });

        // Sport Mode quick-exit rocket (inside the Engine card): bound once so
        // the click always toggles Sport Mode off on every layout (inline
        // handlers can be blocked by overlapping layers).
        const sportRocketBtn = $('sport-rocket-btn');
        if (sportRocketBtn) {
          sportRocketBtn.addEventListener('click', evt => {
            evt.stopPropagation();
            toggleSportMode();
          });
        }

        // Mobile car hero: fall back to the Defender scene if a vehicle
        // art file ever fails to load.
        const mobileHeroImg = $('mobile-car-hero-img');
        if (mobileHeroImg) {
          mobileHeroImg.onerror = function () {
            if (this.src && this.src.indexOf('cinematic-defender-hero') === -1) {
              this.src = 'assets/cinematic-defender-hero.png';
            }
          };
        }

        // Mobile cinematic car stage: same fallback so the centered layer
        // never shows a broken image.
        const carStageImg = $('mobile-car-stage-img');
        if (carStageImg) {
          carStageImg.onerror = function () {
            if (this.src && this.src.indexOf('cinematic-defender-hero') === -1) {
              this.src = 'assets/cinematic-defender-hero.png';
            }
          };
        }

        // Ambient updates
        setInterval(() => {
          if (playing) {
            const speedVal = 70 + Math.floor(Math.random() * 20);
            updateSpeedometer(speedVal);
          }
        }, 3000);

        // Keyboard Shortcuts
        document.addEventListener('keydown', e => {
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
          if (e.key === 'Escape') {
            closeCarSelector();
          }
          if (e.code === 'Space') { e.preventDefault(); togglePP(); }
          else if (e.code === 'ArrowRight') nextTrack();
          else if (e.code === 'ArrowLeft') prevTrack();
          else if (e.key.toLowerCase() === 's') toggleShuf();
          else if (e.key.toLowerCase() === 'r') toggleRep();
          else if (e.key.toLowerCase() === 'n') toggleAtmosphere('night', !atmo.night);
          else if (e.key.toLowerCase() === 'h' && appState.advancedMode) toggleAtmosphere('highway', !atmo.highway);
          else if (e.key.toLowerCase() === 'm') toggleMute();
          else if (e.key.toLowerCase() === 'f') toggleFullscreen();
        });
      }