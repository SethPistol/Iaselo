// IASELO · coût par séjour (27/11/2026, 4e veille, lot F). Règles : dist/cout-sejour-regles.js.
//  GET  /api/workspace/cout-sejour?mois=AAAA-MM   séjours du mois (pseudonymisés : identifiant, spécialité, mode), coûts, recettes, synthèses
//  POST /api/workspace/cout-sejour                {reglages:{minuteBloc, minuteSspi, nuit, ambulatoire, consommables, sspiDefautMin}}
// Accès : administrateur, direction (administration), facturation, DIM. Aucune identité ni donnée médicale n'est renvoyée.
import C from '../dist/cout-sejour-regles.js';
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const METIERS=['administration','facturation','dim'];
async function docData(env,key){const row=await env.DB.prepare('SELECT data FROM workspace_documents WHERE key=?').bind(key).first();return row?JSON.parse(row.data):null}
export async function reglagesCouts(env){
 const row=await env.DB.prepare("SELECT data,updated_by,updated_at FROM app_settings WHERE key='couts'").first();let d={};try{d=row?JSON.parse(row.data):{}}catch{}
 return {...C.REGLAGES_DEFAUT,...d,...(row?{modifiePar:row.updated_by,modifieLe:row.updated_at}:{})};
}
export async function staffCoutSejourApi(request,env,acl){
 const url=new URL(request.url);if(url.pathname!=='/api/workspace/cout-sejour')return null;
 if(!acl.isAdmin&&!METIERS.includes(acl.job))return json({error:'Réservé à la direction, à la facturation, au DIM et à l’administrateur.'},403);
 if(request.method==='POST'){
  if(!acl.isAdmin&&acl.job!=='administration')return json({error:'Réglages réservés à la direction et à l’administrateur.'},403);
  let d;try{d=JSON.parse(await request.text())}catch{return json({error:'Demande invalide.'},400)}
  const v=C.validerReglages(d.reglages||{});if(!v.ok)return json({error:v.errors.join(' ')},400);
  const at=new Date().toISOString(),who=acl.profile.display_name||acl.profile.user_id;
  await env.DB.prepare("INSERT INTO app_settings(key,data,updated_by,updated_at) VALUES('couts',?,?,?) ON CONFLICT (key) DO UPDATE SET data=excluded.data,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(JSON.stringify(v.reglages),who,at).run();
  await acl.log('couts-reglages','management/couts','allowed','Coûts unitaires modifiés',Object.entries(v.reglages).map(([k,x])=>k+' '+x).join(' · '));
  return json({reglages:await reglagesCouts(env)});
 }
 if(request.method!=='GET')return json({error:'Méthode refusée.'},405);
 const mois=/^\d{4}-\d{2}$/.test(url.searchParams.get('mois')||'')?url.searchParams.get('mois'):new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(new Date()).slice(0,7);
 const R=await reglagesCouts(env),reservations=(await docData(env,'management/reservations'))||[];
 const parPatient=new Map();for(const r of Array.isArray(reservations)?reservations:[])if(r?.patient){(parPatient.get(r.patient)||parPatient.set(r.patient,[]).get(r.patient)).push(r)}
 const dossiers=new Map(((await env.DB.prepare("SELECT stay_id,data FROM marche_records WHERE module='assurance' AND kind='dossier'").all()).results||[]).map(r=>{try{return [r.stay_id,JSON.parse(r.data)]}catch{return [r.stay_id,{}]}}));
 const cores=(await env.DB.prepare("SELECT key,data FROM workspace_documents WHERE key LIKE 'stay/%/core'").all()).results||[],lignes=[];
 for(const row of cores){
  let core;try{core=JSON.parse(row.data)}catch{continue}const stay=row.key.split('/')[1];
  const dossier=dossiers.get(stay)||null,l=C.ligne({core,reservations:parPatient.get(stay)||[],dossier},R);
  const date=l.date||dossier?.pmsi?.entree||'';if(!date.startsWith(mois))continue;
  lignes.push({stay,specialite:core.specialty||'',mode:core.mode||'',etape:core.stage||'',...l,date});
 }
 lignes.sort((a,b)=>(a.resultat??Infinity)-(b.resultat??Infinity)||b.total-a.total);
 await acl.log('read','management/couts','allowed','Coût par séjour '+mois,lignes.length+' séjour(s)');
 return json({mois,reglages:R,peutRegler:acl.isAdmin||acl.job==='administration',synthese:C.synthese(lignes),parSpecialite:C.parGroupe(lignes,'specialite'),parMode:C.parGroupe(lignes,'mode'),lignes});
}
