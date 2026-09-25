(() => {
  'use strict';

  function init() {
    const get = id => document.getElementById(id);
    const hero = get('hero-video');
    const heroButton = get('hero-pause');
    const heroProgress = get('hero-progress');
    const dialog = get('film-dialog');
    const film = get('film-video');
    const filmTitle = get('film-title');
    const filmClose = get('film-close');
    const menuButton = get('menu-toggle');
    const nav = get('site-nav');
    const sound = get('sound-audio');
    const soundButton = get('sound-play');
    const soundProgress = get('sound-progress');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let status = get('hero-status');
    let soundStatus = get('sound-status');
    let filmStatus = null;

    if (!status) {
      status = document.createElement('span');
      status.id = 'hero-status';
      document.body.append(status);
    }
    status.classList.remove('sr-only');
    status.classList.add('media-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    if (sound && !soundStatus) {
      soundStatus = document.createElement('span');
      soundStatus.id = 'sound-status';
      if (soundButton) soundButton.insertAdjacentElement('afterend', soundStatus);
      else document.body.append(soundStatus);
    }
    if (soundStatus) {
      soundStatus.classList.remove('sr-only');
      soundStatus.classList.add('media-status');
      soundStatus.setAttribute('role', 'status');
      soundStatus.setAttribute('aria-live', 'polite');
      soundStatus.setAttribute('aria-atomic', 'true');
    }

    function announce(message, channel = 'hero') {
      const liveRegion = channel === 'sound' && soundStatus ? soundStatus
        : channel === 'film' && filmStatus ? filmStatus : status;
      liveRegion.textContent = message;
    }
    function label(button, text, accessibleText) {
      if (!button) return;
      const node = button.querySelector('.button-label');
      if (node) node.textContent = text;
      button.setAttribute('aria-label', accessibleText || text);
    }
    function updateProgress(media, progress) {
      if (!media || !progress) return;
      const duration = media.duration;
      progress.max = 100;
      progress.value = Number.isFinite(duration) && duration > 0
        ? Math.max(0, Math.min(100, media.currentTime / duration * 100)) : 0;
    }
    function connectProgress(media, progress, name) {
      if (!media || !progress) return;
      progress.setAttribute('aria-label', name);
      for (const event of ['timeupdate', 'loadedmetadata', 'durationchange', 'emptied', 'ended']) {
        media.addEventListener(event, () => updateProgress(media, progress));
      }
      updateProgress(media, progress);
    }

    let heroIntent = !reducedMotion.matches;
    let heroExplicitChoice = false;
    let heroVisible = true;
    let heroPending = false;
    let heroErrorAnnounced = false;
    let filmActive = false;
    let filmTrigger = null;
    let resumeHeroAfterFilm = false;
    let filmRun = 0;
    let soundIntent = false;
    let soundRun = 0;

    function heroAllowed() {
      return heroIntent && heroVisible && !document.hidden && !filmActive;
    }
    function updateHeroButton() {
      if (!hero || !heroButton) return;
      const playing = !hero.paused && !hero.ended;
      heroButton.setAttribute('aria-pressed', String(playing));
      heroButton.dataset.state = playing ? 'playing' : 'paused';
      label(heroButton, playing ? '일시정지' : '재생', playing ? '배경 영상 일시정지' : '배경 영상 재생');
    }
    async function syncHero(explicit = false) {
      if (!hero) return;
      if (!heroAllowed()) {
        hero.pause();
        updateHeroButton();
        return;
      }
      if (!hero.paused || heroPending) return;
      heroPending = true;
      try {
        await hero.play();
        announce('');
        heroErrorAnnounced = false;
        if (!heroAllowed()) hero.pause();
      } catch (error) {
        if (error.name !== 'AbortError' && (explicit || !heroErrorAnnounced)) {
          heroErrorAnnounced = true;
          announce(error.name === 'NotAllowedError'
            ? '배경 영상 재생 버튼을 눌러 영상을 시작할 수 있어요.'
            : '배경 영상을 재생하지 못했어요. 재생 버튼으로 다시 시도해주세요.');
        }
      } finally {
        heroPending = false;
        updateHeroButton();
      }
    }

    if (hero) {
      // Start playback only through the visibility and motion-preference checks.
      hero.autoplay = false;
      hero.removeAttribute('autoplay');
      hero.muted = true;
      hero.playsInline = true;
      hero.loop = true;
      if (!heroIntent) hero.pause();
      for (const event of ['play', 'pause', 'ended']) hero.addEventListener(event, updateHeroButton);
      hero.addEventListener('playing', () => { announce(''); heroErrorAnnounced = false; });
      hero.addEventListener('error', () => announce('배경 영상을 불러오지 못했어요.'));
      heroButton?.addEventListener('click', () => {
        heroExplicitChoice = true;
        heroIntent = !(heroPending && heroIntent) && (hero.paused || hero.ended);
        if (heroIntent && hero.ended) hero.currentTime = 0;
        syncHero(true);
      });
      document.addEventListener('visibilitychange', () => syncHero());
      if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => {
          heroVisible = entries.some(entry => entry.target === hero && entry.isIntersecting);
          syncHero();
        }, { threshold: 0 });
        observer.observe(hero);
      }
      const motionChanged = () => {
        if (heroExplicitChoice) return;
        heroIntent = !reducedMotion.matches;
        syncHero();
      };
      if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', motionChanged);
      else reducedMotion.addListener(motionChanged);
      connectProgress(hero, heroProgress, '배경 영상 재생 위치');
      updateHeroButton();
      syncHero();
    }

    function updateSoundButton() {
      if (!sound || !soundButton) return;
      const playing = !sound.paused && !sound.ended;
      soundButton.setAttribute('aria-pressed', String(playing));
      soundButton.dataset.state = playing ? 'playing' : 'paused';
      label(soundButton, playing ? '일시정지' : '소리 듣기', playing ? '사운드트랙 일시정지' : '사운드트랙 소리 듣기');
    }
    function pauseSound() {
      soundIntent = false;
      soundRun += 1;
      if (sound) sound.pause();
      updateSoundButton();
    }
    if (sound && soundButton) {
      sound.autoplay = false;
      sound.removeAttribute('autoplay');
      soundButton.addEventListener('click', async () => {
        if (soundIntent || !sound.paused) {
          pauseSound();
          return;
        }
        soundIntent = true;
        const run = ++soundRun;
        if (sound.ended) sound.currentTime = 0;
        try {
          await sound.play();
          if (run === soundRun) announce('', 'sound');
          if (run === soundRun && (!soundIntent || filmActive)) sound.pause();
        } catch (error) {
          if (run === soundRun) {
            soundIntent = false;
            if (error.name !== 'AbortError') announce('사운드트랙을 재생하지 못했어요. 소리 듣기 버튼으로 다시 시도해주세요.', 'sound');
          }
        } finally {
          updateSoundButton();
        }
      });
      sound.addEventListener('play', updateSoundButton);
      sound.addEventListener('playing', () => announce('', 'sound'));
      sound.addEventListener('pause', updateSoundButton);
      sound.addEventListener('ended', () => { soundIntent = false; updateSoundButton(); });
      sound.addEventListener('error', () => {
        soundIntent = false;
        updateSoundButton();
        announce('사운드트랙 파일을 불러오지 못했어요.', 'sound');
      });
      connectProgress(sound, soundProgress, '사운드트랙 재생 위치');
      updateSoundButton();
    }

    function finishFilm() {
      if (!filmActive) return;
      filmActive = false;
      filmRun += 1;
      film.pause();
      film.removeAttribute('src');
      film.removeAttribute('poster');
      film.load();
      const trigger = filmTrigger;
      filmTrigger = null;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      if (resumeHeroAfterFilm) syncHero();
      resumeHeroAfterFilm = false;
    }
    function closeFilm() {
      if (dialog?.open) dialog.close();
      finishFilm();
    }
    if (dialog && film) {
      dialog.setAttribute('aria-modal', 'true');
      if (filmTitle) dialog.setAttribute('aria-labelledby', filmTitle.id);
      filmStatus = document.createElement('span');
      filmStatus.className = 'film-status';
      filmStatus.setAttribute('role', 'status');
      filmStatus.setAttribute('aria-live', 'polite');
      filmStatus.setAttribute('aria-atomic', 'true');
      dialog.append(filmStatus);
      filmClose?.addEventListener('click', closeFilm);
      dialog.addEventListener('cancel', event => { event.preventDefault(); closeFilm(); });
      dialog.addEventListener('close', () => { if (!dialog.open) finishFilm(); });
      dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeFilm();
      });
      film.addEventListener('error', () => {
        if (filmActive) announce('작품 영상을 불러오지 못했어요. 창을 닫고 다시 선택해주세요.', 'film');
      });
      film.addEventListener('playing', () => announce('', 'film'));
      document.querySelectorAll('[data-film]').forEach(trigger => {
        trigger.setAttribute('aria-haspopup', 'dialog');
        trigger.setAttribute('aria-controls', dialog.id);
        trigger.addEventListener('click', async event => {
          event.preventDefault();
          const source = trigger.dataset.film;
          if (!source) return;
          if (filmActive) closeFilm();
          filmTrigger = trigger;
          resumeHeroAfterFilm = Boolean(hero && !hero.paused && !hero.ended);
          filmActive = true;
          const run = ++filmRun;
          if (hero) hero.pause();
          pauseSound();
          if (filmTitle) filmTitle.textContent = trigger.dataset.title || '작품 영상';
          announce('', 'film');
          film.src = source;
          if (trigger.dataset.poster) film.poster = trigger.dataset.poster;
          else film.removeAttribute('poster');
          film.load();
          try {
            dialog.showModal();
            filmClose?.focus({ preventScroll: true });
          } catch (error) {
            finishFilm();
            announce('영상 창을 열지 못했어요. 다시 선택해주세요.');
            return;
          }
          try {
            await film.play();
            if (run === filmRun) announce('', 'film');
            if (run === filmRun && !filmActive) film.pause();
          } catch (error) {
            if (filmActive && run === filmRun && error.name !== 'AbortError') announce('영상의 재생 버튼을 눌러 작품을 시작해주세요.', 'film');
          }
        });
      });
    }

    if (menuButton && nav) {
      function setMenu(open, restoreFocus = false) {
        nav.classList.toggle('is-open', open);
        menuButton.setAttribute('aria-expanded', String(open));
        menuButton.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
        if (open) (nav.querySelector('a') || menuButton).focus({ preventScroll: true });
        else if (restoreFocus) menuButton.focus({ preventScroll: true });
      }
      menuButton.setAttribute('aria-controls', nav.id);
      setMenu(false);
      menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
      nav.querySelectorAll('a').forEach(anchor => anchor.addEventListener('click', event => {
        setMenu(false);
        let section = null;
        const opensElsewhere = anchor.target === '_blank' || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
        if (!opensElsewhere) {
          try {
            const destination = new URL(anchor.href, window.location.href);
            const here = window.location;
            if (destination.origin === here.origin && destination.pathname === here.pathname && destination.search === here.search && destination.hash) {
              section = get(decodeURIComponent(destination.hash.slice(1)));
            }
          } catch (error) { /* A non-document link returns focus to its menu control. */ }
        }
        if (section) {
          if (!section.hasAttribute('tabindex')) section.setAttribute('tabindex', '-1');
          section.focus({ preventScroll: true });
        } else menuButton.focus({ preventScroll: true });
      }));
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true' && !filmActive) {
          event.preventDefault();
          setMenu(false, true);
        }
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
