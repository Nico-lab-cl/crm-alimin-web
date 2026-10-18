import { NextResponse } from 'next/server';
import { diagnosticoMarcaAnuncio } from '@/lib/evolution_sync';

export const dynamic = 'force-dynamic';

/**
 * Qué campos traen los mensajes recibidos en Evolution, para encontrar dónde
 * queda la marca del anuncio de Meta. ?dias=N (por defecto 7, máximo 30).
 */
export async function GET(request: Request) {
  try {
    const dias = Math.min(Math.max(Number(new URL(request.url).searchParams.get('dias')) || 7, 1), 30);
    return NextResponse.json({ success: true, ...(await diagnosticoMarcaAnuncio(dias)) });
  } catch (error) {
    console.error('Error en el diagnóstico de la marca del anuncio:', error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}
