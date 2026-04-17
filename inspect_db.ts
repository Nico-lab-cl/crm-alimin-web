import { queryMain } from './lib/db';

async function inspect() {
  try {
    console.log('--- COLUMNS ---');
    const cols = await queryMain(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Lead'
    `);
    console.log(cols.rows);

    console.log('\n--- STATUSES IN DB ---');
    const statuses = await queryMain(`
      SELECT DISTINCT status FROM "Lead" LIMIT 20
    `);
    console.log(statuses.rows);

    console.log('\n--- SAMPLE LEADS ---');
    const samples = await queryMain(`
      SELECT * FROM "Lead" LIMIT 1
    `);
    console.log(samples.rows);

  } catch (e) {
    console.error(e);
  }
}

inspect();
