const { Pool } = require('pg');

const connStr = 'postgresql://nicolas:zampullido20@84.247.162.186:5433/aliminspa?sslmode=disable';
const pool = new Pool({ connectionString: connStr });

async function run() {
  try {
    const res = await pool.query(`
      SELECT id, "firstName", "lastName", "phone" 
      FROM "Lead" 
      WHERE "phone" IS NOT NULL AND LENGTH(REGEXP_REPLACE("phone", '[^0-9]', '', 'g')) < 7
    `);
    console.log('Leads with short/empty digit phones:', res.rows);
  } catch (err) {
    console.error('Failed to query leads:', err.message);
  } finally {
    await pool.end();
  }
}
run();
