import { NextResponse } from 'next/server';
import { calificacionesDe } from '@/lib/calificador_ia';
import { secretoValido } from '@/lib/ia_secreto';

export const dynamic = 'force-dynamic';

/**
 * Lo que el calificador IA sabe de una persona, para la memoria de Ali (la
 * pide el CRM móvil en lib/memoriaLead.ts). GET ?lead_id=... o
 * ?conversacion_id=... con x-ia-secret. Las dos IAs se "hablan" así: el
 * calificador escribe en ia_calificacion y Ali lo lee en su siguiente respuesta.
 */
export async function GET(request: Request) {
  if (!secretoValido(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const url = new URL(request.url);
  const leadId = (url.searchParams.get('lead_id') || '').trim() || null;
  const conversacionId = (url.searchParams.get('conversacion_id') || '').trim() || null;
  if (!leadId && !conversacionId) return NextResponse.json({ error: 'Falta lead_id o conversacion_id' }, { status: 400 });
  try {
    return NextResponse.json({ calificaciones: await calificacionesDe({ leadId, conversacionId }) });
  } catch (error) {
    console.error('[agentes-ia] No se pudo leer la calificación:', error);
    return NextResponse.json({ error: 'No se pudo leer la calificación' }, { status: 500 });
  }
}
