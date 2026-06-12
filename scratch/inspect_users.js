const { Pool } = require('pg');

const connStr = 'postgresql://nicolas:zampullido20@84.247.162.186:5433/aliminspa?sslmode=disable';
const pool = new Pool({ connectionString: connStr });

async function run() {
  try {
    const users = await pool.query('SELECT id, name, username FROM "User"');
    console.log('Users:', users.rows);
  } catch (err) {
    console.error('Failed to list users:', err.message);
  } finally {
    await pool.end();
  }
}
run();
