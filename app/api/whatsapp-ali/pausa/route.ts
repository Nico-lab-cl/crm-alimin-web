import { NextResponse } from 'next/server';
import { alCrmMovil } from '@/lib/whatsapp_ali';

export const dynamic = 'force-dynamic';

/**
 * Pausar o reactivar a Ali en un chat. Cuerpo: { conversationId, accion, quien }.
 * "quien" es el asesor elegido en "Respondo como…": este CRM entra con una
 * contraseña compartida y no sabe quién está mirando.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }
  const conversationId = String(body.conversationId || '').trim();
  const accion = String(body.accion || '').trim();
  const quien = String(body.quien || '').trim().slice(0, 120);
  if (!conversationId || (accion !== 'pausar' && accion !== 'reactivar')) {
    return NextResponse.json({ error: 'Faltan la conversación o la acción' }, { status: 400 });
  }
  return alCrmMovil('pausa', JSON.stringify({ conversationId, accion, quien }));
}
