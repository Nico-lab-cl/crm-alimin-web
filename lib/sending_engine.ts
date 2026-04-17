import { queryMain, queryMarketing } from '@/lib/db';

interface SendCampaingOptions {
  campaignId: string;
  leadFilters?: {
    status?: string;
    source?: string;
    project?: string;
  };
}

export async function executeCampaign(options: SendCampaingOptions) {
  const { campaignId, leadFilters } = options;

  // 1. Obtener la campaña
  const campaignRes = await queryMarketing('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
  if (campaignRes.rowCount === 0) throw new Error('Campaña no encontrada');
  const campaign = campaignRes.rows[0];

  // 2. Obtener los Leads de MAIN_DB (Solo lectura)
  // Usamos DISTINCT ON (email) para asegurar que no enviamos duplicados si el usuario lo pidió
  // El usuario confirmó que prefiere emails únicos.
  let leadQuery = 'SELECT DISTINCT ON (email) id, email FROM "Lead" WHERE email IS NOT NULL AND email != \'\'';
  const params: string[] = [];
  
  let filterClause = '';
  if (leadFilters?.status) {
    params.push(leadFilters.status);
    filterClause += ` AND status = $${params.length}`;
  }

  if (leadFilters?.source) {
    params.push(leadFilters.source);
    filterClause += ` AND source = $${params.length}`;
  }

  if (leadFilters?.project) {
    params.push(leadFilters.project);
    filterClause += ` AND (project = $${params.length} OR source = $${params.length})`;
  }

  leadQuery += filterClause;
  // Con DISTINCT ON debemos ordenar por la columna de distinción primero
  leadQuery += ' ORDER BY email, created_at DESC';

  const leadsRes = await queryMain(leadQuery, params);
  const leads = leadsRes.rows;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const n8nUrl = process.env.N8N_WEBHOOK_URL;

  if (!n8nUrl) throw new Error('N8N_WEBHOOK_URL no configurada');

  // 3. Procesar cada lead
  for (const lead of leads) {
    try {
      // Crear log en PENDING
      const logRes = await queryMarketing(
        `INSERT INTO campaign_logs (campaign_id, lead_id, email, status) 
         VALUES ($1, $2, $3, 'PENDING') RETURNING id`,
        [campaignId, lead.id, lead.email]
      );
      const logId = logRes.rows[0].id;

      // Inyectar Píxel de seguimiento
      const trackingPixel = `<img src="${appUrl}/api/track/open?log_id=${logId}" width="1" height="1" style="display:none;" />`;
      const finalHtml = campaign.html_content + trackingPixel;

      // Enviar a n8n
      fetch(n8nUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          log_id: logId,
          campaign_id: campaignId,
          title: campaign.title,
          email: lead.email,
          subject: campaign.subject,
          html: finalHtml,
          design: campaign.mjml_content,
        }),
      }).catch(err => console.error(`Error enviando lead ${lead.email} a n8n:`, err));

      // Marcar como SENT
      await queryMarketing(
        'UPDATE campaign_logs SET status = \'SENT\', sent_at = CURRENT_TIMESTAMP WHERE id = $1',
        [logId]
      );

    } catch (error) {
      console.error(`Error procesando lead ${lead.email}:`, error);
    }
  }

  return { processed: leads.length };
}

export async function sendTestCampaign(campaignId: string, targetEmail: string) {
  // 1. Obtener la campaña
  const campaignRes = await queryMarketing('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
  if (campaignRes.rowCount === 0) throw new Error('Campaña no encontrada');
  const campaign = campaignRes.rows[0];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const n8nUrl = process.env.N8N_WEBHOOK_URL;
  if (!n8nUrl) throw new Error('N8N_WEBHOOK_URL no configurada');

  // 2. Crear log de prueba
  const logRes = await queryMarketing(
    `INSERT INTO campaign_logs (campaign_id, lead_id, email, status) 
     VALUES ($1, $2, $3, 'TEST') RETURNING id`,
    [campaignId, 'test-id', targetEmail]
  );
  const logId = logRes.rows[0].id;

  // 3. Inyectar Píxel
  const trackingPixel = `<img src="${appUrl}/api/track/open?log_id=${logId}" width="1" height="1" style="display:none;" />`;
  const finalHtml = campaign.html_content + trackingPixel;

  // 4. Enviar a n8n
  await fetch(n8nUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      log_id: logId,
      campaign_id: campaignId,
      title: `[PRUEBA] ${campaign.title}`,
      email: targetEmail,
      subject: `[PRUEBA] ${campaign.subject}`,
      html: finalHtml,
      design: campaign.mjml_content,
    }),
  });

  return { success: true };
}
