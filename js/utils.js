      function preloadCriticalAssets() {
        // The hero WebP is already in flight via <link rel=preload>; warm the
        // mid-size variant used by tablet/desktop plus the album cover here.
        const hero = new Image();
        hero.decoding = 'async';
        hero.src = 'assets/cinematic-defender-hero.png';
        // Phones use the same cinematic scene as the full-screen backdrop.
        if (window.innerWidth <= 768) {
          const portrait = new Image();
          portrait.decoding = 'async';
          portrait.src = 'assets/cinematic-defender-hero.png';
        }
        const cover = new Image();
        cover.decoding = 'async';
        cover.src = 'assets/album-placeholder.png';
      }

      // Generates a properly color-graded day version of the hero scene once,
      // so day mode never shows the bright washed-out area above the car. The
      // result is exposed through the --day-bg CSS variable (WebP when possible).
      function generateDayBackdrop() {
        const img = new Image();
        img.decoding = 'async';
        img.src = 'assets/cinematic-defender-hero.png';
        img.onload = () => {
          try {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth || 1600;
            c.height = img.naturalHeight || 900;
            const ctx = c.getContext('2d');
            ctx.filter = 'brightness(1.5) saturate(1.22) contrast(1.06) hue-rotate(-8deg)';
            ctx.drawImage(img, 0, 0);
            ctx.filter = 'none';
            const grad = ctx.createLinearGradient(0, 0, 0, c.height);
            grad.addColorStop(0, 'rgba(96, 140, 180, 0.42)');
            grad.addColorStop(0.34, 'rgba(140, 172, 200, 0.2)');
            grad.addColorStop(0.62, 'rgba(20, 28, 40, 0.16)');
            grad.addColorStop(1, 'rgba(6, 10, 16, 0.28)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, c.width, c.height);
            const mime = supportsWebP ? 'image/webp' : 'image/jpeg';
            document.documentElement.style.setProperty('--day-bg', `url("${c.toDataURL(mime, 0.85)}")`);
          } catch (e) {
            // The CSS fallback keeps the graded hero image visible.
          }
        };
      }

      function scheduleResponsiveUpdate() {
        if (resizeFrame.id) cancelAnimationFrame(resizeFrame.id);
        resizeFrame.id = requestAnimationFrame(() => {
          if (typeof updateSceneStyles === 'function') updateSceneStyles();
          if (typeof renderCarSelector === 'function') renderCarSelector();
          if (typeof rearrangeMobileHud === 'function') rearrangeMobileHud();
          resizeFrame.id = null;
        });
      }

      // ==================== PROCEDURAL ART ====================
      function getProceduralArtwork(title) {
        let hash = 0;
        for (let i = 0; i < title.length; i++) {
          hash = title.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue1 = Math.abs(hash % 360);
        const hue2 = (hue1 + 50) % 360;

        const canvas = document.createElement('canvas');
        canvas.width = 120; canvas.height = 120;
        const ctx = canvas.getContext('2d');

        const grad = ctx.createLinearGradient(0, 0, 120, 120);
        grad.addColorStop(0, `hsl(${hue1}, 70%, 22%)`);
        grad.addColorStop(1, `hsl(${hue2}, 60%, 10%)`);
        ctx.fillStyle = grad; ctx.fillRect(0, 0, 120, 120);

        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1.5; ctx.strokeRect(10, 10, 100, 100);

        ctx.beginPath(); ctx.arc(60, 60, 42, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.stroke();

        ctx.beginPath(); ctx.arc(60, 60, 18, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '600 16px Inter, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const initial = title.trim().charAt(0).toUpperCase();
        ctx.fillText(initial, 60, 60);

        return canvas.toDataURL();
      }

      // ==================== LOAD SONGS FROM songs.csv ====================
      // songs.csv is the ONLY source of truth for the music library. It ships
      // next to the app with two columns: `name` (the original storage
      // filename) and `public_url` (the direct Supabase public URL). Files in
      // Supabase are never renamed â€” clean display titles are generated from
      // `name` at load time.

      const SITE_TAG_RE = /(?:www\.)?downloadming(?:\.se|\.com)?|raag\.me|mymp3singer(?:\.net)?|mymp3song|mr-jatt\.com|vipmarathi|songs\.pk|revival/gi;
      const ARTIST_TOKEN_RE = /^(?:mohammed|rafi|kishore|kumar|lata|mangeshkar|asha|bhosle|amit|mukesh|mahendra|kapoor|sanu|dj|sachin|alka)/i;

      // Turns a storage filename like "47. Jung - Deewana Deewana.mp3" into a
      // clean display title like "Deewana Deewana".
      function cleanSongName(raw) {
        let name = String(raw || '').trim();
        if (!name) return '';

        // 1) Remove the audio extension.
        name = name.replace(/\.(mp3|m4a|wav|flac|aac|ogg)(\?.*)?$/i, '');

        // 2) Remove download-site / catalog tags.
        name = name.replace(SITE_TAG_RE, ' ');

        // 3) Remove parenthetical tags like "(1)", "(Remix)", "(MyMp3Song)".
        name = name.replace(/\([^)]*\)/g, ' ');

        // 4) Remove leading track numbering ("01 - ", "010 ", "06.", "2 ").
        name = name.replace(/^\d{1,4}\s*[-._=)\s]*\s*/, '');

        // 5) Normalize separators: underscores become spaces, "=" and dashes
        //    become " - " so movie/song/artist segments split cleanly.
        name = name.replace(/_+/g, ' ');
        name = name.replace(/\s*=\s*/g, ' - ');
        name = name.replace(/\s*-\s*/g, ' - ');

        // 6) Split into candidate segments and drop junk (empty, pure digits,
        //    roman numerals, trailing "Remix").
        let parts = name.split('-')
          .map(seg => seg.replace(/\s+remix\s*$/i, '').trim())
          .filter(seg => seg && !/^\d+$/.test(seg) && !/^i+v?$/i.test(seg));

        if (parts.length > 1) {
          // A trailing segment that looks like a singer or an artist pair
          // ("SONG-Kishore Kumar", "SONG - Asha Bhosle & Amit Kumar") is a
          // rip tag, not the song title.
          const last = parts[parts.length - 1];
          if (ARTIST_TOKEN_RE.test(last) || (parts.length > 1 && last.indexOf('&') !== -1)) {
            parts.pop();
          }
          // Prefer the LAST multi-word segment ("Movie - Song" keeps the song).
          const multiWord = parts.filter(seg => /\s/.test(seg));
          if (multiWord.length) {
            name = multiWord[multiWord.length - 1];
          } else if (parts.length) {
            name = parts[parts.length - 1];
          }
        } else if (parts.length === 1) {
          name = parts[0];
        }

        // 7) Split camelCase ("DilLagaLiyaMaine") and collapse duplicate spaces.
        name = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();

        // 8) Title case each word.
        return name.split(' ').map(w => w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w).join(' ').trim();
      }

      function formatDuration(seconds) {
        if (!seconds || isNaN(seconds)) return '00:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
      }

      function normalizeMediaUrl(url) {
        const raw = (url || '').trim();
        if (!raw) return '';
        try {
          return new URL(raw).href;
        } catch (e) {
          return raw.replace(/\s/g, '%20');
        }
      }

      function escapeHtml(value) {
        const safe = String(value ?? '');
        return safe.replace(/[&<>'"]/g, char => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        })[char]);
      }

      function isMobileView() {
        return window.innerWidth <= 768;
      }

      function showToast(message) {
        let toast = $('retro-toast');
        if (!toast) {
          toast = document.createElement('div');
          toast.id = 'retro-toast';
          toast.style.cssText = `
            position: fixed;
            top: 75px;
            left: 50%;
            transform: translateX(-50%) translateY(-10px);
            background: linear-gradient(135deg, rgba(16, 24, 40, 0.96), rgba(8, 12, 22, 0.98));
            color: #ffffff;
            border: 1px solid rgba(255, 255, 255, 0.18);
            padding: 12px 20px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 500;
            z-index: 999999;
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            box-shadow: 0 10px 30px rgba(0,0,0,0.7), 0 0 20px rgba(255, 59, 59, 0.35);
            text-align: center;
            width: 88vw;
            max-width: 360px;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.3s ease, transform 0.3s ease;
          `;
          document.body.appendChild(toast);
        }
        toast.innerHTML = message;
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
        if (window.__toastTimer) clearTimeout(window.__toastTimer);
        window.__toastTimer = setTimeout(() => {
          toast.style.opacity = '0';
          toast.style.transform = 'translateX(-50%) translateY(-10px)';
        }, 3600);
      }

      function formatLocationText(city, state, country) {
        const safeCity = String(city || '').trim();
        const safeCountry = String(country || 'India').trim() || 'India';

        if (safeCity) return safeCity;
        return safeCountry;
      }

      function formatUpdatedTime(date = new Date()) {
        let hrs = date.getHours();
        const mins = date.getMinutes();
        const ampm = hrs >= 12 ? 'PM' : 'AM';
        hrs = hrs % 12 || 12;
        return `${hrs}:${mins < 10 ? '0' + mins : mins} ${ampm}`;
      }

      function formatTimerMs(ms) {
        const total = Math.max(0, Math.ceil(ms / 1000));
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        const pad = n => (n < 10 ? '0' : '') + n;
        return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
      }


      // â”€â”€ DOWNLOAD SONG (original Supabase file, title as filename) â”€â”€
      function sanitizeFilename(name) {
        return String(name || 'track').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'track';
      }