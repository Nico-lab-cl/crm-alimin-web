import { NextResponse } from 'next/server';
import { actualizarConocimiento, type DatosConocimiento } from '@/lib/agentes_ia';

export const dynamic = 'force-dynamic';

/** Cambia el texto, el estado o los agentes de una fila. Para sacarla, estado "archivada". */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const fila = await actualizarConocimiento(params.id, (await request.json()) as DatosConocimiento);
    return NextResponse.json({ conocimiento: fila });
  } catch (error) {
    console.error('[agentes-ia] Error actualizando conocimiento:', error);
    return NextResponse.json({ error: (error as Error).message || 'No se pudo guardar' }, { status: 400 });
  }
}
