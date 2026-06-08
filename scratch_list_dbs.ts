import { Client } from 'pg';

async function main() {
  const client = new Client({
    connectionString: 'postgresql://nicolas:zampullido20@84.247.162.186:5433/aliminspa?sslmode=disable'
  });
  try {
    await client.connect();
    const res = await client.query('SELECT datname FROM pg_database WHERE datistemplate = false');
    console.log(res.rows.map(r => r.datname));
    await client.end();
  } catch (e) {
    console.error(e);
  }
}

main();
