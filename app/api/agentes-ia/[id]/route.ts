import { NextResponse } from 'next/server';
import { esAgente, guardarAgente, listarVersiones, obtenerAgente, restaurarVersion, type CambiosAgente } from '@/lib/agentes_ia';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!esAgente(params.id)) return NextResponse.json({ error: 'Agente desconocido' }, { status: 404 });
  try {
    const [agente, versiones] = await Promise.all([obtenerAgente(params.id), listarVersiones(params.id)]);
    return NextResponse.json({ agente, versiones });
  } catch (error) {
    console.error('[agentes-ia] Error leyendo el agente:', error);
    return NextResponse.json({ error: 'No se pudo leer el agente' }, { status: 500 });
  }
}

/** Guarda instrucciones, modelo, encendido y herramientas; la versión anterior queda en el historial. */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  if (!esAgente(params.id)) return NextResponse.json({ error: 'Agente desconocido' }, { status: 404 });
  try {
    const cambios = (await request.json()) as CambiosAgente;
    const agente = await guardarAgente(params.id, cambios);
    return NextResponse.json({ agente, versiones: await listarVersiones(params.id) });
  } catch (error) {
    console.error('[agentes-ia] Error guardando el agente:', error);
    return NextResponse.json({ error: (error as Error).message || 'No se pudo guardar' }, { status: 400 });
  }
}

/** { restaurar: <id de versión> } vuelve a esa versión. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!esAgente(params.id)) return NextResponse.json({ error: 'Agente desconocido' }, { status: 404 });
  try {
    const { restaurar } = (await request.json()) as { restaurar?: number };
    if (!restaurar) return NextResponse.json({ error: 'Falta la versión' }, { status: 400 });
    const agente = await restaurarVersion(params.id, Number(restaurar));
    return NextResponse.json({ agente, versiones: await listarVersiones(params.id) });
  } catch (error) {
    console.error('[agentes-ia] Error restaurando la versión:', error);
    return NextResponse.json({ error: (error as Error).message || 'No se pudo restaurar' }, { status: 400 });
  }
}
