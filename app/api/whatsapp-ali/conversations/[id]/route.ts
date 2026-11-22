import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';
import { calificacionesDe } from '@/lib/calificador_ia';
import { hayTablaDePausas } from '@/lib/whatsapp_ali';

export const dynamic = 'force-dynamic';

/**
 * Un chat con todo lo que hace falta al lado: los mensajes (con sus adjuntos,
 * sin el binario), si Ali está en pausa, la ficha del lead, lo que sabe la IA
 * (calificación y lead score) y las otras conversaciones del mismo lead.
 *
 * Sirve también para leer, en modo consulta, los otros canales del lead
 * (Instagram, Facebook, chat web, el otro número): por eso no filtra por canal.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const conPausas = await hayTablaDePausas();
    const cabecera = await queryMain(
      `
      SELECT
        c.id, c.platform, c.psid,
        c."metaName"   AS nombre_whatsapp,
        c."leadId"     AS lead_id,
        (SELECT "createdAt" AT TIME ZONE 'UTC' FROM "Message"
          WHERE "conversationId" = c.id AND "senderType" = 'meta'
          ORDER BY "createdAt" DESC LIMIT 1) AS ultimo_cliente_en
        ${conPausas ? `, p.pausada_en, p.pausada_por, p.motivo AS pausa_motivo` : ''}
      FROM "Conversation" c
      ${conPausas ? 'LEFT JOIN public.ali_pausas p ON p.conversation_id = c.id' : ''}
      WHERE c.id = $1
      `,
      [params.id]
    );
    if (cabecera.rowCount === 0) {
      return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });
    }
    const conversacion = cabecera.rows[0];

    const mensajes = await queryMain(
      `
      SELECT
        m.id, m.text,
        m."senderType" AS emisor,
        m."sourceType" AS origen,
        (m."createdAt" AT TIME ZONE 'UTC') AS creado,
        m."mediaUrl"   AS media_url,
        m."postContent" AS publicacion,
        u.name         AS autor,
        mm.id          AS adjunto_id,
        mm.kind        AS adjunto_tipo,
        mm."mimeType"  AS adjunto_mime,
        mm."fileName"  AS adjunto_nombre
      FROM "Message" m
      LEFT JOIN "User" u ON u.id = m."senderId"
      -- Solo los metadatos del adjunto: el binario se pide aparte (api/chat-web/media).
      LEFT JOIN "MessageMedia" mm ON mm."messageId" = m.id
      WHERE m."conversationId" = $1
      ORDER BY m."createdAt" ASC
      LIMIT 800
      `,
      [params.id]
    );

    let lead = null;
    let leadScore = null;
    let calificacion: unknown[] = [];
    let otrosCanales: unknown[] = [];

    if (conversacion.lead_id) {
      const l = await queryMain(
        `
        SELECT l.id, l."firstName", l."lastName", l.phone, l.email, l.status, l.source, l.rating,
               l.pie, l.interests, l.notes, l.visited, (l."visitDate" AT TIME ZONE 'UTC') AS "visitDate", l."visitProject", l."lastActivity",
               (l."createdAt" AT TIME ZONE 'UTC') AS "createdAt", l."assignedToId", u.name AS asesor_nombre
          FROM "Lead" l
          LEFT JOIN "User" u ON u.id = l."assignedToId"
         WHERE l.id = $1
        `,
        [conversacion.lead_id]
      );
      lead = l.rows[0] || null;

      try {
        const s = await queryMain(
          `SELECT score, banda, motivos, calculado_en FROM public.lead_score WHERE lead_id = $1`,
          [conversacion.lead_id]
        );
        leadScore = s.rows[0] || null;
      } catch {
        // Sin tabla de lead score todavía.
      }

      const o = await queryMain(
        `
        SELECT c.id, c.platform, c.psid, (c."updatedAt" AT TIME ZONE 'UTC') AS actualizado,
               m.text AS ultimo_texto, (m."createdAt" AT TIME ZONE 'UTC') AS ultimo_en
          FROM "Conversation" c
          LEFT JOIN LATERAL (
            SELECT text, "createdAt" FROM "Message"
             WHERE "conversationId" = c.id AND "sourceType" <> 'EVENTO'
             ORDER BY "createdAt" DESC LIMIT 1
          ) m ON true
         WHERE c."leadId" = $1 AND c.id <> $2
         ORDER BY COALESCE(m."createdAt", c."updatedAt") DESC
         LIMIT 20
        `,
        [conversacion.lead_id, params.id]
      );
      otrosCanales = o.rows;
    }

    try {
      calificacion = await calificacionesDe({ leadId: conversacion.lead_id, conversacionId: params.id });
    } catch (error) {
      console.warn('[whatsapp-ali] No se pudo leer la calificación IA:', (error as Error).message);
    }

    return NextResponse.json({
      conversacion,
      mensajes: mensajes.rows,
      lead,
      leadScore,
      calificacion,
      otrosCanales,
    });
  } catch (error) {
    console.error('[whatsapp-ali] Error leyendo la conversación:', error);
    return NextResponse.json({ error: 'No se pudo leer la conversación' }, { status: 500 });
  }
}
