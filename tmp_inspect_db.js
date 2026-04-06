const { Pool } = require('pg');

const marketingDbUrl = 'postgresql://nicolas:nicolas@n8n_db-crm:5432/crm_marketing?sslmode=disable';
const marketingDb = new Pool({ connectionString: marketingDbUrl });

async function inspect() {
  try {
    const res = await marketingDb.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'campaigns'
      ORDER BY ordinal_position;
    `);
    console.log('Campaigns table columns:');
    console.table(res.rows);
  } catch (error) {
    console.error('Error inspecting table:', error);
  } finally {
    process.exit();
  }
}

inspect();
