/* IASELO · appel vidéo de navigateur à navigateur (WebRTC), partagé par l'écran de l'équipe et la page patient
   (5e veille, lot 7). Le serveur ne relaie que la mise en relation (messages « pret », offre, réponse, candidats ICE) ;
   l'image et le son vont directement d'un navigateur à l'autre, chiffrés, et ne sont jamais enregistrés (aucun
   MediaRecorder). Rôle « pro » : c'est lui qui fait l'offre quand le patient signale qu'il est prêt. */
(function(root){
'use strict';
const style=document.createElement('style');
style.textContent=`.va{position:fixed;inset:0;z-index:9000;background:#0d1b21;color:#fff;display:grid;grid-template-rows:auto 1fr auto;font-family:system-ui,sans-serif}
.va-top{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 16px;flex-wrap:wrap}.va-top b{font-size:16px}
.va-badge{font-size:12px;font-weight:700;padding:3px 9px;border-radius:99px;background:#1f3a44;color:#cfe7ee}
.va-scene{position:relative;min-height:0}.va-scene video{background:#000}.va-dist{width:100%;height:100%;object-fit:contain}
.va-loc{position:absolute;right:14px;bottom:14px;width:min(28vw,220px);aspect-ratio:4/3;object-fit:cover;border:2px solid #fff;border-radius:10px}
.va-etat{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;font-size:18px;pointer-events:none}
.va-bar{display:flex;justify-content:center;gap:12px;padding:14px;flex-wrap:wrap}.va-bar button{min-width:120px;min-height:48px;border-radius:999px;border:0;font-size:15px;font-weight:650;cursor:pointer;background:#e8eef1;color:#0d1b21}
.va-bar button[aria-pressed=true]{background:#7a4a00;color:#fff}.va-bar .va-fin{background:#b42318;color:#fff}`;
document.head.appendChild(style);
root.IaseloAppel={
 /* opts : {role:'pro'|'patient', titre, envoyer(type,data) → Promise, relever(apres) → Promise<{messages,statut}>, iceServers, fin()} */
 async ouvrir(opts){
  const el=document.createElement('div');el.className='va';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','Appel vidéo');
  el.innerHTML=`<div class="va-top"><b>${String(opts.titre||'Appel vidéo').replace(/[&<>"']/g,'')}</b><span class="va-badge">Chiffré de bout en bout · aucun enregistrement</span></div>
  <div class="va-scene"><video class="va-dist" autoplay playsinline></video><video class="va-loc" autoplay playsinline muted></video><p class="va-etat" role="status" aria-live="polite">Connexion…</p></div>
  <div class="va-bar"><button type="button" data-va="micro" aria-pressed="false">Couper le micro</button><button type="button" data-va="camera" aria-pressed="false">Couper la caméra</button><button type="button" class="va-fin" data-va="fin">Raccrocher</button></div>`;
  document.body.appendChild(el);
  const dist=el.querySelector('.va-dist'),loc=el.querySelector('.va-loc'),etat=el.querySelector('.va-etat');
  const dire=t=>{etat.textContent=t;etat.hidden=!t};
  let pc=null,flux=null,apres=0,fini=false,minuteur=null,connecte=false;
  try{flux=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720}},audio:{echoCancellation:true,noiseSuppression:true}})}
  catch{try{flux=await navigator.mediaDevices.getUserMedia({audio:true})}catch{flux=null}}
  if(flux)loc.srcObject=flux;else loc.hidden=true;
  function nouveau(){
   if(pc){try{pc.close()}catch{}}
   pc=new RTCPeerConnection({iceServers:opts.iceServers||[]});connecte=false;
   if(flux)flux.getTracks().forEach(t=>pc.addTrack(t,flux));
   if(!flux||!flux.getVideoTracks().length)pc.addTransceiver('video',{direction:'recvonly'});
   if(!flux)pc.addTransceiver('audio',{direction:'recvonly'});
   pc.ontrack=e=>{dist.srcObject=e.streams[0]||new MediaStream([e.track])};
   pc.onicecandidate=e=>opts.envoyer('candidate',e.candidate?e.candidate.toJSON():null).catch(()=>{});
   pc.onconnectionstatechange=()=>{const s=pc.connectionState;if(s==='connected'){connecte=true;dire('')}else if(s==='failed')dire('La connexion n’a pas pu s’établir. Vérifiez votre réseau ou réessayez.');else if(s==='disconnected')dire('Connexion interrompue…')};
   return pc;
  }
  async function traiter(m){
   if(m.type==='bye'){dire(opts.role==='pro'?'Le patient a quitté l’appel.':'L’appel est terminé.');if(pc){pc.close();pc=null}return}
   if(opts.role==='pro'){
    if(m.type==='pret'){nouveau();const o=await pc.createOffer();await pc.setLocalDescription(o);await opts.envoyer('offer',{type:o.type,sdp:o.sdp});dire('Connexion avec le patient…')}
    else if(m.type==='answer'&&pc?.signalingState==='have-local-offer')await pc.setRemoteDescription(m.data);
   }else{
    if(m.type==='pret'&&!connecte)await opts.envoyer('pret',null);
    else if(m.type==='offer'){nouveau();await pc.setRemoteDescription(m.data);const a=await pc.createAnswer();await pc.setLocalDescription(a);await opts.envoyer('answer',{type:a.type,sdp:a.sdp});dire('Connexion…')}
   }
   if(m.type==='candidate'&&pc&&pc.remoteDescription&&m.data){try{await pc.addIceCandidate(m.data)}catch{}}
  }
  async function boucle(){
   if(fini)return;
   try{const r=await opts.relever(apres);for(const m of r.messages||[]){apres=Math.max(apres,m.seq);await traiter(m).catch(()=>{})}if(['terminee','annulee'].includes(r.statut)){dire('L’appel est terminé.');arreter(false);return}}
   catch(e){dire(e.message||'Réseau indisponible…')}
   minuteur=setTimeout(boucle,connecte?2500:1000);
  }
  function arreter(envoyerBye=true){
   if(fini)return;fini=true;clearTimeout(minuteur);
   if(envoyerBye)opts.envoyer('bye',null).catch(()=>{});
   if(pc){try{pc.close()}catch{}}pc=null;flux?.getTracks().forEach(t=>t.stop());
   setTimeout(()=>{el.remove();opts.fin?.()},envoyerBye?0:2500);
  }
  el.querySelector('[data-va="fin"]').onclick=()=>arreter(true);
  el.querySelector('[data-va="micro"]').onclick=e=>{const on=e.currentTarget.getAttribute('aria-pressed')!=='true';flux?.getAudioTracks().forEach(t=>t.enabled=!on);e.currentTarget.setAttribute('aria-pressed',String(on));e.currentTarget.textContent=on?'Rétablir le micro':'Couper le micro'};
  el.querySelector('[data-va="camera"]').onclick=e=>{const on=e.currentTarget.getAttribute('aria-pressed')!=='true';flux?.getVideoTracks().forEach(t=>t.enabled=!on);e.currentTarget.setAttribute('aria-pressed',String(on));e.currentTarget.textContent=on?'Rétablir la caméra':'Couper la caméra'};
  el.addEventListener('keydown',e=>{if(e.key==='Escape')e.preventDefault()});
  el.querySelector('[data-va="fin"]').focus();
  // L'historique de la salle n'est pas rejoué : on part du dernier message, puis on se signale.
  try{const r=await opts.relever(0);apres=Math.max(0,...(r.messages||[]).map(m=>m.seq))}catch{}
  if(!flux)dire('Caméra et micro indisponibles : autorisez-les dans votre navigateur pour être vu et entendu.');
  else dire(opts.role==='pro'?'En attente du patient…':'En attente de votre soignant…');
  await opts.envoyer('pret',null).catch(e=>dire(e.message));
  boucle();
  return {arreter,etat:()=>({connecte,signal:pc?.signalingState||'',connexion:pc?.connectionState||''})};
 }
};
})(window);
