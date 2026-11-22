'use strict';
(function(){
 let failed=false;
 window.showPatientLoadError=function(error){
  if(failed)return;failed=true;
  const host=document.getElementById('workspace');if(!host)return;
  const box=document.createElement('section');box.className='panel';
  const inner=document.createElement('div');inner.className='content';
  const title=document.createElement('h2');title.textContent='Le formulaire n’a pas pu s’ouvrir';
  const message=document.createElement('p');message.textContent='Rechargez la page. Si le problème persiste, transmettez le message ci-dessous pour que nous puissions le corriger.';
  const detail=document.createElement('p');detail.className='notice warn';detail.textContent='Diagnostic : '+(error?.message||'fichier du formulaire non chargé');
  const retry=document.createElement('button');retry.className='primary';retry.textContent='Recharger la page';retry.onclick=function(){window.location.reload()};
  inner.append(title,message,detail,retry);box.append(inner);host.replaceChildren(box);
 };
 window.addEventListener('error',function(e){window.showPatientLoadError({message:e.message||'un fichier du formulaire n’est pas accessible'})});
 window.addEventListener('unhandledrejection',function(e){window.showPatientLoadError({message:e.reason?.message||'erreur lors de l’ouverture du formulaire'})});
 window.addEventListener('load',function(){if(document.body.dataset.appReady!=='true')window.showPatientLoadError({message:'le formulaire n’a pas démarré — version 5'})});
})();
