import { NextResponse } from 'next/server';
import { correrCompetencia, correrMercado } from '@/lib/investigacion/investigacion';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Botón "Revisar ahora" de /investigacion (Competencia o Mercado). No gasta IA. */
export async function POST(request: Request) {
  const agente = new URL(request.url).searchParams.get('agente');
  try {
    if (agente === 'competencia') return NextResponse.json(await correrCompetencia());
    if (agente === 'mercado') return NextResponse.json(await correrMercado());
    return NextResponse.json({ error: 'agente debe ser competencia o mercado' }, { status: 400 });
  } catch (error) {
    console.error(`[investigacion] Falló la revisión manual de ${agente}:`, error);
    return NextResponse.json({ error: 'No se pudo revisar' }, { status: 500 });
  }
}
