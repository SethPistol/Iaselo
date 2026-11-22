const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {randomBytes,createHash,timingSafeEqual}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {sharedStays}=require('./shared-stays.cjs');
const QR=require('./qr'), E=require('./qr/QRErrorCorrectLevel');
const root=path.resolve(__dirname,'../dist');
const port=Number(process.env.PORT||8080), base=new URL(process.env.DEMO_BASE_URL||'http://localhost:'+port);
const password=process.env.DEMO_PASSWORD;
if(!password||password.length<16||!['http:','https:'].includes(base.protocol)||base.pathname!=='/'||base.username||base.password||base.search||base.hash)throw Error('DEMO_PASSWORD (16 caractères minimum) et DEMO_BASE_URL (origine) requis.');
const db=new DatabaseSync(process.env.DEMO_DB||path.join(__dirname,'questionnaires.sqlite'));
db.exec('CREATE TABLE IF NOT EXISTS invites (token TEXT PRIMARY KEY, stay TEXT NOT NULL, expiry INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS answers (stay TEXT PRIMARY KEY, received TEXT NOT NULL, data TEXT NOT NULL)');
db.exec(`CREATE TABLE IF NOT EXISTS questionnaire_access (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT NOT NULL, stay TEXT NOT NULL, action TEXT NOT NULL
)`);
const hash=s=>createHash('sha256').update(s).digest('hex');
const accounts={demo:password,secretariat:process.env.DEMO_SECRETARIAT_PASSWORD,anesthesie:process.env.DEMO_ANESTHESIE_PASSWORD,ide:process.env.DEMO_IDE_PASSWORD};
const configured=Object.values(accounts).filter(Boolean);
if(configured.some(value=>value.length<16)||new Set(configured).size!==configured.length)throw Error('Utilisez des mots de passe fictifs distincts de 16 caractères minimum.');
const auth=Object.entries(accounts).filter(([,value])=>value).map(([user,value])=>[user,Buffer.from(hash('Basic '+Buffer.from(user+':'+value).toString('base64')))]);
const routeShared=sharedStays(db);
const stayOK=s=>typeof s==='string'&&/^DÉMO-00[1-6]$/.test(s);
const validToken=t=>typeof t==='string'&&/^[a-f0-9]{48}$/.test(t);
const keys=new Set('birthname firstname usename dob weight height operation date allergy allergyDetails operations anesthesia anesthesiaDetails nausea travel hospital hospitalDetails diseases other teeth stairs devices bleeding treatments tobacco cigarettes years alcohol drugs drugDetails questions signedDate signature'.split(' '));
function clean(a){
 if(!a||typeof a!=='object'||Array.isArray(a))throw Error();
 const d=Object.create(null);
 for(const [k,v] of Object.entries(a)){
 if(!keys.has(k))throw Error();
 if(['diseases','devices','bleeding'].includes(k)){if(!Array.isArray(v)||v.length>40||v.some(t=>typeof t!=='string'||t.length>240))throw Error();d[k]=v}
 else{if(typeof v!=='string'||v.length>8000)throw Error();d[k]=v.trim()}
 }
 if(!d.birthname||!d.firstname||!d.dob||!d.signedDate||!d.signature)throw Error();
 return d;
}
function svg(link){
 const qr=new QR(-1,E.M);qr.addData(link);qr.make();const n=qr.getModuleCount();let d='';
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.isDark(y,x))d+='M'+(x+4)+' '+(y+4)+'h1v1h-1z';
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+(n+8)+' '+(n+8)+'" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="'+d+'"/></svg>';
}
async function body(req){let n=0;const a=[];for await(const c of req){n+=c.length;if(n>48000)throw Error();a.push(c)}return JSON.parse(Buffer.concat(a))}
http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','SAMEORIGIN');
 res.setHeader('Permissions-Policy','camera=(), geolocation=(), payment=(), usb=(), microphone=(self)');
 res.setHeader('Cross-Origin-Resource-Policy','same-origin');
 const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value))};
 try{
 const url=new URL(req.url,'http://localhost'), p=url.pathname, credential=Buffer.from(hash(req.headers.authorization||''));
 const actor=auth.find(([,digest])=>timingSafeEqual(credential,digest))?.[0];
 const staff=Boolean(actor), shared=p==='/api/stays'||p.startsWith('/api/stays/');
 const isAPI=p.startsWith('/api/questionnaire/');
 if((p==='/'||p==='/index.html'||p==='/shared'||shared||p.startsWith('/api/questionnaire/staff/'))&&!staff){res.setHeader('WWW-Authenticate','Basic realm="Parcours fictif"');return send(401,{error:'Accès équipe requis.'})}
 if(shared){
  if(req.method==='POST'&&(req.headers.origin!==base.origin||req.headers['content-type']!=='application/json'))return send(403,{error:'Origine non autorisée.'});
  return await routeShared(req,url,actor,send,body);
 }
 if(isAPI){
  if(req.method==='POST'&&(req.headers.origin!==base.origin||req.headers['content-type']!=='application/json'))return send(403,{error:'Origine non autorisée.'});
  if(p==='/api/questionnaire/staff/status'&&req.method==='GET')return send(200,{enabled:true});
  if(p==='/api/questionnaire/staff/invite'&&req.method==='POST'){
   const {stay}=await body(req);if(!stayOK(stay))return send(400,{error:'Séjour de démonstration inconnu.'});
   if(db.prepare('SELECT stay FROM answers WHERE stay=?').get(stay))return send(409,{error:'Un questionnaire a déjà été reçu pour ce séjour.'});
   const token=randomBytes(24).toString('hex'),expiry=Date.now()+48*3600000,link=base.origin+'/patient.html#invitation='+token;
   const qr=svg(link);
   db.prepare('DELETE FROM invites WHERE stay=?').run(stay);
   db.prepare('INSERT INTO invites(token,stay,expiry) VALUES(?,?,?)').run(hash(token),stay,expiry);
   return send(201,{link,expiry,qr:'data:image/svg+xml;base64,'+Buffer.from(qr).toString('base64')});
  }
  if(p==='/api/questionnaire/staff/answers'&&req.method==='GET'){
   const stay=url.searchParams.get('stay');if(!stayOK(stay))return send(400,{error:'Séjour inconnu.'});
   const row=db.prepare('SELECT received,data FROM answers WHERE stay=?').get(stay);
   db.prepare('INSERT INTO questionnaire_access(at,actor,stay,action) VALUES(?,?,?,?)').run(
    new Date().toISOString(),actor,stay,row?'lecture des réponses de démonstration':'recherche de réponses de démonstration'
   );
   return send(200,{questionnaire:row?{received:row.received,answers:JSON.parse(row.data),reviewed:false}:null});
  }
  if(p==='/api/questionnaire/submit'&&req.method==='POST'){
   const {token,answers,confirmed}=await body(req);
   if(!validToken(token)||confirmed!==true)return send(400,{error:'Invitation ou confirmation manquante.'});
   const data=clean(answers), t=hash(token);
   const row=db.prepare('SELECT stay FROM invites WHERE token=? AND expiry>? AND used=0').get(t,Date.now());
   if(!row)return send(410,{error:'Invitation expirée, remplacée ou déjà utilisée.'});
   db.exec('BEGIN IMMEDIATE');
   try{
    if(!db.prepare('UPDATE invites SET used=1 WHERE token=? AND used=0 AND expiry>?').run(t,Date.now()).changes)throw Error();
    db.prepare('INSERT INTO answers VALUES(?,?,?)').run(row.stay,new Date().toISOString(),JSON.stringify(data));db.exec('COMMIT');
   }catch{db.exec('ROLLBACK');return send(409,{error:'Questionnaire déjà transmis ou invitation invalide.'})}
   return send(201,{received:true});
  }
  return send(404,{error:'Service inconnu.'});
 }
 if(req.method!=='GET')return send(405,{error:'Méthode non autorisée.'});
 const f=path.resolve(root,'.'+(p==='/'||p==='/shared'?'/index.html':decodeURIComponent(p)));
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json'}[path.extname(f)];
 if(!f.startsWith(root+path.sep)||!mime||!fs.existsSync(f)||!fs.statSync(f).isFile())return send(404,{error:'Page inconnue.'});
 res.writeHead(200,{'Content-Type':mime});fs.createReadStream(f).pipe(res);
 }catch{if(!res.headersSent)send(400,{error:'Requête ou réponses invalides.'});else res.end()}
}).listen(port,process.env.DEMO_HOST||'127.0.0.1',()=>console.log('Démonstration : '+base.origin));
