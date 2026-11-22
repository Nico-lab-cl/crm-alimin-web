import { NextResponse } from 'next/server';
import { DOCUMENTOS, alCrmMovil } from '@/lib/whatsapp_ali';

export const dynamic = 'force-dynamic';

/**
 * Texto o documento de Ali (plano o brochure) a un chat de WhatsApp, de parte
 * del asesor elegido. Lo manda el CRM móvil (lib/whatsapp_ali.ts).
 * Cuerpo: { conversationId, advisorId, text } o { conversationId, advisorId, documento }.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const conversationId = String(body.conversationId || '').trim();
  const advisorId = String(body.advisorId || '').trim();
  const text = String(body.text || '').trim();
  const documento = String(body.documento || '').trim();

  if (!conversationId) return NextResponse.json({ error: 'Falta la conversación' }, { status: 400 });
  if (!advisorId) return NextResponse.json({ error: 'Elige de parte de qué asesor estás respondiendo' }, { status: 400 });

  if (documento) {
    if (!DOCUMENTOS.some((d) => d.id === documento)) {
      return NextResponse.json({ error: 'Ese documento no existe' }, { status: 400 });
    }
    return alCrmMovil('documento', JSON.stringify({ conversationId, advisorId, documento }));
  }
  if (!text) return NextResponse.json({ error: 'El mensaje viene vacío' }, { status: 400 });
  return alCrmMovil('reply', JSON.stringify({ conversationId, advisorId, text }));
}
