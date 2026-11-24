import {randomBytes} from 'node:crypto';
// Mode recette (IASELO_RECETTE=true) : serveur de test séparé, données fictives uniquement.
// Il évite toute manipulation technique : adresse déduite de l’application Clever Cloud,
// secret de session tiré au démarrage, compte de test créé automatiquement (voir auth.mjs).
export const RECETTE_EMAIL='demo@iaselo.test',RECETTE_PASSWORD='Recette IASELO 2026';
// Compte chirurgien de test, créé uniquement en recette, pour essayer l'application avec ce profil.
export const RECETTE_CHIRURGIEN_EMAIL='chirurgien@iaselo.test',RECETTE_CHIRURGIEN_PASSWORD='Chirurgien IASELO 2026';
export function recette(env=process.env){return env.IASELO_RECETTE==='true'}
function recetteEnv(env){
 if(!recette(env))return env;const out={...env};
 if(!out.BASE_URL&&/^app_[0-9a-f-]{36}$/.test(env.APP_ID||''))out.BASE_URL='https://'+env.APP_ID.replace('_','-')+'.cleverapps.io';
 if(!out.SESSION_SECRET)out.SESSION_SECRET=randomBytes(32).toString('hex');
 out.ENABLE_DEMO_SEED='true';return out;
}
export function config(env=process.env){
 env=recetteEnv(env);
 const production=(env.NODE_ENV||'production')==='production';if(!env.BASE_URL)throw Error('BASE_URL est requis (origine HTTPS de l’application).');const base=new URL(env.BASE_URL);
 if(base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('BASE_URL doit être une origine sans chemin ni identifiants.');if(production&&base.protocol!=='https:')throw Error('BASE_URL doit utiliser HTTPS en production.');
 if(!env.SESSION_SECRET||env.SESSION_SECRET.length<32)throw Error('SESSION_SECRET doit contenir au moins 32 caractères aléatoires.');
 const hours=Number(env.SESSION_HOURS||8);if(!Number.isFinite(hours)||hours<1||hours>24)throw Error('SESSION_HOURS doit être compris entre 1 et 24.');
 return {baseUrl:base.origin,production,secure:base.protocol==='https:',port:Number(env.PORT||8080),sessionSecret:env.SESSION_SECRET,sessionHours:hours,enableDemoSeed:env.ENABLE_DEMO_SEED==='true',recette:recette(env),
  // Double authentification : toujours exigée hors recette ; en recette (patients fictifs), seulement si MFA_OBLIGATOIRE=true,
  // les deux comptes de test restant dispensés.
  mfa:recette(env)?env.MFA_OBLIGATOIRE==='true':true};
}
