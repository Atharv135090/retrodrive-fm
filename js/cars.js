      function setCarImageSrc(img, car, swapping) {
        if (!img || !car) return;
        if (swapping) img.classList.add('swapping');
        const finish = () => img.classList.remove('swapping');
        if (car.scene800 && car.scene1200 && car.scene1920) {
          img.srcset = `${car.scene800} 800w, ${car.scene1200} 1200w, ${car.scene1920} 1920w`;
          img.sizes = '100vw';
        }
        img.src = isMobileView()
          ? car.scene800 || car.scene1920 || car.src
          : car.scene1920 || car.src;
        img.onload = finish;
        window.setTimeout(finish, 300);
      }

      function getSelectedCar() {
        const found = appState.selectedCar ? CAR_OPTIONS.find(car => car.id === appState.selectedCar) : null;
        if (found) return found;
        // V1 hero: the Land Rover Defender across every layout.
        return CAR_OPTIONS.find(car => car.id === 'defender') || CAR_OPTIONS[0];
      }

      // Cars available in the selector sheet on all viewports.
      const MOBILE_SHEET_CARS = ['bmw', 'rollsroyce', 'gwagon', 'fortuner', 'creta'];
      const DESKTOP_SHEET_CARS = ['bmw', 'rollsroyce', 'gwagon', 'fortuner', 'creta'];

      function renderCarSelector() {
        const list = $('car-selector-list');
        if (!list) return;
        list.innerHTML = '';
        const effective = appState.selectedCar || 'bmw';
        const cars = CAR_OPTIONS.filter(car => car.id !== 'defender');
        cars.forEach(car => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'car-option' + (car.id === effective ? ' active-car' : '');
          item.dataset.car = car.id;
          item.innerHTML = `<img src="${car.src}" alt="" loading="lazy" decoding="async"><span>${escapeHtml(car.name)}</span>`;
          item.onclick = evt => {
            evt.stopPropagation();
            selectCar(car.id);
          };
          list.appendChild(item);
        });
      }

      function applyMobilePortrait(car) {
        if (car && car.id) {
          document.body.dataset.selectedCar = car.id;
        }
      }

      function selectCar(carId, options = {}) {
        const car = CAR_OPTIONS.find(entry => entry.id === carId);
        const backdrop = $('hero-backdrop');
        const heroImg = $('mobile-car-hero-img');
        const isMobile = isMobileView();

        if (!backdrop || !car) return;

        const newScene = isMobile
          ? (car.portrait || car.scene800 || car.scene1920 || 'assets/cinematic-defender-hero.png')
          : (car.scene1920 || 'assets/cinematic-defender-hero.png');
        const oldScene = appState.selectedCar
          ? (isMobile
              ? (CAR_OPTIONS.find(c => c.id === appState.selectedCar)?.portrait || 'assets/cinematic-defender-hero.png')
              : (CAR_OPTIONS.find(c => c.id === appState.selectedCar)?.scene1920 || 'assets/cinematic-defender-hero.png'))
          : (isMobile ? 'assets/cinematic-defender-hero.png' : 'assets/cinematic-defender-hero.png');

        if (backdrop && car && oldScene !== newScene && !options.instant) {
          const originalTransition = backdrop.style.transition;
          backdrop.style.transition = 'opacity 180ms ease';
          backdrop.style.opacity = '0';

          setTimeout(() => {
            if (isMobile) {
              backdrop.style.setProperty('--hero-img', `url("../${newScene}")`);
              backdrop.style.setProperty('--mobile-bg', `url("../${newScene}")`);
              document.documentElement.style.setProperty('--hero-img', `url("../${newScene}")`);
              document.documentElement.style.setProperty('--mobile-bg', `url("../${newScene}")`);
              if (heroImg) heroImg.src = newScene;
              applyMobilePortrait(car);
            } else {
              backdrop.style.setProperty('--car-bg', `url("../${newScene}")`);
            }

            backdrop.style.opacity = '1';

            setTimeout(() => {
              backdrop.style.transition = originalTransition;
            }, 180);
          }, 180);
        } else if (backdrop && car) {
          if (isMobile) {
            backdrop.style.setProperty('--hero-img', `url("../${newScene}")`);
            backdrop.style.setProperty('--mobile-bg', `url("../${newScene}")`);
            document.documentElement.style.setProperty('--hero-img', `url("../${newScene}")`);
            document.documentElement.style.setProperty('--mobile-bg', `url("../${newScene}")`);
            if (heroImg) heroImg.src = newScene;
            applyMobilePortrait(car);
          } else {
            backdrop.setProperty('--car-bg', `url("../${newScene}")`);
          }
        }

        appState.selectedCar = car.id;
        window.RDTrack('car_selected', { car_name: car.name, car_id: car.id });
        try { localStorage.setItem('retrodrive_car', car.id); } catch (e) { }

        const vehicleStage = document.getElementById('vehicle-stage');
        const selectedCarImg = document.getElementById('selected-car-img');

        if (vehicleStage) {
          vehicleStage.style.display = 'none';
        }
        if (selectedCarImg) {
          selectedCarImg.style.display = 'none';
        }

        renderCarSelector();
        if (options.closePopup !== false) closeCarSelector();
      }

      function preloadCars() {
        window.setTimeout(() => {
          // Only warm up the currently selected car's scene (the Defender hero
          // is already preloaded). On phones the composed portrait artwork is
          // warmed instead; all other cutouts load lazily on open.
          const selected = getSelectedCar();
          const src = isMobileView()
            ? (selected && (selected.portrait || selected.scene800))
            : (selected && selected.scene1920);
          if (src && selected.id !== 'defender') {
            const img = new Image();
            img.decoding = 'async';
            img.src = src;
          }
        }, 700);
      }

      function positionCarSelectorPopup() {
        const popup = $('car-selector-popup');
        if (!popup) return;

        if (window.innerWidth <= 768) {
          // Mobile uses the anchored bottom-sheet styles; clear any inline
          // positioning left over from resize between layouts.
          popup.style.position = '';
          popup.style.top = '';
          popup.style.right = '';
          popup.style.left = '';
          popup.style.width = '';
          popup.style.maxHeight = '';
          return;
        }

        popup.style.position = '';
        popup.style.top = '';
        popup.style.right = '';
        popup.style.left = '';
        popup.style.maxHeight = '';
      }

      function toggleCarSelector(evt) {
        if (evt) {
          evt.stopPropagation();
          window.__carBtnEl = evt.currentTarget;
        }
        if (isMobileView()) {
          showToast('ðŸ’» For the full 6-car selection experience, open <b>RetroDrive</b> on a Laptop or Desktop screen!');
          return;
        }
        const popup = $('car-selector-popup');
        if (!popup) return;
        renderCarSelector();
        popup.classList.toggle('open');
        if (popup.classList.contains('open')) {
          positionCarSelectorPopup();
        }
      }

      function closeCarSelector() {
        const popup = $('car-selector-popup');
        if (popup) popup.classList.remove('open');
      }

      function confirmCarSelection() {
        closeCarSelector();
      }

      document.addEventListener('click', evt => {
        const popup = $('car-selector-popup');
        if (!popup || !popup.classList.contains('open')) return;
        const btn = evt.target.closest ? evt.target.closest('.car-selector-btn') : null;
        if (popup.contains(evt.target) || btn) return;
        closeCarSelector();
      });

      window.addEventListener('resize', () => {
        const popup = $('car-selector-popup');
        if (popup && popup.classList.contains('open')) {
          positionCarSelectorPopup();
        }
      });