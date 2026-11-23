// Registre des connecteurs nationaux et état affiché dans l'application (écran Tour de contrôle / sortie).
import {statusLabel} from './modes.mjs';import {diagnosticCertificat} from './transport.mjs';
import {insiConfig,createInsi} from './insi.mjs';import {pscConfig} from './psc.mjs';import {dmpConfig,createDmp} from './dmp.mjs';import {mssanteConfig,createMssante} from './mssante.mjs';
const LABELS={insi:['Téléservice INSi','Autorisation CNDA du logiciel + certificat IGC-Santé de l’établissement.'],psc:['Pro Santé Connect','Raccordement déclaré à l’ANS (bac à sable puis production).'],dmp:['DMP (Mon espace santé)','DMP-compatibilité autorisée par le CNDA ; INS qualifiée obligatoire.'],mssante:['MSSanté','Boîte de l’établissement chez un opérateur MSSanté référencé.']};
function safe(fn,id){try{return fn()}catch(e){return {id,mode:'erreur',missing:[],error:e.message,ready:false}}}
export function interopConfigs(env=process.env){return {insi:safe(()=>insiConfig(env),'insi'),psc:safe(()=>pscConfig(env),'psc'),dmp:safe(()=>dmpConfig(env),'dmp'),mssante:safe(()=>mssanteConfig(env),'mssante')}}
const CERTIFICATS={insi:['INSI'],psc:[],dmp:['DMP','DMP_SIGN'],mssante:['MSSANTE']};
export function interopStatus(env=process.env){
 return Object.entries(interopConfigs(env)).map(([id,c])=>({id,label:LABELS[id][0],mode:c.mode,etat:c.error||statusLabel(c),missing:c.missing,autorisation:c.autorisation||'',doc:LABELS[id][1],
  certificats:CERTIFICATS[id].map(p=>diagnosticCertificat(p,env)).filter(x=>x.present)}));
}
export function createConnectors(env=process.env,overrides={}){
 return {env,insi:overrides.insi||createInsi({env}),dmp:overrides.dmp||createDmp({env}),mssante:overrides.mssante||createMssante({env})};
}
