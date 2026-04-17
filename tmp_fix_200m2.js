const { Pool } = require('pg');

const marketingDbUrl = 'postgresql://nicolas:nicolas@n8n_db-crm:5432/crm_marketing?sslmode=disable';
const marketingDb = new Pool({ connectionString: marketingDbUrl });

async function findAndFix() {
  try {
    const res = await marketingDb.query(`
      SELECT id, title, subject, html_content 
      FROM campaigns 
      WHERE html_content ILIKE '%200 m2%' 
         OR mjml_content ILIKE '%200 m2%'
         OR html_content ILIKE '%200m2%'
         OR mjml_content ILIKE '%200m2%'
    `);
    
    if (res.rowCount === 0) {
      console.log('No campaigns found with "200 m2"');
      return;
    }

    console.log(`Found ${res.rowCount} campaigns to update.`);
    for (const campaign of res.rows) {
      console.log(`Updating campaign ID: ${campaign.id}, Title: ${campaign.title}`);
      
      const newHtml = campaign.html_content.replace(/200\s?m2/g, '400 m2');
      
      // Also check mjml if it exists
      const mjmlRes = await marketingDb.query('SELECT mjml_content FROM campaigns WHERE id = $1', [campaign.id]);
      let newMjml = null;
      if (mjmlRes.rows[0].mjml_content) {
        newMjml = mjmlRes.rows[0].mjml_content.replace(/200\s?m2/g, '400 m2');
      }

      await marketingDb.query(`
        UPDATE campaigns 
        SET html_content = $1, mjml_content = $2 
        WHERE id = $3
      `, [newHtml, newMjml || mjmlRes.rows[0].mjml_content, campaign.id]);
      
      console.log(`Successfully updated campaign ${campaign.id}`);
    }
  } catch (error) {
    console.error('Error during update:', error);
  } finally {
    process.exit();
  }
}

findAndFix();
