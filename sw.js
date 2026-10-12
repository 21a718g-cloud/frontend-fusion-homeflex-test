'use strict';
const CACHE='fusion-homeflex-test-shell-v1.5.5-ready-on-add';
const ASSETS=['./','./index.html','./style.css','./app.js','./homeflex.js','./capture.js','./homeflex.css','./homeflex-art.svg','./manifest.webmanifest','./14-icon-192.png','./15-icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'}))))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('fusion-homeflex-test-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{if(e.data==='ACTIVATE_UPDATE')self.skipWaiting()});
function sharedAlbumURL(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&((u.hostname==='photos.app.goo.gl'&&/^\/[A-Za-z0-9_-]+\/?$/.test(u.pathname))||(u.hostname==='photos.google.com'&&/^\/(?:u\/\d+\/)?(?:album|share)\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)))?u.href:null;}catch{return null;}}
async function storeShare(request){
  if(Number(request.headers.get('content-length'))>16000)return new Response('Share is too large.',{status:413});
  const form=await request.formData();
  const values=['title','text','url'].map(k=>form.get(k)||'');
  if(values.some(x=>typeof x!=='string'||x.length>5000))return new Response('Only short title/text/URL shares are accepted.',{status:400});
  const [title,text,url]=values;
  const links=[url,...text.match(/https:\/\/[^\s<>]+/g)||[],...title.match(/https:\/\/[^\s<>]+/g)||[]].map(sharedAlbumURL).filter(Boolean);
  const unique=[...new Set(links)];
  if(unique.length!==1)return new Response('Share exactly one Google Photos album link.',{status:400});
  const albumTitle=title&&!sharedAlbumURL(title)&&title!=='Google Photos'?title:'';
  if(albumTitle.length>120)return new Response('Title exceeds 120 characters. Open HomeFlex and import the link instead.',{status:400});
  const id=crypto.randomUUID(),payload={title:albumTitle,url:unique[0]};
  const d=await new Promise((resolve,reject)=>{const r=indexedDB.open('homeflex.fusion-test.capture-inbox.v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('captures');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  try{await new Promise((resolve,reject)=>{const t=d.transaction('captures','readwrite'),s=t.objectStore('captures');const cursor=s.openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(c){if(Date.now()-(c.value.receivedAt||0)>86400000)c.delete();c.continue();}else s.put({...payload,receivedAt:Date.now()},id);};t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}finally{d.close();}
  return Response.redirect(new URL('./#share='+id,self.registration.scope).href,303);
}
self.addEventListener('fetch',e=>{if(e.request.method==='POST'&&new URL(e.request.url).href===new URL('receive-share',self.registration.scope).href){e.respondWith(storeShare(e.request).catch(()=>new Response('Local capture storage unavailable. Nothing imported.',{status:503})));}});
self.addEventListener('fetch',e=>{if(e.request.method==='GET'&&e.request.destination==='image'&&new URL(e.request.url).origin!==self.location.origin){e.respondWith(caches.open('fusion-homeflex-test-favicons-v1').then(async c=>(await c.match(e.request))||fetch(e.request)));return;}if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin||!new URL(e.request.url).href.startsWith(self.registration.scope))return;const path=new URL(e.request.url).pathname;const asset=ASSETS.some(a=>new URL(a,self.registration.scope).pathname===path);if(!asset&&e.request.mode!=='navigate')return;e.respondWith(caches.open(CACHE).then(async c=>{const hit=await c.match(e.request,{ignoreSearch:true});if(hit)return hit;try{return await fetch(e.request)}catch(err){if(e.request.mode==='navigate')return c.match('./index.html');throw err}}))});
