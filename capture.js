'use strict';
/* Device-local ingress. Fragment data is never sent to the hosting server. */
let captureProcessing=false;
async function processCapture(){
  if(captureProcessing)return;
  const hash=location.hash; if(!/^#(?:capture=|share=)/.test(hash)) return;
  captureProcessing=true;
  history.replaceState(null,'',location.pathname+location.search);
  if(document.getElementById('boot')) await new Promise(resolve=>{const o=new MutationObserver(()=>{if(!document.getElementById('boot')){o.disconnect();resolve();}});o.observe(document.body,{childList:true});});
  const inbox=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('homeflex.fusion-test.capture-inbox.v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('captures');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  let db,id;
  try{
    openWindow('homeflex');
    let payload;
    if(hash.startsWith('#capture=')){
      if(hash.length>50000)throw new Error('Capture exceeds size limit.');
      payload=JSON.parse(decodeURIComponent(hash.slice(9)));
    }else{
      id=hash.slice(7);if(!/^[\da-f-]{36}$/.test(id))throw new Error('Invalid share token.');
      db=await inbox();payload=await new Promise((resolve,reject)=>{const t=db.transaction('captures','readonly'),r=t.objectStore('captures').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      if(!payload)throw new Error('Share already captured or expired.');
    }
    await HomeFlex.receiveCapture(payload);
    if(db)await new Promise((resolve,reject)=>{const t=db.transaction('captures','readwrite');t.objectStore('captures').delete(id);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});
  }catch(err){announce('HomeFlex capture: '+err.message);const r=document.querySelector('#win-homeflex .hf-feedback');if(r){const p=el('p',err.message,'hf-error');p.setAttribute('role','alert');r.append(p);}}
  finally{db?.close();captureProcessing=false;}
}
window.addEventListener("hashchange",processCapture);
processCapture();
