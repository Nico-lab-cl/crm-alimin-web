import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Conversaciones del chat en vivo de aliminspa.cl.
 *
 * Se leen directamente de la base principal, que es la misma que usa el CRM
 * móvil de los asesores: no hay copia ni sincronización. Las respuestas, en
 * cambio, se envían por API (ver app/api/chat-web/reply) para que la
 * asignación del lead tenga un solo responsable.
 */
export async function GET() {
  try {
    const res = await queryMain(`
      SELECT
        c.id,
        c."metaName"          AS nombre_visitante,
        c."updatedAt"         AS actualizado,
        c."visitorLastSeenAt" AS visto_por_ultima_vez,
        l.id                  AS lead_id,
        l."firstName"         AS lead_nombre,
        l."lastName"          AS lead_apellido,
        l.phone               AS telefono,
        l.email               AS correo,
        l.status              AS estado,
        l."assignedToId"      AS asesor_id,
        u.name                AS asesor_nombre,
        m.text                AS ultimo_texto,
        m."senderType"        AS ultimo_emisor,
        m."createdAt"         AS ultimo_en
      FROM "Conversation" c
      LEFT JOIN "Lead" l ON l.id = c."leadId"
      LEFT JOIN "User" u ON u.id = l."assignedToId"
      LEFT JOIN LATERAL (
        SELECT text, "senderType", "createdAt"
        FROM "Message"
        WHERE "conversationId" = c.id
        ORDER BY "createdAt" DESC
        LIMIT 1
      ) m ON true
      WHERE c.platform = 'web'
      ORDER BY c."updatedAt" DESC
      LIMIT 100
    `);

    return NextResponse.json({ conversaciones: res.rows });
  } catch (error) {
    console.error('[chat-web] Error listando conversaciones:', error);
    return NextResponse.json(
      { error: 'No se pudo leer la bandeja del chat web', conversaciones: [] },
      { status: 500 }
    );
  }
}
