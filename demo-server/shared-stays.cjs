const serviceSectors=require('../dist/service-sectors.js');
// Persistent, role-scoped workflow for fictitious stays on the demo server.
const roles={secretariat:'Secrétariat',anesthesie:'Anesthésiste',ide:'Infirmier'};
const specialties=['Orthopédie','Chirurgie digestive','ORL','Gynécologie','Urologie'];
const modes=['Hospitalisation','Ambulatoire'];
const stages=['Consultation','Préopératoire','Intervention','SSPI','Hospitalisation','Sortie'];
const vitalFields=['sbp','dbp','hr','rr','spo2','temp','pain'];

function sharedStays(db){
 db.exec(`CREATE TABLE IF NOT EXISTS shared_stays (
  id INTEGER PRIMARY KEY AUTOINCREMENT, specialty TEXT NOT NULL, mode TEXT NOT NULL, stage TEXT NOT NULL,
  consultation TEXT, revision INTEGER NOT NULL DEFAULT 0, sector TEXT NOT NULL DEFAULT '', identity TEXT
 );
 CREATE TABLE IF NOT EXISTS shared_vitals (
  id TEXT PRIMARY KEY, stay INTEGER NOT NULL REFERENCES shared_stays(id), record TEXT NOT NULL
 );
 CREATE TABLE IF NOT EXISTS shared_audit (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT, stay INTEGER NOT NULL REFERENCES shared_stays(id),
  at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, kind TEXT NOT NULL
 );`);
 const columns=new Set(db.prepare('PRAGMA table_info(shared_stays)').all().map(column=>column.name));
 if(!columns.has('sector')){
  db.exec("ALTER TABLE shared_stays ADD COLUMN sector TEXT NOT NULL DEFAULT ''");
 }
 if(!columns.has('identity'))db.exec('ALTER TABLE shared_stays ADD COLUMN identity TEXT');
 db.exec(`CREATE TABLE IF NOT EXISTS shared_access (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL, actor TEXT NOT NULL, stay INTEGER NOT NULL, action TEXT NOT NULL
 )`);
 const logRead=db.prepare('INSERT INTO shared_access(at,actor,stay,action) VALUES(?,?,?,?)');
 const audit=db.prepare('INSERT INTO shared_audit(stay,at,actor,action,kind) VALUES(?,?,?,?,?)');
 const getStay=db.prepare('SELECT * FROM shared_stays WHERE id=?');
 const getVitals=db.prepare('SELECT record FROM shared_vitals WHERE stay=? ORDER BY rowid');
 const getEvents=db.prepare('SELECT at,actor AS role,action AS text,kind FROM shared_audit WHERE stay=? ORDER BY sequence DESC');
 const updateConsult=db.prepare('UPDATE shared_stays SET consultation=?, revision=revision+1 WHERE id=? AND revision=?');
 const setStage=db.prepare('UPDATE shared_stays SET stage=? WHERE id=?');
 const setSector=db.prepare('UPDATE shared_stays SET sector=? WHERE id=?');
 const getVital=db.prepare('SELECT stay,record FROM shared_vitals WHERE id=?');
 const addVital=db.prepare('INSERT INTO shared_vitals(id,stay,record) VALUES(?,?,?)');
 const administrative=row=>({
  id:'DÉMO-P-'+row.id,specialty:row.specialty,mode:row.mode,stage:row.stage,sector:row.sector,
  identity:row.identity?JSON.parse(row.identity):null
 });
 const snapshot=row=>({
  ...administrative(row),revision:row.revision,
  consult:row.consultation?JSON.parse(row.consultation):{asa:'Non renseigné',history:'',allergies:'À vérifier',treatments:'',plan:'',checks:[],validated:false},
  task:'Séjour fictif partagé',done:false,notes:[],rx:[],discharge:{summary:'',instructions:'',validated:false},
  postopVitals:getVitals.all(row.id).map(x=>JSON.parse(x.record)),events:getEvents.all(row.id)
 });
 function transaction(fn){
  db.exec('BEGIN IMMEDIATE');
  try{const result=fn();db.exec('COMMIT');return result}
  catch(error){db.exec('ROLLBACK');throw error}
 }
 function parseConsult(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.validated!=='boolean')return null;
  const {asa,history,allergies,treatments,plan,checks,ext,validated,validation,versions,medicationRows}=input;
  if(![asa,history,allergies,treatments,plan].every(x=>typeof x==='string'))return null;
  if(!Array.isArray(checks)||checks.some(x=>typeof x!=='string'))return null;
  if(ext&&Object.values(ext).some(x=>typeof x!=='string'))return null;
  if(validated&&(!validation||typeof validation.author!=='string'||!validation.author.trim()))return null;
  return {asa,history,allergies,treatments,plan,checks,ext,validated,validation,versions,medicationRows};
 }
 function parseIdentity({lastName='',firstName='',birthDate=''}){
  if(![lastName,firstName].every(value=>typeof value==='string'&&value.length<=80))return null;
  if(typeof birthDate!=='string')return null;
  if(birthDate){
   const parsed=new Date(birthDate);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)||!Number.isFinite(+parsed)||parsed.toISOString().slice(0,10)!==birthDate)return null;
  }
  return {lastName:lastName.trim(),firstName:firstName.trim(),birthDate};
 }
 function parseVitals(input,actor){
  if(!input||!['SSPI','Hospitalisation'].includes(input.location)||
   !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(input.at)||!Number.isFinite(Date.parse(input.at)))return null;
  const values={location:input.location,pain:''};
  for(const key of vitalFields){
   const value=input[key];
   if(value===undefined||value==='')continue;
   if(typeof value!=='string'||!value.trim()||!Number.isFinite(Number(value))||Number(value)<0)return null;
   if(key==='spo2'&&Number(value)>100||key==='pain'&&(!Number.isInteger(Number(value))||Number(value)>10))return null;
   values[key]=value;
  }
  if(!vitalFields.some(key=>values[key]))return null;
  return {kind:'Surveillance',at:input.at,author:actor,created:new Date().toISOString(),role:roles[actor],values};
 }
 return async function route(req,url,actor,send,body){
  if(!roles[actor])return send(403,{error:'Compte de démonstration par métier requis.'});
  const match=/^\/api\/stays\/(\d+)(?:\/(consultation|vitals|stage|sector))?$/.exec(url.pathname);
  if(url.pathname==='/api/stays'&&req.method==='GET'){
   const rows=db.prepare('SELECT * FROM shared_stays ORDER BY id DESC').all();
   const response={role:roles[actor],actor,stays:actor==='secretariat'?rows.map(administrative):rows.map(snapshot)};
   transaction(()=>{
    const now=new Date().toISOString();
    const action=actor==='secretariat'?'lecture administrative':'lecture des dossiers de démonstration';
    for(const row of rows)logRead.run(now,actor,row.id,action);
   });
   return send(200,response);
  }
  if(url.pathname==='/api/stays'&&req.method==='POST'){
   if(actor!=='secretariat')return send(403,{error:'Création réservée au secrétariat.'});
   const input=await body(req);
   const {specialty,mode}=input;
   const identity=parseIdentity(input);
   if(!identity)return send(400,{error:'Nom, prénom ou date de naissance invalide.'});
   if(!specialties.includes(specialty)||!modes.includes(mode))return send(400,{error:'Spécialité ou mode de séjour invalide.'});
   const id=transaction(()=>{
    const id=db.prepare('INSERT INTO shared_stays(specialty,mode,stage,identity) VALUES(?,?,?,?)').run(specialty,mode,'Consultation',JSON.stringify(identity)).lastInsertRowid;
    audit.run(id,new Date().toISOString(),actor,'Séjour fictif créé','Dossier');
    return id;
   });
   return send(201,administrative(getStay.get(id)));
  }
  if(!match||req.method!=='POST')return send(404,{error:'Service inconnu.'});
  const [,id,area]=match;
  if(!getStay.get(id))return send(404,{error:'Séjour inconnu.'});
  if(actor==='secretariat'||(['consultation','stage','sector'].includes(area)&&actor!=='anesthesie'))return send(403,{error:'Modification réservée au métier autorisé.'});
  const data=await body(req);
  if(area==='consultation'){
   const consult=parseConsult(data.consult);
   if(!consult||!Number.isSafeInteger(data.revision))return send(400,{error:'Consultation ou version invalide.'});
   const updated=transaction(()=>{
    if(!updateConsult.run(JSON.stringify(consult),id,data.revision).changes)return false;
    audit.run(id,new Date().toISOString(),actor,consult.validated?'Consultation validée dans la simulation':'Brouillon de consultation enregistré','Consultation');
    return true;
   });
   if(!updated)return send(409,{error:'Ce séjour a été modifié sur un autre poste. Revenez à la liste pour comparer les versions.'});
  }else if(area==='stage'){
   if(!stages.includes(data.stage))return send(400,{error:'Étape de séjour invalide.'});
   transaction(()=>{
    setStage.run(data.stage,id);
    audit.run(id,new Date().toISOString(),actor,'Étape : '+data.stage,'Parcours');
   });
  }else if(area==='sector'){
   const validSector=value=>typeof value==='string'&&(value===''||Object.hasOwn(serviceSectors,value));
   if(!validSector(data.sector)||!validSector(data.previous))return send(400,{error:'Secteur invalide.'});
   const updated=transaction(()=>{
    const current=getStay.get(id).sector;
    if(current===data.sector)return true;
    if(current!==data.previous)return false;
    setSector.run(data.sector,id);
    audit.run(id,new Date().toISOString(),actor,'Secteur : '+(serviceSectors[data.sector]||'non renseigné'),'Localisation');
    return true;
   });
   if(!updated)return send(409,{error:'Le secteur a changé sur un autre poste. Actualisez les séjours avant de le modifier.'});
  }else if(area==='vitals'){
   const record=parseVitals(data.values,actor);
   if(!record||!/^[a-f0-9]{32}$/.test(data.requestId))return send(400,{error:'Relevé invalide.'});
   const stored=transaction(()=>{
    const existing=getVital.get(data.requestId);
    if(existing){
     const previous=JSON.parse(existing.record);
     return String(existing.stay)===id&&previous.author===actor&&previous.at===record.at&&JSON.stringify(previous.values)===JSON.stringify(record.values);
    }
    addVital.run(data.requestId,id,JSON.stringify(record));
    audit.run(id,record.created,actor,'Constantes enregistrées · '+record.values.location,'Soins');
    return true;
   });
   if(!stored)return send(409,{error:'Identifiant de relevé déjà utilisé.'});
  }else return send(404,{error:'Service inconnu.'});
  return send(200,snapshot(getStay.get(id)));
 };
}
module.exports={sharedStays};
