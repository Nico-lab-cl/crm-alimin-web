import { NextResponse } from 'next/server';
import { correrRevision, leerRevision, marcarEstado, revisionEnCurso, type EstadoError } from '@/lib/revision_ali';

export const dynamic = 'force-dynamic';

/** GET ?semana=YYYY-MM-DD → la revisión de esa semana (o la última). */
export async function GET(request: Request) {
  try {
    const semana = new URL(request.url).searchParams.get('semana') || undefined;
    return NextResponse.json(await leerRevision(semana));
  } catch (error) {
    console.error('[revision-ali] Error leyendo la revisión:', error);
    return NextResponse.json({ error: 'No se pudo leer la revisión', semanas: [], filas: [] }, { status: 500 });
  }
}

/**
 * POST → corre la revisión ahora (sin esperar al lunes). Corre en segundo
 * plano porque puede tardar varios minutos; el panel consulta GET hasta que
 * enCurso vuelva a false.
 */
export async function POST() {
  if (revisionEnCurso()) return NextResponse.json({ ok: true, enCurso: true });
  correrRevision()
    .then((r) => console.log(`[revision-ali] Manual, semana ${r.semana}: ${r.revisadas} revisadas, ${r.conErrores} con errores${r.motivo ? ` (${r.motivo})` : ''}.`))
    .catch((error) => console.error('[revision-ali] Falló la revisión manual:', error));
  return NextResponse.json({ ok: true, enCurso: true });
}

/** PATCH { id, estado: 'real' | 'falso' | 'pendiente' } */
export async function PATCH(request: Request) {
  try {
    const { id, estado } = (await request.json()) as { id?: number; estado?: EstadoError };
    if (!id || !estado) return NextResponse.json({ error: 'Faltan id o estado' }, { status: 400 });
    await marcarEstado(Number(id), estado);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[revision-ali] Error marcando:', error);
    return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 500 });
  }
}
