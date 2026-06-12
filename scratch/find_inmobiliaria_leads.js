const { Pool } = require('pg');

const connStr = 'postgresql://nicolas:zampullido20@84.247.162.186:5433/aliminspa?sslmode=disable';
const pool = new Pool({ connectionString: connStr });

async function run() {
  try {
    const res = await pool.query('SELECT id, "firstName", "lastName", "phone", "email" FROM "Lead" WHERE "firstName" ILIKE \'%Alimin%\' OR "firstName" ILIKE \'%Inmobiliaria%\' OR "lastName" ILIKE \'%Alimin%\' OR "lastName" ILIKE \'%Inmobiliaria%\'');
    console.log('Matching leads:', res.rows);
  } catch (err) {
    console.error('Failed to query leads:', err.message);
  } finally {
    await pool.end();
  }
}
run();
