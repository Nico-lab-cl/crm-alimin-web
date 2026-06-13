import { NextResponse } from 'next/server';
import { queryMain, queryMarketing } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Obtener todas las vinculaciones únicas de JID -> Lead ID
    const linksRes = await queryMarketing(`
      SELECT DISTINCT remote_jid, lead_id 
      FROM whatsapp_messages 
      WHERE lead_id IS NOT NULL
    `);
    const links = linksRes.rows;

    const mismatches = [];
    let matchCount = 0;
    let emptyPhoneCount = 0;

    // 2. Verificar cada vinculación contra el teléfono real del lead en el CRM
    for (const link of links) {
      const remoteJid = link.remote_jid;
      const leadId = link.lead_id;
      const jidPhone = remoteJid.split('@')[0].replace(/\D/g, '');

      const leadRes = await queryMain(`
        SELECT id, "firstName", "lastName", phone, "assignedToId"
        FROM "Lead" 
        WHERE id = $1
      `, [leadId]);

      if (leadRes.rows.length === 0) {
        mismatches.push({
          remote_jid: remoteJid,
          lead_id: leadId,
          reason: 'Lead does not exist in CRM'
        });
        continue;
      }

      const lead = leadRes.rows[0];
      const leadPhone = lead.phone || '';
      const cleanLeadPhone = leadPhone.replace(/\D/g, '');

      if (!cleanLeadPhone) {
        emptyPhoneCount++;
        mismatches.push({
          remote_jid: remoteJid,
          lead_id: leadId,
          lead_name: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
          lead_phone: leadPhone,
          reason: 'Lead has empty phone number'
        });
        continue;
      }

      // Comparar teléfonos
      const isMatch = jidPhone === cleanLeadPhone || jidPhone.endsWith(cleanLeadPhone) || cleanLeadPhone.endsWith(jidPhone);
      if (isMatch) {
        matchCount++;
      } else {
        mismatches.push({
          remote_jid: remoteJid,
          lead_id: leadId,
          lead_name: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
          lead_phone: leadPhone,
          reason: `Phone mismatch: JID has ${jidPhone}, Lead has ${cleanLeadPhone}`
        });
      }
    }

    return NextResponse.json({
      success: true,
      total_links: links.length,
      correct_matches: matchCount,
      empty_phones: emptyPhoneCount,
      total_mismatches: mismatches.length,
      mismatches_sample: mismatches.slice(0, 50)
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
