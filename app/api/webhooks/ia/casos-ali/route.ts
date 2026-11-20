import { NextResponse } from 'next/server';
import { secretoValido } from '@/lib/ia_secreto';
import { listarCasos } from '@/lib/revision_ali';

export const dynamic = 'force-dynamic';

/**
 * Casos de prueba que salieron de errores reales de Ali (revisión semanal →
 * "Convertir en caso de prueba"). Los lee scripts/casos-ali.mjs del sitio
 * junto con los suyos. Solo con x-ia-secret = IA_SECRET.
 * GET → { casos: [{ id, nombre, canal, mensajes, debe }] }
 */
export async function GET(request: Request) {
  if (!secretoValido(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    return NextResponse.json({ casos: await listarCasos() });
  } catch (error) {
    console.error('[casos-ali] Error leyendo los casos:', error);
    return NextResponse.json({ error: 'No se pudieron leer los casos' }, { status: 500 });
  }
}
