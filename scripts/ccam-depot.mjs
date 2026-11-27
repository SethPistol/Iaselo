// Construit la copie de secours de la CCAM gardée dans le dépôt (server/referentiels/ccam-depot.json.gz)
// à partir des trois archives DBF officielles téléchargées sur ameli.fr :
//   node scripts/ccam-depot.mjs CCAM08400_DBF_PART1.zip CCAM08400_DBF_PART2.zip CCAM08400_DBF_PART3.zip
// À relancer à chaque nouvelle version de la CCAM (le serveur la télécharge seul quand ameli répond ;
// cette copie ne sert que si ameli est indisponible au moment de la construction).
import fs from 'node:fs';import {gzipSync} from 'node:zlib';
import {construireCcam} from '../server/referentiels/ccam.mjs';
import {CCAM_DEPOT} from './referentiels.mjs';
const fichiers=process.argv.slice(2);
if(!fichiers.length){console.error('Usage : node scripts/ccam-depot.mjs PART1.zip PART2.zip PART3.zip');process.exit(1)}
const version=(fichiers.map(f=>f.match(/CCAM0?(\d{4,5})_DBF/i)?.[1]).find(Boolean)||'').padStart(5,'0');
if(!version){console.error('Version introuvable dans le nom des archives (CCAM08400_DBF_PART1.zip…).');process.exit(1)}
const ccam=await construireCcam(fichiers.map(f=>fs.readFileSync(f)),{version});
fs.writeFileSync(CCAM_DEPOT,gzipSync(JSON.stringify(ccam),{level:9}));
console.log('Copie CCAM V'+version+' écrite : '+ccam.actes.length+' actes, '+Object.keys(ccam.modificateurs).length+' modificateurs décrits, '+(fs.statSync(CCAM_DEPOT).size/1024).toFixed(0)+' Ko.');
