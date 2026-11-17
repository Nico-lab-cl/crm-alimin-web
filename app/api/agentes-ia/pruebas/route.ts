import { NextResponse } from 'next/server';
import { listarPruebas, marcarRevisada, type FiltroPruebas } from '@/lib/ia_pruebas';

export const dynamic = 'force-dynamic';

/** GET ?asesor=Marcela&canal=instagram&ver=mal&dias=30 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const ver = q.get('ver');
  try {
    const datos = await listarPruebas({
      asesor: q.get('asesor') || undefined,
      canal: q.get('canal') || undefined,
      ver: ver === 'mal' || ver === 'pendientes' ? ver : 'todas',
      dias: Number(q.get('dias')) || 30,
    } satisfies FiltroPruebas);
    return NextResponse.json(datos);
  } catch (error) {
    console.error('[ia-pruebas] Error leyendo las pruebas:', error);
    return NextResponse.json({ error: 'No se pudieron leer las pruebas', pruebas: [], asesores: [] }, { status: 500 });
  }
}

/** PATCH { id, revisada } */
export async function PATCH(request: Request) {
  try {
    const { id, revisada } = (await request.json()) as { id?: string; revisada?: boolean };
    if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 });
    await marcarRevisada(id, Boolean(revisada));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[ia-pruebas] Error marcando revisada:', error);
    return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 500 });
  }
}
