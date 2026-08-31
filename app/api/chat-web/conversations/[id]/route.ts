import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Hilo completo de una conversación del chat web. */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const cabecera = await queryMain(
      `
      SELECT
        c.id,
        c."metaName"          AS nombre_visitante,
        c."visitorLastSeenAt" AS visto_por_ultima_vez,
        l.id                  AS lead_id,
        l."firstName"         AS lead_nombre,
        l."lastName"          AS lead_apellido,
        l.phone               AS telefono,
        l.email               AS correo,
        l."assignedToId"      AS asesor_id,
        u.name                AS asesor_nombre
      FROM "Conversation" c
      LEFT JOIN "Lead" l ON l.id = c."leadId"
      LEFT JOIN "User" u ON u.id = l."assignedToId"
      WHERE c.id = $1 AND c.platform = 'web'
      `,
      [params.id]
    );

    if (cabecera.rowCount === 0) {
      return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });
    }

    const mensajes = await queryMain(
      `
      SELECT
        m.id,
        m.text,
        m."senderType" AS emisor,
        m."createdAt"  AS creado,
        u.name         AS autor,
        mm.id          AS adjunto_id,
        mm.kind        AS adjunto_tipo,
        mm."mimeType"  AS adjunto_mime,
        mm."durationMs" AS adjunto_duracion
      FROM "Message" m
      LEFT JOIN "User" u ON u.id = m."senderId"
      -- Solo los metadatos del adjunto. La columna "data" es binaria y pesa
      -- megabytes: si entrara acá, cada apertura de una conversación traería
      -- todos sus audios enteros. El archivo se pide aparte, uno por vez.
      LEFT JOIN "MessageMedia" mm ON mm."messageId" = m.id
      WHERE m."conversationId" = $1
      ORDER BY m."createdAt" ASC
      LIMIT 500
      `,
      [params.id]
    );

    return NextResponse.json({
      conversacion: cabecera.rows[0],
      mensajes: mensajes.rows,
    });
  } catch (error) {
    console.error('[chat-web] Error leyendo la conversación:', error);
    return NextResponse.json({ error: 'No se pudo leer la conversación' }, { status: 500 });
  }
}
