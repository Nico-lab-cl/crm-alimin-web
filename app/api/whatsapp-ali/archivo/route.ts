import { NextResponse } from 'next/server';
import { alCrmMovil } from '@/lib/whatsapp_ali';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 16 * 1024 * 1024;

/**
 * Foto (JPG o PNG) o PDF propio a un chat de WhatsApp. Se reenvía tal cual al
 * CRM móvil, que valida el contenido, lo sube a WhatsApp y lo guarda.
 * Formulario: conversationId, advisorId, archivo y leyenda (opcional).
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Formulario inválido' }, { status: 400 });
  }

  const conversationId = String(form.get('conversationId') || '').trim();
  const advisorId = String(form.get('advisorId') || '').trim();
  const archivo = form.get('archivo');
  if (!conversationId) return NextResponse.json({ error: 'Falta la conversación' }, { status: 400 });
  if (!advisorId) return NextResponse.json({ error: 'Elige de parte de qué asesor estás respondiendo' }, { status: 400 });
  if (!archivo || typeof archivo === 'string') return NextResponse.json({ error: 'No llegó ningún archivo' }, { status: 400 });
  if (archivo.size > MAX_BYTES) return NextResponse.json({ error: 'El archivo supera los 16 MB' }, { status: 400 });

  const cuerpo = new FormData();
  cuerpo.append('conversationId', conversationId);
  cuerpo.append('advisorId', advisorId);
  cuerpo.append('leyenda', String(form.get('leyenda') || '').slice(0, 1000));
  cuerpo.append('archivo', archivo, archivo.name);
  return alCrmMovil('archivo', cuerpo, false);
}
