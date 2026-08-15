// ==================== ANALYTICS EVENT TRACKER ====================
      // Fire-and-forget event helper used by the player, playlist, car,
      // fullscreen, and wake-lock modules. Every event still feeds the local
      // drive profile (RDProfile) and Google Analytics 4 (gtag), and is also
      // forwarded to the Supabase visitor_events table (window.RDSupa) with
      // the legacy GA4 event names mapped onto the Supabase event vocabulary.
      // Completely inert if nothing is configured, and never throws or slows
      // down any interaction.
      window.RD_GA_ID = 'G-3RVC4DVHZZ';

      const SUPA_EVENT_MAP = {
        song_started: 'song_play'
      };

      window.RDTrack = function (eventName, params) {
        try {
          if (window.RDProfile) window.RDProfile.record(eventName, params || {});
          if (window.RDSupa && window.RDSupa.track) {
            window.RDSupa.track(SUPA_EVENT_MAP[eventName] || eventName, params || {});
          }
        } catch (e) { }
        try {
          if (!window.gtag || !window.RD_GA_ID || !/^G-[A-Z0-9]+$/.test(window.RD_GA_ID)) return;
          const payload = params || {};
          payload.event_time = Date.now();
          window.gtag('event', eventName, payload);
        } catch (e) { }
      };