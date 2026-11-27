// Bloc prédictif : durées estimées, débordement, vacations à libérer, créneaux libres, liste d'attente, SSPI, analyse.
const test=require('node:test');const assert=require('node:assert/strict');
const B=require('../dist/bloc-previsions-regles.js');

// Historique fictif : Dr Martin, prothèse de hanche, 8 passages de 95 à 110 min (prévus 80 min).
function passe(i,{surgeon='Dr Martin',procedure='Prothèse totale de hanche',reel=100,prevu=80,room='bloc-1',day='2026-11-0'+(i%9+1),h='08:00'}={}){
 const start=day+'T'+h,entree=start,sortie=B.addMinutes(start,reel);
 return {id:'H'+i+surgeon+procedure,patient:'P'+i,resource:room,surgeon,procedure,start,end:B.addMinutes(start,prevu+15),duration:prevu,turnover:15,state:'Terminée',vacationId:'VH'+day+room,
  etapes:{arrivee:start,entree,sortie,sortieBloc:B.addMinutes(sortie,45)},recovery:{resource:'sspi-1',start:sortie,end:B.addMinutes(sortie,60)}};
}
const hist=[95,100,105,110,98,102,104,99].map((reel,i)=>passe(i,{reel}));

test('durée estimée : médiane du même chirurgien pour le même acte, fourchette et confiance',()=>{
 const h=B.historique(hist);
 const e=B.estimer(h,{surgeon:'Martin',acte:'prothèse totale de hanche',prevue:80});
 assert.equal(e.base,'chirurgien-acte');assert.equal(e.n,8);assert.equal(e.minutes,101);assert.equal(e.confiance,'elevee');assert.ok(e.p25<=e.minutes&&e.minutes<=e.p75);assert.equal(e.ecart,21);
 // Autre chirurgien, même acte : niveau « acte ».
 assert.equal(B.estimer(h,{surgeon:'Dr Durand',acte:'Prothèse totale de hanche',prevue:90}).base,'acte');
 // Même chirurgien, autre acte : ratio réel/prévu appliqué à la durée prévue (≈ 1,26 × 50).
 const r=B.estimer(h,{surgeon:'Dr Martin',acte:'Ablation de matériel',prevue:50});assert.equal(r.base,'chirurgien');assert.ok(r.minutes>=60&&r.minutes<=66,'ratio appliqué : '+r.minutes);
 // Sans historique : durée prévue, sans confiance.
 const z=B.estimer([],{surgeon:'Dr X',acte:'Y',prevue:45});assert.equal(z.base,'prevue');assert.equal(z.minutes,45);assert.equal(z.confiance,'aucune');
});

test('programme du jour : enchaînement par salle et débordement prévisible de la vacation',()=>{
 const day='2026-12-01',v={id:'V1',resource:'bloc-1',surgeon:'Dr Martin',start:day+'T08:00',end:day+'T13:00',state:'Ouverte'};
 const cas=[0,1,2].map(i=>({id:'C'+i,patient:'Q'+i,resource:'bloc-1',vacationId:'V1',surgeon:'Dr Martin',procedure:'Prothèse totale de hanche',start:B.addMinutes(day+'T08:00',i*95),end:B.addMinutes(day+'T08:00',i*95+95),duration:80,turnover:15,state:'Réservée'}));
 const P=B.previsionJour({reservations:[...hist,...cas],vacations:[v],day});
 assert.equal(P.lignes.length,3);assert.ok(P.lignes.every(l=>l.alerte),'écart de 21 min signalé');
 // 3 × 101 min + 2 rotations de 15 min = 333 min → fin estimée 13:33, soit 33 min de dépassement.
 assert.equal(P.lignes[2].finEstimee,day+'T13:33');assert.equal(P.vacations[0].debordement,33);
});

test('vacations à libérer : remplissage sous 50 % entre J+7 et J+21, jamais une vacation déjà libérée',()=>{
 const today='2026-12-01',mk=(id,d,surgeon='Dr Martin',extra={})=>({id,resource:'bloc-1',surgeon,start:d+'T08:00',end:d+'T13:00',state:'Ouverte',...extra});
 const vac=[mk('A','2026-12-03'),mk('B','2026-12-10'),mk('C','2026-12-12'),mk('D','2026-12-15','',{}),mk('E','2026-12-16','Dr Martin',{liberee:{at:'x'}}),mk('F','2027-01-10')];
 const res=[{id:'R1',resource:'bloc-1',vacationId:'C',start:'2026-12-12T08:00',end:'2026-12-12T11:00',duration:165,turnover:15,state:'Réservée'}];
 const l=B.aLiberer({vacations:vac,reservations:res,today});
 assert.deepEqual(l.map(x=>x.vacation.id),['B'],'A trop proche, C remplie à 60 %, D sans titulaire, E libérée, F trop loin');
 assert.equal(l[0].jours,9);assert.equal(l[0].taux,0);
});

test('créneaux libres et liste d’attente : même chirurgien, durée qui tient, fenêtre et prévenance respectées',()=>{
 const v={id:'V',resource:'bloc-2',surgeon:'Dr Martin',start:'2026-12-08T08:00',end:'2026-12-08T13:00',state:'Ouverte'};
 const lib={id:'L',resource:'bloc-3',surgeon:'',liberee:{at:'x'},start:'2026-12-09T08:00',end:'2026-12-09T12:00',state:'Ouverte'};
 const res=[{id:'R',resource:'bloc-2',start:'2026-12-08T08:00',end:'2026-12-08T10:30',state:'Réservée'}];
 const c=B.creneauxLibres({vacations:[v,lib],reservations:res,from:'2026-12-01',to:'2026-12-31'});
 assert.deepEqual(c.map(x=>[x.vacationId,x.start,x.minutes]),[['V','2026-12-08T10:30',150],['L','2026-12-09T08:00',240]]);
 const attente=[{id:'a1',status:'attente',data:{surgeon:'Martin',dureeMin:120,desDe:'2026-12-01',dateActuelle:'2027-01-20',prevenanceHeures:48}},
  {id:'a2',status:'attente',data:{surgeon:'Dr Durand',dureeMin:200}},
  {id:'a3',status:'attente',data:{surgeon:'Dr Martin',dureeMin:60,dateActuelle:'2026-12-08'}},
  {id:'a4',status:'attente',data:{surgeon:'Dr Martin',dureeMin:60,prevenanceHeures:240}}];
 const m=B.correspondances(attente,c,{maintenant:'2026-12-01T09:00'});
 assert.deepEqual(m.map(x=>[x.attente.id,x.creneaux.map(y=>y.vacationId)]),[['a1',['V','L']],['a2',['L']]],'a3 : pas plus tôt ; a4 : prévenance trop longue');
});

test('prévision SSPI : pic d’occupation et dépassement de capacité signalé',()=>{
 const day='2026-12-02',resources=[{id:'sspi-1',kind:'recovery'},{id:'bloc-1',kind:'room'},{id:'bloc-2',kind:'room'}];
 const cas=['bloc-1','bloc-2'].map((room,i)=>({id:'S'+i,patient:'Z'+i,resource:room,surgeon:'Dr Martin',procedure:'Prothèse totale de hanche',start:day+'T08:30',end:day+'T10:00',duration:80,turnover:15,state:'Réservée',recovery:{resource:'sspi-1',start:day+'T09:30',end:day+'T10:30'}}));
 const C=B.previsionCapacite({reservations:[...hist,...cas],vacations:[],resources,day});
 assert.equal(C.sspiCap,1);assert.equal(C.sspiMediane,45);
 const h9=C.heures.find(h=>h.heure===9),h10=C.heures.find(h=>h.heure===10);
 assert.equal(h9.sspi,0,'fin de salle estimée 10:11');assert.equal(h10.sspi,2);assert.equal(h10.sspiSature,true);
});

test('analyse du bloc : utilisation, retard de première entrée, rotation, dépassement, par chirurgien',()=>{
 const d='2026-11-20',v={id:'VA',resource:'bloc-1',surgeon:'Dr Martin',start:d+'T08:00',end:d+'T12:00',state:'Ouverte'};
 const r=(id,entree,sortie)=>({id,resource:'bloc-1',vacationId:'VA',surgeon:'Dr Martin',start:entree,end:sortie,duration:60,turnover:15,state:'Terminée',etapes:{entree,sortie}});
 const res=[r('1',d+'T08:30',d+'T09:40'),r('2',d+'T10:00',d+'T11:10'),r('3',d+'T11:30',d+'T12:20')];
 const A=B.analyse({reservations:res,vacations:[v],from:'2026-11-01',to:'2026-11-30'});
 assert.equal(A.global.vacations,1);assert.equal(A.global.retardsPremiere,1);assert.equal(A.global.retardMoyen,30);assert.equal(A.global.rotationMediane,20);
 assert.equal(A.global.depassements,1);assert.equal(A.global.minutesDepassees,20);
 assert.equal(Math.round(A.global.utilisation*100),79,'190 min en salle / 240 min');
 assert.equal(A.parChirurgien[0].cle,'Dr Martin');assert.equal(A.ecartDuree.mediane,10);
});

test('liste d’attente : validation des saisies',()=>{
 assert.equal(B.attenteError({stay:'S1',surgeon:'Dr Martin',dureeMin:60}),'');
 assert.match(B.attenteError({stay:'',surgeon:'Dr Martin',dureeMin:60}),/séjour/);
 assert.match(B.attenteError({stay:'S1',surgeon:'Dr Martin',dureeMin:5}),/Durée/);
 assert.match(B.attenteError({stay:'S1',surgeon:'Dr Martin',dureeMin:60,desDe:'2026-12-10',jusquA:'2026-12-01'}),/fin/);
});
