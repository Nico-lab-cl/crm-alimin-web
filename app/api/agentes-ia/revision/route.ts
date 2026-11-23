import { NextResponse } from 'next/server';
import {
  correrRevision,
  crearCasoDesdeRevision,
  crearReglaDesdeRevision,
  leerRevision,
  marcarEstado,
  proponerRegla,
  revisionEnCurso,
  type EstadoError,
} from '@/lib/revision_ali';

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
 * POST { accion: 'correr' | 'rehacer' } → corre la revisión ahora, en segundo
 * plano (puede tardar varios minutos; el panel consulta GET hasta que enCurso
 * vuelva a false). "rehacer" revisa todo de nuevo con la ficha actual de Ali.
 *
 * POST { accion: 'caso', id, debe: string[] } → convierte un error real en caso
 * de prueba.
 *
 * POST { accion: 'proponer_regla', id } → el juez propone una regla general
 * para que Ali no repita el error (no guarda nada).
 * POST { accion: 'regla', id, regla: { tema, como_lo_dice, respuesta, aprobar } }
 * → la guarda en el conocimiento de Ali (aprobada si `aprobar`).
 */
export async function POST(request: Request) {
  const cuerpo = (await request.json().catch(() => ({}))) as {
    accion?: string;
    id?: number;
    debe?: string[];
    regla?: { tema: string; como_lo_dice?: string | null; respuesta: string; aprobar?: boolean };
  };

  if (cuerpo.accion === 'proponer_regla') {
    try {
      if (!cuerpo.id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 });
      return NextResponse.json({ ok: true, propuesta: await proponerRegla(Number(cuerpo.id)) });
    } catch (error) {
      console.error('[revision-ali] No se pudo proponer la regla:', error);
      return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo proponer la regla' }, { status: 400 });
    }
  }

  if (cuerpo.accion === 'regla') {
    try {
      if (!cuerpo.id || !cuerpo.regla) return NextResponse.json({ error: 'Faltan id o regla' }, { status: 400 });
      const regla = await crearReglaDesdeRevision(Number(cuerpo.id), cuerpo.regla);
      return NextResponse.json({ ok: true, regla });
    } catch (error) {
      console.error('[revision-ali] No se pudo crear la regla:', error);
      return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo crear la regla' }, { status: 400 });
    }
  }

  if (cuerpo.accion === 'caso') {
    try {
      if (!cuerpo.id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 });
      const caso = await crearCasoDesdeRevision(Number(cuerpo.id), Array.isArray(cuerpo.debe) ? cuerpo.debe : []);
      return NextResponse.json({ ok: true, caso });
    } catch (error) {
      console.error('[revision-ali] No se pudo crear el caso:', error);
      return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo crear el caso' }, { status: 400 });
    }
  }

  if (revisionEnCurso()) return NextResponse.json({ ok: true, enCurso: true });
  const rehacer = cuerpo.accion === 'rehacer';
  correrRevision({ rehacer })
    .then((r) =>
      console.log(
        `[revision-ali] ${rehacer ? 'Rehecha' : 'Manual'}, semana ${r.semana}: ${r.revisadas} revisadas, ${r.conErrores} con errores${r.motivo ? ` (${r.motivo})` : ''}.`
      )
    )
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
