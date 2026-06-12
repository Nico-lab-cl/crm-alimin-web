const { Pool } = require('pg');

const configs = [
  {
    name: '5432 - postgres / zampullido20 / n8n',
    connectionString: 'postgresql://postgres:zampullido20@84.247.162.186:5432/n8n?sslmode=disable'
  },
  {
    name: '5432 - postgres / postgres / n8n',
    connectionString: 'postgresql://postgres:postgres@84.247.162.186:5432/n8n?sslmode=disable'
  },
  {
    name: '5432 - postgres / nicolas / n8n',
    connectionString: 'postgresql://postgres:nicolas@84.247.162.186:5432/n8n?sslmode=disable'
  },
  {
    name: '5432 - nicolas / nicolas / n8n',
    connectionString: 'postgresql://nicolas:nicolas@84.247.162.186:5432/n8n?sslmode=disable'
  }
];

async function run() {
  for (const config of configs) {
    console.log(`Connecting to ${config.name}...`);
    const pool = new Pool({ connectionString: config.connectionString, connectionTimeoutMillis: 3000 });
    try {
      const res = await pool.query('SELECT datname FROM pg_database WHERE datistemplate = false');
      console.log(`  Databases:`, res.rows.map(r => r.datname));
      
      const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
      console.log('  Tables:', tables.rows.map(r => r.table_name));
      break; // stop on first success
    } catch (err) {
      console.error(`  Failed:`, err.message);
    } finally {
      await pool.end();
    }
  }
}
run();
