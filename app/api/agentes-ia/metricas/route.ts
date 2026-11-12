import { NextResponse } from 'next/server';
import { metricasCanales } from '@/lib/agentes_ia';

export const dynamic = 'force-dynamic';

/** Ali por canal. GET ?dias=7 (1 a 90). */
export async function GET(request: Request) {
  const dias = Math.min(Math.max(Number(new URL(request.url).searchParams.get('dias')) || 7, 1), 90);
  try {
    return NextResponse.json({ dias, canales: await metricasCanales(dias) });
  } catch (error) {
    console.error('[agentes-ia] Error leyendo las métricas por canal:', error);
    return NextResponse.json({ error: 'No se pudieron leer las métricas', canales: [] }, { status: 500 });
  }
}
