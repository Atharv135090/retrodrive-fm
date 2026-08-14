// ==================== ANALYTICS EVENT TRACKER ====================
      // Fire-and-forget GA4 event helper used by the player, playlist,
      // car, fullscreen, and wake-lock modules. Completely inert until a
      // real GA4 Measurement ID is configured in index.html, and never
      // throws or slows down any interaction.
      window.RD_GA_ID = 'G-3RVC4DVHZZ';

      window.RDTrack = function (eventName, params) {
        try {
          if (!window.gtag || !window.RD_GA_ID || !/^G-[A-Z0-9]+$/.test(window.RD_GA_ID)) return;
          const payload = params || {};
          payload.event_time = Date.now();
          window.gtag('event', eventName, payload);
        } catch (e) { }
      };