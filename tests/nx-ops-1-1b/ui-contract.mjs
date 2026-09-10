import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const assert=(cond,msg)=>{if(!cond)throw new Error(msg)};

const clients=read('public/admin/js/modules/clients.js');
const ui=read('public/admin/js/core/ui.js');
const adminCss=read('public/admin/css/admin.css');
const i18n=read('public/admin/js/core/i18n.js');
const page=read('public/client-profile.html');
const pageJs=read('public/js/client-profile.js');
const pageCss=read('public/css/client-profile.css');
const server=read('src/modules/operations/client-profile.js');
const router=read('src/api-router.js');

// Admin workflow: visible operational controls, no technical notes in lifecycle/toasts.
for(const marker of ['profileCompletionSection','data-profile-generate','data-profile-copy','data-profile-revoke','profileLinks','navigator.clipboard'])assert(clients.includes(marker),`admin profile-completion UI marker missing: ${marker}`);
assert(!/lifecycleSection[\s\S]{0,1200}clientLifecycleHelp/.test(clients),'technical lifecycle help is still rendered');
assert(!/lifecycleSection[\s\S]{0,1400}deleteClientHint/.test(clients),'technical delete sequencing note is still rendered');
assert(!clients.includes("toast(`${t('clientCreatedSuccess')} ${saved.client_code"),'create toast still appends implementation detail');
assert(!i18n.includes('تم حذف العميل نهائيًا مع الحفاظ على تسلسل الأكواد'),'Arabic technical delete toast remains');
assert(!i18n.includes('Client permanently deleted. Client-code sequencing was preserved.'),'English technical delete toast remains');
for(const key of ['profileCompletion','generateProfileLink','generateNewProfileLink','copyProfileLink','revokeProfileLink','profileLinkGenerated','profileLinkCopied','profileLinkRevokedToast'])assert(i18n.includes(`${key}:`),`admin i18n key missing: ${key}`);

// Notification standard: top edge, direction-aware logical placement, semantic state icon, Dark/Light support.
assert(ui.includes('toast-icon')&&ui.includes("kind==='error'?'alert':'status'"),'semantic admin toast missing');
for(const marker of ['.toast{top:92px','inset-inline-end:24px','.toast.ok .toast-icon','.toast.error .toast-icon','html[data-theme="light"] .toast','@media(max-width:560px){.toast{top:82px'])assert(adminCss.includes(marker),`notification UX CSS marker missing: ${marker}`);

// Client-facing page: token stays in URL fragment and is sent only in JSON body to same-origin API.
assert(page.includes('meta name="referrer" content="no-referrer"'),'no-referrer policy missing');
assert(page.includes('Content-Security-Policy'),'CSP meta missing');
assert(page.includes('id="profileForm"')&&page.includes('id="profileTaxField"'),'client profile form/tax field missing');
assert(!/name="client_code"|name="client_type"|name="status"/.test(page),'client-facing page exposes server-owned identity/lifecycle fields');
assert(pageJs.includes('tokenFromHash')&&pageJs.includes("new URLSearchParams(raw)")&&pageJs.includes("params.get('token')"),'fragment token resolution missing');
assert(!pageJs.includes('location.search'),'client capability token must not use query string');
assert(pageJs.includes("api('/client-profile/resolve',{token})")&&pageJs.includes("api('/client-profile/complete',{token,profile:profileBody()})"),'public profile API flow missing');
assert(pageJs.includes("resolved.client_type==='individual'")&&pageJs.includes("profileTaxField').hidden"),'conditional Individual tax UX missing');
for(const marker of ['data-theme="dark"','profileLangBtn','profileThemeBtn','aria-live="polite"'])assert(page.includes(marker),`client page accessibility/theme marker missing: ${marker}`);
for(const marker of ['html[data-theme="light"]','.profile-select option','.profile-toast{position:fixed;top:20px','inset-inline-end:20px','@media(max-width:720px)'])assert(pageCss.includes(marker),`client page responsive/theme marker missing: ${marker}`);

// Server authority and security boundaries.
for(const route of ['/api/v1/client-profile/resolve','/api/v1/client-profile/complete','/api/v1/admin/clients/:id/profile-completion','/api/v1/admin/clients/:id/profile-completion/generate','/api/v1/admin/clients/:id/profile-completion/revoke'])assert(router.includes(route),`profile route missing: ${route}`);
for(const marker of ['crypto.getRandomValues(new Uint8Array(32))','sha256Hex(token)','token_hash','rateAllow','assertSameOrigin(request)','CLIENT_PROFILE_LINK_INVALID','completed_at=?','clientType===\'company\''])assert(server.includes(marker),`profile security marker missing: ${marker}`);
assert(!/INSERT INTO client_profile_tokens\([^)]*\btoken\b/i.test(server),'raw token column/storage introduced');
assert(server.includes("new URL('/client-profile.html',request.url)")&&server.includes('#token='),'admin-generated URL must place secret in fragment');
assert(!server.includes('context:{token:'),'raw token leaked to audit context');
assert(server.includes('status!==\'active\'')||server.includes("status!=='active'"),'inactive client capability guard missing');
console.log('NX_OPS_1_1B_UI_CONTRACT_PASS');
