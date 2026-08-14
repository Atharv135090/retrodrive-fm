      function toggleFullscreen() {
        const root = document.documentElement;
        const isFS = !!(
          document.fullscreenElement ||
          document.webkitFullscreenElement ||
          document.mozFullScreenElement ||
          document.msFullscreenElement
        );
        if (typeof closePlayerMenu === 'function') closePlayerMenu();
        window.RDTrack('fullscreen_used', { action: isFS ? 'exit' : 'enter' });

        if (!isFS) {
          const req = root.requestFullscreen || root.webkitRequestFullscreen || root.mozRequestFullScreen || root.msRequestFullscreen;
          if (req) {
            try {
              const p = req.call(root);
              if (p && p.catch) p.catch(() => { });
            } catch (e) { }
          }
          root.classList.add('mobile-fullscreen');
          document.body.classList.add('mobile-fullscreen');
        } else {
          const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
          if (exit) {
            try {
              const p = exit.call(document);
              if (p && p.catch) p.catch(() => { });
            } catch (e) { }
          }
          root.classList.remove('mobile-fullscreen');
          document.body.classList.remove('mobile-fullscreen');
        }
      }

      ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(evtName => {
        document.addEventListener(evtName, () => {
          const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
          if (isFS) {
            document.documentElement.classList.add('mobile-fullscreen');
            document.body.classList.add('mobile-fullscreen');
          } else if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            document.documentElement.classList.remove('mobile-fullscreen');
            document.body.classList.remove('mobile-fullscreen');
          }
        });
      });