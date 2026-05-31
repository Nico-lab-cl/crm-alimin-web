import { NextResponse } from 'next/server';
import { queryMarketing, queryMain } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const log_id = searchParams.get('log_id');

  if (log_id) {
    try {
      // Registrar apertura en la base de datos (solo si no estaba abierto)
      const updateRes = await queryMarketing(
        `UPDATE campaign_logs 
         SET status = 'OPENED', opened_at = CURRENT_TIMESTAMP 
         WHERE id = $1 AND status != 'OPENED'
         RETURNING id`,
        [log_id]
      );

      // Solo registrar notificación en la primera apertura
      if (updateRes.rows && updateRes.rows.length > 0) {
        // Obtener detalles del lead y la campaña
        const detailsRes = await queryMarketing(`
          SELECT cl.lead_id, cl.email, COALESCE(c.name, c.title, 'Campaña sin título') as campaign_title
          FROM campaign_logs cl
          LEFT JOIN campaigns c ON cl.campaign_id = c.id
          WHERE cl.id = $1
        `, [log_id]);

        if (detailsRes.rows.length > 0) {
          const { lead_id, email, campaign_title } = detailsRes.rows[0];

          // Buscar nombre en MAIN_DB de forma insensible a mayúsculas/minúsculas de columnas
          let name = '';
          if (lead_id) {
            try {
              const leadRes = await queryMain('SELECT * FROM "Lead" WHERE id = $1', [lead_id]);
              if (leadRes.rows.length > 0) {
                const row = leadRes.rows[0];
                const first = row.FirstName || row.firstname || row.first_name || '';
                const last = row.LastName || row.lastname || row.last_name || '';
                name = `${first} ${last}`.trim();
              }
            } catch (err) {
              console.warn('Error fetching lead name in track open:', err);
            }
          }

          const displayName = name || email || 'Un contacto';
          const titleMsg = 'Correo Abierto';
          const messageMsg = `${displayName} abrió el correo de la campaña "${campaign_title}"`;

          // Insertar notificación
          await queryMarketing(`
            INSERT INTO notifications (lead_id, email, event_type, title, message)
            VALUES ($1, $2, $3, $4, $5)
          `, [lead_id, email, 'EMAIL_OPENED', titleMsg, messageMsg]);
        }
      }
    } catch (error) {
      console.error('Error tracking open:', error);
    }
  }

  // Retornar un GIF transparente de 1x1
  const buffer = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
