import { NextResponse } from 'next/server';
import { actualizarPrecio, listarPrecios, type Precio } from '@/lib/agentes_ia';

export const dynamic = 'force-dynamic';

/** Corrige el precio por millón de tokens de un modelo (no recalcula lo ya registrado). */
export async function PUT(request: Request) {
  try {
    await actualizarPrecio((await request.json()) as Precio);
    return NextResponse.json({ precios: await listarPrecios() });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || 'No se pudo guardar' }, { status: 400 });
  }
}
