import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CRM_ASESORES_URL = (
  process.env.CRM_ASESORES_URL || 'https://crm.aliminlomasdelmar.com'
).replace(/\/$/, '');

/**
 * Envía la respuesta del asesor al chat web.
 *
 * No se escribe en la base directamente a propósito: el CRM de asesores es el
 * único que escribe en las conversaciones, así la asignación del lead y el
 * orden de la bandeja se comportan igual desde acá que desde el móvil.
 */
export async function POST(request: Request) {
  const apiKey = process.env.WEB_CHAT_API_KEY;
  if (!apiKey) {
    console.error('[chat-web] Falta la variable de entorno WEB_CHAT_API_KEY.');
    return NextResponse.json(
      { error: 'El chat web no está configurado en este servidor' },
      { status: 503 }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const conversationId = String(body.conversationId || '').trim();
  const advisorId = String(body.advisorId || '').trim();
  const text = String(body.text || '').trim();

  if (!conversationId || !text) {
    return NextResponse.json({ error: 'Falta la conversación o el mensaje' }, { status: 400 });
  }
  if (!advisorId) {
    return NextResponse.json(
      { error: 'Elige de parte de qué asesor estás respondiendo' },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${CRM_ASESORES_URL}/api/public/web-chat/reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-crm-api-key': apiKey,
      },
      body: JSON.stringify({ conversationId, advisorId, text }),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });

    const datos = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error('[chat-web] El CRM de asesores rechazó la respuesta:', res.status, datos);
      return NextResponse.json(
        { error: datos.error || 'No se pudo enviar la respuesta' },
        { status: res.status === 429 ? 429 : 502 }
      );
    }

    return NextResponse.json(datos);
  } catch (error) {
    console.error('[chat-web] No se pudo contactar al CRM de asesores:', error);
    return NextResponse.json({ error: 'El CRM de asesores no respondió' }, { status: 503 });
  }
}
