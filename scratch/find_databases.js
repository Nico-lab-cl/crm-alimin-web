const { Pool } = require('pg');

const connStr = 'postgresql://nicolas:zampullido20@84.247.162.186:5433/postgres?sslmode=disable';
const pool = new Pool({ connectionString: connStr });

async function run() {
  try {
    const res = await pool.query('SELECT datname FROM pg_database WHERE datistemplate = false');
    console.log('Databases:', res.rows.map(r => r.datname));
  } catch (err) {
    console.error('Failed to list databases:', err.message);
  } finally {
    await pool.end();
  }
}
run();
