(() => {
  const existing = window.NEXORA_CONFIG || {};
  window.NEXORA_CONFIG = {
    // Shared-hosting production default: API lives on the same domain under /api/v1.
    apiEnabled: existing.apiEnabled !== false,
    apiBase: String(existing.apiBase || '').replace(/\/$/, ''),
    requestTimeoutMs: Math.max(1000, Number(existing.requestTimeoutMs || 8000)),
    // Read-only public content can fall back to approved static seed data if the API is temporarily unavailable.
    // Inquiry submission never fakes success and still requires the live API.
    staticFallback: existing.staticFallback !== false
  };
})();
