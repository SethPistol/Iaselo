const {test}=require('node:test');const assert=require('node:assert/strict');const C=require('../dist/planning-core.js');
const t=s=>'2026-11-20T'+s;
const resources=[{id:'room',kind:'room',label:'Salle A'},{id:'room2',kind:'room',label:'Salle B'},{id:'sspi',kind:'recovery',label:'SSPI A'},{id:'bed',kind:'bed',label:'Lit A'},{id:'staff',kind:'staff',label:'Personnel A'},{id:'staff2',kind:'staff',label:'Personnel B'},{id:'eq',kind:'equipment',label:'Équipement A'}];
const vacations=[{id:'V',resource:'room',label:'Équipe A',start:t('08:00'),end:t('13:00'),staffIds:['staff']},{id:'V2',resource:'room2',label:'Équipe B',start:t('08:00'),end:t('13:00'),staffIds:['staff2']}];
const booking=(overrides={})=>({id:'A',patient:'A',planningVersion:1,resource:'room',vacationId:'V',start:t('08:00'),end:t('09:15'),duration:60,turnover:15,staffIds:['staff'],equipmentIds:['eq'],recovery:{resource:'sspi',start:t('09:00'),end:t('10:00')},bed:{resource:'bed',start:t('10:00'),end:t('18:00')},state:'Réservée',...overrides});
test('parcours salle, SSPI et lit cohérent, avec remise en état comprise dans la vacation',()=>{
 assert.equal(C.bookingError(booking(),[],resources,vacations),'');
 assert.match(C.bookingError(booking({turnover:10}),[],resources,vacations),/durée/);
 assert.match(C.bookingError(booking({end:t('13:15'),duration:300}),[],resources,vacations),/vacation/);
 assert.match(C.bookingError(booking({recovery:{resource:'sspi',start:t('09:15'),end:t('10:00')}}),[],resources,vacations),/fin prévue/);
 assert.match(C.bookingError(booking({bed:{resource:'bed',start:t('09:30'),end:t('18:00')}}),[],resources,vacations),/sortie prévue/);
});
test('les conflits de matériel et de SSPI sont détectés entre salles indépendantes',()=>{
 const a=booking(),b=booking({id:'B',patient:'B',resource:'room2',vacationId:'V2',staffIds:['staff2']});
 assert.match(C.bookingError(b,[a],resources,vacations),/Conflit/);
 assert.match(C.bookingError({...b,equipmentIds:[],bed:null},[a],resources,vacations),/Conflit/);
 assert.match(C.bookingError({...b,equipmentIds:[],recovery:null,bed:{resource:'bed',start:t('09:00'),end:t('18:00')}},[a],resources,vacations),/Conflit/);
 assert.equal(C.bookingError({...b,equipmentIds:[],recovery:null,bed:null},[a],resources,vacations),'');
});
test('les vacations bloquent les doubles affectations de personnel et les salles fermées',()=>{
 assert.match(C.vacationError({...vacations[1],staffIds:['staff']},[vacations[0]],resources),/Chevauchement/);
 assert.match(C.vacationError({...vacations[1],staffIds:[]},[],resources),/personnel/);
 assert.match(C.vacationError(vacations[0],[],resources.map(r=>r.id==='room'?{...r,open:false}:r)),/indisponible/);
 assert.equal(C.vacationError({...vacations[0],id:'V3',start:t('13:00'),end:t('17:00')},vacations,resources),'');
});
test('une fin de réservation libère le créneau mais une occupation déclarée exige une libération réelle',()=>{
 const a=booking();assert.equal(C.busyAt(a,'sspi',t('09:59')),true);assert.equal(C.busyAt(a,'sspi',t('10:00')),false);
 const occupied={...a,state:'Occupée',phase:'recovery'};assert.equal(C.busyAt(occupied,'sspi',t('12:00')),true);
 assert.match(C.transitionError({...a,id:'B'},'recovery',[occupied],resources),/encore occupée/);
 assert.equal(C.transitionError({...a,id:'B'},'recovery',[{...occupied,state:'Terminée'}],resources),'');
});
test('les réservations annulées ne bloquent plus les créneaux et les noms des ressources sont contrôlés',()=>{
 assert.equal(C.bookingError({...booking(),id:'B',patient:'B'},[{...booking(),state:'Annulée'}],resources,vacations),'');
 assert.match(C.resourceError([...resources,resources[0]]),/double/);
 assert.match(C.bookingError(booking({staffIds:['staff2']}),[],resources,vacations),/personnels affectés/);
});
test('annonces chirurgicales : placées dans la vacation du chirurgien, à la suite du programme, dépassement signalé',()=>{
 const day='2026-11-20',vac=[{id:'V',resource:'room',label:'Orthopédie',surgeon:'Dr Jean Dubois',start:t('08:00'),end:t('12:00'),staffIds:['staff']},{id:'V2',resource:'room2',label:'Digestif',surgeon:'Dr Martin',start:t('08:00'),end:t('10:00'),staffIds:['staff2']}];
 const ann=(stay,f,state='Transmise',revision=1)=>({id:stay,surgicalAnnouncement:{published:{state,revision,fields:{procedure:'Geste '+stay,surgeon:'dr dubois',date:day,...f}}}});
 const stays=[ann('A',{duration:'90'}),ann('B',{time:'10:30',duration:'45'}),ann('C',{}),ann('D',{surgeon:'Dr Martin',duration:'120'}),ann('E',{surgeon:'Dr Inconnu'}),ann('F',{date:'2026-11-21'}),ann('G',{},'Annulée')];
 const booked=[{id:'R',patient:'Z',resource:'room',vacationId:'V',start:t('08:00'),end:t('09:00'),state:'Réservée'}];
 const res=C.placeAnnouncements(day,stays.map(C.announcementOf),vac,booked);
 const at=id=>res.placed.find(p=>p.stay===id);
 assert.equal(at('A').start,t('09:00'));assert.equal(at('A').end,t('10:45'));assert.equal(at('A').vacationId,'V');
 assert.equal(at('B').start,t('10:45'),'heure souhaitée prise, décalée après le patient précédent');
 assert.equal(at('C').start,t('11:45'));assert.equal(at('C').overflow,60,'durée par défaut 60 min + 15 min de remise en état : fin 13 h, dépassement de 60 min');assert.equal(at('C').defaultDuration,true);
 assert.equal(at('D').overflow,15);
 assert.match(res.unplaced.find(u=>u.stay==='E').reason,/Aucune vacation de Dr Inconnu/);
 assert.ok(!at('F')&&!at('G'),'autre jour ou annonce annulée : rien');
 assert.equal(res.load.get('V').free,240-60-105-60-75);
 // Une proposition confirmée devient une réservation valide (convocation possible ensuite) et n'est plus proposée.
 const item=C.bookingFromAnnouncement(at('A'));assert.equal(C.bookingError(item,booked,resources,vacations.map(v=>v.id==='V'?{...v,end:t('12:00')}:v)),'');
 assert.equal(item.source,'annonce');assert.equal(item.annonceRevision,1);
 const again=C.placeAnnouncements(day,stays.map(C.announcementOf),vac,[...booked,item]);assert.ok(!again.placed.some(p=>p.stay==='A'));assert.equal(again.placed.find(p=>p.stay==='B').start,t('10:45'));
 // Le chirurgien modifie ou annule ensuite son annonce : le programme confirmé le signale.
 assert.equal(C.announcementDrift(item,C.announcementOf(ann('A',{}))),'');
 assert.match(C.announcementDrift(item,C.announcementOf(ann('A',{date:'2026-11-23'},'Transmise',2))),/nouvelle date souhaitée le 23\/11\/2026/);
 assert.match(C.announcementDrift(item,C.announcementOf(ann('A',{},'Annulée'))),/annulée/);
 assert.equal(C.sameSurgeon('Dr Jean Dubois','dubois'),true);assert.equal(C.sameSurgeon('Dr Martin','Dr Dubois'),false);assert.equal(C.sameSurgeon('','Dr Dubois'),false);
});
