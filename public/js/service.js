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
      breadcrumb:'Services', serviceLabel:'Service', start:'Start a Project', allServices:'All Services', statusLabel:'Status', available:'Available', scopeLabel:'Scope', tailored:'Tailored to project needs', catalogLabel:'Catalog',
      aboutEyebrow:'ABOUT', aboutTitle:'About this service.', capabilitiesEyebrow:'CAPABILITIES', capabilitiesTitle:'What can be included.', techEyebrow:'TECHNOLOGIES', techTitle:'Tools selected for the job.',
      methodEyebrow:'DELIVERY', methodTitle:'From scope to launch.', methodCopy:'The exact scope changes, but the delivery discipline stays clear from discovery through release.', discover:'Discover', discoverD:'Clarify goals, users, constraints and success criteria.', design:'Design', designD:'Shape the experience, structure and interaction model.', build:'Build', buildD:'Develop, integrate and test with maintainable engineering.', launch:'Launch', launchD:'Deploy, verify and prepare the product for real use.',
      relatedEyebrow:'RELATED WORK', relatedTitle:'Projects using this service.', continueEyebrow:'NEXT / CONTINUE', continueTitle:'Explore another service.', nextService:'Next Service', ctaEyebrow:'YOUR PROJECT', ctaTitle:'Need this service for your project?', ctaCopy:'Tell us what you’re building and we’ll help shape the right scope.', notFoundTitle:'Service not found.', notFoundCopy:'This service is not available in the current catalog.'
    },
    ar: {
      breadcrumb:'الخدمات', serviceLabel:'خدمة', start:'ابدأ مشروعك', allServices:'كل الخدمات', statusLabel:'الحالة', available:'متاحة', scopeLabel:'النطاق', tailored:'يتم تحديده حسب احتياج المشروع', catalogLabel:'الفهرس',
      aboutEyebrow:'عن الخدمة', aboutTitle:'عن هذه الخدمة.', capabilitiesEyebrow:'الإمكانات', capabilitiesTitle:'ما الذي يمكن أن يشمله النطاق.', techEyebrow:'التقنيات', techTitle:'أدوات نختارها حسب الاحتياج.',
      methodEyebrow:'التنفيذ', methodTitle:'من تحديد النطاق إلى الإطلاق.', methodCopy:'تفاصيل كل مشروع تختلف، لكن مسار التنفيذ يفضل واضح من الفهم وحتى الإطلاق.', discover:'اكتشاف', discoverD:'نفهم الأهداف والمستخدمين والقيود ومعايير النجاح.', design:'تصميم', designD:'نحدد التجربة والهيكل وطريقة التفاعل.', build:'تطوير', buildD:'نبني ونربط ونختبر بكود قابل للصيانة.', launch:'إطلاق', launchD:'ننشر ونتحقق ونجهز المنتج للاستخدام الحقيقي.',
      relatedEyebrow:'أعمال مرتبطة', relatedTitle:'مشاريع استخدمت هذه الخدمة.', continueEyebrow:'التالي / تابع', continueTitle:'استكشف خدمة أخرى.', nextService:'الخدمة التالية', ctaEyebrow:'مشروعك', ctaTitle:'محتاج الخدمة دي في مشروعك؟', ctaCopy:'احكيلنا بتبني إيه ونحدد معاك النطاق المناسب.', notFoundTitle:'الخدمة غير موجودة.', notFoundCopy:'الخدمة المطلوبة غير متاحة داخل كتالوج الخدمات الحالي.'
    }
  };

  const state = { service:null, services:[] };
  let revealObserver;
  const language = () => localStorage.getItem('nexora_lang') === 'ar' ? 'ar' : 'en';
  const localized = value => value?.[language()] || value?.en || value?.ar || '';
  const detailUrl = service => `service.html?slug=${encodeURIComponent(service.slug)}`;
  const setText = (selector,value) => document.querySelectorAll(selector).forEach(el => { el.textContent = value ?? ''; });
  const setOptional = (key,visible) => { const el=document.querySelector(`[data-service-optional="${key}"]`); if(el) el.hidden=!visible; };

  function renderStaticCopy(){
    const dict = copy[language()];
    document.querySelectorAll('[data-service-i18n]').forEach(el => { const value=dict[el.dataset.serviceI18n]; if(value) el.textContent=value; });
  }

  function renderParagraphs(container,text){
    if(!container) return;
    container.replaceChildren();
    String(text || '').split(/\n{2,}/).map(v=>v.trim()).filter(Boolean).forEach(value => { const p=document.createElement('p'); p.textContent=value; container.appendChild(p); });
  }

  function renderCapabilities(items){
    const root=document.querySelector('[data-service-capabilities]'); if(!root) return; root.replaceChildren();
    items.forEach((item,index)=>{ const title=localized(item.title); if(!title) return; const row=document.createElement('article'); row.className='service-capability'; const n=document.createElement('span'); n.textContent=String(index+1).padStart(2,'0'); const body=document.createElement('div'); const h=document.createElement('h3'); h.textContent=title; body.appendChild(h); const desc=localized(item.description); if(desc){const p=document.createElement('p');p.textContent=desc;body.appendChild(p);} row.append(n,body); root.appendChild(row); });
  }

  function renderTechnologies(items){
    const root=document.querySelector('[data-service-technologies]'); if(!root) return; root.replaceChildren();
    items.forEach((item,index)=>{ const name=localized(item.name); if(!name) return; const row=document.createElement('div'); row.className='service-tech'; const n=document.createElement('span'); n.textContent=String(index+1).padStart(2,'0'); const strong=document.createElement('strong'); strong.textContent=name; row.append(n,strong); root.appendChild(row); });
  }

  function renderRelatedProjects(items){
    const root=document.querySelector('[data-service-related-projects]'); if(!root) return; root.replaceChildren();
    items.forEach(project=>{ if(!project.slug || !localized(project.title)) return; const a=document.createElement('a'); a.className='service-related-card reveal'; a.href=`project.html?slug=${encodeURIComponent(project.slug)}`; if(project.image){const img=document.createElement('img');img.src=project.image;img.alt=localized(project.title);img.loading='lazy';a.appendChild(img);} const body=document.createElement('div'); const h=document.createElement('h3'); h.textContent=localized(project.title); body.appendChild(h); if(project.domain){const p=document.createElement('p');p.textContent=project.domain;body.appendChild(p);} a.appendChild(body); root.appendChild(a); });
  }

  function observeReveals(){
    const nodes=[...document.querySelectorAll('.reveal:not(.is-visible)')].filter(el=>!el.closest('[hidden]'));
    if(!nodes.length) return;
    if(!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches){nodes.forEach(el=>el.classList.add('is-visible'));return;}
    if(!revealObserver){revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');revealObserver.unobserve(entry.target);}}),{threshold:.08,rootMargin:'0px 0px -4% 0px'});}
    nodes.forEach(el=>revealObserver.observe(el));
  }

  function updateSectionNumbers(){
    let index=0;
    document.querySelectorAll('[data-service-optional], [data-service-section]').forEach(section=>{ if(section.hidden) return; index+=1; section.querySelectorAll('[data-section-number]').forEach(el=>el.textContent=String(index).padStart(2,'0')); });
  }

  function render(){
    renderStaticCopy();
    const service=state.service;
    const main=document.querySelector('[data-service-page]');
    const notFound=document.querySelector('[data-service-not-found]');
    if(!service){
      main?.querySelectorAll(':scope > section:not([data-service-not-found])').forEach(section=>section.hidden=true);
      if(notFound) notFound.hidden=false;
      document.title=`NEXORA Technologies — ${copy[language()].notFoundTitle}`;
      document.documentElement.classList.remove('i18n-preload','service-data-pending');
      return;
    }
    if(notFound) notFound.hidden=true;
    main?.querySelectorAll(':scope > section:not([data-service-optional]):not([data-service-not-found])').forEach(section=>section.hidden=false);
    const index=Math.max(0,state.services.findIndex(item=>item.slug===service.slug));
    const next=state.services[(index+1)%state.services.length];
    const title=localized(service.title);
    const short=localized(service.shortDescription);
    const number=String(index+1).padStart(2,'0');

    setText('[data-service-title]',title); setText('[data-service-short-description]',short); setText('[data-service-number]',number); setText('[data-service-index]',number); setText('[data-service-total]',String(state.services.length).padStart(2,'0')); setText('[data-service-position]',`${number} / ${String(state.services.length).padStart(2,'0')}`);
    document.querySelectorAll('[data-service-icon]').forEach(el=>{el.innerHTML=icons[service.icon]||icons.custom;});

    const description=localized(service.description); setOptional('description',Boolean(description)); renderParagraphs(document.querySelector('[data-service-description]'),description);
    const capabilities=service.capabilities.filter(item=>localized(item.title)); setOptional('capabilities',capabilities.length>0); renderCapabilities(capabilities);
    const technologies=service.technologies.filter(item=>localized(item.name)); setOptional('technologies',technologies.length>0); renderTechnologies(technologies);
    const related=service.relatedProjects.filter(item=>item.slug&&localized(item.title)); setOptional('relatedProjects',related.length>0); renderRelatedProjects(related);

    if(next){
      const nextTitle=localized(next.title); const nextShort=localized(next.shortDescription); const nextNumber=String(((index+1)%state.services.length)+1).padStart(2,'0');
      const link=document.querySelector('[data-next-service]'); if(link) link.href=detailUrl(next);
      setText('[data-next-number]',nextNumber); setText('[data-next-title]',nextTitle); setText('[data-next-description]',nextShort);
      document.querySelectorAll('[data-next-icon]').forEach(el=>{el.innerHTML=icons[next.icon]||icons.custom;});
    }

    document.title=`${title} — NEXORA Technologies`;
    const meta=document.querySelector('meta[name="description"]');
    const seoDescription=localized(service.seo?.description || {}); if(meta) meta.content=seoDescription||short||`${title} | NEXORA Technologies`;
    updateSectionNumbers(); observeReveals(); document.documentElement.classList.remove('i18n-preload','service-data-pending');
  }

  function updateProgress(){
    const max=Math.max(1,document.documentElement.scrollHeight-innerHeight); const progress=Math.min(1,Math.max(0,scrollY/max)); const bar=document.querySelector('.service-progress i'); if(bar) bar.style.transform=`scaleX(${progress})`;
  }

  async function load(){
    try{
      state.services=await window.NEXORA_REPOSITORIES.services.list();
      const slug=new URLSearchParams(location.search).get('slug');
      state.service=slug?await window.NEXORA_REPOSITORIES.services.bySlug(slug):(state.services[0]||null);
      if(state.service) document.querySelectorAll('[data-service-contact]').forEach(link=>link.href=`contact.html?service=${encodeURIComponent(state.service.slug)}`);
    }catch(error){console.error('NEXORA service detail error',error);state.services=[];state.service=null;}
    render(); updateProgress();
  }

  document.addEventListener('DOMContentLoaded',()=>{
    load();
    document.querySelector('[data-lang-toggle]')?.addEventListener('click',()=>setTimeout(render,0));
    addEventListener('scroll',updateProgress,{passive:true});
  });
})();
