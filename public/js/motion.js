(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover:hover) and (pointer:fine)');
  const LIBS = {
    gsap: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.13.0/gsap.min.js',
    scrollTrigger: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.13.0/ScrollTrigger.min.js',
    lenis: 'https://unpkg.com/lenis@1.3.23/dist/lenis.min.js',
    lenisCss: 'https://unpkg.com/lenis@1.3.23/dist/lenis.css'
  };

  let lenis = null;
  let manualActiveId = null;
  let manualActiveUntil = 0;
  let navRaf = 0;
  let headerHeight = 72;
  let enhancedMotionInitialized = false;
  let lenisInitialized = false;
  let navTracker = null;
  let lastActiveId = null;
  let trackerRaf = 0;
  let navigationRaf = 0;
  let navigationToken = 0;
  let navigationInFlight = false;

  const gsapReady = () => Boolean(window.gsap);
  const scrollTriggerReady = () => Boolean(window.gsap && window.ScrollTrigger);

  function loadStyle(href) {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = href; link.media = 'print';
    link.onload = () => { link.media = 'all'; };
    document.head.appendChild(link);
  }

  function loadScript(src, test, timeout = 2200) {
    if (test()) return Promise.resolve(true);
    return new Promise(resolve => {
      const script = document.createElement('script');
      let settled = false;
      const finish = ok => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ok);
      };
      const timer = setTimeout(() => { script.remove(); finish(false); }, timeout);
      script.src = src; script.async = true;
      script.onload = () => finish(test());
      script.onerror = () => finish(false);
      document.head.appendChild(script);
    });
  }

  async function loadMotionLibraries() {
    if (reduceMotion.matches) return;
    loadStyle(LIBS.lenisCss);
    const [gsapOk, lenisOk] = await Promise.all([
      loadScript(LIBS.gsap, () => Boolean(window.gsap)),
      loadScript(LIBS.lenis, () => Boolean(window.Lenis))
    ]);
    if (gsapOk) await loadScript(LIBS.scrollTrigger, () => Boolean(window.ScrollTrigger), 1800);
    if (lenisOk) initLenis();
    if (gsapOk) initEnhancedMotion();
  }

  const navLinks = () => [...document.querySelectorAll('.nav-link[href^="#"], .drawer-links a[href^="#"]')];
  const uniqueNavTargets = () => {
    const seen = new Set();
    return navLinks().map(link => link.getAttribute('href').slice(1)).filter(id => {
      if (!id || seen.has(id) || !document.getElementById(id)) return false;
      seen.add(id); return true;
    }).map(id => document.getElementById(id)).sort((a, b) => a.offsetTop - b.offsetTop);
  };

  function updateHeaderHeight() {
    headerHeight = Math.ceil(document.querySelector('.nav')?.getBoundingClientRect().height || 72);
    root.style.setProperty('--nav-height', `${headerHeight}px`);
  }

  function updateNavTracker(id = lastActiveId) {
    const nav = document.querySelector('.nav-links');
    if (!nav || !navTracker || !id || window.innerWidth <= 1024) return;
    const active = nav.querySelector(`.nav-link[href="#${CSS.escape(id)}"]`);
    if (!active) return;
    const navRect = nav.getBoundingClientRect();
    const linkRect = active.getBoundingClientRect();
    const x = Math.round((linkRect.left - navRect.left) * 10) / 10;
    const width = Math.max(18, Math.round(linkRect.width * 10) / 10);
    navTracker.style.setProperty('--track-x', `${x}px`);
    navTracker.style.setProperty('--track-w', width);
    navTracker.classList.add('is-ready');
  }

  function scheduleNavTracker(id = lastActiveId) {
    if (trackerRaf) cancelAnimationFrame(trackerRaf);
    trackerRaf = requestAnimationFrame(() => {
      trackerRaf = 0;
      updateNavTracker(id);
    });
  }

  function initNavTracker() {
    const nav = document.querySelector('.nav-links');
    if (!nav || nav.querySelector('.nav-active-track')) return;
    navTracker = document.createElement('span');
    navTracker.className = 'nav-active-track';
    navTracker.setAttribute('aria-hidden', 'true');
    nav.appendChild(navTracker);
    scheduleNavTracker(document.querySelector('.nav-link.active')?.getAttribute('href')?.slice(1) || 'home');

    const languageObserver = new MutationObserver(() => scheduleNavTracker());
    languageObserver.observe(root, { attributes: true, attributeFilter: ['lang', 'dir'] });
  }

  function setActiveNav(id) {
    if (!id) return;
    if (lastActiveId !== id) {
      lastActiveId = id;
      navLinks().forEach(link => {
        const active = link.getAttribute('href') === `#${id}`;
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
    }
    scheduleNavTracker(id);
  }

  function computeActiveSection(scrollYValue = window.scrollY) {
    if (manualActiveId && performance.now() < manualActiveUntil) return manualActiveId;
    if (manualActiveId && performance.now() >= manualActiveUntil) manualActiveId = null;
    const sections = uniqueNavTargets();
    if (!sections.length) return null;
    const marker = scrollYValue + headerHeight + Math.min(window.innerHeight * 0.18, 170);
    let current = sections[0];
    for (const section of sections) {
      if (section.offsetTop <= marker) current = section;
      else break;
    }
    return current?.id || null;
  }

  function updateScrollUi(scrollYValue = window.scrollY) {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    root.style.setProperty('--scroll-progress', `${Math.min(100, Math.max(0, scrollYValue / max * 100))}%`);
    setActiveNav(computeActiveSection(scrollYValue));
  }

  function scheduleScrollUi() {
    if (navRaf) return;
    navRaf = requestAnimationFrame(() => { navRaf = 0; updateScrollUi(window.scrollY); });
  }

  function initLenis() {
    if (lenisInitialized || reduceMotion.matches || !finePointer.matches || window.innerWidth <= 900 || !window.Lenis) return;
    lenisInitialized = true;
    lenis = new window.Lenis({
      duration: 1.0,
      easing: t => 1 - Math.pow(1 - t, 4),
      smoothWheel: true,
      syncTouch: false,
      wheelMultiplier: 0.92,
      touchMultiplier: 1
    });
    if (scrollTriggerReady()) {
      window.gsap.registerPlugin(window.ScrollTrigger);
      lenis.on('scroll', window.ScrollTrigger.update);
    }
    lenis.on('scroll', event => updateScrollUi(event.animatedScroll ?? event.scroll ?? window.scrollY));
    if (gsapReady()) {
      window.gsap.ticker.add(time => lenis?.raf(time * 1000));
      window.gsap.ticker.lagSmoothing(0);
    } else {
      const loop = time => { if (lenis) { lenis.raf(time); requestAnimationFrame(loop); } };
      requestAnimationFrame(loop);
    }
  }

  function navigationDestination(target) {
    updateHeaderHeight();
    const raw = target.getBoundingClientRect().top + window.scrollY - headerHeight - 8;
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    return Math.max(0, Math.min(max, raw));
  }

  function navigationDuration(target) {
    if (!target) return .72;
    const distance = Math.abs(navigationDestination(target) - window.scrollY);
    return Math.min(.9, Math.max(.62, .62 + distance / 5200));
  }

  function navigationEase(t) {
    return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function finishNavigation(target, token) {
    if (token !== navigationToken) return;
    navigationInFlight = false;
    root.classList.remove('nav-gliding');
    navigationRaf = 0;
    manualActiveUntil = performance.now() + 180;
    setActiveNav(target?.id || manualActiveId);
    updateScrollUi(window.scrollY);
    if (scrollTriggerReady()) window.ScrollTrigger.update();
  }

  function cancelNavigation(reason = 'replace') {
    const wasInFlight = navigationInFlight;
    navigationToken += 1;
    if (navigationRaf) cancelAnimationFrame(navigationRaf);
    if (wasInFlight && lenis) lenis.scrollTo(window.scrollY, { immediate: true, force: true });
    navigationRaf = 0;
    navigationInFlight = false;
    root.classList.remove('nav-gliding');
    if (reason === 'user') {
      manualActiveId = null;
      manualActiveUntil = 0;
      scheduleScrollUi();
    }
  }

  function fallbackNavigationTween(target, duration, immediate = false) {
    cancelNavigation('replace');
    const token = ++navigationToken;
    const destination = navigationDestination(target);
    const start = window.scrollY;
    const delta = destination - start;

    if (immediate || reduceMotion.matches || Math.abs(delta) < 2) {
      window.scrollTo({ top: destination, behavior: 'auto' });
      finishNavigation(target, token);
      return 0;
    }

    navigationInFlight = true;
    root.classList.add('nav-gliding');
    const started = performance.now();
    const total = Math.max(1, duration * 1000);

    const frame = now => {
      if (token !== navigationToken) return;
      const progress = Math.min(1, (now - started) / total);
      const y = start + delta * navigationEase(progress);
      window.scrollTo({ top: y, behavior: 'auto' });
      updateScrollUi(y);
      if (progress < 1) navigationRaf = requestAnimationFrame(frame);
      else {
        window.scrollTo({ top: destination, behavior: 'auto' });
        finishNavigation(target, token);
      }
    };
    navigationRaf = requestAnimationFrame(frame);
    return duration;
  }

  function scrollToTarget(target, immediate = false) {
    if (!target) return 0;
    const duration = immediate || reduceMotion.matches ? 0 : navigationDuration(target);

    if (lenis && !reduceMotion.matches && !immediate) {
      cancelNavigation('replace');
      const token = ++navigationToken;
      navigationInFlight = true;
      root.classList.add('nav-gliding');
      lenis.scrollTo(navigationDestination(target), {
        immediate: false,
        duration,
        easing: navigationEase,
        onComplete: () => finishNavigation(target, token)
      });
      return duration;
    }

    return fallbackNavigationTween(target, duration, immediate);
  }

  function initNavigationInterrupts() {
    const interrupt = () => { if (navigationInFlight) cancelNavigation('user'); };
    window.addEventListener('wheel', interrupt, { passive: true });
    window.addEventListener('touchstart', interrupt, { passive: true });
    window.addEventListener('pointerdown', interrupt, { passive: true });
    window.addEventListener('keydown', event => {
      if (!navigationInFlight) return;
      if (['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)) interrupt();
    });
  }

  function initAnchorNavigation() {
    document.addEventListener('click', event => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || href === '#') return;
      const target = document.querySelector(href);
      if (!target) return;
      event.preventDefault();
      const id = href.slice(1);
      manualActiveId = id;
      setActiveNav(id);
      const beginNavigation = () => {
        const duration = scrollToTarget(target, false);
        manualActiveUntil = performance.now() + Math.max(700, duration * 1000 + 180);
      };
      if (link.closest('.mobile-drawer') && window.innerWidth <= 1024 && !reduceMotion.matches)
        window.setTimeout(beginNavigation, 110);
      else beginNavigation();
      if (location.hash !== href) history.pushState({ section: id }, '', href);
    });

    window.addEventListener('popstate', () => {
      const id = location.hash.slice(1) || 'home';
      const target = document.getElementById(id);
      if (!target) return;
      manualActiveId = id;
      manualActiveUntil = performance.now() + 850;
      setActiveNav(id);
      scrollToTarget(target, false);
    });
  }

  function initRevealCadence() {
    ['.cap-grid', '.projects-track', '.process-line', '.packages-grid', '.team-grid'].forEach(selector => {
      document.querySelectorAll(selector).forEach(group => {
        [...group.querySelectorAll('.reveal')].forEach((el, index) => el.style.setProperty('--reveal-delay', `${Math.min(index * 48, 190)}ms`));
      });
    });
  }

  function initHeroMotion() {
    if (!gsapReady() || reduceMotion.matches) return;
    const g = window.gsap;
    const hero = document.querySelector('.hero');
    const art = document.querySelector('.hero-art');
    const mark = document.querySelector('.hero-mark');
    if (!hero || !art || !mark) return;

    if (!finePointer.matches || window.innerWidth <= 900) return;
    const floatTween = g.to(mark, { y: -6, duration: 3.8, ease: 'sine.inOut', yoyo: true, repeat: -1, paused: true });
    if (scrollTriggerReady()) {
      window.ScrollTrigger.create({
        trigger: hero, start: 'top bottom', end: 'bottom top',
        onEnter: () => floatTween.play(), onEnterBack: () => floatTween.play(),
        onLeave: () => floatTween.pause(), onLeaveBack: () => floatTween.pause()
      });
    } else floatTween.play();

    const xTo = g.quickTo(mark, 'x', { duration: .45, ease: 'power3.out' });
    const rTo = g.quickTo(mark, 'rotationZ', { duration: .55, ease: 'power3.out' });
    let rect = null;
    art.addEventListener('pointerenter', () => { rect = art.getBoundingClientRect(); }, { passive: true });
    art.addEventListener('pointermove', event => {
      rect ||= art.getBoundingClientRect();
      const normalized = ((event.clientX - rect.left) / rect.width - .5) * 2;
      xTo(normalized * 8); rTo(-2 + normalized * .75);
    }, { passive: true });
    art.addEventListener('pointerleave', () => { xTo(0); rTo(-2); rect = null; }, { passive: true });
  }

  function initProcessMotion() {
    const line = document.querySelector('.process-line');
    if (!line || window.innerWidth <= 620) return;
    if (scrollTriggerReady() && !reduceMotion.matches) {
      window.gsap.fromTo(line, { '--process-progress': 0 }, {
        '--process-progress': 1, ease: 'none',
        scrollTrigger: { trigger: line, start: 'top 78%', end: 'bottom 46%', scrub: .35 }
      });
    } else line.style.setProperty('--process-progress', 1);
  }

  function initFooterMotion() {
    if (!gsapReady() || reduceMotion.matches) return;
    const footer = document.querySelector('.footer');
    if (!footer || footer.dataset.motionReady === '1') return;
    footer.dataset.motionReady = '1';
    const items = footer.querySelectorAll('.footer-brand, .footer-nav, .footer-right');
    if (!items.length) return;
    const vars = { y: 14, opacity: 0 };
    const to = { y: 0, opacity: 1, duration: .52, stagger: .07, ease: 'power3.out', clearProps: 'transform' };
    if (scrollTriggerReady()) {
      to.scrollTrigger = { trigger: footer, start: 'top 92%', once: true };
      window.gsap.fromTo(items, vars, to);
    } else {
      window.gsap.fromTo(items, vars, to);
    }
  }

  function initEnhancedMotion() {
    if (enhancedMotionInitialized || !gsapReady()) return;
    enhancedMotionInitialized = true;
    if (scrollTriggerReady()) window.gsap.registerPlugin(window.ScrollTrigger);
    initHeroMotion();
    initProcessMotion();
    initFooterMotion();
    if (!lenisInitialized && window.Lenis) initLenis();
    if (scrollTriggerReady()) requestAnimationFrame(() => window.ScrollTrigger.refresh());
  }

  function refreshDynamicMotion() {
    initRevealCadence();
    if (scrollTriggerReady()) requestAnimationFrame(() => window.ScrollTrigger.refresh());
  }

  function initDynamicObserver() {
    if (!('MutationObserver' in window)) return;
    const targets = [document.querySelector('[data-projects]'), document.querySelector('[data-people]')].filter(Boolean);
    if (!targets.length) return;
    const observer = new MutationObserver(refreshDynamicMotion);
    targets.forEach(target => observer.observe(target, { childList: true }));
  }

  function initScrollSignals() {
    updateHeaderHeight(); updateScrollUi();
    window.addEventListener('scroll', scheduleScrollUi, { passive: true });
    window.addEventListener('resize', () => { updateHeaderHeight(); scheduleScrollUi(); scheduleNavTracker(); }, { passive: true });
  }

  function initHashPosition() {
    const id = location.hash.slice(1);
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setActiveNav(id); scrollToTarget(target, true);
    }));
  }

  function initBase() {
    initNavTracker();
    initNavigationInterrupts();
    initAnchorNavigation();
    initScrollSignals();
    initRevealCadence();
    initDynamicObserver();
    initHashPosition();
    loadMotionLibraries();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initBase, { once: true });
  else initBase();
})();
