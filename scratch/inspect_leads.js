const { Pool } = require('pg');

const connStr = 'postgresql://nicolas:zampullido20@84.247.162.186:5433/aliminspa?sslmode=disable';
const pool = new Pool({ connectionString: connStr });

async function run() {
  try {
    const leads = await pool.query('SELECT id, "firstName", "lastName", "phone", "email" FROM "Lead" LIMIT 10');
    console.log('Leads in aliminspa (Lead table):');
    console.log(JSON.stringify(leads.rows, null, 2));
  } catch (err) {
    console.error('Inspection failed:', err.message);
  } finally {
    await pool.end();
  }
}
run();
