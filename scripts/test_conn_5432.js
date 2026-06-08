const { Client } = require('pg');

async function test() {
  const configs = [
    {
      name: 'CRM DB via 5432 (pw: nicolas)',
      connectionString: 'postgresql://nicolas:nicolas@84.247.162.186:5432/crm?sslmode=disable'
    },
    {
      name: 'CRM DB via 5432 (pw: zampullido20)',
      connectionString: 'postgresql://nicolas:zampullido20@84.247.162.186:5432/crm?sslmode=disable'
    },
    {
      name: 'CRM DB via 5433 (pw: nicolas)',
      connectionString: 'postgresql://nicolas:nicolas@84.247.162.186:5433/crm?sslmode=disable'
    },
    {
      name: 'AliminSpa DB via 5432 (pw: zampullido20)',
      connectionString: 'postgresql://nicolas:zampullido20@84.247.162.186:5432/aliminspa?sslmode=disable'
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
      
      const countRes = await client.query('SELECT COUNT(*) FROM "Lead"').catch(e => null);
      if (countRes) {
        console.log(`  Lead table count: ${countRes.rows[0].count}`);
      }
      
      await client.end();
    } catch (e) {
      console.error(`  FAILED: ${e.message}`);
    }
  }
}

test();
