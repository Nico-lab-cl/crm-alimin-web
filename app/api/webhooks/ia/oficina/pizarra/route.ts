import { NextResponse } from 'next/server';
import { secretoValido } from '@/lib/ia_secreto';
import { leerPizarra } from '@/lib/oficina_director';

export const dynamic = 'force-dynamic';

/**
 * Pizarra de la Oficina IA: notas y charlas que dejó el director
 * (lib/oficina_director.ts). La lee el servidor de la oficina con x-ia-secret.
 * Sin datos de clientes.
 */
export async function GET(request: Request) {
  if (!secretoValido(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const limite = Number(new URL(request.url).searchParams.get('limite')) || 20;
  try {
    return NextResponse.json({ pizarra: await leerPizarra(limite) });
  } catch (error) {
    console.error('[oficina] No se pudo leer la pizarra:', error);
    return NextResponse.json({ error: 'No se pudo leer la pizarra' }, { status: 500 });
  }
}
