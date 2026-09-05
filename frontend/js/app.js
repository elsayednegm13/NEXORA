(() => {
  const root = document.documentElement;
  const state = {
    lang: localStorage.getItem('nexora_lang') || 'en',
    theme: localStorage.getItem('nexora_theme') || 'system'
  };

  const translations = {
    en: {
      nav_home:'Home', nav_services:'Services', nav_packages:'Packages', nav_work:'Work', nav_about:'About', nav_contact:'Contact', start_project:'Start a Project',
      hero_kicker:'BUILD TODAY. A BRIGHTER TOMORROW.', hero_title_1:'We design, build and engineer', hero_title_2:'digital products that move businesses forward.', hero_lead:'From focused websites to complete business systems, we turn ideas and operations into scalable digital experiences.', explore_work:'Explore Our Work',
      s_projects:'Projects in portfolio', s_delivery:'Delivery mindset', s_people:'Builders', s_ideas:'Ideas to build',
      sec_cap:'02 / CAPABILITIES', cap_title:'What We Build', cap_copy:'Clear services, engineered around real business goals — from first interface to complete operational system.',
      cap_web:'Websites', cap_web_d:'Professional, responsive websites built to represent, explain and convert.', cap_platform:'Web Platforms', cap_platform_d:'Custom portals and digital platforms for workflows, users and growth.', cap_erp:'ERP & CRM', cap_erp_d:'Business systems that organize operations, customers, inventory and reporting.', cap_ui:'UI/UX Design', cap_ui_d:'Clear product interfaces and design systems focused on usability and trust.', cap_custom:'Custom Systems', cap_custom_d:'Tailored software for unique workflows and business requirements.', learn_more:'Learn more',
      sec_work:'03 / SELECTED WORK', work_title:'Projects that make an impact', work_copy:'A selected view of real projects from the existing portfolio. Project details and case studies will be managed later from the dashboard.', view_all:'View All 12 Projects', project_label:'Existing project', visit:'Visit Project',
      sec_process:'04 / OUR PROCESS', process_title:'From idea to real impact', process_copy:'A transparent build process designed to keep decisions clear and delivery measurable.', p1:'Discover', p1d:'Understand goals, users, constraints and success criteria.', p2:'Design', p2d:'Structure the experience, interface and system behavior.', p3:'Build', p3d:'Develop, integrate and test with maintainable engineering.', p4:'Launch', p4d:'Deploy, verify and prepare the product for real use.', p5:'Support', p5d:'Iterate, improve and keep the product healthy as it grows.',
      sec_packages:'05 / BUILD PATHS', packages_title:'Flexible packages for your needs', packages_copy:'Package content is temporary in this prototype; the final version will be fully editable from the dashboard.', pkg_launch:'Launch', pkg_launch_d:'A focused professional website for a clear digital presence.', pkg_grow:'Grow', pkg_grow_d:'A richer website experience with expanded pages and CMS control.', pkg_scale:'Scale', pkg_scale_d:'A custom platform or business system for more complex workflows.', pkg_custom:'Custom', pkg_custom_d:'A tailored engagement built around unique requirements.', quote:'Contact for quote', flexible:'Flexible timeline', most_popular:'Most Popular', get_started:'Get Started', contact_us:'Contact Us',
      sec_tech:'06 / TECHNOLOGY', tech_title:'Tools we work with', tech_copy:'A flexible technology stack selected per project requirements, performance and long-term maintainability.',
      sec_team:'07 / OUR TEAM', team_title:'The people behind Nexora', team_copy:'Two builders. One technology studio. Names and profile data below are temporary placeholders and will be editable from the dashboard.',
      sec_cta:'08 / GET STARTED', cta_title:"Let's build something great", cta_copy:'Tell us what you want to build and we will turn it into a clear plan, scope and execution path.', talk:'Start the conversation',
      footer_copy:'Building a better digital tomorrow.', rights:'© 2026 NEXORA Technologies. All rights reserved.'
    },
    ar: {
      nav_home:'الرئيسية', nav_services:'الخدمات', nav_packages:'الباقات', nav_work:'الأعمال', nav_about:'من نحن', nav_contact:'تواصل', start_project:'ابدأ مشروعك',
      hero_kicker:'نبني اليوم لمستقبل رقمي أفضل.', hero_title_1:'نصمم ونطور ونبني', hero_title_2:'منتجات رقمية تدفع الأعمال إلى الأمام.', hero_lead:'من المواقع الاحترافية إلى أنظمة الأعمال المتكاملة، نحول الأفكار والعمليات إلى تجارب رقمية قابلة للنمو.', explore_work:'استكشف أعمالنا',
      s_projects:'مشروع في الملف', s_delivery:'عقلية تسليم', s_people:'مطوران', s_ideas:'أفكار قابلة للبناء',
      sec_cap:'02 / القدرات', cap_title:'ماذا نبني؟', cap_copy:'خدمات واضحة مبنية حول أهداف العمل الحقيقية، من أول واجهة وحتى النظام التشغيلي الكامل.',
      cap_web:'مواقع ويب', cap_web_d:'مواقع احترافية ومتجاوبة تعرّف بالخدمة وتشرحها وتساعد على التحويل.', cap_platform:'منصات ويب', cap_platform_d:'بوابات ومنصات مخصصة للعمليات والمستخدمين والنمو.', cap_erp:'أنظمة ERP وCRM', cap_erp_d:'أنظمة أعمال لتنظيم العمليات والعملاء والمخزون والتقارير.', cap_ui:'تصميم UI/UX', cap_ui_d:'واجهات وأنظمة تصميم واضحة تركز على سهولة الاستخدام والثقة.', cap_custom:'أنظمة مخصصة', cap_custom_d:'برمجيات مخصصة لمسارات العمل والمتطلبات غير التقليدية.', learn_more:'اعرف أكثر',
      sec_work:'03 / أعمال مختارة', work_title:'مشاريع صنعت أثرًا', work_copy:'عرض مختار لمشاريع حقيقية من ملف الأعمال القديم فقط. تفاصيل الـCase Study ستتم إدارتها لاحقًا من الداش بورد.', view_all:'عرض كل الـ12 مشروع', project_label:'مشروع حالي', visit:'زيارة المشروع',
      sec_process:'04 / طريقة العمل', process_title:'من الفكرة إلى أثر حقيقي', process_copy:'مسار تنفيذ واضح يحافظ على وضوح القرارات وقابلية قياس التسليم.', p1:'اكتشاف', p1d:'فهم الأهداف والمستخدمين والقيود ومعايير النجاح.', p2:'تصميم', p2d:'بناء تجربة الاستخدام والواجهة وسلوك النظام.', p3:'تطوير', p3d:'تنفيذ وربط واختبار بكود قابل للصيانة.', p4:'إطلاق', p4d:'نشر المنتج والتحقق منه وتجهيزه للاستخدام الحقيقي.', p5:'دعم', p5d:'تحسين مستمر والحفاظ على صحة المنتج مع نموه.',
      sec_packages:'05 / مسارات التنفيذ', packages_title:'باقات مرنة حسب احتياجك', packages_copy:'بيانات الباقات مؤقتة في هذا النموذج، والنسخة النهائية ستكون قابلة للتعديل بالكامل من الداش بورد.', pkg_launch:'Launch', pkg_launch_d:'موقع احترافي مركز لبناء حضور رقمي واضح.', pkg_grow:'Grow', pkg_grow_d:'تجربة موقع أوسع مع صفحات أكثر وتحكم عبر CMS.', pkg_scale:'Scale', pkg_scale_d:'منصة أو نظام أعمال مخصص لمسارات أكثر تعقيدًا.', pkg_custom:'Custom', pkg_custom_d:'تنفيذ مخصص بالكامل حسب متطلبات المشروع.', quote:'تواصل لتحديد السعر', flexible:'مدة مرنة', most_popular:'الأكثر طلبًا', get_started:'ابدأ الآن', contact_us:'تواصل معنا',
      sec_tech:'06 / التقنيات', tech_title:'الأدوات التي نعمل بها', tech_copy:'Stack مرن يتم اختياره حسب متطلبات المشروع والأداء وقابلية الصيانة على المدى الطويل.',
      sec_team:'07 / الفريق', team_title:'الأشخاص خلف Nexora', team_copy:'مطوران، استوديو تقني واحد. الأسماء والبيانات بالأسفل مؤقتة وستكون قابلة للتعديل من الداش بورد.',
      sec_cta:'08 / ابدأ', cta_title:'خلينا نبني حاجة عظيمة', cta_copy:'احكيلنا عايز تبني إيه، ونحوّل الفكرة لخطة واضحة ونطاق تنفيذ ومسار مناسب.', talk:'ابدأ المحادثة',
      footer_copy:'نبني غدًا رقميًا أفضل.', rights:'© 2026 NEXORA Technologies. جميع الحقوق محفوظة.'
    }
  };

  function resolvedTheme() {
    if (state.theme !== 'system') return state.theme;
    return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function applyTheme() {
    const t = resolvedTheme();
    root.dataset.theme = t;
    document.querySelectorAll('[data-brand-logo]').forEach(img => {
      img.src = t === 'dark' ? 'assets/brand/nexora-logo-dark.png' : 'assets/brand/nexora-logo-light.png';
    });
    const btn = document.querySelector('[data-theme-toggle]');
    if (btn) btn.textContent = state.theme === 'system' ? '◐' : (t === 'dark' ? '☾' : '☀');
  }

  function cycleTheme() {
    state.theme = state.theme === 'system' ? 'dark' : state.theme === 'dark' ? 'light' : 'system';
    localStorage.setItem('nexora_theme', state.theme);
    applyTheme();
  }

  function applyLanguage() {
    const lang = state.lang;
    root.lang = lang;
    root.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (translations[lang][key]) el.textContent = translations[lang][key];
    });
    const btn = document.querySelector('[data-lang-toggle]');
    if (btn) btn.textContent = lang === 'en' ? 'AR' : 'EN';
    renderProjects();
    renderPeople();
  }

  function renderProjects() {
    const el = document.querySelector('[data-projects]');
    if (!el || !window.NEXORA_DATA) return;
    const lang = state.lang;
    const projects = window.NEXORA_DATA.projects.filter(p => p.featured).slice(0, 4);
    el.innerHTML = projects.map(p => `
      <article class="project-card glass reveal">
        <a class="project-media" href="${p.url}" target="_blank" rel="noopener noreferrer" aria-label="${lang === 'ar' ? p.titleAr : p.titleEn}">
          <img src="${p.image}" loading="lazy" alt="${lang === 'ar' ? p.titleAr : p.titleEn}" onerror="this.style.display='none'">
          <span class="project-badge">${translations[lang].project_label}</span>
        </a>
        <div class="project-body">
          <h3>${lang === 'ar' ? p.titleAr : p.titleEn}</h3>
          <div class="project-domain">${p.domain}</div>
          <div class="project-actions">
            <span>#${String(p.id).padStart(2,'0')}</span>
            <a class="project-link" href="${p.url}" target="_blank" rel="noopener noreferrer">${translations[lang].visit} ↗</a>
          </div>
        </div>
      </article>`).join('');
    observeReveals();
  }

  function renderPeople() {
    const el = document.querySelector('[data-people]');
    if (!el || !window.NEXORA_DATA) return;
    const lang = state.lang;
    el.innerHTML = window.NEXORA_DATA.people.map(p => `
      <article class="person-card glass reveal">
        <div class="person-avatar" aria-hidden="true">${p.initials}</div>
        <div>
          <h3>${lang === 'ar' ? p.nameAr : p.nameEn}</h3>
          <div class="person-role">${lang === 'ar' ? p.roleAr : p.roleEn}</div>
          <div class="focus-list">${(lang === 'ar' ? p.focusAr : p.focusEn).map(x => `<span class="focus-chip">${x}</span>`).join('')}</div>
        </div>
      </article>`).join('');
    observeReveals();
  }

  let observer;
  function observeReveals() {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.reveal').forEach(x => x.classList.add('is-visible'));
      return;
    }
    if (!observer) observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: .12 });
    document.querySelectorAll('.reveal:not(.is-visible)').forEach(x => observer.observe(x));
  }

  function toggleDrawer(force) {
    const drawer = document.querySelector('.mobile-drawer');
    if (!drawer) return;
    const open = typeof force === 'boolean' ? force : !drawer.classList.contains('is-open');
    drawer.classList.toggle('is-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  }

  function init() {
    applyTheme();
    applyLanguage();
    observeReveals();
    document.querySelector('[data-theme-toggle]')?.addEventListener('click', cycleTheme);
    document.querySelector('[data-lang-toggle]')?.addEventListener('click', () => {
      state.lang = state.lang === 'en' ? 'ar' : 'en';
      localStorage.setItem('nexora_lang', state.lang);
      applyLanguage();
    });
    document.querySelector('[data-menu-toggle]')?.addEventListener('click', () => toggleDrawer());
    document.querySelector('.drawer-backdrop')?.addEventListener('click', () => toggleDrawer(false));
    document.querySelectorAll('.drawer-links a').forEach(a => a.addEventListener('click', () => toggleDrawer(false)));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') toggleDrawer(false); });
    const nav = document.querySelector('.nav');
    const onScroll = () => nav?.classList.toggle('is-scrolled', scrollY > 16);
    onScroll(); addEventListener('scroll', onScroll, {passive:true});
    matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => { if (state.theme === 'system') applyTheme(); });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
