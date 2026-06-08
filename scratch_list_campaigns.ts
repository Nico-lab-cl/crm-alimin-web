import { Client } from 'pg';

async function main() {
  const client = new Client({
    connectionString: 'postgresql://nicolas:zampullido20@84.247.162.186:5433/aliminspa?sslmode=disable'
  });
  try {
    await client.connect();
    
    // Check if table campaigns exists
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'campaigns'
    `);
    
    if (tablesRes.rows.length > 0) {
      const res = await client.query('SELECT id, name, title, subject, status, created_at FROM campaigns ORDER BY created_at DESC LIMIT 10');
      console.log(JSON.stringify(res.rows, null, 2));
    } else {
      console.log("Table 'campaigns' does not exist in 'aliminspa' database. Let's list all public tables:");
      const allTables = await client.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      console.log(allTables.rows.map(r => r.table_name));
    }
    
    await client.end();
  } catch (e) {
    console.error(e);
  }
}

main();
