// IASELO · tableau de bord personnel du praticien (28/11/2026, 5e veille, lot 6). Règles : dist/tableau-praticien-regles.js.
//  GET /api/workspace/mon-tableau?jours=30|90|365
//   Mes séjours : ceux où j'ai écrit la consultation, la feuille d'anesthésie, l'annonce ou le compte rendu opératoire
//   (historique des versions), et, pour un chirurgien, les interventions programmées à mon nom.
//   Réponse : mon activité, mes indicateurs qualité, la moyenne anonyme de l'établissement (aucun nom, aucun numéro de
//   séjour, petits effectifs masqués), mes documents en attente (séjours que je peux lire seulement).
import T from '../dist/tableau-praticien-regles.js';
import AM from '../dist/ameliorations-regles.js';
T.avecAntibiotiques(AM);
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const lire=s=>{try{return JSON.parse(s||'null')}catch{return null}};
const jourParis=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(now);
const MODULES=['core','consult','perop','postopVitals','cro'];
const AUTEUR={anesthesiste:['consult','perop'],chirurgien:['surgicalAnnouncement','cro','croDraft']};

export async function staffTableauPraticienApi(request,env,acl){
 const url=new URL(request.url);if(url.pathname!=='/api/workspace/mon-tableau')return null;
 if(request.method!=='GET')return json({error:'Méthode non prise en charge.'},405);
 if(!['anesthesiste','chirurgien'].includes(acl.job))return json({error:'Tableau de bord réservé aux médecins.'},403);
 const p=T.periode(url.searchParams.get('jours'),jourParis()),moi=acl.profile?.display_name||'',uid=acl.profile?.user_id||'';
 // Toutes les rubriques utiles, tous séjours (pour la moyenne de l'établissement, calculée sans rien en renvoyer d'identifiant).
 const sejours=new Map();
 for(const m of MODULES){
  const rows=(await env.DB.prepare("SELECT key,data,updated_at FROM workspace_documents WHERE key LIKE ?").bind('stay/%/'+m).all()).results||[];
  // Date de dernière modification : sert de date d'activité quand le séjour n'a ni intervention ni programme.
  for(const r of rows){const id=r.key.split('/')[1];if(!sejours.has(id))sejours.set(id,{id});const s=sejours.get(id);s[m]=lire(r.data);const maj=String(r.updated_at||'').slice(0,10);if(maj>(s.maj||''))s.maj=maj}
 }
 const reservations=lire((await env.DB.prepare("SELECT data FROM workspace_documents WHERE key='management/reservations'").first())?.data)||[];
 const parSejour=new Map();for(const r of Array.isArray(reservations)?reservations:[])if(r?.patient){if(!parSejour.has(r.patient))parSejour.set(r.patient,[]);parSejour.get(r.patient).push(r)}
 // Mes séjours.
 const mien=new Set();
 const cles=AUTEUR[acl.job].map(m=>"key LIKE 'stay/%/"+m+"'").join(' OR ');
 for(const r of ((await env.DB.prepare('SELECT DISTINCT key FROM workspace_versions WHERE actor=? AND ('+cles+')').bind(uid).all()).results||[]))mien.add(r.key.split('/')[1]);
 if(acl.job==='chirurgien')for(const [stay,rs] of parSejour)if(rs.some(r=>T.memeNom(r.surgeon,moi)))mien.add(stay);
 const ind=[...sejours.values()].filter(s=>s.core).map(s=>({...T.sejour(s,parSejour.get(s.id)||[]),stage:s.core.stage||''})).filter(x=>T.dansPeriode(x,p));
 const mesInd=ind.filter(x=>mien.has(x.stay));
 const enAttente=[];
 for(const x of mesInd){
  if(!acl.canRead('stay/'+x.stay+'/core'))continue;
  const s=sejours.get(x.stay),nom=[String(s.core?.identity?.lastName||'').toUpperCase(),s.core?.identity?.firstName||''].filter(Boolean).join(' ');
  if(acl.job==='chirurgien'&&x.croManquant)enAttente.push({stay:x.stay,patient:nom,quoi:'Compte rendu opératoire à rédiger',onglet:'operativeReport'});
  if(acl.job==='anesthesiste'&&s.consult&&!s.consult.validated&&['Consultation','Préopératoire'].includes(s.core.stage))enAttente.push({stay:x.stay,patient:nom,quoi:'Consultation à valider',onglet:'consult'});
 }
 // Retards et alertes qualité de mes séjours (pour agir), séjours lisibles seulement.
 const aRevoir=mesInd.filter(x=>acl.canRead('stay/'+x.stay+'/core')&&(x.antibio==='hors-delai'||x.douleur)).slice(0,20).map(x=>({stay:x.stay,motifs:[x.antibio==='hors-delai'?'Antibioprophylaxie hors délai'+(x.ecartAntibioMin!=null?' ('+x.ecartAntibioMin+' min avant incision)':''):'',x.douleur?'Douleur ≥ 4/10':''].filter(Boolean)}));
 await acl.log('read','praticien/tableau','allowed','Tableau de bord personnel · '+p.jours+' jours','');
 return json({periode:p,moi:T.agreger(mesInd),etablissement:T.anonyme(T.agreger(ind)),indicateurs:T.INDICATEURS,enAttente:enAttente.slice(0,30),aRevoir,seuilPetitEffectif:T.SEUIL.petitEffectif});
}
