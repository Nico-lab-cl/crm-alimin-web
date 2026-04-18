const { Client } = require('pg');

async function tryConnect(url) {
    console.log(`Connecting to: ${url}`);
    const client = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
    try {
        await client.connect();
        return client;
    } catch (e) {
        console.error(`Failed to connect to ${url}: ${e.message}`);
        return null;
    }
}

async function main() {
    const urls = [
        'postgresql://nicolas:nicolas@localhost:15432/crm_marketing?sslmode=disable',
        'postgresql://nicolas:nicolas@n8n_db-crm:5432/crm_marketing?sslmode=disable',
        'postgresql://nicolas:nicolas@localhost:5432/crm_marketing?sslmode=disable'
    ];

    let client = null;
    for (const url of urls) {
        client = await tryConnect(url);
        if (client) break;
    }

    if (!client) {
        console.error('Could not connect to any database URL.');
        process.exit(1);
    }

    try {
        console.log('Successfully connected. Checking columns...');
        
        const res = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'campaigns'
        `);
        const columns = res.rows.map(r => r.column_name);
        console.log('Current columns:', columns);

        if (!columns.includes('updated_at')) {
            console.log('Adding column updated_at...');
            await client.query('ALTER TABLE campaigns ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP');
            console.log('Column updated_at added.');
        }

        if (!columns.includes('name')) {
            console.log('Adding column name...');
            await client.query('ALTER TABLE campaigns ADD COLUMN name VARCHAR(255)');
            await client.query('UPDATE campaigns SET name = title WHERE name IS NULL');
            await client.query('ALTER TABLE campaigns ALTER COLUMN name SET NOT NULL');
            console.log('Column name added.');
        }

        console.log('Schema fix completed successfully.');

    } catch (err) {
        console.error('Error during schema update:', err);
    } finally {
        await client.end();
    }
}

main();
