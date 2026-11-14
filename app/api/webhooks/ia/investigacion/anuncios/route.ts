import { NextResponse } from 'next/server';
import { secretoValido } from '@/lib/ia_secreto';
import { anunciosEmpiezan, guardarAnuncios, type AnuncioRecibido } from '@/lib/investigacion/investigacion';

export const dynamic = 'force-dynamic';

/**
 * Ali - Anuncios: la tarea diaria de Claude Code (en el PC de Nicolás) busca
 * en la Biblioteca de Anuncios de Meta y manda lo que encontró. La API de Meta
 * no entrega anuncios comerciales de Chile, por eso no lo hace el CRM.
 *
 * POST con x-ia-secret:
 * - { estado: "inicio" } → en la Oficina IA se ve a Ali - Anuncios trabajando.
 * - { anuncios: [...], resumen: "..." } → se guardan, se comparan y queda el informe del día.
 */
export async function POST(request: Request) {
  if (!secretoValido(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  let cuerpo: { estado?: string; anuncios?: AnuncioRecibido[]; resumen?: string | null };
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  if (cuerpo.estado === 'inicio') {
    anunciosEmpiezan();
    return NextResponse.json({ ok: true });
  }
  if (!Array.isArray(cuerpo.anuncios)) return NextResponse.json({ error: 'Falta anuncios (lista)' }, { status: 400 });
  if (cuerpo.anuncios.length > 1000) return NextResponse.json({ error: 'Demasiados anuncios' }, { status: 400 });
  try {
    const r = await guardarAnuncios(cuerpo.anuncios, typeof cuerpo.resumen === 'string' ? cuerpo.resumen.slice(0, 3000) : null);
    return NextResponse.json({ ok: true, ...r });
  } catch (error) {
    console.error('[investigacion] No se pudieron guardar los anuncios:', error);
    return NextResponse.json({ error: 'No se pudieron guardar los anuncios' }, { status: 500 });
  }
}
