// ==================== DRIVE PROFILE — REAL DATA ENGINE ====================
      // Records real listening/driving behavior (fed by the same events as
      // GA4 tracking), persists everything in localStorage, and computes all
      // profile statistics, streaks, achievements, and the monthly wrapped
      // from that data only. No fake values anywhere.
      (() => {
        const KEY = 'rd_drive_profile_v1';
        const HISTORY_LIMIT = 50;

        function todayStr() {
          const d = new Date();
          return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        }

        function monthStr() {
          const d = new Date();
          return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        }

        function newMonthBucket() {
          return { listenSec: 0, starts: 0, completes: 0, skips: 0, sessions: 0, hourHist: {}, songs: {}, cars: {}, playlists: {} };
        }

        function defaults() {
          return {
            firstOpened: null,
            totals: {
              listenSec: 0, starts: 0, completes: 0, skips: 0,
              sessions: 0, nightSessions: 0, weekendDays: 0,
              longestSessionSec: 0, fullscreen: 0, wakeLock: 0,
              themeDay: 0, themeNight: 0, carSwitches: 0
            },
            daySecs: {},
            songs: {},
            cars: {},
            playlists: {},
            months: {},
            history: [],
            achievements: {}
          };
        }

        let P = load();
        let openSession = null;
        let currentTrack = null;
        let lastCarName = null;
        let lastCarId = null;
        const listeners = new Set();

        function load() {
          try {
            const raw = localStorage.getItem(KEY);
            if (raw) return Object.assign(defaults(), JSON.parse(raw));
          } catch (e) { }
          const fresh = defaults();
          fresh.firstOpened = Date.now();
          return fresh;
        }

        function save() {
          try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { }
        }

        function rollMonthIfNeeded() {
          const cur = monthStr();
          if (!P.months[cur]) P.months[cur] = newMonthBucket();
        }

        function emit() {
          listeners.forEach(fn => { try { fn(); } catch (e) { } });
        }

        function notify() {
          save();
          statsDirty = true;
          emit();
        }

        function songRec(title) {
          if (!P.songs[title]) {
            P.songs[title] = { plays: 0, completes: 0, skips: 0, lastPlayed: 0, secs: 0 };
          }
          return P.songs[title];
        }

        function record(event, params) {
          try {
            params = params || {};
            rollMonthIfNeeded();
            const mb = P.months[monthStr()];
            const now = Date.now();
            const d = new Date();
            const hour = d.getHours();

            if (event === 'song_started') {
              const title = params.song_title || 'Unknown';
              const playlist = params.playlist || 'Hindi Old';
              const s = songRec(title);
              s.plays++;
              s.lastPlayed = now;
              P.totals.starts++;
              mb.starts++;
              mb.songs[title] = (mb.songs[title] || 0) + 1;
              mb.playlists[playlist] = (mb.playlists[playlist] || 0) + 1;
              P.playlists[playlist] = P.playlists[playlist] || { plays: 0, listenSec: 0 };
              P.playlists[playlist].plays++;
              currentTrack = { title: title, playlist: playlist, car: lastCarName, secs: 0 };
              if (!openSession) {
                P.totals.sessions++;
                mb.sessions++;
                if (hour >= 18) P.totals.nightSessions++;
                openSession = { startTs: now, secs: 0, hour: hour, lastTs: now };
              }
            } else if (event === 'listening_time') {
              const v = Math.max(0, Number(params.value) || 0);
              if (v <= 0) return;
              P.totals.listenSec += v;
              const day = todayStr();
              P.daySecs[day] = (P.daySecs[day] || 0) + v;
              mb.listenSec += v;
              if (currentTrack) {
                currentTrack.secs += v;
                songRec(currentTrack.title).secs += v;
                if (currentTrack.playlist) P.playlists[currentTrack.playlist].listenSec += v;
              }
              if (lastCarId && P.cars[lastCarId]) P.cars[lastCarId].secs = (P.cars[lastCarId].secs || 0) + v;
              if (openSession) {
                openSession.secs += v;
                openSession.lastTs = now;
                if (openSession.secs > P.totals.longestSessionSec) P.totals.longestSessionSec = openSession.secs;
              }
              const hb = mb.hourHist;
              hb[hour] = (hb[hour] || 0) + v;
              if (P.totals.longestSessionSec >= 7200) checkAchievement('long_drive');
            } else if (event === 'song_completed') {
              const title = params.song_title || 'Unknown';
              const playlist = params.playlist || 'Hindi Old';
              songRec(title).completes++;
              P.totals.completes++;
              mb.completes++;
              addHistory({ title: title, playlist: playlist, car: currentTrack ? currentTrack.car : lastCarName, ts: now, secs: currentTrack ? currentTrack.secs : 0, outcome: 'completed' });
            } else if (event === 'song_skipped') {
              const title = params.song_title || 'Unknown';
              const playlist = params.playlist || 'Hindi Old';
              songRec(title).skips++;
              P.totals.skips++;
              mb.skips++;
              addHistory({ title: title, playlist: playlist, car: currentTrack ? currentTrack.car : lastCarName, ts: now, secs: currentTrack ? currentTrack.secs : 0, outcome: 'skipped' });
            } else if (event === 'playlist_selected') {
              const playlist = params.playlist || 'Hindi Old';
              P.playlists[playlist] = P.playlists[playlist] || { plays: 0, listenSec: 0 };
              P.playlists[playlist].plays++;
              mb.playlists[playlist] = (mb.playlists[playlist] || 0) + 1;
            } else if (event === 'car_selected') {
              const id = params.car_id || (params.car_name || '').toLowerCase().replace(/\s+/g, '') || 'car';
              const name = params.car_name || id;
              P.cars[id] = P.cars[id] || { name: name, count: 0 };
              P.cars[id].name = name;
              P.cars[id].count++;
              lastCarName = name;
              lastCarId = id;
              P.totals.carSwitches++;
              mb.cars[id] = (mb.cars[id] || 0) + 1;
            } else if (event === 'fullscreen_used') {
              P.totals.fullscreen++;
            } else if (event === 'wake_lock_activated') {
              P.totals.wakeLock++;
            } else if (event === 'theme_changed') {
              if (params.theme === 'night') P.totals.themeNight++;
              else P.totals.themeDay++;
            }
            checkAllAchievements();
            notify();
          } catch (e) { }
        }

        function addHistory(entry) {
          P.history.unshift(entry);
          if (P.history.length > HISTORY_LIMIT) P.history.length = HISTORY_LIMIT;
        }

        function onPause() {
          if (!openSession) return;
          openSession = null;
          checkAllAchievements();
          notify();
        }

        // ---------- streaks ----------

        function activeDayKeys() {
          return Object.keys(P.daySecs).filter(k => (P.daySecs[k] || 0) > 0).sort();
        }

        function parseDay(k) {
          const parts = k.split('-');
          return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        }

        function currentStreak() {
          const days = activeDayKeys();
          if (!days.length) return 0;
          const set = new Set(days);
          let streak = 0;
          const cursor = new Date();
          if (!set.has(todayStr())) cursor.setDate(cursor.getDate() - 1);
          while (set.has(cursor.getFullYear() + '-' + String(cursor.getMonth() + 1).padStart(2, '0') + '-' + String(cursor.getDate()).padStart(2, '0'))) {
            streak++;
            cursor.setDate(cursor.getDate() - 1);
          }
          return streak;
        }

        function longestStreak() {
          const days = activeDayKeys();
          if (!days.length) return 0;
          let best = 1, run = 1;
          for (let i = 1; i < days.length; i++) {
            const diff = Math.round((parseDay(days[i]) - parseDay(days[i - 1])) / 86400000);
            if (diff === 1) { run++; best = Math.max(best, run); }
            else run = 1;
          }
          return best;
        }

        function weekendActiveDays() {
          let n = 0;
          Object.keys(P.daySecs).forEach(k => {
            if ((P.daySecs[k] || 0) > 0) {
              const wd = parseDay(k).getDay();
              if (wd === 0 || wd === 6) n++;
            }
          });
          return n;
        }

        // ---------- achievements ----------

        const ACHIEVEMENTS = [
          { id: 'rookie', title: 'Road Trip Rookie', desc: '1 hour of total listening', progress: () => Math.min(100, (P.totals.listenSec / 3600) * 100) },
          { id: 'addict', title: 'Retro Addict', desc: '10 hours of total listening', progress: () => Math.min(100, (P.totals.listenSec / 36000) * 100) },
          { id: 'legend', title: 'Highway Legend', desc: '25 hours of total listening', progress: () => Math.min(100, (P.totals.listenSec / 90000) * 100) },
          { id: 'cassette_master', title: 'Cassette Master', desc: 'Play every playlist', progress: () => {
            const played = Object.keys(P.playlists).filter(k => P.playlists[k].plays > 0).length;
            const seen = Math.max(1, Object.keys(P.playlists).length);
            return Math.min(100, (played / seen) * 100);
          } },
          { id: 'night_driver', title: 'Night Driver', desc: '10 night listening sessions', progress: () => Math.min(100, (P.totals.nightSessions / 10) * 100) },
          { id: 'weekend', title: 'Weekend Cruiser', desc: 'Listen on 5 weekend days', progress: () => Math.min(100, (weekendActiveDays() / 5) * 100) },
          { id: 'long_drive', title: 'Long Drive Expert', desc: 'A single 2-hour listening session', progress: () => Math.min(100, (P.totals.longestSessionSec / 7200) * 100) }
        ];

        function checkAchievement(id) {
          const def = ACHIEVEMENTS.find(a => a.id === id);
          if (!def || P.achievements[id]) return;
          if (def.progress() >= 100) {
            P.achievements[id] = { unlockedAt: Date.now() };
          }
        }

        function checkAllAchievements() {
          ACHIEVEMENTS.forEach(a => checkAchievement(a.id));
        }

        // ---------- wrapped ----------

        function wrapped() {
          const cur = monthStr();
          rollMonthIfNeeded();
          const mb = P.months[cur];
          const songs = Object.entries(mb.songs || {}).sort((a, b) => b[1] - a[1]);
          const cars = Object.entries(mb.cars || {}).sort((a, b) => b[1] - a[1]);
          const pls = Object.entries(mb.playlists || {}).sort((a, b) => b[1] - a[1]);
          const hours = Object.entries(mb.hourHist || {}).sort((a, b) => b[1] - a[1]);
          return {
            month: cur,
            hours: (mb.listenSec || 0) / 3600,
            topSong: songs[0] ? songs[0][0] : null,
            top5: songs.slice(0, 5).map(s => s[0]),
            favCar: cars[0] ? (P.cars[cars[0][0]] ? P.cars[cars[0][0]].name : cars[0][0]) : null,
            favPlaylist: pls[0] ? pls[0][0] : null,
            activeHour: hours[0] ? Number(hours[0][0]) : null,
            sessions: mb.sessions || 0,
            skips: mb.skips || 0,
            completionRate: (mb.starts || 0) > 0 ? Math.round(((mb.completes || 0) / mb.starts) * 100) : 0
          };
        }

        // ---------- sports metrics ----------

        function monthBucket() {
          rollMonthIfNeeded();
          return P.months[monthStr()];
        }

        function sportsMetrics() {
          const t = P.totals;
          const h = Math.max(1, t.listenSec / 3600);
          const mb = monthBucket();
          const hours = Object.entries(mb.hourHist || {}).sort((a, b) => b[1] - a[1]);
          const peakHour = hours[0] ? Number(hours[0][0]) : null;
          const buckets = { morning: 0, evening: 0, night: 0 };
          Object.entries(mb.hourHist || {}).forEach(([hh, secs]) => {
            const n = Number(hh);
            if (n >= 5 && n < 12) buckets.morning += secs;
            else if (n >= 12 && n < 18) buckets.evening += secs;
            else buckets.night += secs;
          });
          const period = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0][0];
          return {
            songsPerHour: t.starts / h,
            skipPerHour: t.skips / h,
            avgSkipSpeedSec: t.skips > 0 ? t.listenSec / t.skips : 0,
            carSwitchPerHour: t.carSwitches / h,
            peakHour: peakHour,
            period: period,
            intensity: Math.min(100, (t.starts / h) * 12)
          };
        }

        function liveSession() {
          if (!openSession) return { open: false, secs: 0 };
          const secs = openSession.secs + Math.max(0, (Date.now() - openSession.lastTs) / 1000);
          return { open: true, secs: Math.round(secs), startTs: openSession.startTs };
        }

        // ---------- user profiles (preset, persisted) ----------

        const PROFILE_KEY = 'rd_profile_v2';
        const PRESETS = [
          { id: 'atharv', name: 'Atharv', avatar: 0 },
          { id: 'aryan', name: 'Aryan', avatar: 1 },
          { id: 'aarav', name: 'Aarav', avatar: 2 },
          { id: 'vihaan', name: 'Vihaan', avatar: 3 },
          { id: 'kabir', name: 'Kabir', avatar: 4 },
          { id: 'dev', name: 'Dev', avatar: 5 }
        ];
        const AVATAR_GRADIENTS = [
          ['#f3e5bd', '#d4af37', '#9a7b1e'],
          ['#e8f1ff', '#8fb8e8', '#4a74a8'],
          ['#ffe9d6', '#e8a06a', '#a8683a'],
          ['#e6ffe6', '#7cc47c', '#3a7a3a'],
          ['#f0e6ff', '#b28ae0', '#6a4a9a'],
          ['#ffe6ea', '#e87a8a', '#9a3a4a']
        ];

        let PF = loadProfiles();
        const profileListeners = new Set();

        function loadProfiles() {
          try {
            const raw = localStorage.getItem(PROFILE_KEY);
            if (raw) {
              const data = JSON.parse(raw);
              if (Array.isArray(data.profiles) && data.profiles.length === PRESETS.length) {
                return { profiles: data.profiles, current: data.current || PRESETS[0].id };
              }
            }
          } catch (e) { }
          return { profiles: PRESETS.slice(), current: PRESETS[0].id };
        }

        function saveProfiles() {
          try { localStorage.setItem(PROFILE_KEY, JSON.stringify(PF)); } catch (e) { }
        }

        function emitProfile() {
          profileListeners.forEach(fn => { try { fn(); } catch (e) { } });
        }

        function getProfile() {
          return PF.profiles.find(p => p.id === PF.current) || PF.profiles[0];
        }

        function setCurrentProfile(id) {
          if (!PF.profiles.some(p => p.id === id)) return;
          PF.current = id;
          saveProfiles();
          emitProfile();
        }

        function updateProfile(patches) {
          const p = getProfile();
          if (patches && typeof patches.name === 'string') {
            const n = patches.name.trim().slice(0, 16);
            if (n) p.name = n;
          }
          if (patches && typeof patches.avatar === 'number' && patches.avatar >= 0 && patches.avatar < AVATAR_GRADIENTS.length) {
            p.avatar = patches.avatar;
          }
          saveProfiles();
          emitProfile();
        }

        // ---------- cached stats ----------
        // Derived stats are recomputed only when data changes (or the day
        // rolls over); the live session is refreshed on every call so the
        // profile's 1s tick stays cheap.

        let statsCache = null;
        let statsDirty = true;

        function computeStats() {
          rollMonthIfNeeded();
          const days = activeDayKeys();
          const weekSecs = Object.keys(P.daySecs)
            .filter(k => {
              const t = parseDay(k).getTime();
              const now = Date.now();
              const day = 86400000;
              const wd = new Date(now).getDay();
              const monday = now - ((wd + 6) % 7) * day;
              return t >= monday - day && t <= now;
            })
            .reduce((sum, k) => sum + P.daySecs[k], 0);
          const todaySecs = P.daySecs[todayStr()] || 0;
          const monthSecs = Object.keys(P.daySecs)
            .filter(k => k.slice(0, 7) === monthStr())
            .reduce((sum, k) => sum + P.daySecs[k], 0);
          const songRows = Object.entries(P.songs).map(([title, s]) => ({ title: title, plays: s.plays, completes: s.completes, skips: s.skips, secs: s.secs, lastPlayed: s.lastPlayed }));
          songRows.sort((a, b) => b.plays - a.plays);
          const mostPlayed = songRows[0] || null;
          const top5 = songRows.slice(0, 5);
          const recently = songRows.slice().sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 10);
          const mostSkipped = songRows.slice().sort((a, b) => b.skips - a.skips)[0] || null;
          const completionRate = P.totals.starts > 0 ? Math.round((P.totals.completes / P.totals.starts) * 100) : 0;
          const carRows = Object.entries(P.cars).map(([id, c]) => ({ id: id, name: c.name, count: c.count, secs: c.secs || 0 })).sort((a, b) => b.count - a.count);
          const favCar = carRows[0] ? carRows[0].name : null;
          const distTotal = Math.max(1, Object.values(P.playlists).reduce((s, p) => s + p.listenSec, 0));
          const distribution = Object.entries(P.playlists)
            .map(([name, p]) => ({ playlist: name, secs: p.listenSec, plays: p.plays, share: Math.round((p.listenSec / distTotal) * 100) }))
            .sort((a, b) => b.secs - a.secs);
          const achievements = ACHIEVEMENTS.map(a => {
            const progress = Math.round(a.progress());
            const rec = P.achievements[a.id];
            return {
              id: a.id, title: a.title, desc: a.desc, progress: progress,
              unlockedAt: rec ? rec.unlockedAt : null,
              state: rec ? 'unlocked' : (progress >= 100 ? 'unlocked' : 'locked')
            };
          });
          return {
            totals: P.totals,
            todaySecs: todaySecs,
            weekSecs: weekSecs,
            monthSecs: monthSecs,
            memberSince: P.firstOpened,
            daySecs: P.daySecs,
            streaks: { current: currentStreak(), longest: longestStreak(), activeDays: days.length },
            mostPlayed: mostPlayed,
            top5: top5,
            recently: recently,
            mostSkipped: mostSkipped,
            completionRate: completionRate,
            distribution: distribution,
            carRows: carRows,
            favCar: favCar,
            history: P.history,
            achievements: achievements,
            wrapped: wrapped(),
            sports: sportsMetrics(),
            live: liveSession()
          };
        }

        function getStats() {
          if (statsCache && statsCache.__day !== todayStr()) statsDirty = true;
          if (!statsCache || statsDirty) {
            statsCache = computeStats();
            statsCache.__day = todayStr();
            statsDirty = false;
          }
          statsCache.live = liveSession();
          return statsCache;
        }

        window.RDProfile = {
          record: record,
          onPause: onPause,
          getStats: getStats,
          addListener: fn => { listeners.add(fn); },
          profiles: {
            get: getProfile,
            all: () => PF.profiles.slice(),
            setCurrent: setCurrentProfile,
            update: updateProfile,
            avatarGradients: AVATAR_GRADIENTS,
            addListener: fn => { profileListeners.add(fn); }
          }
        };
      })();