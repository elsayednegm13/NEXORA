(() => {
  const root = document.documentElement;
  root.classList.add('js');
  document.body?.classList.add('js');

  const savedLang = localStorage.getItem('nexora_lang');
  const savedTheme = localStorage.getItem('nexora_theme');
  const state = {
    lang: savedLang === 'ar' ? 'ar' : 'en',
    theme: ['light','dark','system'].includes(savedTheme) ? savedTheme : 'system',
    project: null,
    projects: []
  };

  const t = {
    en: {
      nav_home:'Home', nav_services:'Services', nav_work:'Work', nav_packages:'Packages', nav_about:'About', nav_contact:'Contact', start_project:'Start a Project', menu_label:'Menu', mobile_nav_kicker:'Explore', drawer_hint:'Choose a section or start your project.',
      breadcrumb_work:'Work', live_project:'Live Project', project_snapshot:'Project Snapshot', project_number:'Project', website:'Website', status:'Status', live:'Live', service:'Service', visit_live_site:'Visit Live Site', back_to_work:'Back to Work', portfolio_index:'Portfolio Index',
      about_eyebrow:'ABOUT', about_title:'About the project.',
      technologies_eyebrow:'TECHNOLOGIES', technologies_title:'Tools behind the build.', technologies_copy:'The tools and technologies used to shape the experience.',
      services_eyebrow:'SERVICES', services_title:'What we delivered.',
      visual_eyebrow:'VISUAL STORY', visual_title:'Explore the interface.', visual_copy:'A closer visual reading of the live project using its verified portfolio artwork.', visual_overview:'Overview', visual_detail:'Interface Detail', visual_flow:'Page Flow',
      challenge_eyebrow:'CHALLENGE', challenge_title:'The challenge.', solution_eyebrow:'SOLUTION', solution_title:'The solution.',
      results_eyebrow:'RESULTS', results_title:'Verified outcomes.', results_copy:'Key outcomes and measurable highlights from the project.',
      gallery_eyebrow:'GALLERY', gallery_title:'More project views.',
      live_eyebrow:'LIVE EXPERIENCE', live_copy:'Open the real project and experience it in its current live environment.', visit_live_project:'Visit Live Project',
      continue_eyebrow:'NEXT / CONTINUE', continue_title:'Keep exploring.', all_projects:'All Projects', previous_project:'Previous Project', next_project:'Next Project',
      cta_eyebrow:'YOUR PROJECT', cta_title:'Have something in mind?', cta_copy:'Let’s turn your next idea into a clear digital experience.',
      not_found_title:'Project not found.', not_found_copy:'This project is not available in the current portfolio index.', footer_copy:'Building a better digital tomorrow.', rights:'© 2026 NEXORA Technologies. All rights reserved.'
    },
    ar: {
      nav_home:'الرئيسية', nav_services:'الخدمات', nav_work:'الأعمال', nav_packages:'الباقات', nav_about:'من نحن', nav_contact:'تواصل', start_project:'ابدأ مشروعك', menu_label:'القائمة', mobile_nav_kicker:'استكشف', drawer_hint:'اختار القسم أو ابدأ مشروعك مباشرة.',
      breadcrumb_work:'الأعمال', live_project:'مشروع مباشر', project_snapshot:'ملخص المشروع', project_number:'المشروع', website:'الموقع', status:'الحالة', live:'مباشر', service:'الخدمة', visit_live_site:'زيارة الموقع', back_to_work:'العودة للأعمال', portfolio_index:'فهرس الأعمال',
      about_eyebrow:'عن المشروع', about_title:'عن المشروع.',
      technologies_eyebrow:'التقنيات', technologies_title:'أدوات البناء.', technologies_copy:'الأدوات والتقنيات المستخدمة في بناء التجربة.',
      services_eyebrow:'الخدمات', services_title:'ما الذي تم تنفيذه.',
      visual_eyebrow:'القصة البصرية', visual_title:'استكشف الواجهة.', visual_copy:'قراءة بصرية أقرب للمشروع باستخدام الصورة الحقيقية المحفوظة ضمن أعمالنا.', visual_overview:'نظرة عامة', visual_detail:'تفاصيل الواجهة', visual_flow:'تدفق الصفحة',
      challenge_eyebrow:'التحدي', challenge_title:'التحدي.', solution_eyebrow:'الحل', solution_title:'الحل.',
      results_eyebrow:'النتائج', results_title:'نتائج موثقة.', results_copy:'أهم النتائج والمؤشرات المرتبطة بالمشروع.',
      gallery_eyebrow:'معرض المشروع', gallery_title:'مشاهد إضافية.',
      live_eyebrow:'التجربة المباشرة', live_copy:'افتح المشروع الحقيقي وجرّب النسخة الحالية على بيئته المباشرة.', visit_live_project:'زيارة المشروع المباشر',
      continue_eyebrow:'التالي / تابع', continue_title:'كمّل الاستكشاف.', all_projects:'كل المشاريع', previous_project:'المشروع السابق', next_project:'المشروع التالي',
      cta_eyebrow:'مشروعك', cta_title:'عندك فكرة للمشروع القادم؟', cta_copy:'خلينا نحول فكرتك القادمة إلى تجربة رقمية واضحة.',
      not_found_title:'المشروع غير موجود.', not_found_copy:'المشروع المطلوب غير موجود داخل فهرس الأعمال الحالي.', footer_copy:'نبني غدًا رقميًا أفضل.', rights:'© 2026 NEXORA Technologies. جميع الحقوق محفوظة.'
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

  function toSnake(value){ return String(value).replace(/[A-Z]/g,letter => `_${letter.toLowerCase()}`); }

  function localized(raw, key){
    const snake = toSnake(key);
    const nested = raw?.[key] ?? raw?.[snake];
    const ar = nested && typeof nested === 'object' ? nested.ar : undefined;
    const en = nested && typeof nested === 'object' ? nested.en : undefined;
    return {
      ar: String(ar ?? raw?.[`${key}Ar`] ?? raw?.[`${key}_ar`] ?? raw?.[`${snake}_ar`] ?? '').trim(),
      en: String(en ?? raw?.[`${key}En`] ?? raw?.[`${key}_en`] ?? raw?.[`${snake}_en`] ?? '').trim()
    };
  }

  function normalizeTerm(item, index){
    if(typeof item === 'string') return {id:index + 1, slug:'', name:{ar:item,en:item}};
    const name = localized(item || {}, 'name');
    const fallback = String(item?.label ?? item?.title ?? '').trim();
    return {
      id:item?.id ?? index + 1,
      slug:String(item?.slug ?? ''),
      name:{ar:name.ar || fallback,en:name.en || fallback},
      icon:String(item?.icon ?? item?.icon_url ?? '')
    };
  }

  function normalizeResult(item, index){
    if(typeof item === 'string') return {id:index + 1,value:'',label:{ar:item,en:item},note:{ar:'',en:''}};
    return {
      id:item?.id ?? index + 1,
      value:String(item?.value ?? ''),
      label:localized(item || {}, 'label'),
      note:localized(item || {}, 'note')
    };
  }

  function normalizeMedia(item, index){
    if(typeof item === 'string') return {id:index + 1,url:item,alt:{ar:'',en:''},caption:{ar:'',en:''}};
    return {
      id:item?.id ?? index + 1,
      url:String(item?.url ?? item?.image ?? item?.media_url ?? item?.src ?? ''),
      alt:localized(item || {}, 'alt'),
      caption:localized(item || {}, 'caption')
    };
  }

  function normalizeProject(raw){
    const title = {
      ar:String(raw?.titleAr ?? raw?.title_ar ?? raw?.title?.ar ?? '').trim(),
      en:String(raw?.titleEn ?? raw?.title_en ?? raw?.title?.en ?? '').trim()
    };
    return {
      id:Number(raw?.id || 0),
      slug:String(raw?.slug || ''),
      title,
      shortDescription:localized(raw, 'shortDescription'),
      description:localized(raw, 'description'),
      challenge:localized(raw, 'challenge'),
      solution:localized(raw, 'solution'),
      url:String(raw?.url ?? raw?.website_url ?? ''),
      domain:String(raw?.domain ?? ''),
      image:String(raw?.image ?? raw?.cover_image?.url ?? raw?.cover_image ?? ''),
      status:String(raw?.status ?? 'live'),
      featured:Boolean(raw?.featured ?? raw?.is_featured),
      technologies:Array.isArray(raw?.technologies) ? raw.technologies.map(normalizeTerm) : [],
      services:Array.isArray(raw?.services) ? raw.services.map(normalizeTerm) : [],
      results:Array.isArray(raw?.results) ? raw.results.map(normalizeResult) : [],
      gallery:Array.isArray(raw?.gallery) ? raw.gallery.map(normalizeMedia).filter(item => item.url) : [],
      seo:raw?.seo && typeof raw.seo === 'object' ? raw.seo : {}
    };
  }

  const repository = {
    async list(){
      if(window.NEXORA_PROJECT_REPOSITORY?.list){
        const response = await window.NEXORA_PROJECT_REPOSITORY.list();
        return Array.isArray(response) ? response.map(normalizeProject) : [];
      }
      return (window.NEXORA_DATA?.projects || []).map(normalizeProject);
    },
    async bySlug(slug){
      if(window.NEXORA_PROJECT_REPOSITORY?.bySlug){
        const response = await window.NEXORA_PROJECT_REPOSITORY.bySlug(slug);
        return response ? normalizeProject(response) : null;
      }
      const projects = state.projects.length ? state.projects : await this.list();
      return projects.find(project => project.slug === slug) || null;
    }
  };

  function textFor(value){ return state.lang === 'ar' ? value?.ar || '' : value?.en || ''; }
  function projectName(project){ return textFor(project?.title); }
  function projectAlt(project){ return state.lang === 'ar' ? project?.title?.en || '' : project?.title?.ar || ''; }
  function termName(term){ return textFor(term?.name); }
  function detailUrl(project){ return `project.html?slug=${encodeURIComponent(project.slug)}`; }
  function hasText(value){ return Boolean(String(value || '').trim()); }

  function setText(selector,value){ document.querySelectorAll(selector).forEach(el => { el.textContent = value ?? ''; }); }
  function setHref(selector,value){ document.querySelectorAll(selector).forEach(el => { el.href = value || '#'; }); }

  function setOptionalSection(key,visible){
    const section = document.querySelector(`[data-optional-section="${key}"]`);
    if(section) section.hidden = !visible;
  }

  function renderTextBlocks(container,text){
    if(!container) return;
    container.replaceChildren();
    String(text || '').split(/\n{2,}/).map(part => part.trim()).filter(Boolean).forEach(part => {
      const p = document.createElement('p');
      p.textContent = part;
      container.appendChild(p);
    });
  }

  function renderTerms(selector,items){
    const container = document.querySelector(selector);
    if(!container) return;
    container.replaceChildren();
    items.forEach((item,index) => {
      const name = termName(item);
      if(!name) return;
      const card = document.createElement('div');
      card.className = 'project-term';
      const number = document.createElement('span');
      number.textContent = String(index + 1).padStart(2,'0');
      const strong = document.createElement('strong');
      strong.textContent = name;
      card.append(number,strong);
      container.appendChild(card);
    });
  }

  function renderResults(items){
    const container = document.querySelector('[data-project-results]');
    if(!container) return;
    container.replaceChildren();
    items.forEach((item,index) => {
      const label = textFor(item.label);
      const note = textFor(item.note);
      if(!label && !item.value && !note) return;
      const card = document.createElement('article');
      card.className = 'project-result-card';
      const idx = document.createElement('span'); idx.textContent = String(index + 1).padStart(2,'0');
      if(item.value){ const value = document.createElement('strong'); value.textContent = item.value; card.append(idx,value); }
      else card.append(idx);
      if(label){ const labelEl = document.createElement('h3'); labelEl.textContent = label; card.append(labelEl); }
      if(note){ const noteEl = document.createElement('p'); noteEl.textContent = note; card.append(noteEl); }
      container.appendChild(card);
    });
  }

  function renderGallery(items,project){
    const container = document.querySelector('[data-project-gallery]');
    if(!container) return;
    container.replaceChildren();
    items.forEach((item,index) => {
      const figure = document.createElement('figure');
      figure.className = 'project-gallery-item reveal';
      const img = document.createElement('img');
      img.src = item.url;
      img.loading = 'lazy';
      img.alt = textFor(item.alt) || `${projectName(project)} ${index + 1}`;
      figure.appendChild(img);
      const caption = textFor(item.caption);
      if(caption){ const cap = document.createElement('figcaption'); cap.textContent = caption; figure.appendChild(cap); }
      container.appendChild(figure);
    });
  }


  function updateSectionNumbers(){
    let index = 0;
    document.querySelectorAll('[data-project-section]').forEach(section => {
      if(section.hidden) return;
      index += 1;
      section.querySelectorAll('[data-section-number]').forEach(el => { el.textContent = String(index).padStart(2,'0'); });
    });
  }

  function imageFallback(img,container){
    if(!img) return;
    img.onerror = () => container?.classList.add('image-failed');
    img.onload = () => container?.classList.remove('image-failed');
  }

  function renderProject(){
    const projects = state.projects;
    const project = state.project;
    const page = document.querySelector('[data-project-page]');
    const notFound = document.querySelector('[data-project-not-found]');

    if(!project){
      page?.querySelectorAll(':scope > section:not([data-project-not-found])').forEach(section => { section.hidden = true; });
      if(notFound) notFound.hidden = false;
      document.title = `NEXORA Technologies — ${t[state.lang].not_found_title}`;
      root.classList.remove('i18n-preload');
      return;
    }

    if(notFound) notFound.hidden = true;
    page?.querySelectorAll(':scope > section:not([data-optional-section]):not([data-project-not-found])').forEach(section => { section.hidden = false; });

    const index = Math.max(0,projects.findIndex(item => item.slug === project.slug));
    const previous = projects[(index - 1 + projects.length) % projects.length];
    const next = projects[(index + 1) % projects.length];
    const number = `#${String(project.id).padStart(2,'0')}`;
    const position = String(index + 1).padStart(2,'0');

    setText('[data-project-title]',projectName(project));
    setText('[data-project-alt-title]',projectAlt(project));
    setText('[data-project-index]',number);
    setText('[data-project-number]',number);
    setText('[data-project-position]',position);
    setText('[data-project-total]',String(projects.length).padStart(2,'0'));
    setText('[data-project-domain]',project.domain);
    setHref('[data-project-live]',project.url);

    const shortDescription = textFor(project.shortDescription);
    const shortEl = document.querySelector('[data-project-short-description]');
    if(shortEl){ shortEl.textContent = shortDescription; shortEl.hidden = !shortDescription; }

    const description = textFor(project.description);
    setOptionalSection('description',hasText(description));
    renderTextBlocks(document.querySelector('[data-project-description]'),description);

    const technologies = project.technologies.filter(term => hasText(termName(term)));
    setOptionalSection('technologies',technologies.length > 0);
    renderTerms('[data-project-technologies]',technologies);

    const services = project.services.filter(term => hasText(termName(term)));
    setOptionalSection('services',services.length > 0);
    renderTerms('[data-project-services]',services);
    const serviceMeta = document.querySelector('[data-project-service-meta]');
    if(serviceMeta) serviceMeta.hidden = services.length === 0;
    setText('[data-project-service-primary]',services[0] ? termName(services[0]) : '');

    const challenge = textFor(project.challenge);
    setOptionalSection('challenge',hasText(challenge));
    renderTextBlocks(document.querySelector('[data-project-challenge]'),challenge);

    const solution = textFor(project.solution);
    setOptionalSection('solution',hasText(solution));
    renderTextBlocks(document.querySelector('[data-project-solution]'),solution);

    const results = project.results.filter(item => hasText(textFor(item.label)) || hasText(item.value) || hasText(textFor(item.note)));
    setOptionalSection('results',results.length > 0);
    renderResults(results);

    const gallery = project.gallery.filter(item => hasText(item.url));
    setOptionalSection('gallery',gallery.length > 0);
    renderGallery(gallery,project);

    const image = document.querySelector('[data-project-image]');
    const media = document.querySelector('[data-project-media]');
    if(image){
      image.src = project.image;
      image.alt = projectName(project);
      imageFallback(image,media);
    }
    document.querySelectorAll('[data-project-image-copy]').forEach((copy,copyIndex) => {
      copy.src = project.image;
      copy.alt = `${projectName(project)} — ${t[state.lang][['visual_overview','visual_detail','visual_flow'][copyIndex]] || projectName(project)}`;
      imageFallback(copy,copy.closest('[data-visual-media]'));
    });

    if(previous){
      setHref('[data-project-prev]',detailUrl(previous));
      setText('[data-prev-title]',projectName(previous));
      setText('[data-prev-domain]',previous.domain);
    }

    if(next){
      setHref('[data-project-next]',detailUrl(next));
      setText('[data-next-index]',`#${String(next.id).padStart(2,'0')}`);
      setText('[data-next-title]',projectName(next));
      setText('[data-next-domain]',next.domain);
      const nextImage = document.querySelector('[data-next-image]');
      const nextMedia = document.querySelector('[data-next-media]');
      if(nextImage){
        nextImage.src = next.image;
        nextImage.alt = projectName(next);
        imageFallback(nextImage,nextMedia);
      }
    }

    document.querySelectorAll('[data-project-contact]').forEach(link => { link.href = `contact.html?project=${encodeURIComponent(project.slug)}`; });
    document.title = `${projectName(project)} — NEXORA Technologies`;
    const descriptionMeta = document.querySelector('meta[name="description"]');
    const seoDescription = textFor(project.seo?.description || {});
    if(descriptionMeta) descriptionMeta.content = seoDescription || shortDescription || `${projectName(project)} — ${project.domain} | NEXORA Technologies`;

    updateSectionNumbers();
    observeReveals();
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
    renderProject();
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
      }, {threshold:.08,rootMargin:'0px 0px -4% 0px'});
    }
    document.querySelectorAll('.reveal:not(.is-visible)').forEach(el => {
      if(!el.closest('[hidden]')) observer.observe(el);
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
    const progress = Math.min(1,Math.max(0,scrollY / max));
    root.style.setProperty('--scroll-progress',`${progress * 100}%`);
    const indicator = document.querySelector('.project-progress i');
    if(indicator) indicator.style.transform = `scaleX(${progress})`;
    document.querySelector('.nav')?.classList.toggle('is-scrolled',scrollY > 16);
  }

  async function init(){
    applyTheme();
    try {
      state.projects = await repository.list();
      const params = new URLSearchParams(location.search);
      const slug = params.get('slug');
      state.project = slug ? await repository.bySlug(slug) : (state.projects[0] || null);
    } catch (error) {
      console.error('NEXORA project repository error',error);
      state.projects = (window.NEXORA_DATA?.projects || []).map(normalizeProject);
      const slug = new URLSearchParams(location.search).get('slug');
      state.project = slug ? state.projects.find(project => project.slug === slug) || null : state.projects[0] || null;
    }
    applyLanguage();
    observeReveals();
    updateScroll();

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
    document.addEventListener('keydown',event => { if(event.key === 'Escape') toggleDrawer(false); });
    addEventListener('scroll',updateScroll,{passive:true});
    matchMedia('(prefers-color-scheme: light)').addEventListener?.('change',() => { if(state.theme === 'system') applyTheme(); });
  }

  document.addEventListener('DOMContentLoaded',init);
})();
