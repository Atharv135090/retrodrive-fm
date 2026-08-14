      // ==================== STATE ====================
      // Single source of truth for the playlist. Every track is an object
      // with { title, artist, src, cover }. audio.src is updated ONLY through
      // loadTrack(index), and currentTrackIndex is the single active index
      // used by every music control (next/prev/ended/playlist clicks).
      let playlist = [];
      let currentTrackIndex = 0;
      let playing = false, shuffled = true, repMode = 0;
      // Playback order used by Next/Previous. When not shuffled it is a plain
      // sequential wrap of playlist indexes so Next always continues from the
      // currently selected track.
      let playbackQueue = [];
      let queuePos = 0;
      let atmo = { night: false, rain: false, highway: false, golden: false };
      let audioCtx, analyser, freqData;
      const audio = document.getElementById('audio');
      audio.preload = 'auto';
      audio.playsInline = true;
      audio.volume = 0.8;
      const $ = id => document.getElementById(id);
      const CAR_OPTIONS = [
        { id: 'defender', name: 'Defender', src: 'assets/cinematic-defender-hero.png', portrait: 'assets/cinematic-defender-hero.png', scene800: 'assets/cinematic-defender-hero.png', scene1200: 'assets/cinematic-defender-hero.png', scene1920: 'assets/cinematic-defender-hero.png' },
        { id: 'bmw', name: 'BMW', src: 'assets/BMW.png', portrait: 'assets/BMW.png', scene800: 'assets/BMW.png', scene1200: 'assets/BMW.png', scene1920: 'assets/BMW.png' },
        { id: 'rollsroyce', name: 'Rolls-Royce', src: 'assets/rollsroyce.png', portrait: 'assets/rollsroyce.png', scene800: 'assets/rollsroyce.png', scene1200: 'assets/rollsroyce.png', scene1920: 'assets/rollsroyce.png' },
        { id: 'gwagon', name: 'G-Wagon', src: 'assets/gwagon.png', portrait: 'assets/gwagon.png', scene800: 'assets/gwagon.png', scene1200: 'assets/gwagon.png', scene1920: 'assets/gwagon.png' },
        { id: 'fortuner', name: 'Fortuner', src: 'assets/Fortuner.png', portrait: 'assets/Fortuner.png', scene800: 'assets/Fortuner.png', scene1200: 'assets/Fortuner.png', scene1920: 'assets/Fortuner.png' },
        { id: 'creta', name: 'Creta', src: 'assets/creta.png', portrait: 'assets/creta.png', scene800: 'assets/creta.png', scene1200: 'assets/creta.png', scene1920: 'assets/creta.png' }
      ];
      const appState = { advancedMode: false, nightTheme: false, driverCount: 604, engineOn: true, engineTimer: null, playlistOpen: false, selectedCar: null };
      const WEATHER_REFRESH_MS = 10 * 60 * 1000;
      const supportsWebP = (() => {
        const canvas = document.createElement('canvas');
        return canvas.toDataURL ? canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0 : false;
      })();
      const resizeFrame = { id: null };
      document.body.classList.add('cinematic-mode', 'theme-night');

      // ==================== TRACK VALIDATION ====================
      // URLs that proved unplayable (404, wrong content type, network failure)
      // are registered once here so they are never retried again.
      const invalidTrackUrls = new Set();
      // Cached health probe results (URL -> { ok, ts }) so the pre-play check
      // and the startup scan don't hammer the same URL repeatedly.
      const urlHealth = new Map();
      const URL_HEALTH_TTL_MS = 180000;

      let wantPlay = false;
      // A monotonically increasing token. Each new play request bumps it, so
      // stale async probes/play() completions can never clobber a newer one.
      let playToken = 0;


      // Wrapper for preview card onclick handlers
      let previewMode = 'engine';

      // ==================== WEATHER & LOCATION (cached-first) ====================
      const WEATHER_TTL_MS = 10 * 60 * 1000;
      const weatherCache = { key: '', time: 0, temp: null, code: null };
      const LOC_CACHE_KEY = 'retrodrive_location';
      // 1 hour: cached pin survives a refresh but self-corrects on the interval.
      const LOC_MAX_AGE_MS = 60 * 60 * 1000;
      // Neutral last resort: never invent a specific city the user isn't in.
      const WEATHER_FALLBACK_CHAIN = [
        { city: '', state: '', country: 'India', lat: 20.5937, lon: 78.9629 }
      ];

      // ==================== PHASE 3: PREMIUM MUSIC EXPERIENCE ====================

      // â”€â”€ SPORT MODE (signature cinematic driving mode) â”€â”€
      let sportMode = false;

      // â”€â”€ SLEEP TIMER (countdown survives song changes; 5s fade-out) â”€â”€
      const sleepTimer = { endAt: 0, intervalId: null, fadeRafId: null, fadeStartVol: null };