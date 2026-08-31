import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CRM_ASESORES_URL = (
  process.env.CRM_ASESORES_URL || 'https://crm.aliminlomasdelmar.com'
).replace(/\/$/, '');

/**
 * Envía al chat web una foto, un audio o un video de parte de un asesor.
 *
 * Es a /api/chat-web/reply lo que un adjunto es a un mensaje de texto, y por la
 * misma razón de fondo: acá no se escribe en la base directamente. El CRM de
 * asesores es el único que escribe en las conversaciones, así la asignación del
 * lead, la marca de contacto y el orden de la bandeja se comportan igual desde
 * este panel que desde el teléfono.
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

  let formulario: FormData;
  try {
    formulario = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Envío inválido' }, { status: 400 });
  }

  const conversationId = String(formulario.get('conversationId') || '').trim();
  const advisorId = String(formulario.get('advisorId') || '').trim();
  const archivo = formulario.get('file');

  if (!conversationId) {
    return NextResponse.json({ error: 'Falta la conversación' }, { status: 400 });
  }
  if (!advisorId) {
    return NextResponse.json(
      { error: 'Elige de parte de qué asesor estás respondiendo' },
      { status: 400 }
    );
  }
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: 'No llegó ningún archivo' }, { status: 400 });
  }

  try {
    // Se rearma el formulario en vez de reenviar el original: así solo viajan
    // los campos que este endpoint reconoce, y no cualquier cosa que el
    // navegador haya agregado.
    const cuerpo = new FormData();
    cuerpo.append('conversationId', conversationId);
    cuerpo.append('advisorId', advisorId);
    cuerpo.append('file', archivo);

    const texto = String(formulario.get('text') || '').trim();
    if (texto) cuerpo.append('text', texto);

    const duracion = Number(formulario.get('durationMs') || 0);
    if (Number.isFinite(duracion) && duracion > 0) {
      cuerpo.append('durationMs', String(Math.round(duracion)));
    }

    const res = await fetch(`${CRM_ASESORES_URL}/api/public/web-chat/reply-media`, {
      method: 'POST',
      headers: { 'x-crm-api-key': apiKey },
      body: cuerpo,
      signal: AbortSignal.timeout(30000),
      cache: 'no-store',
    });

    const datos = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error('[chat-web] El CRM de asesores rechazó el adjunto:', res.status, datos);
      return NextResponse.json(
        { error: datos.error || 'No se pudo enviar el archivo' },
        { status: res.status === 429 ? 429 : res.status === 400 ? 400 : 502 }
      );
    }

    return NextResponse.json(datos);
  } catch (error) {
    console.error('[chat-web] No se pudo contactar al CRM de asesores:', error);
    return NextResponse.json({ error: 'El CRM de asesores no respondió' }, { status: 503 });
  }
}
