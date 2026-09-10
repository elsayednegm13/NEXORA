'use strict';

export const state={
  lang:document.documentElement.lang==='en'?'en':'ar',
  theme:document.documentElement.dataset.theme==='light'?'light':'dark',
  user:null,csrf:'',view:'overview',dashboard:null,inquiries:[],clients:[],clientMeta:null,clientConfig:null,clientProjects:[],clientProjectMeta:null,clientProjectConfig:null,clientProjectClientScope:null,projects:[],services:[],
  syncTimer:null,syncBusy:false,syncInterval:20000,lastSyncAt:null,activeInquiry:null,activeClient:null,activeClientProject:null,drawerMode:null,projectWorkspaceOpen:false
};
