(() => {
  function normalizeConfig(raw){
    const base = window.NEXORA_INQUIRY_CONFIG || {};
    return {
      projectStages: Array.isArray(raw?.projectStages || raw?.project_stages) ? (raw.projectStages || raw.project_stages) : (base.projectStages || []),
      timelines: Array.isArray(raw?.timelines) ? raw.timelines : (base.timelines || []),
      budgetModes: Array.isArray(raw?.budgetModes || raw?.budget_modes) ? (raw.budgetModes || raw.budget_modes) : (base.budgetModes || []),
      currencies: Array.isArray(raw?.currencies) ? raw.currencies : (base.currencies || ['EGP','USD'])
    };
  }

  async function config(){
    if(window.NEXORA_API?.apiEnabled){
      const remote = await window.NEXORA_API.request('/api/v1/project-inquiries/config');
      return normalizeConfig(remote || {});
    }
    return normalizeConfig({});
  }

  async function submit(payload){
    if(!window.NEXORA_API?.apiEnabled) throw new Error('API_NOT_CONFIGURED');
    return window.NEXORA_API.request('/api/v1/project-inquiries',{
      method:'POST',
      headers:{'Content-Type':'application/json','Idempotency-Key':payload.client_request_id},
      body:JSON.stringify(payload)
    });
  }

  window.NEXORA_REPOSITORIES = window.NEXORA_REPOSITORIES || {};
  window.NEXORA_REPOSITORIES.inquiries = { config, submit, normalizeConfig };
})();
