const { Pool } = require('pg');

const connStr = 'postgresql://nicolas:zampullido20@84.247.162.186:5433/aliminspa?sslmode=disable';
const pool = new Pool({ connectionString: connStr });

async function run() {
  try {
    const res = await pool.query('SELECT * FROM "Lead" WHERE id = \'0a85ea8a-7cfe-416f-bc4c-688b713f930a\'');
    console.log('Lead details:', res.rows[0]);
  } catch (err) {
    console.error('Failed to query lead:', err.message);
  } finally {
    await pool.end();
  }
}
run();
