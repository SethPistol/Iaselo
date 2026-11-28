/* IASELO · ordonnance numérique de sortie, EN SIMULATION (5e veille, lot 5).
   L'ordonnance numérique de l'Assurance maladie n'est pas encore ouverte aux établissements : IASELO prépare le circuit
   (identifiant unique + QR code imprimé sur l'ordonnance, dépôt, suivi de la délivrance) sans rien transmettre.
   Identifiant de simulation : « SIM- » + 15 caractères (alphabet sans 0/O/1/I) en 3 groupes + 1 caractère de contrôle.
   Le jour de l'ouverture du service, l'identifiant et le dépôt viendront du téléservice ; le reste du circuit est conservé. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloOrdoNum=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const ALPHA='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const t=v=>v===undefined||v===null?'':String(v).trim();
function controle(corps){let s=0;for(let i=0;i<corps.length;i++)s=(s*31+ALPHA.indexOf(corps[i])*(i+1))%ALPHA.length;return ALPHA[s]}
function identifiant(octets){const b=Array.from(octets||[]);if(b.length<15)throw new Error('15 octets aléatoires requis.');const c=b.slice(0,15).map(x=>ALPHA[x%ALPHA.length]).join('');return 'SIM-'+c.slice(0,5)+'-'+c.slice(5,10)+'-'+c.slice(10,15)+controle(c)}
function valide(id){const m=/^SIM-([2-9A-HJ-NP-Z]{5})-([2-9A-HJ-NP-Z]{5})-([2-9A-HJ-NP-Z]{5})([2-9A-HJ-NP-Z])$/.exec(t(id));return !!m&&controle(m[1]+m[2]+m[3])===m[4]}
const CHAMPS=['drug','dose','route','frequency','duration','notes'];
function lignes(items){const out=(Array.isArray(items)?items:[]).filter(i=>i&&t(i.drug)).map(i=>Object.fromEntries(CHAMPS.map(k=>[k,t(i[k]).slice(0,300)])));return out}
function canonique(items){return JSON.stringify(lignes(items))}
function verifier({items,prescripteur}={}){const e=[],l=lignes(items);if(!l.length)e.push('Ordonnance vide : ajoutez au moins un médicament.');if(l.length>30)e.push('30 lignes au plus.');if(!t(prescripteur?.nom))e.push('Nom du prescripteur requis.');if(t(prescripteur?.rpps)&&!/^\d{11}$/.test(t(prescripteur.rpps)))e.push('RPPS : 11 chiffres.');return {ok:!e.length,erreurs:e,lignes:l}}
// Statut à partir des événements (dépôt, délivrances, annulation), dans l'ordre.
function statut(evenements){let s='brouillon';const delivrees=new Set();let n=0;
 for(const e of evenements||[]){if(e.type==='depot'){s='deposee';n=e.lignes||n}else if(e.type==='annulation')s='annulee';else if(e.type==='delivrance'&&s!=='annulee'){(e.lignes||[]).forEach(i=>delivrees.add(i));s=n&&delivrees.size>=n?'delivree':'delivree-partielle'}}
 return s}
const LIBELLES={brouillon:'Non déposée',deposee:'Déposée (simulation)','delivree-partielle':'Délivrée en partie','delivree':'Délivrée',annulee:'Annulée'};
return {identifiant,valide,lignes,canonique,verifier,statut,LIBELLES,ALPHA};
});
