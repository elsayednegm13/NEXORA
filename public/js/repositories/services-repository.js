(() => {
  function normalizeLocalized(value) {
    if (!value) return { ar: '', en: '' };
    if (typeof value === 'string') return { ar: value, en: value };
    return { ar: String(value.ar || ''), en: String(value.en || '') };
  }

  function normalizeCapability(raw, index) {
    if (typeof raw === 'string') {
      return { id: index + 1, title: normalizeLocalized(raw), description: { ar: '', en: '' }, sortOrder: index + 1 };
    }
    return {
      id: Number(raw?.id ?? index + 1),
      title: normalizeLocalized(raw?.title || { ar: raw?.title_ar || '', en: raw?.title_en || '' }),
      description: normalizeLocalized(raw?.description || { ar: raw?.description_ar || '', en: raw?.description_en || '' }),
      sortOrder: Number(raw?.sortOrder ?? raw?.sort_order ?? index + 1)
    };
  }

  function normalizeTechnology(raw, index) {
    if (typeof raw === 'string') {
      return { id: index + 1, slug: '', name: normalizeLocalized(raw), iconUrl: '', sortOrder: index + 1 };
    }
    return {
      id: Number(raw?.id ?? index + 1),
      slug: String(raw?.slug || ''),
      name: normalizeLocalized(raw?.name || raw?.title || { ar: raw?.name_ar || raw?.title_ar || '', en: raw?.name_en || raw?.title_en || '' }),
      iconUrl: String(raw?.iconUrl ?? raw?.icon_url ?? ''),
      sortOrder: Number(raw?.sortOrder ?? raw?.sort_order ?? index + 1)
    };
  }

  function normalizeProject(raw, index) {
    return {
      id: Number(raw?.id ?? index + 1),
      slug: String(raw?.slug || ''),
      title: normalizeLocalized(raw?.title || { ar: raw?.titleAr || raw?.title_ar || '', en: raw?.titleEn || raw?.title_en || '' }),
      image: String(raw?.image ?? raw?.coverImage ?? raw?.cover_image ?? ''),
      domain: String(raw?.domain || ''),
      sortOrder: Number(raw?.sortOrder ?? raw?.sort_order ?? index + 1)
    };
  }

  function normalizeService(raw) {
    return {
      id: Number(raw?.id),
      slug: String(raw?.slug || ''),
      title: normalizeLocalized(raw?.title || { ar: raw?.titleAr || raw?.title_ar || '', en: raw?.titleEn || raw?.title_en || '' }),
      shortDescription: normalizeLocalized(raw?.shortDescription || raw?.short_description || { ar: raw?.short_description_ar || '', en: raw?.short_description_en || '' }),
      description: raw?.description ? normalizeLocalized(raw.description) : normalizeLocalized({ ar: raw?.description_ar || '', en: raw?.description_en || '' }),
      icon: String(raw?.icon || raw?.iconKey || raw?.icon_key || 'custom'),
      active: raw?.active !== false && raw?.is_active !== false,
      featured: raw?.featured === true || raw?.is_featured === true,
      sortOrder: Number(raw?.sortOrder ?? raw?.sort_order ?? 0),
      capabilities: Array.isArray(raw?.capabilities) ? raw.capabilities.map(normalizeCapability).sort((a,b) => a.sortOrder - b.sortOrder || a.id - b.id) : [],
      technologies: Array.isArray(raw?.technologies) ? raw.technologies.map(normalizeTechnology).sort((a,b) => a.sortOrder - b.sortOrder || a.id - b.id) : [],
      relatedProjects: Array.isArray(raw?.relatedProjects || raw?.related_projects) ? (raw.relatedProjects || raw.related_projects).map(normalizeProject).sort((a,b) => a.sortOrder - b.sortOrder || a.id - b.id) : [],
      seo: {
        title: normalizeLocalized(raw?.seo?.title || { ar: raw?.seo_title_ar || '', en: raw?.seo_title_en || '' }),
        description: normalizeLocalized(raw?.seo?.description || { ar: raw?.seo_description_ar || '', en: raw?.seo_description_en || '' })
      }
    };
  }

  function staticList() {
    return (window.NEXORA_SERVICES_DATA || []).map(normalizeService)
      .filter(service => service.active)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  }

  function fallbackAllowed() { return window.NEXORA_CONFIG?.staticFallback !== false; }

  async function list() {
    if (window.NEXORA_API?.apiEnabled) {
      try {
        const source = await window.NEXORA_API.request('/api/v1/services');
        return (Array.isArray(source) ? source : []).map(normalizeService)
          .filter(service => service.active)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
      } catch (error) {
        if (!fallbackAllowed()) throw error;
        console.warn('NEXORA services API unavailable; static fallback used.', error?.code || error?.message || error);
      }
    }
    return staticList();
  }

  async function bySlug(slug) {
    if (!slug) return null;
    if (window.NEXORA_API?.apiEnabled) {
      try {
        const source = await window.NEXORA_API.request(`/api/v1/services/${encodeURIComponent(slug)}`);
        const service = source ? normalizeService(source) : null;
        return service?.active ? service : null;
      } catch (error) {
        if (!fallbackAllowed()) throw error;
        console.warn('NEXORA service detail API unavailable; static fallback used.', error?.code || error?.message || error);
      }
    }
    return staticList().find(service => service.slug === slug) || null;
  }

  window.NEXORA_REPOSITORIES = window.NEXORA_REPOSITORIES || {};
  window.NEXORA_REPOSITORIES.services = { list, bySlug, normalizeService };
})();
