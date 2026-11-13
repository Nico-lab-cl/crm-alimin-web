import { NextResponse } from 'next/server';
import { calificadosRecientes } from '@/lib/calificador_ia';
import { secretoValido } from '@/lib/ia_secreto';

export const dynamic = 'force-dynamic';

/**
 * Leads que el calificador IA marcó como "calificado" en las últimas horas.
 * Lo pide el CRM móvil (lib/avisoCalificadoIA.ts) para avisarle al asesor a
 * cargo. GET ?horas=3 con x-ia-secret.
 */
export async function GET(request: Request) {
  if (!secretoValido(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const horas = Number(new URL(request.url).searchParams.get('horas') || 3);
  try {
    return NextResponse.json({ calificados: await calificadosRecientes(Number.isFinite(horas) ? horas : 3) });
  } catch (error) {
    console.error('[agentes-ia] No se pudieron leer los calificados:', error);
    return NextResponse.json({ error: 'No se pudieron leer los calificados' }, { status: 500 });
  }
}
