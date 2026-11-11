import { NextResponse } from 'next/server';
import {
  crearConocimiento,
  esAgente,
  ESTADOS,
  listarConocimiento,
  type DatosConocimiento,
  type EstadoConocimiento,
} from '@/lib/agentes_ia';

export const dynamic = 'force-dynamic';

/** GET ?agente=atraccion&estado=aprobada */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const agente = q.get('agente') || '';
  const estado = q.get('estado') || '';
  try {
    const filas = await listarConocimiento({
      agente: esAgente(agente) ? agente : undefined,
      estado: ESTADOS.includes(estado as EstadoConocimiento) ? (estado as EstadoConocimiento) : undefined,
    });
    return NextResponse.json({ conocimiento: filas });
  } catch (error) {
    console.error('[agentes-ia] Error leyendo el conocimiento:', error);
    return NextResponse.json({ error: 'No se pudo leer el conocimiento', conocimiento: [] }, { status: 500 });
  }
}

/** Crea una fila nueva; siempre nace "por revisar". */
export async function POST(request: Request) {
  try {
    const fila = await crearConocimiento((await request.json()) as DatosConocimiento);
    return NextResponse.json({ conocimiento: fila });
  } catch (error) {
    console.error('[agentes-ia] Error creando conocimiento:', error);
    return NextResponse.json({ error: (error as Error).message || 'No se pudo crear' }, { status: 400 });
  }
}
