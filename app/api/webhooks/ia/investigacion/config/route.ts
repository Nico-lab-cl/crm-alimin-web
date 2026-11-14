import { NextResponse } from 'next/server';
import { secretoValido } from '@/lib/ia_secreto';
import { leerConfig } from '@/lib/investigacion/tablas';

export const dynamic = 'force-dynamic';

/** Qué busca la tarea diaria de anuncios: términos y páginas de la competencia (se editan en /investigacion). */
export async function GET(request: Request) {
  if (!secretoValido(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  try {
    const c = await leerConfig();
    return NextResponse.json({ terminos: c.terminos_anuncios, paginas: c.paginas_competencia });
  } catch (error) {
    console.error('[investigacion] No se pudo leer la configuración:', error);
    return NextResponse.json({ error: 'No se pudo leer la configuración' }, { status: 500 });
  }
}
