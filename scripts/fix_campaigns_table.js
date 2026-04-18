const { Client } = require('pg');

async function main() {
  const connectionString = 'postgresql://nicolas:nicolas@localhost:15432/crm_marketing?sslmode=disable'; // Trying localhost port first
  console.log('Connecting to:', connectionString);
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('Connected to database.');
    
    // Check if updated_at exists
    const checkRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaigns' AND column_name = 'updated_at'
    `);

    if (checkRes.rows.length === 0) {
      console.log('Column updated_at missing. Adding it...');
      await client.query(`
        ALTER TABLE campaigns 
        ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      `);
      console.log('Column updated_at added successfully.');
    } else {
      console.log('Column updated_at already exists.');
    }

    // Also check for 'name' column as the error mentions 'name' being updated too
    const checkName = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'campaigns' AND column_name = 'name'
    `);
    
    if (checkName.rows.length === 0) {
      console.log('Column name missing. Adding it...');
      // Looking at the update query: SET name = $1, title = $2, subject = $3, html_content = $4, mjml_content = $5, updated_at = CURRENT_TIMESTAMP
      // It seems 'name' is expected too.
      await client.query(`
        ALTER TABLE campaigns 
        ADD COLUMN name VARCHAR(255)
      `);
      // Update name with title for existing rows
      await client.query(`UPDATE campaigns SET name = title WHERE name IS NULL`);
      await client.query(`ALTER TABLE campaigns ALTER COLUMN name SET NOT NULL`);
      console.log('Column name added successfully.');
    }

  } catch (err) {
    console.error('Error:', err.message);
    if (err.message.includes('getaddrinfo ENOTFOUND') || err.message.includes('connect ECONNREFUSED')) {
        console.log('Trying fallback connection string...');
        const client2 = new Client({
            connectionString: 'postgresql://nicolas:nicolas@n8n_db-crm:5432/crm_marketing?sslmode=disable'
        });
        try {
            await client2.connect();
            console.log('Connected via n8n_db-crm.');
            // Repeat logic... (simplified for brevity here, but better to reuse)
            await client2.query(`
                DO $$ 
                BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='updated_at') THEN
                        ALTER TABLE campaigns ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='campaigns' AND column_name='name') THEN
                        ALTER TABLE campaigns ADD COLUMN name VARCHAR(255);
                        UPDATE campaigns SET name = title;
                        ALTER TABLE campaigns ALTER COLUMN name SET NOT NULL;
                    END IF;
                END $$;
            `);
            console.log('Fix applied via fallback.');
            await client2.end();
        } catch (err2) {
            console.error('Fallback failed:', err2.message);
        }
    }
  } finally {
    try { await client.end(); } catch(e) {}
  }
}

main();
