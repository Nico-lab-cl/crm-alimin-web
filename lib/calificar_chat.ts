import { NextResponse } from 'next/server';
import { calificarChatReal, votosDeChat, type Voto } from '@/lib/ia_pruebas';

/**
 * Lo común de las dos rutas que reciben el 👍/👎 de un asesor sobre una
 * respuesta de Ali en un chat real: la de la bandeja WhatsApp Ali (sesión del
 * CRM web) y la del CRM móvil (x-ia-secret). Ver calificarChatReal.
 */

export async function recibirCalificacion(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }
  const conversationId = String(body.conversationId || '').trim();
  const messageId = String(body.messageId || '').trim();
  const asesor = String(body.asesor || '').trim().slice(0, 60);
  const voto: Voto | null = body.voto === 'bien' || body.voto === 'mal' ? body.voto : null;
  const correccion = typeof body.correccion === 'string' ? body.correccion : null;
  if (!conversationId || !messageId) return NextResponse.json({ error: 'Faltan la conversación o el mensaje' }, { status: 400 });
  if (!asesor) return NextResponse.json({ error: 'Elige quién está calificando' }, { status: 400 });

  try {
    const votos = await calificarChatReal({ conversationId, messageId, voto, correccion, asesor });
    return NextResponse.json({ ok: true, votos });
  } catch (error) {
    const mensaje = (error as Error).message;
    const esDelUsuario = /no encontrada|Solo se califican/.test(mensaje);
    if (!esDelUsuario) console.error('[calificar-chat] No se pudo guardar:', error);
    return NextResponse.json({ error: esDelUsuario ? mensaje : 'No se pudo guardar la calificación' }, { status: esDelUsuario ? 400 : 500 });
  }
}

export async function entregarVotos(request: Request) {
  const conversationId = new URL(request.url).searchParams.get('conversationId') || '';
  if (!conversationId) return NextResponse.json({ error: 'Falta la conversación' }, { status: 400 });
  try {
    return NextResponse.json({ votos: await votosDeChat(conversationId) });
  } catch (error) {
    console.error('[calificar-chat] No se pudieron leer los votos:', error);
    return NextResponse.json({ votos: {} }, { status: 500 });
  }
}
