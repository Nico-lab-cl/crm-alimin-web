import { NextResponse } from 'next/server';
import { queryMarketing, queryMain } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get('filter') || 'all'; // all, anonymous, identified
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // 1. Construir query de actividades
    let queryText = `
      SELECT id, lead_id, anonymous_id, event_type, page_url, page_title, details, created_at
      FROM lead_activities
    `;
    const params: unknown[] = [];

    if (filter === 'anonymous') {
      queryText += ` WHERE lead_id IS NULL`;
    } else if (filter === 'identified') {
      queryText += ` WHERE lead_id IS NOT NULL`;
    }

    queryText += ` ORDER BY created_at DESC LIMIT $1 OFFSET $2`;
    params.push(limit, offset);

    const activitiesRes = await queryMarketing(queryText, params);
    const activities = activitiesRes.rows;

    // 2. Obtener total count para paginación
    let countQuery = `SELECT COUNT(*) as count FROM lead_activities`;
    if (filter === 'anonymous') {
      countQuery += ` WHERE lead_id IS NULL`;
    } else if (filter === 'identified') {
      countQuery += ` WHERE lead_id IS NOT NULL`;
    }
    const countRes = await queryMarketing(countQuery);
    const totalCount = parseInt(countRes.rows[0].count, 10);

    // 3. Recopilar IDs de leads únicos y buscar sus datos en MAIN_DB
    const leadIds = Array.from(
      new Set(activities.map(a => a.lead_id).filter(id => id !== null))
    );

    const leadMap: Record<string, { name: string; email: string }> = {};

    if (leadIds.length > 0) {
      try {
        // Consultar esquema para las columnas exactas de Lead
        const schemaRes = await queryMain(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'Lead'
        `);
        const cols = schemaRes.rows.map((r: { column_name: string }) => r.column_name);
        
        const firstNameCol = cols.find(c => c.toLowerCase() === 'firstname') || 'FirstName';
        const lastNameCol = cols.find(c => c.toLowerCase() === 'lastname') || 'LastName';
        const emailCol = cols.find(c => c.toLowerCase() === 'email') || 'Email';
        const idCol = cols.find(c => c.toLowerCase() === 'id') || 'id';

        const leadsRes = await queryMain(
          `SELECT "${idCol}" as id, "${firstNameCol}" as firstname, "${lastNameCol}" as lastname, "${emailCol}" as email 
           FROM "Lead" 
           WHERE "${idCol}" = ANY($1)`,
          [leadIds]
        );

        leadsRes.rows.forEach((row: { id: string; firstname: string; lastname: string; email: string }) => {
          leadMap[row.id] = {
            name: `${row.firstname || ''} ${row.lastname || ''}`.trim(),
            email: row.email || '',
          };
        });
      } catch (err) {
        console.warn('Error fetching lead details for web mapping API:', err);
      }
    }

    // 4. Mapear actividades juntando datos del lead
    const results = activities.map(act => {
      const leadInfo = act.lead_id ? leadMap[act.lead_id] : null;
      return {
        id: act.id,
        lead_id: act.lead_id,
        anonymous_id: act.anonymous_id,
        event_type: act.event_type,
        page_url: act.page_url,
        page_title: act.page_title,
        details: act.details,
        created_at: act.created_at,
        lead_name: leadInfo ? leadInfo.name : null,
        lead_email: leadInfo ? leadInfo.email : null,
        is_synchronized: act.lead_id !== null,
      };
    });

    return NextResponse.json({
      success: true,
      activities: results,
      totalCount,
    });
  } catch (error) {
    console.error('Error in GET /api/web-mapping:', error);
    return NextResponse.json(
      { success: false, message: 'Error interno al obtener mapeo web', error: (error as Error).message },
      { status: 500 }
    );
  }
}
