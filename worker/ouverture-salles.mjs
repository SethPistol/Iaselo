// IASELO · ouverture des salles d'opération.
//  GET  /api/workspace/ouverture-salles?date=AAAA-MM-JJ : salles du bloc et vérifications signées ce jour-là.
//  POST /api/workspace/ouverture-salles : signe une partie (infirmière ou anesthésie) pour une salle, le jour même.
//  Partie infirmière : profil infirmier ; partie anesthésie : profil anesthésiste. Lecture : soignants du bloc et
//  administrateur. Les signatures ne sont jamais modifiées : une nouvelle vérification s'ajoute et fait foi.
//  Aucune donnée patient. Chaque lecture et chaque signature sont tracées dans le journal des accès.
import {randomUUID} from 'node:crypto';
import regles from '../dist/ouverture-salles-regles.js';
import planningCore from '../dist/planning-core.js';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const LECTEURS=['anesthesiste','infirmier','chirurgien'];
const TZ='Europe/Paris';
function aujourdhui(d=new Date()){const p=Object.fromEntries(new Intl.DateTimeFormat('fr-FR',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`}
async function salles(env){
 const row=await env.DB.prepare("SELECT data FROM workspace_documents WHERE key='management/planningResources'").first();
 let list=[];try{list=JSON.parse(row?.data||'[]')}catch{}
 return (Array.isArray(list)?list:[]).filter(r=>r&&r.id&&planningCore.kind(r)==='room'&&r.open!==false).map(r=>({id:String(r.id),label:String(r.label||r.id).slice(0,80),sector:r.sector||''}));
}
const ligne=r=>({id:r.id,date:r.day,room:r.room,roomLabel:r.room_label,part:r.part,items:JSON.parse(r.items),conclusion:r.conclusion,comment:r.comment,author:r.actor_name,at:r.at});
export async function staffOuvertureSallesApi(request,env,acl){
 const url=new URL(request.url);if(url.pathname!=='/api/workspace/ouverture-salles')return null;
 if(!acl.active||!(acl.isAdmin||LECTEURS.includes(acl.job))){await acl.log('read','management/ouverture-salles','denied','Ouverture des salles hors habilitation');return json({error:'Ouverture des salles réservée aux équipes du bloc.'},403)}
 const today=aujourdhui();
 if(request.method==='GET'){
  const date=url.searchParams.get('date')||today;if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return json({error:'Date invalide.'},400);
  const records=((await env.DB.prepare('SELECT * FROM room_openings WHERE day=? ORDER BY at DESC').bind(date).all()).results||[]).map(ligne);
  await acl.log('read','management/ouverture-salles','allowed','Ouverture des salles',date);
  return json({date,today,rooms:await salles(env),records,canSign:{infirmier:acl.job==='infirmier',anesthesie:acl.job==='anesthesiste'}});
 }
 if(request.method!=='POST')return json({error:'Méthode refusée.'},405);
 let d;try{d=await request.json()}catch{return json({error:'Requête illisible.'},400)}
 const part=String(d?.part||''),p=regles.PARTIES[part];
 if(!p)return json({error:'Partie inconnue.'},400);
 if(acl.job!==p.metier){await acl.log('write','management/ouverture-salles','denied','Partie '+part+' réservée au profil '+p.metier);return json({error:part==='infirmier'?'La partie infirmière est signée par un(e) infirmier(ère) du bloc.':'La partie anesthésie est signée par un anesthésiste.'},403)}
 if(d.date!==today)return json({error:'L’ouverture se signe le jour même ('+today.split('-').reverse().join('/')+').'},400);
 const room=(await salles(env)).find(r=>r.id===d.room);if(!room)return json({error:'Salle inconnue ou fermée.'},400);
 const saisie={items:d.items,conclusion:d.conclusion,comment:typeof d.comment==='string'?d.comment.trim():''};
 const err=regles.erreur(part,saisie);if(err)return json({error:err},400);
 const items=Object.fromEntries(p.items.map(([k])=>[k,saisie.items[k]]));
 const rec={id:randomUUID(),day:today,room:room.id,room_label:room.label,part,items:JSON.stringify(items),conclusion:saisie.conclusion,comment:saisie.comment,actor:String(acl.profile.user_id||''),actor_name:String(acl.profile.display_name||'Professionnel').slice(0,160),at:new Date().toISOString()};
 await env.DB.prepare('INSERT INTO room_openings(id,day,room,room_label,part,items,conclusion,comment,actor,actor_name,at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(rec.id,rec.day,rec.room,rec.room_label,rec.part,rec.items,rec.conclusion,rec.comment,rec.actor,rec.actor_name,rec.at).run();
 await acl.log('write','management/ouverture-salles','allowed',p.label+' · '+regles.CONCLUSIONS[rec.conclusion],room.label+' · '+today);
 return json({record:ligne(rec)});
}
