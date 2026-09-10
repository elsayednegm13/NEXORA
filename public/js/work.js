(() => {
  const root = document.documentElement;
  root.classList.add('js');
  document.body?.classList.add('js');

  const savedLang = localStorage.getItem('nexora_lang');
  const savedTheme = localStorage.getItem('nexora_theme');
  const state = {
    lang: savedLang === 'ar' ? 'ar' : 'en',
    theme: ['light','dark','system'].includes(savedTheme) ? savedTheme : 'system',
    projects: []
  };

  function seedProjects(){
    const repo = window.NEXORA_REPOSITORIES?.projects;
    const raw = window.NEXORA_DATA?.projects || [];
    state.projects = repo?.normalizeProject ? raw.map(repo.normalizeProject) : raw;
  }

  const t = {
    en: {
      nav_home:'Home', nav_services:'Services', nav_work:'Work', nav_packages:'Packages', nav_about:'About', nav_contact:'Contact', start_project:'Start a Project', menu_label:'Menu', mobile_nav_kicker:'Explore', drawer_hint:'Choose a section or start your project.',
      work_eyebrow:'01 / WORK', work_title_1:'Digital work built', work_title_2:'for real businesses.', work_lead:'A growing collection of websites and digital products delivered across different business needs.', explore_projects:'Explore Projects', build_with_us:'Build With Us', live_projects:'Live Projects', featured_label:'Featured', archive_label:'Project Archive',
      featured_eyebrow:'02 / FEATURED', featured_title:'Selected work', featured_copy:'A closer look at four projects from the current NEXORA portfolio.', featured_badge:'Featured Project', live_badge:'Live Project', view_project:'View Project',
      archive_eyebrow:'03 / PROJECT INDEX', archive_title:'More projects', archive_count:'More live projects',
      next_eyebrow:'04 / YOUR PROJECT', next_title:'Your project can be next.', next_copy:'Tell us what you want to build. We’ll help turn the idea into a clear digital product.', view_services:'View Services',
      footer_copy:'Building a better digital tomorrow.', rights:'© 2026 NEXORA Technologies. All rights reserved.'
    },
    ar: {
      nav_home:'الرئيسية', nav_services:'الخدمات', nav_work:'الأعمال', nav_packages:'الباقات', nav_about:'من نحن', nav_contact:'تواصل', start_project:'ابدأ مشروعك', menu_label:'القائمة', mobile_nav_kicker:'استكشف', drawer_hint:'اختار القسم أو ابدأ مشروعك مباشرة.',
      work_eyebrow:'01 / الأعمال', work_title_1:'أعمال رقمية صُممت', work_title_2:'لأعمال حقيقية.', work_lead:'مجموعة متنامية من المواقع والمنتجات الرقمية المنفذة لاحتياجات أعمال مختلفة.', explore_projects:'استكشف المشاريع', build_with_us:'ابنِ معنا', live_projects:'مشروع مباشر', featured_label:'أعمال مختارة', archive_label:'أرشيف المشاريع',
      featured_eyebrow:'02 / أعمال مختارة', featured_title:'مشاريع مختارة', featured_copy:'نظرة أقرب على أربعة مشاريع من أعمال NEXORA الحالية.', featured_badge:'مشروع مختار', live_badge:'مشروع مباشر', view_project:'عرض المشروع',
      archive_eyebrow:'03 / فهرس المشاريع', archive_title:'مشاريع أخرى', archive_count:'مشاريع مباشرة أخرى',
      next_eyebrow:'04 / مشروعك', next_title:'مشروعك ممكن يكون التالي.', next_copy:'احكيلنا عايز تبني إيه، ونساعدك نحول الفكرة إلى منتج رقمي واضح.', view_services:'شاهد الخدمات',
      footer_copy:'نبني غدًا رقميًا أفضل.', rights:'© 2026 NEXORA Technologies. جميع الحقوق محفوظة.'
    }
  };

  function resolvedTheme(){
    if(state.theme !== 'system') return state.theme;
    return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function applyTheme(){
    const theme = resolvedTheme();
    root.dataset.theme = theme;
    document.querySelectorAll('[data-brand-logo]').forEach(img => {
      img.src = theme === 'dark' ? 'assets/brand/nexora-logo-dark.png' : 'assets/brand/nexora-logo-light.png';
    });
    const btn = document.querySelector('[data-theme-toggle]');
    if(btn) btn.textContent = state.theme === 'system' ? '◐' : (theme === 'dark' ? '☾' : '☀');
  }

  function cycleTheme(){
    state.theme = state.theme === 'system' ? 'dark' : state.theme === 'dark' ? 'light' : 'system';
    localStorage.setItem('nexora_theme',state.theme);
    applyTheme();
  }

  function projectName(project){
    return state.lang === 'ar' ? project.titleAr : project.titleEn;
  }

  function projectAlt(project){
    return state.lang === 'ar' ? project.titleEn : project.titleAr;
  }

  function detailUrl(project){
    return `project.html?slug=${encodeURIComponent(project.slug)}`;
  }

  function createImage(project,index){
    const img = document.createElement('img');
    img.src = project.image || '';
    img.alt = projectName(project);
    img.loading = index < 2 ? 'eager' : 'lazy';
    if(index < 2) img.fetchPriority = 'high';
    img.addEventListener('error',() => {
      const article = img.closest('article');
      article?.classList.add('image-failed');
      img.remove();
    },{once:true});
    return img;
  }

  function createFeaturedCard(project,index,lang){
    const article = document.createElement('article');
    article.className = 'featured-card reveal';
    const media = document.createElement('a'); media.className = 'featured-media'; media.href = detailUrl(project); media.setAttribute('aria-label',projectName(project)); media.appendChild(createImage(project,index));
    const content = document.createElement('div'); content.className = 'featured-content';
    const info = document.createElement('div');
    const meta = document.createElement('div'); meta.className = 'featured-meta';
    const idx = document.createElement('span'); idx.className = 'featured-index'; idx.textContent = `#${String(project.id).padStart(2,'0')}`;
    const dot = document.createElement('span'); dot.className = 'featured-dot';
    const live = document.createElement('span'); live.className = 'featured-live'; live.textContent = lang.featured_badge;
    meta.append(idx,dot,live);
    const h3 = document.createElement('h3'); h3.textContent = projectName(project);
    const alt = document.createElement('div'); alt.className = 'featured-alt'; alt.textContent = projectAlt(project);
    const domain = document.createElement('div'); domain.className = 'featured-domain'; domain.textContent = project.domain || '';
    info.append(meta,h3,alt,domain);
    const open = document.createElement('a'); open.className = 'project-open'; open.href = detailUrl(project); open.setAttribute('aria-label',`${lang.view_project}: ${projectName(project)}`); open.textContent = '↗';
    content.append(info,open); article.append(media,content); return article;
  }

  function createArchiveCard(project,index,lang){
    const article = document.createElement('article'); article.className = 'archive-card reveal';
    const media = document.createElement('a'); media.className = 'archive-media'; media.href = detailUrl(project); media.setAttribute('aria-label',projectName(project)); media.appendChild(createImage(project,index));
    const badge = document.createElement('span'); badge.className = 'archive-badge'; badge.textContent = lang.live_badge; media.appendChild(badge);
    const body = document.createElement('div'); body.className = 'archive-body';
    const head = document.createElement('div'); head.className = 'archive-head';
    const names = document.createElement('div'); const h3 = document.createElement('h3'); h3.textContent = projectName(project); const alt = document.createElement('div'); alt.className = 'archive-alt'; alt.textContent = projectAlt(project); names.append(h3,alt);
    const number = document.createElement('span'); number.textContent = `#${String(project.id).padStart(2,'0')}`; head.append(names,number);
    const domain = document.createElement('a'); domain.className = 'archive-domain'; domain.href = project.url || '#'; domain.target = '_blank'; domain.rel = 'noopener noreferrer';
    const strong = document.createElement('strong'); strong.textContent = project.domain || ''; const arrow = document.createElement('span'); arrow.textContent = '↗'; domain.append(strong,arrow);
    body.append(head,domain); article.append(media,body); return article;
  }

  function updateProjectCounts(featured,archive){
    const total = state.projects.length;
    const featuredCount = featured.length;
    const archiveCount = archive.length;
    document.querySelectorAll('[data-project-count]').forEach(el => { el.textContent = String(total).padStart(2,'0'); });
    document.querySelectorAll('[data-featured-range]').forEach(el => { el.textContent = featuredCount ? `01—${String(featuredCount).padStart(2,'0')}` : '—'; });
    document.querySelectorAll('[data-archive-range]').forEach(el => { el.textContent = archiveCount ? `${String(featuredCount + 1).padStart(2,'0')}—${String(total).padStart(2,'0')}` : '—'; });
    document.querySelectorAll('[data-archive-count]').forEach(el => { el.textContent = String(archiveCount).padStart(2,'0'); });
  }

  function renderProjects(){
    const projects = state.projects;
    const featured = projects.filter(project => project.featured).slice(0,4);
    const archive = projects.filter(project => !project.featured);
    const lang = t[state.lang];
    updateProjectCounts(featured,archive);

    const featuredRoot = document.querySelector('[data-featured-projects]');
    if(featuredRoot){ const fragment=document.createDocumentFragment(); featured.forEach((project,index)=>fragment.appendChild(createFeaturedCard(project,index,lang))); featuredRoot.replaceChildren(fragment); }

    const archiveRoot = document.querySelector('[data-archive-projects]');
    if(archiveRoot){ const fragment=document.createDocumentFragment(); archive.forEach((project,index)=>fragment.appendChild(createArchiveCard(project,index + featured.length,lang))); archiveRoot.replaceChildren(fragment); }
    applyRevealDelays(); observeReveals();
  }

  async function hydrateProjects(){
    const repo = window.NEXORA_REPOSITORIES?.projects;
    if(!repo) return;
    try { const projects = await repo.list(); if(Array.isArray(projects) && projects.length) state.projects = projects; }
    catch(error){ console.error('NEXORA work projects hydration error',error); }
    renderProjects();
  }

  function applyLanguage(){
    root.lang = state.lang;
    root.dir = state.lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const value = t[state.lang][el.dataset.i18n];
      if(value) el.textContent = value;
    });
    const btn = document.querySelector('[data-lang-toggle]');
    if(btn) btn.textContent = state.lang === 'en' ? 'AR' : 'EN';
    renderProjects();
    root.classList.remove('i18n-preload');
  }

  let observer;
  function observeReveals(){
    if(!('IntersectionObserver' in window)){
      document.querySelectorAll('.reveal').forEach(el => el.classList.add('is-visible'));
      return;
    }
    if(!observer){
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if(entry.isIntersecting){
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      }, {threshold:.08, rootMargin:'0px 0px -4% 0px'});
    }
    document.querySelectorAll('.reveal:not(.is-visible)').forEach(el => observer.observe(el));
  }

  function applyRevealDelays(){
    document.querySelectorAll('.featured-projects,.archive-projects').forEach(group => {
      [...group.querySelectorAll('.reveal')].forEach((el,index) => el.style.setProperty('--reveal-delay',`${Math.min((index % 4) * 54,162)}ms`));
    });
  }

  function toggleDrawer(force){
    const drawer = document.querySelector('.mobile-drawer');
    const toggle = document.querySelector('[data-menu-toggle]');
    if(!drawer) return;
    const open = typeof force === 'boolean' ? force : !drawer.classList.contains('is-open');
    drawer.classList.toggle('is-open',open);
    drawer.setAttribute('aria-hidden',String(!open));
    toggle?.setAttribute('aria-expanded',String(open));
    toggle?.classList.toggle('is-open',open);
    document.body.classList.toggle('menu-open',open);
    document.body.style.overflow = open ? 'hidden' : '';
    if(open) requestAnimationFrame(() => document.querySelector('[data-menu-close]')?.focus({preventScroll:true}));
  }

  function updateScroll(){
    const max = Math.max(1,document.documentElement.scrollHeight - innerHeight);
    root.style.setProperty('--scroll-progress',`${Math.min(100,Math.max(0,scrollY / max * 100))}%`);
    document.querySelector('.nav')?.classList.toggle('is-scrolled',scrollY > 16);
  }

  function initLocalAnchorScroll(){
    document.querySelectorAll('a[href^="#"]').forEach(link => {
      const href = link.getAttribute('href');
      if(!href || href === '#') return;
      link.addEventListener('click', event => {
        const target = document.querySelector(href);
        if(!target) return;
        event.preventDefault();
        const navHeight = document.querySelector('.nav')?.getBoundingClientRect().height || 72;
        const destination = Math.max(0,target.getBoundingClientRect().top + scrollY - navHeight - 10);
        if(matchMedia('(prefers-reduced-motion: reduce)').matches){
          scrollTo({top:destination,behavior:'auto'});
          return;
        }
        const start = scrollY;
        const delta = destination - start;
        const duration = Math.min(850,Math.max(560,Math.abs(delta) * .28));
        const started = performance.now();
        const ease = x => 1 - Math.pow(1 - x,4);
        const step = now => {
          const progress = Math.min(1,(now - started) / duration);
          scrollTo({top:start + delta * ease(progress),behavior:'auto'});
          if(progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    });
  }

  function init(){
    seedProjects();
    applyTheme();
    applyLanguage();
    hydrateProjects();
    observeReveals();
    updateScroll();
    initLocalAnchorScroll();

    document.querySelector('[data-theme-toggle]')?.addEventListener('click',cycleTheme);
    document.querySelector('[data-lang-toggle]')?.addEventListener('click',() => {
      state.lang = state.lang === 'en' ? 'ar' : 'en';
      localStorage.setItem('nexora_lang',state.lang);
      applyLanguage();
    });
    document.querySelector('[data-menu-toggle]')?.addEventListener('click',() => toggleDrawer());
    document.querySelector('.drawer-backdrop')?.addEventListener('click',() => toggleDrawer(false));
    document.querySelector('[data-menu-close]')?.addEventListener('click',() => toggleDrawer(false));
    document.querySelectorAll('.mobile-drawer a').forEach(link => link.addEventListener('click',() => toggleDrawer(false)));
    document.addEventListener('keydown',event => {if(event.key === 'Escape') toggleDrawer(false);});
    addEventListener('scroll',updateScroll,{passive:true});
    matchMedia('(prefers-color-scheme: light)').addEventListener?.('change',() => {if(state.theme === 'system') applyTheme();});
  }

  document.addEventListener('DOMContentLoaded',init);
})();
