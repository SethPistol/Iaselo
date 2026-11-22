import {createPool,migrate} from '../server/database.mjs';const pool=createPool();try{await migrate(pool);console.log('Migrations PostgreSQL à jour.')}finally{await pool.end()}
