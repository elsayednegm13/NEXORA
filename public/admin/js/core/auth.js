'use strict';

import { state } from './state.js';
import { $ } from './dom.js';

let navigateHandler=async()=>{};
let startLiveSyncHandler=()=>{};
let stopLiveSyncHandler=()=>{};
export function configureAuth({navigate,startLiveSync,stopLiveSync}={}){if(navigate)navigateHandler=navigate;if(startLiveSync)startLiveSyncHandler=startLiveSync;if(stopLiveSync)stopLiveSyncHandler=stopLiveSync}

export function showLogin(message=''){stopLiveSyncHandler();$('#appView').hidden=true;$('#loginView').hidden=false;$('#boot').style.opacity='0';setTimeout(()=>$('#boot').hidden=true,300);if(message){$('#loginError').textContent=message;$('#loginError').hidden=false}}
export function showApp(){state.user&&($('#adminName').textContent=state.user.name,$('#adminEmail').textContent=state.user.email);$('#loginView').hidden=true;$('#appView').hidden=false;$('#boot').style.opacity='0';setTimeout(()=>$('#boot').hidden=true,300);navigateHandler(location.hash.replace('#','')||'overview',false);startLiveSyncHandler()}
