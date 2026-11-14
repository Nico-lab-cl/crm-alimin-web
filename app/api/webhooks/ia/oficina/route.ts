import { NextResponse } from 'next/server';
import { secretoValido } from '@/lib/ia_secreto';
import { esAgenteOficina, historialOficina, leerRango, registrarEnOficina } from '@/lib/oficina_registro';

export const dynamic = 'force-dynamic';

/**
 * Lo llama el servidor de la Oficina IA (repo oficina-ia-alimin) con x-ia-secret.
 * POST { agente, tipo: "tarea" | "dijo", texto }: guarda una tarea.
 * GET ?agente=&desde=&hasta=&q=: tareas y conteos, sin datos de clientes.
 */
export async function POST(request: Request) {
  if (!secretoValido(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  let body: { agente?: unknown; tipo?: unknown; texto?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  if (!esAgenteOficina(body.agente) || (body.tipo !== 'tarea' && body.tipo !== 'dijo') || typeof body.texto !== 'string') {
    return NextResponse.json({ error: 'Faltan agente, tipo o texto' }, { status: 400 });
  }
  try {
    await registrarEnOficina(body.agente, body.tipo, body.texto);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[oficina] No se pudo guardar la tarea:', error);
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!secretoValido(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const url = new URL(request.url);
  const agente = url.searchParams.get('agente');
  if (!esAgenteOficina(agente)) return NextResponse.json({ error: 'Agente desconocido' }, { status: 400 });
  try {
    const rango = leerRango(url.searchParams.get('desde'), url.searchParams.get('hasta'));
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
    return NextResponse.json(await historialOficina(agente, rango, q));
  } catch (error) {
    console.error('[oficina] No se pudo leer el historial:', error);
    return NextResponse.json({ error: 'No se pudo leer el historial' }, { status: 500 });
  }
}
