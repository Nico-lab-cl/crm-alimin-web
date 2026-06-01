import { NextResponse } from 'next/server';
import { queryMarketing, queryMain } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Manejador de preflight CORS (OPTIONS)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// Registro de actividad (POST)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { lead_id, anonymous_id, event_type, page_url, page_title, details } = body;

    if ((!lead_id && !anonymous_id) || !event_type) {
      return new NextResponse(
        JSON.stringify({ error: 'lead_id o anonymous_id y event_type son requeridos' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // Si hay lead_id, validar que sea un UUID válido
    if (lead_id) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(lead_id)) {
        return new NextResponse(
          JSON.stringify({ success: false, message: 'lead_id no es un UUID válido, ignorando registro de actividad.' }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }
    }

    // Insertar en lead_activities
    const query = `
      INSERT INTO lead_activities (lead_id, anonymous_id, event_type, page_url, page_title, details)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;
    const res = await queryMarketing(query, [
      lead_id || null,
      anonymous_id || null,
      event_type,
      page_url || '',
      page_title || '',
      JSON.stringify(details || {}),
    ]);

    // Buscar detalles del lead en MAIN_DB solo si está identificado
    let name = '';
    let email = '';
    if (lead_id) {
      try {
        const leadRes = await queryMain('SELECT * FROM "Lead" WHERE id = $1', [lead_id]);
        if (leadRes.rows.length > 0) {
          const row = leadRes.rows[0];
          const first = row.FirstName || row.firstname || row.first_name || '';
          const last = row.LastName || row.lastname || row.last_name || '';
          name = `${first} ${last}`.trim();
          email = row.Email || row.email || '';
        }
      } catch (err) {
        console.warn('Error fetching lead name in track activity:', err);
      }

      const displayName = name || email || 'Un contacto';
      let titleMsg = 'Visita a la Web';
      let messageMsg = `${displayName} visitó la página "${page_title || 'Inicio'}" (${page_url || ''})`;
      let notifEventType = 'PAGE_VISIT';

      if (event_type === 'CLICK_BUTTON') {
        titleMsg = 'Interacción en la Web';
        const elementName = details?.element_name || 'un elemento';
        const category = details?.category ? ` (${details.category})` : '';
        messageMsg = `${displayName} hizo clic en "${elementName}"${category} en la página "${page_title || 'Inicio'}"`;
        notifEventType = 'CLICK_BUTTON';
      } else if (event_type && event_type !== 'PAGE_VISIT') {
        notifEventType = event_type;
        titleMsg = `Interacción: ${event_type}`;
        messageMsg = `${displayName} realizó una interacción de tipo "${event_type}" en la página "${page_title || 'Inicio'}"`;
      }

      // Registrar la notificación en tiempo real solo para leads identificados
      await queryMarketing(`
        INSERT INTO notifications (lead_id, anonymous_id, email, event_type, title, message)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [lead_id, anonymous_id || null, email, notifEventType, titleMsg, messageMsg]);
    }

    return new NextResponse(
      JSON.stringify({ success: true, activity_id: res.rows[0].id }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    console.error('Error tracking lead activity:', error);
    return new NextResponse(
      JSON.stringify({ error: 'Error al registrar actividad', message: (error as Error).message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
