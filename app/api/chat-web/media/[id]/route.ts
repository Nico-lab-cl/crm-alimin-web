import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CRM_ASESORES_URL = (
  process.env.CRM_ASESORES_URL || 'https://crm.aliminlomasdelmar.com'
).replace(/\/$/, '');

/**
 * Trae un adjunto del chat (foto, audio o video) desde el CRM de asesores.
 *
 * Se hace de servidor a servidor y no apuntando el navegador directo al CRM
 * porque el archivo está detrás de autenticación: el CRM lo entrega con una
 * sesión de asesor o con la API key, y el navegador de este panel no tiene
 * ninguna de las dos. La API key nunca sale de este servidor.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const apiKey = process.env.WEB_CHAT_API_KEY;
  if (!apiKey) {
    console.error('[chat-web] Falta la variable de entorno WEB_CHAT_API_KEY.');
    return NextResponse.json({ error: 'El chat web no está configurado' }, { status: 503 });
  }

  try {
    const res = await fetch(`${CRM_ASESORES_URL}/api/media/${encodeURIComponent(params.id)}`, {
      headers: { 'x-crm-api-key': apiKey },
      // Más holgado que el resto de las llamadas: acá viaja un archivo completo.
      signal: AbortSignal.timeout(30000),
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Adjunto no encontrado' },
        { status: res.status === 404 ? 404 : 502 }
      );
    }

    const contenido = await res.arrayBuffer();

    return new NextResponse(contenido, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/octet-stream',
        'Content-Length': String(contenido.byteLength),
        // Es contenido de una conversación con un cliente: se cachea en el
        // navegador del asesor y en ninguna caché compartida.
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('[chat-web] No se pudo traer el adjunto:', error);
    return NextResponse.json({ error: 'El CRM de asesores no respondió' }, { status: 503 });
  }
}
