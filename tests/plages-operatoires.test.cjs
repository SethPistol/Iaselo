// Plages opératoires des chirurgiens (26/11/2026) : règles et génération des vacations.
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../dist/plages-operatoires-regles.js'),C=require('../dist/planning-core.js');
const resources=[{id:'S1',kind:'room',label:'Bloc · Salle 1'},{id:'S2',kind:'room',label:'Bloc · Salle 2'},{id:'I1',kind:'staff',label:'IBODE 1'},{id:'I2',kind:'staff',label:'IBODE 2'}];
const plage=(x={})=>({id:'PL1',surgeon:'Dr Dubois',weekday:2,resource:'S1',start:'08:00',duration:300,staffIds:['I1'],from:'2026-11-26',rhythm:'hebdo',state:'Active',...x});
test('une plage valide : jour, salle, début, durée',()=>{
 assert.equal(P.plageError(plage(),[],resources),'');
 assert.equal(P.fin(plage()),'13:00');assert.equal(P.dureeTexte(300),'5 h');assert.equal(P.dureeTexte(270),'4 h 30');
 assert.match(P.plageError(plage({surgeon:' '}),[],resources),/chirurgien/);
 assert.match(P.plageError(plage({weekday:9}),[],resources),/jour/);
 assert.match(P.plageError(plage({resource:'I1'}),[],resources),/salle/);
 assert.match(P.plageError(plage({duration:20}),[],resources),/durée/);
 assert.match(P.plageError(plage({duration:310}),[],resources),/durée/);
 assert.match(P.plageError(plage({start:'20:00',duration:300}),[],resources),/même jour/);
 assert.match(P.plageError(plage({staffIds:[]}),[],resources),/personnel/);
 assert.match(P.plageError(plage({until:'2026-11-01'}),[],resources),/fin de validité/);
 assert.match(P.plageError(plage({patient:'X'}),[],resources),/inconnu/);
});
test('deux plages actives ne se chevauchent pas dans la même salle ou avec le même personnel',()=>{
 const a=plage();
 assert.match(P.plageError(plage({id:'PL2',surgeon:'Dr Martin',start:'12:00',staffIds:['I2']}),[a],resources),/Chevauchement avec la plage de Dr Dubois/);
 assert.match(P.plageError(plage({id:'PL2',resource:'S2',start:'12:00'}),[a],resources),/Chevauchement/);
 assert.equal(P.plageError(plage({id:'PL2',start:'13:00',staffIds:['I2']}),[a],resources),'');
 assert.equal(P.plageError(plage({id:'PL2',weekday:3,staffIds:['I2']}),[a],resources),'');
 assert.equal(P.plageError(plage({id:'PL2',staffIds:['I2']}),[{...a,state:'Suspendue'}],resources),'');
 assert.equal(P.plageError(plage({id:'PL2',rhythm:'paire',staffIds:['I2']}),[{...a,rhythm:'impaire'}],resources),'');
 assert.equal(P.plageError(plage({id:'PL2',from:'2027-01-01',staffIds:['I2']}),[{...a,until:'2026-12-31'}],resources),'');
 assert.match(P.listeError([a,a],resources),/double/);
});
test('les dates suivent le jour opératoire, le rythme et la validité',()=>{
 assert.equal(P.jourDe('2026-11-26'),4);
 assert.deepEqual(P.dates(plage(),'2026-11-26','2026-12-16'),['2026-12-01','2026-12-08','2026-12-15']);
 assert.deepEqual(P.dates(plage({until:'2026-12-08'}),'2026-11-26','2026-12-31'),['2026-12-01','2026-12-08']);
 const paires=P.dates(plage({rhythm:'paire'}),'2026-11-26','2026-12-31');assert.ok(paires.length===2&&paires.every(d=>P.semaineIso(d)%2===0),paires.join());
 assert.equal(P.semaineIso('2026-12-01'),49);assert.equal(P.semaineIso('2027-01-01'),53);
 assert.deepEqual(P.dates(plage({state:'Suspendue'}),'2026-11-26','2026-12-31'),[]);
});
test('génération : vacations datées avec le chirurgien, sans toucher aux vacations occupées ou manuelles',()=>{
 const today='2026-11-26',g=x=>P.generer({resources,today,vacationError:C.vacationError,...x});
 let r=g({plages:[plage()],vacations:[{id:'VAC-MAIN',resource:'S2',label:'Manuelle',start:'2026-12-01T08:00',end:'2026-12-01T12:00',staffIds:['I2'],state:'Ouverte'}]});
 assert.equal(r.ajoutees.length,12);assert.equal(r.vacations.length,13);
 const v=r.vacations.find(x=>x.start==='2026-12-01T08:00'&&x.plageId);assert.deepEqual({surgeon:v.surgeon,end:v.end,resource:v.resource,staff:v.staffIds},{surgeon:'Dr Dubois',end:'2026-12-01T13:00',resource:'S1',staff:['I1']});
 assert.equal(C.vacationError(v,r.vacations,resources),'');
 // Une annonce de Dr Dubois ce jour-là se place dans la vacation générée.
 const ann={stay:'S',state:'Transmise',revision:1,sentAt:'2026-11-26T10:00',procedure:'Arthroscopie',surgeon:'Dubois',date:'2026-12-01',time:'',duration:60,urgency:'Programmée'};
 assert.equal(C.placeAnnouncements('2026-12-01',[ann],r.vacations,[]).placed[0]?.vacationId,v.id);
 // Relancer sans changement : rien ne bouge.
 const r2=g({plages:[plage()],vacations:r.vacations});assert.equal(r2.ajoutees.length+r2.retirees.length+r2.ajustees.length,0);
 // Durée raccourcie : un patient programmé à 11 h 30 ne tient plus → vacation conservée et signalée, les autres ajustées.
 const resa=[{id:'R1',patient:'P',resource:'S1',vacationId:v.id,start:'2026-12-01T11:30',end:'2026-12-01T12:45',state:'Réservée'}];
 const r3=g({plages:[plage({duration:180})],vacations:r.vacations,reservations:resa});
 assert.equal(r3.vacations.find(x=>x.id===v.id).end,'2026-12-01T13:00');assert.equal(r3.signalements.length,1);assert.equal(r3.ajustees.length,11);
 // Plage supprimée : vacations libres retirées, la vacation occupée reste, la manuelle aussi.
 const r4=g({plages:[],vacations:r.vacations,reservations:resa});
 assert.deepEqual(r4.vacations.map(x=>x.id).sort(),[v.id,'VAC-MAIN'].sort());assert.equal(r4.retirees.length,11);
 // Une occurrence annulée à la main (congé) n'est pas recréée.
 const annulee=r.vacations.map(x=>x.id===v.id?{...x,state:'Annulée'}:x),r5=g({plages:[plage()],vacations:annulee});
 assert.equal(r5.vacations.filter(x=>x.id===v.id).length,1);assert.equal(r5.vacations.find(x=>x.id===v.id).state,'Annulée');
 // Les vacations passées issues d'une plage ne bougent pas.
 const passee={...v,id:'VAC-PL-PL1-2026-11-24',start:'2026-11-24T08:00',end:'2026-11-24T13:00'};
 assert.ok(g({plages:[],vacations:[passee]}).vacations.some(x=>x.id===passee.id));
});
test('seuls l’administrateur et le cadre de bloc gèrent les plages',()=>{
 assert.ok(P.peutGerer({isAdmin:true,profession:'administration'}));
 assert.ok(P.peutGerer({profession:'infirmier',poste:'cadre'}));
 for(const p of [{profession:'infirmier',poste:'bloc'},{profession:'chirurgien'},{profession:'anesthesiste'},{profession:'secretariat'},{profession:'infirmier',poste:'cadre',active:false},null])assert.ok(!P.peutGerer(p),JSON.stringify(p));
});
test('l’écran Plages des chirurgiens est branché dans Bloc & lits',()=>{
 const fs=require('node:fs'),src=fs.readFileSync(__dirname+'/../dist/bloc-planner.js','utf8'),html=fs.readFileSync(__dirname+'/../dist/index.html','utf8');
 assert.match(src,/\['plages','Plages des chirurgiens'\]/);assert.match(src,/plages:\(\)=>plagesPane\(day\)/);
 assert.ok(html.indexOf('plages-operatoires-regles.js')<html.indexOf('bloc-planner.js'));
 const M=require('../dist/menu-profils.js');assert.ok(M.menuPourProfil('administration',true).includes('regulation'));assert.ok(M.menuPourProfil('infirmier',false,'cadre').includes('ouvertureSalles'));
});
test('relancer la génération ne change pas l’ordre des vacations (pas d’enregistrement inutile)',()=>{
 const g=x=>P.generer({resources,today:'2026-11-26',vacationError:C.vacationError,...x});
 const r=g({plages:[plage()],vacations:[]}),manuelle={id:'VAC-MAIN',resource:'S2',label:'Manuelle',start:'2026-12-02T08:00',end:'2026-12-02T12:00',staffIds:['I2'],state:'Ouverte'};
 const liste=[...r.vacations,manuelle];assert.deepEqual(g({plages:[plage()],vacations:liste}).vacations,liste);
});
