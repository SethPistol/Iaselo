// IASELO · interopérabilité nationale : modes de fonctionnement et garde-fous communs.
//
// Chaque connecteur (INSi, Pro Santé Connect, DMP, MSSanté) fonctionne dans l'un de ces trois modes,
// choisi par une variable d'environnement Clever Cloud INTEROP_<ID>_MODE :
//
//   simulation  (défaut) réponses locales préfixées SIM-, rien ne quitte le serveur ;
//   test        appels réels vers l'environnement de TEST officiel (CNDA, ANS « bas », opérateur de test),
//               avec des identités et cartes de test uniquement ;
//   production  appels réels vers le service national. Exige la référence de l'autorisation officielle
//               (INTEROP_<ID>_AUTORISATION : n° d'autorisation CNDA, n° de raccordement PSC…) et refuse
//               de démarrer sur le serveur de recette.
//
// Le logiciel n'affirme jamais qu'une homologation est obtenue : il affiche la référence déclarée par
// l'exploitant, à vérifier sur les sites officiels (catalogue CNDA, ANS).
export const MODES=['simulation','test','production'];
const clean=v=>String(v??'').trim();

export function connectorMode(id,env=process.env){
 const key='INTEROP_'+id.toUpperCase()+'_MODE',mode=clean(env[key]||'simulation').toLowerCase();
 if(!MODES.includes(mode))throw Error(key+' doit valoir simulation, test ou production.');
 if(mode==='production'&&env.IASELO_RECETTE==='true')throw Error(key+'=production est interdit sur le serveur de recette (données fictives).');
 return mode;
}

// Vérifie la configuration d'un connecteur. `need` : variables obligatoires hors simulation.
export function connectorConfig(id,need,env=process.env){
 const mode=connectorMode(id,env),values=Object.fromEntries(need.map(k=>[k,clean(env[k])]));
 const missing=mode==='simulation'?[]:need.filter(k=>!values[k]);
 const autorisation=clean(env['INTEROP_'+id.toUpperCase()+'_AUTORISATION']);
 if(mode==='production'&&!autorisation)missing.push('INTEROP_'+id.toUpperCase()+'_AUTORISATION');
 return {id,mode,values,missing,autorisation,ready:mode==='simulation'||!missing.length};
}

// Lève une erreur explicite plutôt que d'appeler un service national avec une configuration incomplète.
export function requireReady(cfg){
 if(cfg.mode==='simulation')throw Error('Connecteur '+cfg.id+' en simulation : aucun appel réel.');
 if(cfg.missing.length)throw Error('Connecteur '+cfg.id+' ('+cfg.mode+') incomplet : '+cfg.missing.join(', ')+'.');
 return cfg;
}

export function statusLabel(cfg){
 if(cfg.mode==='simulation')return 'simulation';
 if(cfg.missing.length)return cfg.mode+' · configuration incomplète';
 return cfg.mode==='test'?'environnement de test officiel':'production · autorisation déclarée '+cfg.autorisation+' (à vérifier)';
}
