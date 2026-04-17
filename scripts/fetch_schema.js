const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: 'postgresql://nicolas:nicolas@n8n_db-crm:5432/crm?sslmode=disable'
  });

  try {
    await client.connect();
    const res = await client.query('SELECT * FROM "Lead" LIMIT 1');
    if (res.rows.length > 0) {
      console.log('Columns:', Object.keys(res.rows[0]));
      console.log('Sample Row:', res.rows[0]);
    } else {
      console.log('No rows found in Lead table.');
    }
    
    // Also check distinct values of some columns if they exist
    const columnsRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Lead'
    `);
    const columns = columnsRes.rows.map(r => r.column_name);
    console.log('All Columns:', columns);

  } catch (err) {
    console.error('Error fetching schema:', err);
  } finally {
    await client.end();
  }
}

main();
