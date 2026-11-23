// Diagnostic des certificats IGC-Santé déposés dans les variables du serveur : lisibilité, mot de passe, expiration.
import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {diagnosticCertificat} from '../../server/interop/transport.mjs';
import {interopStatus} from '../../server/interop/index.mjs';

let p12=null;
try{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cert-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(dir,'k.pem'),'-out',path.join(dir,'c.pem'),'-days','20','-subj','/CN=CLINIQUE TEST AUTH_CLI/O=Clinique de test'],{stdio:'ignore'});
 execFileSync('openssl',['pkcs12','-export','-inkey',path.join(dir,'k.pem'),'-in',path.join(dir,'c.pem'),'-out',path.join(dir,'t.p12'),'-passout','pass:secret'],{stdio:'ignore'});
 p12=fs.readFileSync(path.join(dir,'t.p12')).toString('base64');fs.rmSync(dir,{recursive:true,force:true});
}catch{}

test('Certificat : absent, lisible avec date d’expiration, mot de passe faux',{skip:!p12&&'openssl indisponible'},()=>{
 assert.deepEqual(diagnosticCertificat('INSI',{}),{prefix:'INSI',present:false});
 const ok=diagnosticCertificat('INSI',{INSI_CERT_P12_BASE64:p12,INSI_CERT_PASSWORD:'secret'});
 assert.equal(ok.lisible,true);assert.equal(ok.titulaire,'CLINIQUE TEST AUTH_CLI');assert.ok(ok.joursRestants>=18&&ok.joursRestants<=20);assert.equal(ok.igcSante,false);
 assert.doesNotMatch(JSON.stringify(ok),/BEGIN|secret/);
 assert.equal(diagnosticCertificat('INSI',{INSI_CERT_P12_BASE64:p12,INSI_CERT_PASSWORD:'faux'}).erreur,'Mot de passe du certificat incorrect.');
 const st=interopStatus({INTEROP_INSI_MODE:'test',INSI_CERT_P12_BASE64:p12,INSI_CERT_PASSWORD:'secret'}).find(c=>c.id==='insi');
 assert.equal(st.certificats.length,1);assert.equal(st.certificats[0].lisible,true);
 assert.ok(interopStatus({}).every(c=>c.certificats.length===0));
});
