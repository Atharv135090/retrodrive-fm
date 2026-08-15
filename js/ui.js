      // Mobile HUD reads Time | Car | Driving Tonight | Theme. The clock
      // lives inside .top-right-telemetry in the markup (desktop order); on
      // phones it is moved to the left edge, right before the car button.
      function rearrangeMobileHud() {
        const hud = $('top-hud');
        const clock = hud && hud.querySelector('.clock-box');
        const telemetry = hud && hud.querySelector('.top-right-telemetry');
        const carBtn = $('hud-car-btn');
        if (!hud || !clock || !telemetry || !carBtn) return;
        if (isMobileView()) {
          if (clock.nextElementSibling !== carBtn) hud.insertBefore(clock, carBtn);
        } else if (clock.parentElement !== telemetry) {
          telemetry.insertBefore(clock, telemetry.firstChild);
        }
      }

      function initDriverCount() {
        const el = $('driver-count-text');
        if (!el) return;
        // Start at a random value inside the 400â€“700 band.
        appState.driverCount = 400 + Math.floor(Math.random() * 301);
        const render = () => {
          el.textContent = `${appState.driverCount} DRIVING`;
        };
        const bump = () => {
          // Smooth drift of Â±1 to Â±8, always staying inside 400â€“700.
          const delta = Math.floor(Math.random() * 8) + 1;
          const up = Math.random() > 0.5;
          appState.driverCount = Math.max(400, Math.min(700, appState.driverCount + (up ? delta : -delta)));
          render();
          setTimeout(bump, 5 * 60 * 1000);
        };
        render();
        setTimeout(bump, 5 * 60 * 1000);
      }

      // ==================== BOOT (phased for instant UI) ====================
      // Phase 0 renders the interface synchronously. Everything async
      // (playlist, weather, GPS, art, preloads) starts after first paint.
      // The loading overlay must never block: it is hidden as soon as the
      // DOM is ready, with a hard 1s safety timeout (CSS also auto-hides it).
      function hideLoadingOverlay() {
        const el = $('loading-overlay');
        if (!el) return;
        el.classList.add('gone');
        clearTimeout(hideLoadingOverlay.timer);
        hideLoadingOverlay.timer = setTimeout(() => el.classList.add('gone'), 800);
      }

      // ==================== IGNITION ====================
      function ignite() {
        $('intro').classList.add('gone');
        try {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) { }

        // Turn on engine (visual state only - no engine audio)
        appState.engineOn = true;
        const state = $('engine-side-state');
        const btn = $('engine-power-btn');
        const wave = $('engine-waveform');
        if (state) { state.textContent = 'ON'; state.classList.remove('off'); }
        if (btn) btn.classList.remove('off');
        if (wave) wave.classList.add('active');
        startEqualizerLoop();

        // The player boots idle: ignition turns the engine on but never
        // auto-plays music. The user starts the drive with Play.
      }

      // ==================== ATMOSPHERE ====================
      function toggleAtmosphere(mode, val) {
        atmo[mode] = val;
        const chk = $(`chk-${mode}`);
        if (chk) chk.checked = val;

        if (mode === 'golden' && val) {
          atmo.night = false;
          const cn = $('chk-night'); if (cn) cn.checked = false;
        }
        if (mode === 'night' && val) {
          atmo.golden = false;
          const cg = $('chk-golden'); if (cg) cg.checked = false;
        }

        updateSceneStyles();
      }

      function changeMood(mood) {
        if (mood === 'chill') {
          toggleAtmosphere('night', true);
          toggleAtmosphere('rain', true);
          toggleAtmosphere('highway', false);
        } else if (mood === 'monsoon') {
          toggleAtmosphere('night', true);
          toggleAtmosphere('rain', true);
          toggleAtmosphere('highway', true);
        } else if (mood === 'highway') {
          toggleAtmosphere('night', true);
          toggleAtmosphere('rain', false);
          toggleAtmosphere('highway', true);
        } else if (mood === 'golden') {
          toggleAtmosphere('golden', true);
          toggleAtmosphere('rain', false);
          toggleAtmosphere('highway', false);
        }
      }

      function updateSceneStyles() {
        const sc = $('scene'), rc = $('rain-canvas'), ft = $('freq-tuner-needle');
        const sub = $('tel-sub-val');
        const isNightTheme = document.body.classList.contains('theme-night');

        let bg = isNightTheme
          ? 'linear-gradient(to bottom, #030712 0%, #0b1528 50%, #172540 100%)'
          : 'linear-gradient(to bottom, #41597a 0%, #587291 40%, #48634e 70%, #263128 100%)';
        let needleLeft = '50%';
        let desc = 'LATE NIGHTS &bull; OLD SONGS &bull; ENDLESS ROADS';

        if (atmo.golden) {
          bg = 'linear-gradient(to bottom, #2c0900 0%, #6b2000 50%, #b64800 100%)';
          needleLeft = '15%';
          desc = 'GOLDEN SUNSET &bull; NOSTALGIA &bull; ENDLESS ROADS';
        } else if (atmo.rain) {
          bg = 'linear-gradient(to bottom, #060c16 0%, #0f1929 50%, #192436 100%)';
          needleLeft = '75%';
        }

        sc.style.background = bg;
        if (ft) ft.style.left = needleLeft;
        rc.style.opacity = (isNightTheme || atmo.rain) ? (atmo.rain ? 1 : 0.28) : 0;
        if (sub) sub.innerHTML = desc;
      }

      // ==================== STARS ====================
      function initStars() {
        const c = $('stars-canvas'), ctx = c.getContext('2d');
        let w, h, stars = [];

        function resize() {
          w = c.width = c.parentElement.offsetWidth;
          h = c.height = window.innerHeight * 0.6;
          stars = Array.from({ length: 200 }, () => ({
            x: Math.random() * w, y: Math.random() * h,
            r: Math.random() * 1.3 + 0.3,
            a: Math.random(), da: (Math.random() - 0.5) * 0.007
          }));
        }

        function draw() {
          ctx.clearRect(0, 0, w, h);
          stars.forEach(s => {
            s.a = Math.max(0.1, Math.min(1, s.a + s.da));
            if (s.a <= 0.1 || s.a >= 1) s.da *= -1;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255,255,255,${s.a})`;
            ctx.fill();
          });
          requestAnimationFrame(draw);
        }
        resize();
        window.addEventListener('resize', resize);
        draw();
      }

      // ==================== DUST ====================
      function initDust() {
        const c = $('dust-canvas'), ctx = c.getContext('2d');
        let w, h, parts = [];

        function resize() {
          w = c.width = window.innerWidth;
          h = c.height = window.innerHeight;
          parts = Array.from({ length: 55 }, () => ({
            x: Math.random() * w, y: Math.random() * h * 0.7 + h * 0.3,
            r: Math.random() * 2.2 + 0.5,
            vx: (Math.random() - 0.5) * 1.4, vy: -Math.random() * 0.7 - 0.2,
            a: Math.random() * 0.5 + 0.08
          }));
        }

        function draw() {
          ctx.clearRect(0, 0, w, h);
          parts.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(200,210,220,${p.a})`;
            ctx.fill();
            p.x += p.vx; p.y += p.vy;
            if (p.y < h * 0.3 || p.x < 0 || p.x > w) {
              p.x = Math.random() * w; p.y = h;
              p.vx = (Math.random() - 0.5) * 1.4; p.vy = -Math.random() * 0.7 - 0.2;
            }
          });
          requestAnimationFrame(draw);
        }
        resize();
        window.addEventListener('resize', resize);
        draw();
      }

      // ==================== FILM GRAIN ====================
      function initGrain() {
        const c = $('grain-canvas'), ctx = c.getContext('2d');
        function tick() {
          c.width = window.innerWidth; c.height = window.innerHeight;
          const id = ctx.createImageData(c.width, c.height), d = id.data;
          for (let i = 0; i < d.length; i += 4) {
            const v = Math.random() * 255 | 0;
            d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 18;
          }
          ctx.putImageData(id, 0, 0);
          setTimeout(tick, 80);
        }
        tick();
      }

      // ==================== RAIN ====================
      function initRain() {
        const c = $('rain-canvas'), ctx = c.getContext('2d');
        let w, h;
        const drops = Array.from({ length: 160 }, () => ({}));

        function reset(d) { d.x = Math.random() * w; d.y = -20; d.l = Math.random() * 22 + 12; d.v = Math.random() * 9 + 14; }

        function resize() {
          w = c.width = window.innerWidth; h = c.height = window.innerHeight;
          drops.forEach(d => reset(d));
        }

        function draw() {
          if (atmo.rain) {
            ctx.clearRect(0, 0, w, h);
            ctx.strokeStyle = 'rgba(180,220,250,.42)'; ctx.lineWidth = 1.4;
            ctx.beginPath();
            drops.forEach(d => {
              ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 4, d.y + d.l);
              d.y += d.v; d.x -= 2.5;
              if (d.y > h) reset(d);
            });
            ctx.stroke();
          }
          requestAnimationFrame(draw);
        }
        resize();
        window.addEventListener('resize', resize);
        draw();
      }

      // ==================== CLOCK ====================
      function startClock() {
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        const desktopClock = $('clock');
        const pillClock = $('driver-clock');
        const dateLabel = $('date-lbl');
        const tick = () => {
          const now = new Date();
          let hrs = now.getHours();
          const mins = now.getMinutes();
          const ampm = hrs >= 12 ? 'PM' : 'AM';
          hrs = hrs % 12;
          hrs = hrs ? hrs : 12;
          const minsStr = mins < 10 ? '0' + mins : mins;
          const timeText = `${hrs}:${minsStr} ${ampm}`;
          if (desktopClock) desktopClock.textContent = timeText;
          if (pillClock) pillClock.textContent = timeText;
          if (dateLabel) dateLabel.textContent = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
        };
        tick();
        setInterval(tick, 1000);
      }

      // ==================== FUEL & SPEEDO ====================
      function updateSpeedometer(speed) {
        const arc = $('spd-arc');
        if (arc) {
          const pct = speed / 160;
          const offset = 239 - (239 * pct);
          arc.style.strokeDashoffset = offset;
        }
      }


      function setMode(mode) {
        previewMode = mode;
        document.querySelectorAll('.preview-card').forEach(card => {
          card.classList.toggle('active-preview', card.dataset.mode === mode);
        });

        // Each preview selects a complete, predictable scene instead of merely
        // toggling one setting on and off.
        if (mode === 'engine') {
          atmo = { night: true, rain: false, highway: false, golden: false };
        } else if (mode === 'drive') {
          atmo = { night: true, rain: false, highway: true, golden: false };
        } else if (mode === 'highway') {
          atmo = { night: true, rain: false, highway: true, golden: false };
        } else if (mode === 'rain') {
          atmo = { night: true, rain: true, highway: false, golden: false };
        } else if (mode === 'golden') {
          atmo = { night: false, rain: false, highway: false, golden: true };
        }

        ['night', 'rain', 'highway', 'golden'].forEach(name => {
          const control = $(`chk-${name}`);
          if (control) control.checked = atmo[name];
        });
        updateSceneStyles();
      }

      function toggleAdvancedMode(enabled) {
        appState.advancedMode = !!enabled;
        document.body.classList.toggle('advanced-mode', appState.advancedMode);
        document.body.classList.toggle('cinematic-mode', !appState.advancedMode);
        const toggle = $('advanced-mode-toggle');
        if (toggle && toggle.checked !== appState.advancedMode) toggle.checked = appState.advancedMode;
        syncUiPrefs();
      }

      function toggleThemeMode(enabled) {
        const prev = appState.nightTheme;
        appState.nightTheme = !!enabled;
        if (appState.nightTheme !== prev) {
          const t = (typeof playlist !== 'undefined' && playlist[currentTrackIndex]) ? playlist[currentTrackIndex] : null;
          window.RDTrack(appState.nightTheme ? 'theme_night' : 'theme_day', {
            theme: appState.nightTheme ? 'night' : 'day',
            song_title: t ? t.title : ''
          });
        }
        document.body.classList.toggle('theme-night', appState.nightTheme);
        document.body.classList.toggle('theme-day', !appState.nightTheme);
        const label = $('theme-mode-label');
        if (label) label.textContent = appState.nightTheme ? 'NIGHT THEME' : 'DAY THEME';
        const toggle = $('theme-mode-toggle');
        if (toggle && toggle.checked !== appState.nightTheme) toggle.checked = appState.nightTheme;
        updateSceneStyles();
        syncUiPrefs();
        window.RDTrack('theme_changed', { theme: appState.nightTheme ? 'night' : 'day' });
      }

      // Device APIs are permission / browser dependent. When granted, location is
      // shown as a real city and battery is mirrored in both the battery and fuel UI.
      function initDeviceTelemetry() {
        let batteryLevel = 0.87;
        const setBattery = (level) => {
          const percentage = Math.round(level * 100);
          const batText = $('battery-text');
          if (batText) batText.textContent = `${percentage}%`;
          const fuelVal = $('fuel-value');
          if (fuelVal) fuelVal.textContent = `${percentage}%`;
          const fuelArc = $('fuel-arc');
          if (fuelArc) fuelArc.style.strokeDashoffset = 239 * (1 - level);
          const batLevel = document.querySelector('.battery-level');
          if (batLevel) batLevel.style.width = `${percentage}%`;
        };

        const simulateBattery = () => {
          setBattery(batteryLevel);
          // Slowly discharge/fluctuate every 45 seconds to show it's active
          setInterval(() => {
            batteryLevel = Math.max(0.05, batteryLevel - (Math.random() > 0.4 ? 0.01 : 0));
            setBattery(batteryLevel);
          }, 45000);
        };

        if (navigator.getBattery) {
          navigator.getBattery().then(battery => {
            const update = () => setBattery(battery.level);
            update();
            battery.addEventListener('levelchange', update);
          }).catch(() => {
            simulateBattery();
          });
        } else {
          simulateBattery();
        }
      }

      function getWeatherIconMarkup(code) {
        const condition = Number(code);
        const isDay = true;

        if (condition === 0) {
          return `<svg class="weather-cloud-svg" viewBox="0 0 64 64" aria-hidden="true"><circle cx="22" cy="28" r="12" fill="#fff7d6"/><circle cx="32" cy="24" r="14" fill="#fff7d6"/><circle cx="42" cy="30" r="11" fill="#fff7d6"/><path d="M19 43h27a8 8 0 0 0 0-16 12 12 0 0 0-22.8-3A9.5 9.5 0 0 0 19 43Z" fill="#ffffff"/><line x1="28" y1="44" x2="28" y2="52" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/><line x1="36" y1="44" x2="36" y2="52" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/></svg>`;
        }

        if ([1, 2, 3].includes(condition)) {
          return `<svg class="weather-cloud-svg" viewBox="0 0 64 64" aria-hidden="true"><path d="M46 38a8 8 0 0 0-6.06-7.73 12 12 0 0 0-21.7-2.65 9.5 9.5 0 0 0-1.24 17.38h29a8 8 0 0 0 0-7z" fill="#ffffff"/><line x1="22" y1="46" x2="20" y2="52" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/><line x1="30" y1="46" x2="28" y2="52" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/><line x1="38" y1="46" x2="36" y2="52" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/></svg>`;
        }

        if ([45, 48].includes(condition)) {
          return `<svg class="weather-cloud-svg" viewBox="0 0 64 64" aria-hidden="true"><path d="M46 38a8 8 0 0 0-6.06-7.73 12 12 0 0 0-21.7-2.65 9.5 9.5 0 0 0-1.24 17.38h29a8 8 0 0 0 0-7z" fill="#ffffff"/><path d="M23 45c1.5-4.5 5.2-7 10.3-7 5.7 0 9.7 3.5 10.5 8" fill="none" stroke="var(--accent)" stroke-width="2.3" stroke-linecap="round"/></svg>`;
        }

        if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(condition)) {
          return `<svg class="weather-cloud-svg" viewBox="0 0 64 64" aria-hidden="true"><path d="M46 38a8 8 0 0 0-6.06-7.73 12 12 0 0 0-21.7-2.65 9.5 9.5 0 0 0-1.24 17.38h29a8 8 0 0 0 0-7z" fill="#ffffff"/><line x1="20" y1="46" x2="20" y2="56" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/><line x1="30" y1="46" x2="30" y2="56" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/><line x1="40" y1="46" x2="40" y2="56" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/></svg>`;
        }

        if ([71, 73, 75, 77, 85, 86].includes(condition)) {
          return `<svg class="weather-cloud-svg" viewBox="0 0 64 64" aria-hidden="true"><path d="M46 38a8 8 0 0 0-6.06-7.73 12 12 0 0 0-21.7-2.65 9.5 9.5 0 0 0-1.24 17.38h29a8 8 0 0 0 0-7z" fill="#ffffff"/><path d="M22 46v8M30 44v10M38 46v8M46 44v10" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round"/></svg>`;
        }

        return `<svg class="weather-cloud-svg" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="16" fill="#fff7d6"/><path d="M18 43h28" stroke="var(--accent)" stroke-width="2.6" stroke-linecap="round"/></svg>`;
      }

      function getWeatherLabel(code) {
        const map = {
          0: 'Clear sky',
          1: 'Mainly clear',
          2: 'Partly cloudy',
          3: 'Cloudy',
          45: 'Foggy',
          48: 'Depositing rime fog',
          51: 'Light drizzle',
          53: 'Drizzle',
          55: 'Heavy drizzle',
          56: 'Freezing drizzle',
          57: 'Heavy freezing drizzle',
          61: 'Light rain',
          63: 'Rain',
          65: 'Heavy rain',
          66: 'Freezing rain',
          67: 'Heavy freezing rain',
          71: 'Light snow',
          73: 'Snow',
          75: 'Heavy snow',
          77: 'Snow grains',
          80: 'Rain showers',
          81: 'Heavy rain showers',
          82: 'Violent rain showers',
          85: 'Light snow showers',
          86: 'Heavy snow showers',
          95: 'Thunderstorm',
          96: 'Thunderstorm with hail',
          99: 'Heavy thunderstorm with hail'
        };
        return map[Number(code)] || 'Weather';
      }

      function setWeatherCard(locationText, temperature, weatherCode, updatedAt = new Date()) {
        const tempEl = document.querySelector('.default-weather-temp');
        const descEl = document.querySelector('.default-weather-desc');
        const cityEl = document.querySelector('.default-weather-city');
        const iconWrap = document.querySelector('.weather-icon-container');
        const updateEl = document.querySelector('.weather-meta-item.update-item span');

        if (tempEl) tempEl.innerHTML = `${Math.round(temperature)}&deg;`;
        if (descEl) descEl.textContent = getWeatherLabel(weatherCode);
        if (cityEl) {
          const cityName = (locationText || 'Phaltan').split(',')[0].trim();
          cityEl.textContent = cityName;
          cityEl.classList.toggle('loc-long', cityName.length > 20);
          cityEl.classList.toggle('loc-xlong', cityName.length > 32);
        }
        if (iconWrap) iconWrap.innerHTML = getWeatherIconMarkup(weatherCode);
        if (updateEl) updateEl.textContent = `Updated ${formatUpdatedTime(updatedAt)}`;
      }

      // Instant, offline-safe render from whatever the last visit resolved.
      function applyCachedWeather() {
        const cached = readLocationCache();
        if (!cached) {
          const fb = WEATHER_FALLBACK_CHAIN[0];
          setWeatherCard(formatLocationText(fb.city, fb.state, fb.country), 29, 3, new Date());
          return;
        }
        setWeatherCard(cached.text, cached.temp ?? 29, cached.code ?? 0, new Date(cached.weatherTs || cached.ts));
      }

      async function fetchWeatherForLocation(lat, lon, locationText) {
        const key = `${lat},${lon}`;
        const now = Date.now();
        if (weatherCache.key === key && now - weatherCache.time < WEATHER_TTL_MS) {
          setWeatherCard(locationText, weatherCache.temp, weatherCache.code, new Date(weatherCache.time));
          return;
        }
        try {
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto&forecast_days=1`;
          const result = await fetch(url);
          if (!result.ok) throw new Error('Weather request failed');
          const data = await result.json();
          const current = data.current || {};
          weatherCache.key = key;
          weatherCache.time = now;
          weatherCache.temp = current.temperature_2m ?? 29;
          weatherCache.code = current.weather_code ?? 0;
          setWeatherCard(locationText, weatherCache.temp, weatherCache.code, new Date(now));
          // Persist real weather with the location so the next load is instant.
          const existing = readLocationCache();
          writeLocationCache({
            lat, lon, text: locationText,
            ts: existing ? existing.ts : now,
            weatherTs: now, temp: weatherCache.temp, code: weatherCache.code
          });
        } catch (error) {
          // Fall back instantly to a neutral forecast without blocking the UI.
          setWeatherCard(locationText, 29, 3, new Date());
        }
      }

      // No IP guessing: without an allowed GPS fix the only honest answer is
      // the country itself, so the card never claims a city the user isn't in.
      function applyFallback() {
        const fb = WEATHER_FALLBACK_CHAIN[0];
        const text = formatLocationText(fb.city, fb.state, fb.country);
        writeLocationCache({ lat: fb.lat, lon: fb.lon, text, ts: Date.now() });
setWeatherCard(text, 29, 3, new Date());
          fetchWeatherForLocation(fb.lat, fb.lon, text);
      }

      // Reads the stored browser decision for geolocation without ever prompting.
// 'granted' and 'prompt' both allow an attempt (granted resolves silently,
// denied resolves immediately to the error path â€” no re-prompt either way),
// so the app never guesses the location from a stale session flag.
      function getLocationPermissionState() {
        return new Promise(resolve => {
          if (!navigator.permissions || !navigator.permissions.query) return resolve('unsupported');
          navigator.permissions.query({ name: 'geolocation' }).then(
            status => resolve(status.state),
            () => resolve('unsupported')
          );
        });
      }

      // open-meteo reverse results put the settlement in `name` (`locality`
      // is usually just a neighbourhood). Skip values that merely repeat the
      // state so the card never renders "Maharashtra, Maharashtra".
      function pickReverseLocation(result) {
        if (!result) return { city: '', state: '', country: 'India' };
        const state = result.admin1 || result.state || '';
        const rawCity = result.name || result.city || result.locality || '';
        const city = (rawCity && rawCity !== state) ? rawCity : '';
        return { city, state, country: result.country || 'India' };
      }

      async function resolveLocationAndWeather() {
        const cached = readLocationCache();
        if (cached) {
          setWeatherCard(cached.text, cached.temp ?? 29, cached.code ?? 0, new Date(cached.weatherTs || cached.ts));
        }

        const buildLocText = (city, state, country) => {
          const c = (city && city.trim()) ? city.trim() : '';
          if (c) return c;
          return (country && country.trim()) ? country.trim() : 'India';
        };

        const tryIpLocation = async () => {
          try {
            const res = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
            if (res.ok) {
              const data = await res.json();
              if (data && (data.city || data.country_name)) {
                const text = buildLocText(data.city, data.region, data.country_name);
                const lat = data.latitude || 19.076;
                const lon = data.longitude || 72.8777;
                writeLocationCache({ lat, lon, text, ts: Date.now() });
                setWeatherCard(text, 29, 3, new Date());
                await fetchWeatherForLocation(lat, lon, text);
                return true;
              }
            }
          } catch (e) { }

          try {
            const res2 = await fetch('https://ipwho.is/', { cache: 'no-store' });
            if (res2.ok) {
              const data2 = await res2.json();
              if (data2 && data2.success) {
                const text = buildLocText(data2.city, data2.region, data2.country);
                const lat = data2.latitude || 19.076;
                const lon = data2.longitude || 72.8777;
                writeLocationCache({ lat, lon, text, ts: Date.now() });
                setWeatherCard(text, 29, 3, new Date());
                await fetchWeatherForLocation(lat, lon, text);
                return true;
              }
            }
          } catch (e) { }

          applyFallback();
          return false;
        };

        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(async position => {
            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;

            try {
              const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`;
              const bdcRes = await fetch(bdcUrl);
              if (bdcRes.ok) {
                const bdcData = await bdcRes.json();
                const city = bdcData.locality || bdcData.city || bdcData.localityInfo?.informal?.[0]?.name || '';
                const state = bdcData.principalSubdivision || '';
                const country = bdcData.countryName || 'India';
                const locationText = buildLocText(city, state, country);
                writeLocationCache({ lat: latitude, lon: longitude, text: locationText, ts: Date.now() });
                setWeatherCard(locationText, 29, 3, new Date());
                await fetchWeatherForLocation(latitude, longitude, locationText);
                return;
              }
            } catch (err) { }

            try {
              const reverseUrl = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}&language=en&format=json`;
              const reverseRes = await fetch(reverseUrl);
              if (reverseRes.ok) {
                const reverseData = await reverseRes.json();
                const loc = pickReverseLocation(reverseData.results && reverseData.results[0]);
                const locationText = formatLocationText(loc.city, loc.state, loc.country);
                writeLocationCache({ lat: latitude, lon: longitude, text: locationText, ts: Date.now() });
                setWeatherCard(locationText, 29, 3, new Date());
                await fetchWeatherForLocation(latitude, longitude, locationText);
                return;
              }
            } catch (err) { }

            await tryIpLocation();
          }, async () => {
            // Permission denied: never guess a city â€” show only "India".
            applyFallback();
          }, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
          });
        } else {
          await tryIpLocation();
        }
      }

      // Called from the background boot phase: never blocks first paint and
      // re-resolves silently on a fixed interval (no extra permission prompts).
      function initLocation() {
        // Tap the pin to re-attempt a precise fix (e.g. after granting or
        // enabling browser location permission the first attempt missed).
        const locItem = document.querySelector('.weather-meta-item.location-item');
        if (locItem) {
          locItem.addEventListener('click', () => resolveLocationAndWeather());
        }
        window.setTimeout(() => {
          resolveLocationAndWeather();
          setInterval(() => {
            resolveLocationAndWeather();
          }, WEATHER_REFRESH_MS);
        }, 400);
      }

      // ==================== CAPTURE MOMENT ====================
      function captureMoment() {
        const c = $('snap-canvas'), ctx = c.getContext('2d');
        c.width = 920; c.height = 560;
        ctx.fillStyle = '#08101e'; ctx.fillRect(0, 0, 920, 560);

        const gr = ctx.createLinearGradient(0, 0, 920, 0);
        gr.addColorStop(0, '#10b981'); gr.addColorStop(1, '#3b82f6');
        ctx.fillStyle = gr; ctx.fillRect(0, 0, 920, 6);

        ctx.fillStyle = '#fff'; ctx.font = 'bold 26px Inter, sans-serif';
        ctx.fillText('RETRODRIVE DEFENDER', 40, 56);
        ctx.fillStyle = '#7ea4c8'; ctx.font = '14px Inter, monospace';
        ctx.fillText(new Date().toLocaleString(), 40, 80);
        ctx.fillStyle = 'rgba(16,185,129,.2)'; ctx.fillRect(40, 94, 840, 1);

        const t = playlist[currentTrackIndex];
        ctx.fillStyle = '#10b981'; ctx.font = 'bold 17px Inter, sans-serif';
        ctx.fillText('NOW PLAYING: ' + (t ? t.title : 'Retro Hindi Drive'), 58, 476);
        ctx.fillStyle = '#c8d8ea'; ctx.font = 'italic 15px Inter, sans-serif';
        ctx.fillText('"Some songs don\'t end. They become roads."', 58, 506);

        $('snap-modal').classList.add('on');
      }

      function closeSnap() { $('snap-modal').classList.remove('on'); }
      function downloadSnap() {
        const a = document.createElement('a');
        a.download = 'RetroDrive-Moment.png';
        a.href = $('snap-canvas').toDataURL();
        a.click();
      }