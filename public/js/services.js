(() => {
  const icons = {
    web: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18"/><path d="M8 14h4"/></svg>',
    platform: '<svg viewBox="0 0 24 24"><path d="M7 3v4H3"/><path d="M17 3v4h4"/><path d="M7 21v-4H3"/><path d="M17 21v-4h4"/><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
    system: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    design: '<svg viewBox="0 0 24 24"><path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2L12 3z"/></svg>',
    custom: '<svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="8"/></svg>'
  };

  const copy = {
    en: {
      eyebrow: 'SERVICES', titleA: 'Build the right thing.', titleB: 'Build it to last.',
      lead: 'From focused websites to complete business systems, NEXORA shapes digital products around the real needs of the business.',
      explore: 'Explore Services', discuss: 'Discuss Your Project', indexEyebrow: 'OUR SERVICES', indexTitle: 'What we can build with you',
      indexCopy: 'Each service can stand alone or combine with others as the project grows.', open: 'Explore service',
      modelEyebrow: 'HOW WE WORK', modelTitle: 'One delivery model. Different scopes.', modelCopy: 'The scope changes from project to project. The discipline and clarity do not.',
      discover: 'Discover', discoverD: 'Clarify the goal, users, constraints and success criteria.', design: 'Design', designD: 'Shape the experience, system structure and interaction model.', build: 'Build', buildD: 'Develop, integrate and test with maintainable engineering.', launch: 'Launch & Support', launchD: 'Deploy, verify and keep improving after release.',
      futureEyebrow: 'WHY NEXORA', futureTitle: 'Built to move with your business.', futureCopy: 'A focused start, a clear experience, and room to grow without losing direction.',
      growFocus: 'Clear Scope', growFocusD: 'Start with what matters most and keep priorities visible.', growStructure: 'Strong Foundation', growStructureD: 'Build on a foundation that stays clear as needs expand.', growConnect: 'Connected Thinking', growConnectD: 'Consider experience, workflows and future connections together.', growEvolve: 'Room to Evolve', growEvolveD: 'Improve and expand the product without starting over.',
      ctaEyebrow: 'LET’S BUILD', ctaTitle: 'Have a project in mind?', ctaCopy: 'Tell us what you need. We’ll help define the right path before we build.', start: 'Start a Project', work: 'View Our Work'
    },
    ar: {
      eyebrow: 'الخدمات', titleA: 'نبني الشيء الصح.', titleB: 'ونبنيه ليستمر.',
      lead: 'من المواقع المركزة إلى أنظمة الأعمال المتكاملة، نبني منتجات رقمية حول الاحتياج الحقيقي للعمل.',
      explore: 'استكشف الخدمات', discuss: 'ناقش مشروعك', indexEyebrow: 'خدماتنا', indexTitle: 'إيه اللي نقدر نبنيه معاك؟',
      indexCopy: 'كل خدمة ممكن تكون مستقلة أو تتكامل مع غيرها حسب نمو المشروع.', open: 'استكشف الخدمة',
      modelEyebrow: 'طريقة عملنا', modelTitle: 'منهج تنفيذ واحد، ونطاق مختلف لكل مشروع.', modelCopy: 'حجم المشروع بيتغير، لكن الوضوح وجودة التنفيذ يفضلوا ثابتين.',
      discover: 'اكتشاف', discoverD: 'نفهم الهدف والمستخدمين والقيود ومعايير النجاح.', design: 'تصميم', designD: 'نحدد التجربة وهيكل النظام وطريقة التفاعل.', build: 'تطوير', buildD: 'نبني ونربط ونختبر بكود قابل للصيانة والتوسع.', launch: 'إطلاق ودعم', launchD: 'ننشر ونتحقق ونستمر في التحسين بعد الإطلاق.',
      futureEyebrow: 'ليه NEXORA؟', futureTitle: 'أساس يتحرك مع نمو شغلك.', futureCopy: 'بداية مركزة، تجربة واضحة، ومساحة للتطور من غير ما نفقد اتجاه المنتج.',
      growFocus: 'نطاق واضح', growFocusD: 'نبدأ بالأهم ونخلي الأولويات واضحة من البداية.', growStructure: 'أساس قوي', growStructureD: 'نبني أساس يفضل منظم وواضح مع توسع الاحتياج.', growConnect: 'تفكير متكامل', growConnectD: 'نبص للتجربة ومسار العمل والتكاملات المستقبلية كصورة واحدة.', growEvolve: 'قابل للتطور', growEvolveD: 'نطور ونوسع المنتج بدون ما نبدأ من الصفر.',
      ctaEyebrow: 'نبدأ سوا', ctaTitle: 'عندك مشروع في بالك؟', ctaCopy: 'احكيلنا محتاج إيه، ونحدد معاك المسار المناسب قبل ما نبدأ التنفيذ.', start: 'ابدأ مشروعك', work: 'شوف أعمالنا'
    }
  };

  let dynamicObserver;
  function language(){ return localStorage.getItem('nexora_lang') === 'ar' ? 'ar' : 'en'; }
  function detailUrl(service){ return `service.html?slug=${encodeURIComponent(service.slug)}`; }

  function observeDynamicReveals(elements){
    const list = [...elements].filter(Boolean);
    if(!list.length) return;
    if(!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches){
      list.forEach(el => el.classList.add('is-visible'));
      return;
    }
    if(!dynamicObserver){
      dynamicObserver = new IntersectionObserver(entries => entries.forEach(entry => {
        if(entry.isIntersecting){ entry.target.classList.add('is-visible'); dynamicObserver.unobserve(entry.target); }
      }), {threshold:.08, rootMargin:'0px 0px -4% 0px'});
    }
    list.forEach(el => dynamicObserver.observe(el));
  }

  function renderStatic(){
    const dict = copy[language()];
    document.querySelectorAll('[data-services-i18n]').forEach(el => {
      const value = dict[el.dataset.servicesI18n];
      if(value) el.textContent = value;
    });
  }

  function createServiceCard(service,index,lang,dict){
    const title = service.title[lang] || service.title.en || service.title.ar;
    const description = service.shortDescription[lang] || service.shortDescription.en || service.shortDescription.ar;
    const article = document.createElement('article');
    article.className = 'service-detail-card reveal';
    article.id = service.slug;

    const visual = document.createElement('span'); visual.className = 'service-card-symbol'; visual.setAttribute('aria-hidden','true'); visual.innerHTML = icons[service.icon] || icons.custom;
    const glow = document.createElement('span'); glow.className = 'service-card-glow'; glow.setAttribute('aria-hidden','true');
    const rail = document.createElement('span'); rail.className = 'service-card-rail'; rail.setAttribute('aria-hidden','true');

    const top = document.createElement('div'); top.className = 'service-card-top';
    const idx = document.createElement('span'); idx.className = 'service-index'; idx.textContent = String(index + 1).padStart(2,'0');
    const icon = document.createElement('span'); icon.className = 'service-icon'; icon.setAttribute('aria-hidden','true'); icon.innerHTML = icons[service.icon] || icons.custom;
    top.append(idx,icon);

    const body = document.createElement('div'); body.className = 'service-card-body';
    const h3 = document.createElement('h3'); h3.textContent = title;
    const p = document.createElement('p'); p.textContent = description;
    body.append(h3,p);

    const link = document.createElement('a'); link.className = 'service-card-link'; link.href = detailUrl(service);
    const label = document.createElement('span'); label.textContent = dict.open;
    const arrow = document.createElement('span'); arrow.textContent = '↗';
    link.append(label,arrow);

    article.append(glow,rail,visual,top,body,link);
    return article;
  }

  function scrollToRequestedService(){
    const id = decodeURIComponent(location.hash.slice(1));
    if(!id) return;
    const target = document.getElementById(id);
    if(!target) return;
    const navHeight = document.querySelector('.nav')?.getBoundingClientRect().height || 72;
    const top = Math.max(0,target.getBoundingClientRect().top + scrollY - navHeight - 12);
    requestAnimationFrame(() => scrollTo({top,behavior:'auto'}));
  }

  async function renderServices(){
    const grid = document.querySelector('[data-services-grid]');
    if(!grid || !window.NEXORA_REPOSITORIES?.services) return;
    const services = await window.NEXORA_REPOSITORIES.services.list();
    const lang = language();
    const dict = copy[lang];
    const fragment = document.createDocumentFragment();
    const cards = services.map((service,index) => createServiceCard(service,index,lang,dict));
    cards.forEach(card => fragment.appendChild(card));
    grid.replaceChildren(fragment);
    observeDynamicReveals(cards);
    scrollToRequestedService();
    window.dispatchEvent(new Event('resize'));
  }

  async function refresh(){
    renderStatic();
    try { await renderServices(); }
    catch(error){ console.error('NEXORA services render error',error); }
  }

  document.addEventListener('DOMContentLoaded',() => {
    refresh();
    const toggle = document.querySelector('[data-lang-toggle]');
    toggle?.addEventListener('click',() => setTimeout(refresh,0));
    addEventListener('hashchange',scrollToRequestedService);
  });
})();
