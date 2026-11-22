import pg from 'pg';import fs from 'node:fs/promises';import {createHash} from 'node:crypto';
pg.types.setTypeParser(20,v=>{const n=Number(v);if(!Number.isSafeInteger(n))throw Error('Database integer out of safe range');return n});
export function createPool(env=process.env){
 const url=env.DATABASE_URL||env.POSTGRESQL_ADDON_URI;
 const connection=url?{connectionString:url}:{host:env.POSTGRESQL_ADDON_HOST,port:Number(env.POSTGRESQL_ADDON_PORT||5432),user:env.POSTGRESQL_ADDON_USER,password:env.POSTGRESQL_ADDON_PASSWORD,database:env.POSTGRESQL_ADDON_DB};
 if(!url&&!connection.host)throw Error('DATABASE_URL ou les variables POSTGRESQL_ADDON_* sont requises.');
 const mode=env.PGSSL||'verify-full';if(!['verify-full','disable'].includes(mode))throw Error('PGSSL doit valoir verify-full ou disable.');
 // L’URL ne peut pas réduire la vérification TLS choisie explicitement ici.
 if(url){const u=new URL(url);for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])u.searchParams.delete(key);connection.connectionString=u.toString()}
 return new pg.Pool({...connection,max:Number(env.PG_POOL_SIZE||5),connectionTimeoutMillis:10000,idleTimeoutMillis:30000,ssl:mode==='disable'?false:{rejectUnauthorized:true,...(env.PGSSL_CA?{ca:env.PGSSL_CA.replace(/\\n/g,'\n')}:{})}});
}
export function translateSQL(sql){
 let out='',quoted=false,double=false,index=0;
 for(let i=0;i<sql.length;i++){const ch=sql[i];if(ch==="'"&&!double){out+=ch;if(quoted&&sql[i+1]==="'"){out+=sql[++i];continue}quoted=!quoted;continue}if(ch==='"'&&!quoted){double=!double;out+=ch;continue}out+=ch==='?'&&!quoted&&!double?'$'+(++index):ch;}
 const ignore=/^\s*INSERT OR IGNORE\b/i.test(out);out=out.replace(/^\s*INSERT OR IGNORE\b/i,'INSERT');if(ignore&&!/\bON CONFLICT\b/i.test(out))out=out.replace(/;?\s*$/,' ON CONFLICT DO NOTHING');return out;
}
export function postgresBinding(pool){
 const result=r=>({results:r.rows||[],meta:{changes:r.command==='SELECT'?0:r.rowCount||0}});
 const statement=(sql,values=[])=>({sql,values,bind(...v){return statement(sql,v)},async all(){const r=await pool.query(translateSQL(sql),values);return {results:r.rows}},async first(){return (await pool.query(translateSQL(sql),values)).rows[0]||null},async run(){return result(await pool.query(translateSQL(sql),values))}});
 return {pool,prepare:statement,async batch(statements){const client=await pool.connect();try{await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');const out=[];for(const s of statements)out.push(result(await client.query(translateSQL(s.sql),s.values)));await client.query('COMMIT');return out}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}},close:()=>pool.end()};
}
export async function migrate(pool){const client=await pool.connect();try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(73621590)');await client.query('CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL)');
 for(const name of (await fs.readdir(new URL('../migrations/postgres/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort()){
  const sql=await fs.readFile(new URL('../migrations/postgres/'+name,import.meta.url),'utf8'),hash=createHash('sha256').update(sql).digest('hex'),old=(await client.query('SELECT sha256 FROM app_migrations WHERE name=$1',[name])).rows[0];
  if(old){if(old.sha256!==hash)throw Error('Migration déjà appliquée et modifiée : '+name);continue}
  await client.query(sql);await client.query('INSERT INTO app_migrations VALUES($1,$2,$3)',[name,hash,new Date().toISOString()]);
 }await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}}
