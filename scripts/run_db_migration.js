const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
  let mainDbUrl = process.env.MAIN_DB_URL;

  if (!mainDbUrl) {
    console.log('MAIN_DB_URL not found in environment, loading from .env.local...');
    try {
      const envPath = path.join(process.cwd(), '.env.local');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/^MAIN_DB_URL=(.+)$/m);
        if (match) {
          mainDbUrl = match[1].trim();
          console.log('Loaded MAIN_DB_URL from .env.local:', mainDbUrl.replace(/:[^:@]+@/, ':***@'));
        }
      }
    } catch (e) {
      console.warn('Error reading .env.local:', e);
    }
  }

  // Fallbacks
  const connections = [];
  if (mainDbUrl) {
    connections.push({ name: 'Configured MAIN_DB', url: mainDbUrl });
    if (mainDbUrl.includes('localhost:15432')) {
      // Direct VPS container fallback if localhost port forward is not active
      connections.push({ name: 'VPS container fallback', url: mainDbUrl.replace('localhost:15432', 'n8n_db-crm:5432') });
    }
  }
  connections.push({
    name: 'Localhost fallback',
    url: 'postgresql://nicolas:nicolas@localhost:15432/crm?sslmode=disable'
  });

  for (const conn of connections) {
    console.log(`Connecting to ${conn.name}...`);
    const client = new Client({
      connectionString: conn.url,
      connectionTimeoutMillis: 5000
    });

    try {
      await client.connect();
      console.log(`Connected to ${conn.name} successfully!`);

      console.log('Altering table "Lead" to add "emailEnabled" column if it does not exist...');
      await client.query('ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "emailEnabled" BOOLEAN DEFAULT TRUE;');
      console.log('Column "emailEnabled" created or verified.');

      console.log('Setting emailEnabled to TRUE for existing null records...');
      const updateRes = await client.query('UPDATE "Lead" SET "emailEnabled" = TRUE WHERE "emailEnabled" IS NULL;');
      console.log(`Updated ${updateRes.rowCount} null records to TRUE.`);

      await client.end();
      console.log('MIGRATION SUCCESSFUL!');
      process.exit(0);
    } catch (err) {
      console.error(`Error on ${conn.name}:`, err);
    }
  }

  console.error('All database connections failed. Migration aborted.');
  process.exit(1);
}

run();
