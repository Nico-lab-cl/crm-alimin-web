const { Pool } = require('pg');

const connStr = 'postgresql://nicolas:zampullido20@84.247.162.186:5433/aliminspa?sslmode=disable';
const pool = new Pool({ connectionString: connStr });

async function run() {
  try {
    console.log('Querying Conversation table...');
    const conversations = await pool.query('SELECT * FROM "Conversation" LIMIT 5');
    console.log('Conversations:', conversations.rows);

    console.log('Querying Message table...');
    const messages = await pool.query('SELECT * FROM "Message" LIMIT 5');
    console.log('Messages:', messages.rows);
  } catch (err) {
    console.error('Inspection failed:', err.message);
  } finally {
    await pool.end();
  }
}
run();
