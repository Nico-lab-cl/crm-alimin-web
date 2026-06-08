import { Client } from 'pg';

async function test() {
  const configs = [
    {
      name: 'CRM DB via 5433',
      connectionString: 'postgresql://nicolas:zampullido20@84.247.162.186:5433/crm?sslmode=disable'
    },
    {
      name: 'CRM Marketing DB via 5433',
      connectionString: 'postgresql://nicolas:zampullido20@84.247.162.186:5433/crm_marketing?sslmode=disable'
    },
    {
      name: 'AliminSpa DB via 5433',
      connectionString: 'postgresql://nicolas:zampullido20@84.247.162.186:5433/aliminspa?sslmode=disable'
    }
  ];

  for (const config of configs) {
    console.log(`Testing ${config.name}...`);
    const client = new Client({
      connectionString: config.connectionString,
      connectionTimeoutMillis: 3000,
    });
    try {
      await client.connect();
      console.log(`  SUCCESS! Connected to ${config.name}`);
      
      const tables = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      console.log('  Tables:', tables.rows.map(r => r.table_name));
      
      if (config.name.includes('Marketing')) {
        const count = await client.query('SELECT COUNT(*) FROM whatsapp_messages');
        console.log(`  whatsapp_messages count: ${count.rows[0].count}`);
      }
      
      await client.end();
    } catch (e) {
      console.error(`  FAILED: ${(e as Error).message}`);
    }
  }
}

test();
