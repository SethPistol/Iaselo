import {hashPassword} from '../server/auth.mjs';import {secretInput} from './password-input.mjs';
try{console.log(await hashPassword(await secretInput()))}catch(e){console.error(e.message);process.exit(1)}
