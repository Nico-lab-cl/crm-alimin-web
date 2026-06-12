const { Pool } = require('pg');

const marketingDbUrl = 'postgresql://nicolas:zampullido20@84.247.162.186:5433/crm_marketing?sslmode=disable';
const mainDbUrl = 'postgresql://nicolas:zampullido20@84.247.162.186:5433/crm?sslmode=disable';

const poolMarketing = new Pool({ connectionString: marketingDbUrl });
const poolMain = new Pool({ connectionString: mainDbUrl });

async function run() {
  try {
    const res = await poolMarketing.query('SELECT DISTINCT ON (remote_jid) id, remote_jid, lead_id, push_name, advisor_name, timestamp, body, from_me FROM whatsapp_messages ORDER BY remote_jid, timestamp DESC LIMIT 20');
    console.log('whatsapp_messages (latest unique):');
    console.log(JSON.stringify(res.rows, null, 2));

    // Also look up advisors
    const advisors = await poolMarketing.query('SELECT DISTINCT advisor_name FROM whatsapp_messages');
    console.log('Unique advisors:', advisors.rows);
  } catch (err) {
    console.error('Connection failed:', err.message);
  } finally {
    await poolMarketing.end();
    await poolMain.end();
  }
}
run();
