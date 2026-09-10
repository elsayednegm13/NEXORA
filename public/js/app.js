(() => {
  const root = document.documentElement;
  root.classList.add('js');
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

  const translations = {
    en: {
      nav_home:'Home', nav_services:'Services', nav_packages:'Packages', nav_work:'Work', nav_about:'About', nav_contact:'Contact', start_project:'Start a Project', menu_label:'Menu', mobile_nav_kicker:'Explore', drawer_hint:'Choose a section or start your project.', scroll_down:'SCROLL DOWN',
      hero_kicker:'BUILD TODAY. A BRIGHTER TOMORROW.', hero_title_1:'We design, build and engineer digital products', hero_title_2:'that move businesses forward.', hero_lead:'From powerful websites to complete business systems, we turn ideas and operations into scalable digital experiences.', explore_work:'Explore Our Work',
      s_projects:'Projects', s_web:'Web Experiences', s_systems:'Business Systems', s_design:'Product Design',
      sec_cap:'02 / CAPABILITIES', cap_title:'What We Build', cap_copy:'We combine strategy, design and technology to build digital products that create real business value.', cap_cta:'Learn More About Our Services',
      cap_web:'Websites', cap_web_d:'Professional, responsive websites that represent your brand and convert.', cap_platform:'Web Platforms', cap_platform_d:'Custom portals and digital platforms for workflows, users and growth.', cap_erp:'ERP & CRM', cap_erp_d:'Business systems that organize operations, customers, inventory and reporting.', cap_ui:'UI/UX Design', cap_ui_d:'Clear interfaces and design systems focused on usability and trust.', cap_custom:'Custom Systems', cap_custom_d:'Tailored software for unique workflows and business requirements.', learn_more:'Learn More',
      sec_work:'03 / SELECTED WORK', work_title:'Projects that make an impact', work_copy:'A selection of real work delivered across different businesses and digital needs.', view_all:'View All 12 Projects', project_label:'Live Project', visit:'View Project',
      sec_process:'04 / OUR PROCESS', process_title:'From idea to real impact', process_copy:'A clear process that turns business goals into a focused product, then keeps it moving after launch.', process_cta:'Our Process', p1:'Discover', p1d:'Understand goals, users, constraints and success criteria.', p2:'Design', p2d:'Shape the user experience, interfaces and system architecture.', p3:'Build', p3d:'Develop, integrate and test with maintainable engineering.', p4:'Launch', p4d:'Deploy, verify and prepare the product for real use.', p5:'Support', p5d:'Improve, maintain and support the product as it grows.',
      sec_packages:'05 / BUILD PATHS', packages_title:'Flexible packages for your needs', packages_copy:'Choose the right starting point for your project. Every package can be tailored to the final scope.', compare_packages:'Compare All Packages', pkg_launch:'Launch', pkg_launch_d:'A professional website for a focused digital presence.', pkg_grow:'Grow', pkg_grow_d:'A richer website experience with expanded content and CMS control.', pkg_scale:'Scale', pkg_scale_d:'A custom platform or business system for complex requirements.', pkg_custom:'Custom', pkg_custom_d:'A tailored solution built around unique needs and workflows.', quote:'Request a quote', lets_talk:"Let's Talk", flexible:'Flexible timeline', most_popular:'Most Popular', get_started:'Get Started', contact_us:'Contact Us',
      pkg_l1:'Responsive experience', pkg_l2:'Core pages', pkg_l3:'Content management ready', pkg_l4:'SEO foundation', pkg_g1:'Expanded content', pkg_g2:'Dynamic pages', pkg_g3:'Content management', pkg_g4:'Performance review', pkg_s1:'Custom development', pkg_s2:'Advanced integrations', pkg_s3:'ERP / CRM ready', pkg_s4:'Scalable architecture', pkg_c1:'Full customization', pkg_c2:'Dedicated support', pkg_c3:'Any system type', pkg_c4:'From idea to launch',
      sec_tech:'06 / TECHNOLOGY', tech_title:'Tools we work with', tech_copy:'Modern technologies selected for performance, reliability and long-term maintainability.',
      sec_team:'07 / OUR TEAM', team_title:'The people behind Nexora', team_copy:'Two builders. One technology studio. Different skills, one vision — to build digital solutions that create a real difference.', more_about:'More About Us',
      sec_cta:'08 / GET STARTED', cta_title:"Let's build something great", cta_copy:"Tell us about your project and let's turn it into reality.", email_placeholder:'Enter your email', fast_response:'Fast Response', fast_response_d:'Usually within 24 hours', no_obligation:'No Obligation', no_obligation_d:'Just a friendly discussion',
      footer_copy:'Building a better digital tomorrow.', rights:'© 2026 NEXORA Technologies. All rights reserved.'
    },
    ar: {
      nav_home:'الرئيسية', nav_services:'الخدمات', nav_packages:'الباقات', nav_work:'الأعمال', nav_about:'من نحن', nav_contact:'تواصل', start_project:'ابدأ مشروعك', menu_label:'القائمة', mobile_nav_kicker:'استكشف', drawer_hint:'اختار القسم أو ابدأ مشروعك مباشرة.', scroll_down:'مرّر لأسفل',
      hero_kicker:'نبني اليوم لمستقبل رقمي أفضل.', hero_title_1:'نصمم ونطور ونبني منتجات رقمية', hero_title_2:'تدفع الأعمال إلى الأمام.', hero_lead:'من المواقع الاحترافية إلى أنظمة الأعمال المتكاملة، نحول الأفكار والعمليات إلى تجارب رقمية قابلة للنمو.', explore_work:'استكشف أعمالنا',
      s_projects:'مشروع', s_web:'تجارب ويب', s_systems:'أنظمة أعمال', s_design:'تصميم منتجات',
      sec_cap:'02 / القدرات', cap_title:'ماذا نبني؟', cap_copy:'نجمع بين التخطيط والتصميم والتقنية لبناء منتجات رقمية تحقق قيمة فعلية للأعمال.', cap_cta:'اعرف أكثر عن خدماتنا',
      cap_web:'مواقع ويب', cap_web_d:'مواقع احترافية ومتجاوبة تمثل علامتك بوضوح وتساعد على التحويل.', cap_platform:'منصات ويب', cap_platform_d:'بوابات ومنصات مخصصة للعمليات والمستخدمين والنمو.', cap_erp:'أنظمة ERP وCRM', cap_erp_d:'أنظمة أعمال لتنظيم العمليات والعملاء والمخزون والتقارير.', cap_ui:'تصميم UI/UX', cap_ui_d:'واجهات وأنظمة تصميم واضحة تركز على سهولة الاستخدام والثقة.', cap_custom:'أنظمة مخصصة', cap_custom_d:'برمجيات مخصصة لمسارات العمل والمتطلبات الفريدة.', learn_more:'اعرف أكثر',
      sec_work:'03 / أعمال مختارة', work_title:'مشاريع تصنع أثرًا', work_copy:'مجموعة من الأعمال الحقيقية المنفذة لاحتياجات رقمية ومجالات أعمال مختلفة.', view_all:'عرض كل الـ12 مشروع', project_label:'مشروع مباشر', visit:'عرض المشروع',
      sec_process:'04 / طريقة العمل', process_title:'من الفكرة إلى أثر حقيقي', process_copy:'مسار واضح يحول أهداف العمل إلى منتج مركز، ثم يستمر في التطور بعد الإطلاق.', process_cta:'طريقة عملنا', p1:'اكتشاف', p1d:'فهم الأهداف والمستخدمين والقيود ومعايير النجاح.', p2:'تصميم', p2d:'صياغة تجربة الاستخدام والواجهات ومعمارية النظام.', p3:'تطوير', p3d:'تنفيذ وربط واختبار بكود قابل للصيانة.', p4:'إطلاق', p4d:'نشر المنتج والتحقق منه وتجهيزه للاستخدام الحقيقي.', p5:'دعم', p5d:'تحسين وصيانة ودعم المنتج أثناء نموه.',
      sec_packages:'05 / مسارات التنفيذ', packages_title:'باقات مرنة حسب احتياجك', packages_copy:'اختر نقطة البداية الأنسب لمشروعك، وكل باقة يمكن تكييفها حسب النطاق النهائي.', compare_packages:'قارن الباقات', pkg_launch:'Launch', pkg_launch_d:'موقع احترافي لبناء حضور رقمي واضح ومركز.', pkg_grow:'Grow', pkg_grow_d:'تجربة موقع أوسع مع محتوى أكثر وتحكم عبر CMS.', pkg_scale:'Scale', pkg_scale_d:'منصة أو نظام أعمال مخصص للمتطلبات الأكثر تعقيدًا.', pkg_custom:'Custom', pkg_custom_d:'حل مصمم بالكامل حول احتياجات ومسارات عمل خاصة.', quote:'اطلب عرض سعر', lets_talk:'نتكلم', flexible:'مدة مرنة', most_popular:'الأكثر طلبًا', get_started:'ابدأ الآن', contact_us:'تواصل معنا',
      pkg_l1:'تجربة متجاوبة', pkg_l2:'الصفحات الأساسية', pkg_l3:'جاهز لإدارة المحتوى', pkg_l4:'أساس SEO', pkg_g1:'محتوى موسع', pkg_g2:'صفحات ديناميكية', pkg_g3:'إدارة المحتوى', pkg_g4:'مراجعة الأداء', pkg_s1:'تطوير مخصص', pkg_s2:'تكاملات متقدمة', pkg_s3:'جاهز لـ ERP / CRM', pkg_s4:'معمارية قابلة للتوسع', pkg_c1:'تخصيص كامل', pkg_c2:'دعم مخصص', pkg_c3:'أي نوع من الأنظمة', pkg_c4:'من الفكرة إلى الإطلاق',
      sec_tech:'06 / التقنيات', tech_title:'الأدوات التي نعمل بها', tech_copy:'تقنيات حديثة يتم اختيارها لتحقيق الأداء والاعتمادية وسهولة الصيانة على المدى الطويل.',
      sec_team:'07 / فريقنا', team_title:'الأشخاص خلف Nexora', team_copy:'مطوران، استوديو تقني واحد. مهارات مختلفة ورؤية واحدة: بناء حلول رقمية تحدث فرقًا حقيقيًا.', more_about:'اعرف عنا أكثر',
      sec_cta:'08 / ابدأ', cta_title:'خلينا نبني حاجة عظيمة', cta_copy:'احكيلنا عن مشروعك ونحوّل الفكرة إلى شيء حقيقي.', email_placeholder:'اكتب بريدك الإلكتروني', fast_response:'رد سريع', fast_response_d:'عادة خلال 24 ساعة', no_obligation:'بدون التزام', no_obligation_d:'مجرد نقاش ودي عن المشروع',
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

  function applyLanguage(){
    const lang = state.lang;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const value = translations[lang][el.dataset.i18n];
      if(value) el.textContent = value;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const value = translations[lang][el.dataset.i18nPlaceholder];
      if(value) el.placeholder = value;
    });
    const btn = document.querySelector('[data-lang-toggle]');
    if(btn) btn.textContent = lang === 'en' ? 'AR' : 'EN';
    renderProjects();
    renderPeople();
    root.classList.remove('i18n-preload');
  }

  function projectTitle(project,lang){
    return lang === 'ar' ? (project.titleAr || project.title?.ar || '') : (project.titleEn || project.title?.en || '');
  }

  function createProjectCard(project,lang){
    const main = projectTitle(project,lang);
    const alt = projectTitle(project,lang === 'ar' ? 'en' : 'ar');
    const article = document.createElement('article');
    article.className = 'project-card glass reveal';

    const media = document.createElement('a');
    media.className = 'project-media';
    media.href = `project.html?slug=${encodeURIComponent(project.slug)}`;
    media.setAttribute('aria-label',main);
    const img = document.createElement('img');
    img.src = project.image || '';
    img.loading = 'lazy';
    img.alt = main;
    img.addEventListener('error',() => { img.style.opacity = '.18'; },{once:true});
    const badge = document.createElement('span');
    badge.className = 'project-badge';
    badge.textContent = translations[lang].project_label;
    media.append(img,badge);

    const body = document.createElement('div');
    body.className = 'project-body';
    const h3 = document.createElement('h3'); h3.textContent = main;
    const altEl = document.createElement('div'); altEl.className = 'project-alt'; altEl.textContent = alt;
    const domain = document.createElement('div'); domain.className = 'project-domain'; domain.textContent = project.domain || '';
    const actions = document.createElement('div'); actions.className = 'project-actions';
    const number = document.createElement('span'); number.textContent = `#${String(project.id).padStart(2,'0')}`;
    const visit = document.createElement('a'); visit.className = 'project-link'; visit.href = project.url || '#'; visit.target = '_blank'; visit.rel = 'noopener noreferrer'; visit.textContent = `${translations[lang].visit} ↗`;
    actions.append(number,visit); body.append(h3,altEl,domain,actions); article.append(media,body);
    return article;
  }

  function updateProjectCounts(){
    const count = state.projects.length;
    document.querySelectorAll('[data-project-count-stat]').forEach(el => { el.textContent = `${count}+`; });
    document.querySelectorAll('[data-i18n="view_all"]').forEach(el => {
      el.textContent = state.lang === 'ar' ? `عرض كل الـ${count} مشروع` : `View All ${count} Projects`;
    });
  }

  function renderProjects(){
    const el = document.querySelector('[data-projects]');
    if(!el) return;
    const lang = state.lang;
    const projects = state.projects.filter(project => project.featured).slice(0,4);
    updateProjectCounts();
    const fragment = document.createDocumentFragment();
    projects.forEach(project => fragment.appendChild(createProjectCard(project,lang)));
    el.replaceChildren(fragment);
    observeReveals();
  }

  async function hydrateProjects(){
    const repo = window.NEXORA_REPOSITORIES?.projects;
    if(!repo) return;
    try {
      const projects = await repo.list();
      if(Array.isArray(projects) && projects.length) state.projects = projects;
    } catch(error) {
      console.error('NEXORA home projects hydration error',error);
    }
    renderProjects();
  }

  function renderPeople(){
    const el = document.querySelector('[data-people]');
    if(!el || !window.NEXORA_DATA) return;
    const lang = state.lang;
    el.innerHTML = window.NEXORA_DATA.people.map(p => `<article class="person-card glass reveal">
      <div class="person-avatar" aria-hidden="true">${p.initials}</div>
      <div><h3>${lang === 'ar' ? p.nameAr : p.nameEn}</h3><div class="person-role">${lang === 'ar' ? p.roleAr : p.roleEn}</div><div class="focus-list">${(lang === 'ar' ? p.focusAr : p.focusEn).map(x => `<span class="focus-chip">${x}</span>`).join('')}</div></div>
    </article>`).join('');
    observeReveals();
  }

  let observer;
  function observeReveals(){
    if(!('IntersectionObserver' in window)){document.querySelectorAll('.reveal').forEach(x => x.classList.add('is-visible'));return;}
    if(!observer) observer = new IntersectionObserver(entries => entries.forEach(entry => {if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}}),{threshold:.08});
    document.querySelectorAll('.reveal:not(.is-visible)').forEach(x => observer.observe(x));
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
    else toggle?.focus({preventScroll:true});
  }

  function init(){
    seedProjects();
    applyTheme();
    applyLanguage();
    hydrateProjects();
    observeReveals();
    document.querySelector('[data-theme-toggle]')?.addEventListener('click',cycleTheme);
    document.querySelector('[data-lang-toggle]')?.addEventListener('click',()=>{state.lang = state.lang === 'en' ? 'ar' : 'en';localStorage.setItem('nexora_lang',state.lang);applyLanguage();});
    document.querySelector('[data-menu-toggle]')?.addEventListener('click',()=>toggleDrawer());
    document.querySelector('.drawer-backdrop')?.addEventListener('click',()=>toggleDrawer(false));
    document.querySelector('[data-menu-close]')?.addEventListener('click',()=>toggleDrawer(false));
    document.querySelectorAll('.mobile-drawer a[href^="#"]').forEach(a => a.addEventListener('click',()=>toggleDrawer(false)));
    document.addEventListener('keydown',e => {if(e.key === 'Escape') toggleDrawer(false);});
    const nav = document.querySelector('.nav');
    const onScroll = () => nav?.classList.toggle('is-scrolled',scrollY > 16);
    onScroll(); addEventListener('scroll',onScroll,{passive:true});
    matchMedia('(prefers-color-scheme: light)').addEventListener?.('change',()=>{if(state.theme === 'system') applyTheme();});
  }

  document.addEventListener('DOMContentLoaded',init);
})();
