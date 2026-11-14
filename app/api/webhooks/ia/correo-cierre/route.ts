import { NextResponse } from 'next/server';
import { correoCierreParaLead } from '@/lib/correo_cierre_ia';
import { secretoValido } from '@/lib/ia_secreto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Vista previa de un correo "Después de la visita" escrito por la IA de
 * Cierre para un lead real, SIN enviarlo. Para revisar ejemplos antes de
 * encender la secuencia. GET ?lead_id=...&paso=1..4[&proyecto=LOMAS|ARENA]
 * con x-ia-secret. Devuelve { asunto, preheader, html }.
 */
export async function GET(request: Request) {
  if (!secretoValido(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const url = new URL(request.url);
  const leadId = (url.searchParams.get('lead_id') || '').trim();
  const paso = Number(url.searchParams.get('paso') || 1);
  const p = (url.searchParams.get('proyecto') || '').toUpperCase();
  if (!leadId || !Number.isInteger(paso) || paso < 1 || paso > 4) {
    return NextResponse.json({ error: 'Falta lead_id o paso (1 a 4)' }, { status: 400 });
  }
  try {
    const correo = await correoCierreParaLead(leadId, { posicion: paso, total: 4 }, p === 'ARENA' ? 'ARENA' : p === 'LOMAS' ? 'LOMAS' : null);
    if (!correo) return NextResponse.json({ error: 'No se pudo escribir el correo' }, { status: 502 });
    return NextResponse.json(correo);
  } catch (error) {
    console.error('[correo-cierre] Falló la vista previa:', error);
    return NextResponse.json({ error: 'No se pudo escribir el correo' }, { status: 500 });
  }
}
