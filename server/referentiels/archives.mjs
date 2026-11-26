// Lecture des formats publiés par les autorités, sans dépendance :
//  - archives ZIP (méthodes 0 « stockée » et 8 « deflate ») de l'Assurance Maladie ;
//  - tables dBase (DBF) de la CCAM, en page de code DOS 850, lues en flux enregistrement par enregistrement ;
//  - fichiers texte tabulés de la BDPM (UTF-8 ou Windows-1252 selon les années).
import {Readable} from 'node:stream';
import {createInflateRaw} from 'node:zlib';

const FIN=0x06054b50,CENTRALE=0x02014b50,LOCALE=0x04034b50;

/** Entrées d'une archive ZIP chargée en mémoire : [{nom, methode, taille, donnees() → flux décompressé}]. */
export function entreesZip(zip){
 if(!Buffer.isBuffer(zip)||zip.length<22)throw Error('Archive ZIP invalide.');
 let fin=-1;for(let i=zip.length-22;i>=Math.max(0,zip.length-22-65535);i--)if(zip.readUInt32LE(i)===FIN){fin=i;break}
 if(fin<0)throw Error('Archive ZIP invalide : fin de répertoire introuvable.');
 const nombre=zip.readUInt16LE(fin+10);let p=zip.readUInt32LE(fin+16);const out=[];
 for(let k=0;k<nombre;k++){
  if(zip.readUInt32LE(p)!==CENTRALE)throw Error('Archive ZIP invalide : répertoire corrompu.');
  const methode=zip.readUInt16LE(p+10),compresse=zip.readUInt32LE(p+20),taille=zip.readUInt32LE(p+24),ln=zip.readUInt16LE(p+28),lx=zip.readUInt16LE(p+30),lc=zip.readUInt16LE(p+32),local=zip.readUInt32LE(p+42);
  const nom=zip.toString('utf8',p+46,p+46+ln);p+=46+ln+lx+lc;
  if(nom.endsWith('/'))continue;
  if(zip.readUInt32LE(local)!==LOCALE)throw Error('Archive ZIP invalide : en-tête local manquant pour '+nom+'.');
  const debut=local+30+zip.readUInt16LE(local+26)+zip.readUInt16LE(local+28),brut=zip.subarray(debut,debut+compresse);
  if(![0,8].includes(methode))throw Error('Compression '+methode+' non gérée pour '+nom+'.');
  out.push({nom,methode,taille,donnees:()=>methode===0?Readable.from([brut]):Readable.from([brut]).pipe(createInflateRaw())});
 }
 return out;
}

// Moitié haute de la page de code 850 (0x80 à 0xFF).
const CP850_HAUT='ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ ';
export function cp850(b){let s='';for(let i=0;i<b.length;i++){const c=b[i];s+=c<0x80?String.fromCharCode(c):CP850_HAUT[c-0x80]}return s}

/**
 * Parcourt une table DBF à partir d'un flux d'octets. `champs` limite les colonnes décodées (les autres sont ignorées,
 * ce qui évite de décoder les longs libellés inutiles). `brut(nom)` garde les espaces de fin d'une colonne.
 */
export async function* lireDbf(flux,{champs=null,brut=()=>false}={}){
 let tampon=Buffer.alloc(0),entete=null,colonnes=null,taille=0,lus=0;
 for await(const morceau of flux){
  tampon=tampon.length?Buffer.concat([tampon,morceau]):morceau;
  if(!entete){
   if(tampon.length<32)continue;
   const longueur=tampon.readUInt16LE(8);if(tampon.length<longueur)continue;
   entete={nombre:tampon.readUInt32LE(4),longueur};taille=tampon.readUInt16LE(10);
   colonnes=[];let decalage=1;
   for(let p=32;p+32<=longueur&&tampon[p]!==0x0d;p+=32){
    const nom=tampon.toString('latin1',p,p+11).replace(/\0.*$/s,''),type=String.fromCharCode(tampon[p+11]),lg=tampon[p+16];
    colonnes.push({nom,type,decalage,lg});decalage+=lg;
   }
   if(!colonnes.length||taille<2)throw Error('Table DBF invalide.');
   if(champs)colonnes=colonnes.filter(c=>champs.includes(c.nom));
   tampon=tampon.subarray(longueur);
  }
  let p=0;
  while(tampon.length-p>=taille&&lus<entete.nombre){
   const e=tampon.subarray(p,p+taille);p+=taille;lus++;
   if(e[0]===0x2a)continue;if(e[0]===0x1a)return;
   const o={};for(const c of colonnes){const t=cp850(e.subarray(c.decalage,c.decalage+c.lg));o[c.nom]=brut(c.nom)?t:t.trim()}
   yield o;
  }
  tampon=tampon.subarray(p);
 }
}

/** Texte BDPM : UTF-8 si valide, sinon Windows-1252 (anciens fichiers). Une ligne = un tableau de colonnes. */
export function lignesTabulees(b){
 let t;try{t=new TextDecoder('utf-8',{fatal:true}).decode(b)}catch{t=new TextDecoder('windows-1252').decode(b)}
 return t.replace(/^﻿/,'').split(/\r?\n/).filter(l=>l.trim()).map(l=>l.split('\t').map(x=>x.trim()));
}

/** Noms des colonnes d'une table DBF (lecture de l'en-tête seulement). */
export async function colonnesDbf(flux){
 let tampon=Buffer.alloc(0);
 for await(const morceau of flux){tampon=Buffer.concat([tampon,morceau]);if(tampon.length<32)continue;const longueur=tampon.readUInt16LE(8);if(tampon.length<longueur)continue;
  const noms=[];for(let p=32;p+32<=longueur&&tampon[p]!==0x0d;p+=32)noms.push(tampon.toString('latin1',p,p+11).replace(/\0.*$/s,''));flux.destroy?.();return noms}
 return [];
}
