(() => {
  const config = window.NEXORA_CONFIG || {};
  const apiEnabled = config.apiEnabled === true;
  const apiBase = String(config.apiBase || '').replace(/\/$/, '');
  const timeoutMs = Math.max(1000, Number(config.requestTimeoutMs || 8000));

  function endpoint(path) {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${apiBase}${normalized}`;
  }

  async function request(path, options = {}) {
    if (!apiEnabled) {
      const error = new Error('API_NOT_CONFIGURED');
      error.code = 'API_NOT_CONFIGURED';
      throw error;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const callerSignal = options.signal;
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort();
      else callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const response = await fetch(endpoint(path), {
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json', ...(options.headers || {}) },
        ...options,
        signal: controller.signal
      });

      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json') ? await response.json() : null;
      if (!response.ok) {
        const error = new Error(payload?.error?.message || `API_${response.status}`);
        error.status = response.status;
        error.code = payload?.error?.code || `API_${response.status}`;
        error.details = payload?.error?.details || [];
        error.requestId = payload?.request_id || response.headers.get('x-request-id') || '';
        throw error;
      }
      return payload?.data ?? payload;
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error('API_TIMEOUT');
        timeoutError.code = 'API_TIMEOUT';
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  window.NEXORA_API = { apiEnabled, apiBase, endpoint, request };
})();
