const { Pool } = require('pg');

const connStr = 'postgresql://nicolas:zampullido20@84.247.162.186:5433/aliminspa?sslmode=disable';
const pool = new Pool({ connectionString: connStr });

async function run() {
  try {
    const cols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Lead'
    `);
    console.log('Lead columns:');
    console.log(cols.rows);
  } catch (err) {
    console.error('Failed to list columns:', err.message);
  } finally {
    await pool.end();
  }
}
run();
