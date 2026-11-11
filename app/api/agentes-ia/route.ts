import { NextResponse } from 'next/server';
import { conteoConocimiento, listarAgentes, resumenGasto } from '@/lib/agentes_ia';

export const dynamic = 'force-dynamic';

/** Todo lo que pinta el mapa: agentes, conocimiento por estado y gasto. */
export async function GET() {
  try {
    const [agentes, conocimiento, gasto] = await Promise.all([listarAgentes(), conteoConocimiento(), resumenGasto()]);
    return NextResponse.json({ agentes, conocimiento, gasto });
  } catch (error) {
    console.error('[agentes-ia] Error leyendo el mapa:', error);
    return NextResponse.json({ error: 'No se pudieron leer los agentes' }, { status: 500 });
  }
}
