const { Pool } = require('pg');

const configs = [
  {
    name: '5432 - postgres / c886f4677c481efad228 / n8n',
    connectionString: 'postgresql://postgres:c886f4677c481efad228@84.247.162.186:5432/n8n?sslmode=disable'
  },
  {
    name: '5432 - nicolas / zampullido20 / crm_marketing',
    connectionString: 'postgresql://nicolas:zampullido20@84.247.162.186:5432/crm_marketing?sslmode=disable'
  },
  {
    name: '5432 - nicolas / zampullido20 / crm',
    connectionString: 'postgresql://nicolas:zampullido20@84.247.162.186:5432/crm?sslmode=disable'
  }
];

async function run() {
  for (const config of configs) {
    console.log(`Connecting to ${config.name}...`);
    const pool = new Pool({ connectionString: config.connectionString, connectionTimeoutMillis: 3000 });
    try {
      const res = await pool.query('SELECT datname FROM pg_database WHERE datistemplate = false');
      console.log(`  Databases:`, res.rows.map(r => r.datname));
      
      // If we connected to n8n, let's query the Contact table
      if (config.name.includes('n8n')) {
        const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.log('  Tables:', tables.rows.map(r => r.table_name));
        
        if (tables.rows.some(r => r.table_name.toLowerCase() === 'contact')) {
          const cols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'Contact'");
          console.log('  Contact Columns:', cols.rows);
          
          const sampleContacts = await pool.query('SELECT * FROM "Contact" LIMIT 5');
          console.log('  Sample Contacts:', sampleContacts.rows);
        }
      }
    } catch (err) {
      console.error(`  Failed:`, err.message);
    } finally {
      await pool.end();
    }
  }
}
run();
