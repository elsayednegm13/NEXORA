'use strict';

import { DurableObject } from 'cloudflare:workers';
import worker from './worker.js';

export class ProjectRealtimeRoom extends DurableObject {
  constructor(ctx,env){super(ctx,env);this.state=ctx;this.env=env}
  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname==='/connect'){
      if(String(request.headers.get('Upgrade')||'').toLowerCase()!=='websocket')return new Response('Expected WebSocket',{status:426});
      const role=request.headers.get('X-Nexora-Realtime-Role')==='admin'?'admin':'client';
      const grantId=request.headers.get('X-Nexora-Grant-Id')||null;
      const pair=new WebSocketPair();
      const client=pair[0],server=pair[1];
      server.serializeAttachment({role,grant_id:grantId});
      this.state.acceptWebSocket(server,[`role:${role}`]);
      return new Response(null,{status:101,webSocket:client});
    }
    if(url.pathname==='/broadcast'&&request.method==='POST'){
      let event={};try{event=await request.json()}catch{return new Response('Bad JSON',{status:400})}
      const raw=JSON.stringify(event),sockets=this.state.getWebSockets();let delivered=0;
      for(const ws of sockets){
        let meta=null;try{meta=ws.deserializeAttachment()}catch{}
        if(event.visibility==='internal'&&meta?.role!=='admin')continue;
        try{ws.send(raw);delivered++}catch{}
      }
      return new Response(JSON.stringify({delivered}),{status:200,headers:{'Content-Type':'application/json'}});
    }
    return new Response('Not found',{status:404});
  }
  async webSocketMessage(ws,message){if(String(message)==='ping'){try{ws.send('pong')}catch{}}}
  async webSocketClose(ws,code,reason){try{ws.close(code,reason)}catch{}}
  async webSocketError(ws){try{ws.close(1011,'Realtime error')}catch{}}
}

export default worker;
