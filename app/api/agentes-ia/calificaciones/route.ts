import { NextResponse } from 'next/server';
import { ultimasCalificaciones } from '@/lib/agentes_ia';
import { pasadaCalificadorSinSolapar } from '@/lib/calificador_ia';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json({ calificaciones: await ultimasCalificaciones(30) });
  } catch (error) {
    console.error('[calificador] Error leyendo calificaciones:', error);
    return NextResponse.json({ error: 'No se pudieron leer', calificaciones: [] }, { status: 500 });
  }
}

/**
 * Prueba a mano: califica hasta { limite } conversaciones (3 por defecto)
 * aunque el temporizador esté apagado. Gasta tokens reales.
 */
export async function POST(request: Request) {
  try {
    const { limite } = (await request.json().catch(() => ({}))) as { limite?: number };
    const r = await pasadaCalificadorSinSolapar({ forzar: true, limite: Math.min(Math.max(Number(limite) || 3, 1), 10) });
    return NextResponse.json({ resultado: r, calificaciones: await ultimasCalificaciones(30) });
  } catch (error) {
    console.error('[calificador] Error en la prueba:', error);
    return NextResponse.json({ error: (error as Error).message || 'Falló la prueba' }, { status: 500 });
  }
}
