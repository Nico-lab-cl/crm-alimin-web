import { queryMain, queryMarketing } from '@/lib/db';

interface SendCampaingOptions {
  campaignId: string;
  leadFilters?: {
    status?: string;
    source?: string;
    project?: string;
  };
  advancedFilters?: Array<{ column: string; operator: string; value: string }>;
  dateRange?: { start?: string; end?: string };
}

export async function executeCampaign(options: SendCampaingOptions) {
  const { campaignId, leadFilters, advancedFilters, dateRange } = options;

  // 1. Obtener la campaña
  const campaignRes = await queryMarketing('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
  if (campaignRes.rowCount === 0) throw new Error('Campaña no encontrada');
  const campaign = campaignRes.rows[0];

  // 2. Construir Query Dinámica de Leads
  const whereClauses = ['email IS NOT NULL AND email != \'\''];
  const params: (string | number | Date)[] = [];

  // Filtros Básicos
  if (leadFilters?.status) {
    params.push(leadFilters.status);
    whereClauses.push(`status = $${params.length}`);
  }
  if (leadFilters?.source) {
    params.push(leadFilters.source);
    whereClauses.push(`source = $${params.length}`);
  }
  if (leadFilters?.project) {
    params.push(leadFilters.project);
    whereClauses.push(`(project = $${params.length} OR source = $${params.length})`);
  }

  // Filtros Avanzados
  if (Array.isArray(advancedFilters)) {
    advancedFilters.forEach((f) => {
      if (!f.column || !f.value) return;
      const safeCol = `"${f.column.replace(/"/g, '')}"`;
      switch (f.operator) {
        case 'equals':
          params.push(f.value);
          whereClauses.push(`${safeCol} = $${params.length}`);
          break;
        case 'contains':
          params.push(`%${f.value}%`);
          whereClauses.push(`${safeCol} ILIKE $${params.length}`);
          break;
        case 'starts_with':
          params.push(`${f.value}%`);
          whereClauses.push(`${safeCol} ILIKE $${params.length}`);
          break;
        case 'ends_with':
          params.push(`%${f.value}`);
          whereClauses.push(`${safeCol} ILIKE $${params.length}`);
          break;
      }
    });
  }

  // Filtro de Fecha
  if (dateRange?.start) {
    params.push(new Date(dateRange.start));
    whereClauses.push(`created_at >= $${params.length}`);
  }
  if (dateRange?.end) {
    const endDate = new Date(dateRange.end);
    endDate.setHours(23, 59, 59, 999);
    params.push(endDate);
    whereClauses.push(`created_at <= $${params.length}`);
  }

  const whereString = whereClauses.join(' AND ');
  // DISTINCT ON (email) para evitar duplicados y ORDER BY para los más recientes
  const leadQuery = `
    SELECT DISTINCT ON (email) id, email 
    FROM "Lead" 
    WHERE ${whereString} 
    ORDER BY email, created_at DESC
  `;

  const leadsRes = await queryMain(leadQuery, params);
  const leads = leadsRes.rows;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const n8nUrl = process.env.N8N_WEBHOOK_URL;
  if (!n8nUrl) throw new Error('N8N_WEBHOOK_URL no configurada');

  // 3. Procesar cada lead
  for (const lead of leads) {
    try {
      const logRes = await queryMarketing(
        `INSERT INTO campaign_logs (campaign_id, lead_id, email, status) 
         VALUES ($1, $2, $3, 'PENDING') RETURNING id`,
        [campaignId, lead.id, lead.email]
      );
      const logId = logRes.rows[0].id;

      const trackingPixel = `<img src="${appUrl}/api/track/open?log_id=${logId}" width="1" height="1" style="display:none;" />`;
      const finalHtml = campaign.html_content + trackingPixel;

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
      }).catch(err => console.error(`Error enviando a n8n:`, err));

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
  const campaignRes = await queryMarketing('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
  if (campaignRes.rowCount === 0) throw new Error('Campaña no encontrada');
  const campaign = campaignRes.rows[0];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const n8nUrl = process.env.N8N_WEBHOOK_URL;
  if (!n8nUrl) throw new Error('N8N_WEBHOOK_URL no configurada');

  const logRes = await queryMarketing(
    `INSERT INTO campaign_logs (campaign_id, lead_id, email, status) 
     VALUES ($1, $2, $3, 'TEST') RETURNING id`,
    [campaignId, 'test-id', targetEmail]
  );
  const logId = logRes.rows[0].id;

  const trackingPixel = `<img src="${appUrl}/api/track/open?log_id=${logId}" width="1" height="1" style="display:none;" />`;
  const finalHtml = campaign.html_content + trackingPixel;

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
