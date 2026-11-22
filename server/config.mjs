export function config(env=process.env){
 const production=(env.NODE_ENV||'production')==='production';if(!env.BASE_URL)throw Error('BASE_URL est requis (origine HTTPS de l’application).');const base=new URL(env.BASE_URL);
 if(base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw Error('BASE_URL doit être une origine sans chemin ni identifiants.');if(production&&base.protocol!=='https:')throw Error('BASE_URL doit utiliser HTTPS en production.');
 if(!env.SESSION_SECRET||env.SESSION_SECRET.length<32)throw Error('SESSION_SECRET doit contenir au moins 32 caractères aléatoires.');
 const hours=Number(env.SESSION_HOURS||8);if(!Number.isFinite(hours)||hours<1||hours>24)throw Error('SESSION_HOURS doit être compris entre 1 et 24.');
 return {baseUrl:base.origin,production,secure:base.protocol==='https:',port:Number(env.PORT||8080),sessionSecret:env.SESSION_SECRET,sessionHours:hours,enableDemoSeed:env.ENABLE_DEMO_SEED==='true'};
}
