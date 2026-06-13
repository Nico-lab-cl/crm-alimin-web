import { NextResponse } from 'next/server';
import { queryMain, queryMarketing } from '@/lib/db';
import { normalizeAdvisorName, getEvolutionAdvisors } from '@/lib/evolution_sync';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Consultar las conversaciones únicas más recientes
    const query = `
      SELECT DISTINCT ON (remote_jid) 
        id,
        message_id,
        lead_id,
        remote_jid,
        from_me,
        body,
        timestamp,
        instance_id,
        advisor_name,
        push_name
      FROM whatsapp_messages
      ORDER BY remote_jid, timestamp DESC
    `;

    const res = await queryMarketing(query);
    const rawChats = res.rows;

    // 2. Mapear nombres de Leads a los chats vinculados
    const chatsList = [];
    const leadIds = rawChats.map((c: any) => c.lead_id).filter(Boolean);
    const leadMap = new Map<string, any>();

    if (leadIds.length > 0) {
      try {
        const leadsRes = await queryMain(`
          SELECT l.id, l."firstName", l."lastName", l.phone, l.email, u.name as "assignedAdvisor"
          FROM "Lead" l
          LEFT JOIN "User" u ON l."assignedToId" = u.id
          WHERE l.id = ANY($1)
        `, [leadIds]);

        for (const row of leadsRes.rows) {
          leadMap.set(row.id, row);
        }
      } catch (e) {
        console.warn('[WhatsApp API Chats] Error al realizar batch query de Leads:', (e as Error).message);
      }
    }

    for (const chat of rawChats) {
      let leadName = null;
      let email = null;
      let leadPhone = null;
      let leadAdvisorName = null;
      const phone = chat.remote_jid.split('@')[0].replace(/\D/g, '');

      if (chat.lead_id && leadMap.has(chat.lead_id)) {
        const row = leadMap.get(chat.lead_id);
        const first = row.firstName || row.FirstName || row.firstname || '';
        const last = row.lastName || row.LastName || row.lastname || '';
        leadName = `${first} ${last}`.trim();
        email = row.email || row.Email || null;
        leadPhone = row.phone || row.Phone || null;
        leadAdvisorName = row.assignedAdvisor || null;
      }

      const displayPhone = leadPhone ? leadPhone.replace(/\D/g, '') : phone;

      chatsList.push({
        id: chat.id,
        message_id: chat.message_id,
        lead_id: chat.lead_id,
        remote_jid: chat.remote_jid,
        phone: displayPhone,
        lead_name: leadName || chat.push_name || `+${phone}`,
        email,
        body: chat.body,
        timestamp: chat.timestamp,
        from_me: chat.from_me,
        advisor_name: normalizeAdvisorName(leadAdvisorName || chat.advisor_name),
        is_crm_contact: !!chat.lead_id
      });
    }

    // Ordenar cronológicamente (más recientes primero)
    chatsList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Obtener lista de asesores directamente de Evolution API (todas las instancias)
    let advisors: string[] = [];
    try {
      advisors = await getEvolutionAdvisors();
    } catch (e) {
      console.warn('[WhatsApp API Chats] Error al obtener asesores de Evolution:', (e as Error).message);
      advisors = Array.from(new Set(chatsList.map(c => c.advisor_name).filter(n => n && n !== 'WhatsApp Sistema')));
    }

    return NextResponse.json({
      success: true,
      chatsCount: chatsList.length,
      advisors,
      chats: chatsList
    });

  } catch (error: any) {
    console.error('[Sync All Webhook] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
