const { Pool } = require('pg');

const mainDbUrl = 'postgresql://nicolas:zampullido20@84.247.162.186:5433/crm?sslmode=disable';
const poolMain = new Pool({ connectionString: mainDbUrl });

async function run() {
  try {
    const tables = await poolMain.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('Tables in crm:', tables.rows.map(r => r.table_name));

    // If whatsapp_messages is here, query it
    if (tables.rows.some(r => r.table_name === 'whatsapp_messages')) {
      const res = await poolMain.query('SELECT DISTINCT ON (remote_jid) id, remote_jid, lead_id, push_name, advisor_name, timestamp, body, from_me FROM whatsapp_messages ORDER BY remote_jid, timestamp DESC LIMIT 20');
      console.log('whatsapp_messages (latest unique):');
      console.log(JSON.stringify(res.rows, null, 2));

      const advisors = await poolMain.query('SELECT DISTINCT advisor_name FROM whatsapp_messages');
      console.log('Unique advisors:', advisors.rows);
    }
  } catch (err) {
    console.error('Connection failed:', err.message);
  } finally {
    await poolMain.end();
  }
}
run();
