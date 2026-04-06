import { NextResponse } from 'next/server';
import { queryMarketing, queryMain } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, name, phone, formid } = body;

    if (!email || !formid) {
      return NextResponse.json({ message: 'Email y FormID son requeridos' }, { status: 400 });
    }

    // 1. Guardar o actualizar el lead en MAIN_DB
    // Nota: El usuario dijo que el origen es "META"
    await queryMain(`
      INSERT INTO "Lead" (email, name, phone, source, formid, created_at)
      VALUES ($1, $2, $3, 'META', $4, CURRENT_TIMESTAMP)
      ON CONFLICT (email) DO UPDATE 
      SET name = EXCLUDED.name, 
          phone = EXCLUDED.phone, 
          source = 'META', 
          formid = EXCLUDED.formid
    `, [email, name || '', phone || '', formid]);

    // 2. Buscar si hay una campaña automatizada para este FormID
    const campaignRes = await queryMarketing(`
      SELECT * FROM campaigns 
      WHERE is_automation = true 
      AND (automation_formid = $1 OR automation_formid LIKE '%' || $1 || '%')
      LIMIT 1
    `, [formid]);

    if (campaignRes.rowCount === 0) {
      return NextResponse.json({ message: 'Sin campaña automatizada para este FormID', formid });
    }

    const campaign = campaignRes.rows[0];

    // 3. Registrar el log como PROGRAMADO
    const scheduledAt = new Date(Date.now() + 5 * 60 * 1000); // +5 minutos
    const logRes = await queryMarketing(`
      INSERT INTO campaign_logs (campaign_id, email, status, scheduled_at, lead_id)
      VALUES ($1, $2, 'SCHEDULED', $3, (SELECT id FROM "Lead" WHERE email = $2 LIMIT 1))
      RETURNING id
    `, [campaign.id, email, scheduledAt]);

    const logId = logRes.rows[0].id;

    // 4. Iniciar el retraso y enviar (Lógica simple en memoria para este proyecto)
    // En producción idealmente esto sería un worker o un nodo 'Wait' en n8n
    setTimeout(async () => {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const n8nUrl = process.env.N8N_WEBHOOK_URL;
        if (!n8nUrl) return;

        const trackingPixel = `<img src="${appUrl}/api/track/open?log_id=${logId}" width="1" height="1" style="display:none;" />`;
        const finalHtml = campaign.html_content + trackingPixel;

        await fetch(n8nUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            log_id: logId,
            campaign_id: campaign.id,
            email: email,
            name: name,
            phone: phone,
            subject: campaign.subject,
            html: finalHtml,
            formid: formid,
            source: 'META',
            automation: true
          }),
        });

        // Marcar como enviado
        await queryMarketing(
          "UPDATE campaign_logs SET status = 'SENT', sent_at = CURRENT_TIMESTAMP WHERE id = $1",
          [logId]
        );
      } catch (err) {
        console.error('Error en envío automatizado diferido:', err);
      }
    }, 5 * 60 * 1000);

    return NextResponse.json({ 
      success: true, 
      message: 'Lead recibido y correo programado para dentro de 5 minutos',
      campaign_title: campaign.title,
      scheduled_at: scheduledAt.toISOString()
    });

  } catch (error) {
    console.error('Error in Meta Webhook:', error);
    return NextResponse.json({ message: 'Error interno' }, { status: 500 });
  }
}
