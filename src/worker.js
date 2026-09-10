'use strict';

import { requestId, errorResponse } from './core/http.js';
import { handleApi } from './api-router.js';

export default {
  async fetch(request, env) {
    const rid=requestId();
    try {
      const path=new URL(request.url).pathname;
      if(path.startsWith('/api/'))return await handleApi(request,env,rid);
      if(env.ASSETS)return env.ASSETS.fetch(request);
      return new Response('Not found',{status:404});
    } catch(err) { return errorResponse(err,rid); }
  }
};
