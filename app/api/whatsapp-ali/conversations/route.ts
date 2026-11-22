import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';
import { PSID_DEL_NUMERO, hayTablaDePausas } from '@/lib/whatsapp_ali';

export const dynamic = 'force-dynamic';

/**
 * Chats de WhatsApp del número de Ali (lib/whatsapp_ali.ts), todos: también
 * los que Ali atiende sola, que en la bandeja del móvil no aparecen.
 * Las notas internas (sourceType EVENTO) no cuentan como último mensaje.
 */
export async function GET() {
  try {
    const conPausas = await hayTablaDePausas();
    const res = await queryMain(
      `
      SELECT
        c.id,
        c."metaName"       AS nombre_whatsapp,
        c.psid,
        (c."updatedAt" AT TIME ZONE 'UTC') AS actualizado,
        l.id               AS lead_id,
        l."firstName"      AS lead_nombre,
        l."lastName"       AS lead_apellido,
        l.status           AS estado,
        u.name             AS asesor_nombre,
        m.text             AS ultimo_texto,
        m."senderType"     AS ultimo_emisor,
        (m."createdAt" AT TIME ZONE 'UTC') AS ultimo_en,
        (cl."createdAt" AT TIME ZONE 'UTC') AS ultimo_cliente_en,
        EXISTS (
          SELECT 1 FROM "Message" h
           WHERE h."conversationId" = c.id AND h."senderType" = 'ali' AND h."sourceType" = 'HANDOFF'
        ) AS derivada,
        ${conPausas ? `(SELECT p.pausada_en FROM public.ali_pausas p WHERE p.conversation_id = c.id)` : 'NULL::timestamptz'} AS pausada_en
      FROM "Conversation" c
      LEFT JOIN "Lead" l ON l.id = c."leadId"
      LEFT JOIN "User" u ON u.id = l."assignedToId"
      LEFT JOIN LATERAL (
        SELECT text, "senderType", "createdAt" FROM "Message"
         WHERE "conversationId" = c.id AND "sourceType" <> 'EVENTO'
         ORDER BY "createdAt" DESC LIMIT 1
      ) m ON true
      LEFT JOIN LATERAL (
        SELECT "createdAt" FROM "Message"
         WHERE "conversationId" = c.id AND "senderType" = 'meta'
         ORDER BY "createdAt" DESC LIMIT 1
      ) cl ON true
      WHERE c.platform = 'whatsapp' AND c.psid LIKE $1
      ORDER BY COALESCE(m."createdAt", c."updatedAt") DESC
      LIMIT 300
      `,
      [PSID_DEL_NUMERO]
    );

    return NextResponse.json({ conversaciones: res.rows });
  } catch (error) {
    console.error('[whatsapp-ali] Error listando conversaciones:', error);
    return NextResponse.json({ error: 'No se pudo leer la bandeja de WhatsApp', conversaciones: [] }, { status: 500 });
  }
}
