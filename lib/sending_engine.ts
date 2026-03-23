import { queryMain, queryMarketing } from '@/lib/db';

interface SendCampaingOptions {
  campaignId: string;
  leadFilters?: {
    // Ejemplo: status, region, etc.
    status?: string;
  };
}

export async function executeCampaign(options: SendCampaingOptions) {
  const { campaignId, leadFilters } = options;

  // 1. Obtener la campaña
  const campaignRes = await queryMarketing('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
  if (campaignRes.rowCount === 0) throw new Error('Campaña no encontrada');
  const campaign = campaignRes.rows[0];

  // 2. Obtener los Leads de MAIN_DB (Solo lectura)
  // Nota: Ajustar query según filtros reales requeridos por el usuario
  let leadQuery = 'SELECT id, email FROM "Lead" WHERE email IS NOT NULL AND email != \'\'';
  const params: string[] = [];
  
  if (leadFilters?.status) {
    leadQuery += ' AND status = $1';
    params.push(leadFilters.status);
  }

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
      // No esperamos el resultado para evitar timeout si son muchos leads, 
      // pero en este loop simple de node-postgres podríamos querer ser más eficientes (Promise.all con chunks)
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
