(() => {
  function localized(value, legacyAr = '', legacyEn = '') {
    if (typeof value === 'string') return { ar: value, en: value };
    return {
      ar: String(value?.ar ?? legacyAr ?? ''),
      en: String(value?.en ?? legacyEn ?? '')
    };
  }

  function normalizeTerm(raw, index) {
    if (typeof raw === 'string') return { id: index + 1, slug: '', name: { ar: raw, en: raw }, iconUrl: '' };
    return {
      id: Number(raw?.id ?? index + 1),
      slug: String(raw?.slug || ''),
      name: localized(raw?.name || raw?.title, raw?.name_ar || raw?.title_ar, raw?.name_en || raw?.title_en),
      iconUrl: String(raw?.iconUrl ?? raw?.icon_url ?? '')
    };
  }

  function normalizeResult(raw, index) {
    if (typeof raw === 'string') return { id: index + 1, value: '', label: { ar: raw, en: raw }, note: { ar: '', en: '' } };
    return {
      id: Number(raw?.id ?? index + 1),
      value: String(raw?.value ?? ''),
      label: localized(raw?.label, raw?.label_ar, raw?.label_en),
      note: localized(raw?.note, raw?.note_ar, raw?.note_en)
    };
  }

  function normalizeMedia(raw, index) {
    if (typeof raw === 'string') return { id: index + 1, url: raw, alt: { ar: '', en: '' }, caption: { ar: '', en: '' } };
    return {
      id: Number(raw?.id ?? index + 1),
      url: String(raw?.url ?? raw?.image ?? raw?.media_url ?? raw?.src ?? ''),
      alt: localized(raw?.alt, raw?.alt_ar, raw?.alt_en),
      caption: localized(raw?.caption, raw?.caption_ar, raw?.caption_en)
    };
  }

  function normalizeProject(raw) {
    const title = localized(raw?.title, raw?.titleAr || raw?.title_ar, raw?.titleEn || raw?.title_en);
    const shortDescription = localized(raw?.shortDescription || raw?.short_description, raw?.short_description_ar, raw?.short_description_en);
    const description = localized(raw?.description, raw?.description_ar, raw?.description_en);
    const challenge = localized(raw?.challenge, raw?.challenge_ar, raw?.challenge_en);
    const solution = localized(raw?.solution, raw?.solution_ar, raw?.solution_en);
    const image = String(raw?.image ?? raw?.coverImage ?? raw?.cover_image?.url ?? raw?.cover_image ?? '');
    const url = String(raw?.url ?? raw?.websiteUrl ?? raw?.website_url ?? '');
    const featured = raw?.featured === true || raw?.isFeatured === true || raw?.is_featured === true;
    const sortOrder = Number(raw?.sortOrder ?? raw?.sort_order ?? raw?.id ?? 0);

    return {
      id: Number(raw?.id || 0),
      slug: String(raw?.slug || ''),
      title,
      titleAr: title.ar,
      titleEn: title.en,
      shortDescription,
      description,
      challenge,
      solution,
      url,
      domain: String(raw?.domain || ''),
      image,
      status: String(raw?.status || 'live'),
      featured,
      sortOrder,
      technologies: Array.isArray(raw?.technologies) ? raw.technologies.map(normalizeTerm) : [],
      services: Array.isArray(raw?.services) ? raw.services.map(normalizeTerm) : [],
      results: Array.isArray(raw?.results) ? raw.results.map(normalizeResult) : [],
      gallery: Array.isArray(raw?.gallery) ? raw.gallery.map(normalizeMedia).filter(item => item.url) : [],
      seo: {
        title: localized(raw?.seo?.title, raw?.seo_title_ar, raw?.seo_title_en),
        description: localized(raw?.seo?.description, raw?.seo_description_ar, raw?.seo_description_en)
      }
    };
  }

  function localProjects() {
    return (window.NEXORA_DATA?.projects || []).map(normalizeProject)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  }

  function fallbackAllowed() {
    return window.NEXORA_CONFIG?.staticFallback !== false;
  }

  async function list() {
    if (window.NEXORA_API?.apiEnabled) {
      try {
        const source = await window.NEXORA_API.request('/api/v1/projects');
        return (Array.isArray(source) ? source : []).map(normalizeProject)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
      } catch (error) {
        if (!fallbackAllowed()) throw error;
        console.warn('NEXORA projects API unavailable; static fallback used.', error?.code || error?.message || error);
      }
    }
    return localProjects();
  }

  async function bySlug(slug) {
    if (!slug) return null;
    if (window.NEXORA_API?.apiEnabled) {
      try {
        const source = await window.NEXORA_API.request(`/api/v1/projects/${encodeURIComponent(slug)}`);
        return source ? normalizeProject(source) : null;
      } catch (error) {
        if (!fallbackAllowed()) throw error;
        console.warn('NEXORA project detail API unavailable; static fallback used.', error?.code || error?.message || error);
      }
    }
    return localProjects().find(project => project.slug === slug) || null;
  }

  window.NEXORA_REPOSITORIES = window.NEXORA_REPOSITORIES || {};
  window.NEXORA_REPOSITORIES.projects = { list, bySlug, normalizeProject };
  window.NEXORA_PROJECT_REPOSITORY = window.NEXORA_REPOSITORIES.projects;
})();
