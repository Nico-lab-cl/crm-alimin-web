import { NextResponse } from 'next/server';
import { esAgenteOficina, historialCompleto, leerRango, mensajesDeConversacion } from '@/lib/oficina_registro';

export const dynamic = 'force-dynamic';

/**
 * Historial de un agente para /agentes-ia/historial (con sesión del CRM).
 * ?agente=&desde=&hasta=&q=  → tareas, conversaciones e informes.
 * ?conversacion=<id>         → mensajes de esa conversación.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const conversacion = url.searchParams.get('conversacion');
    if (conversacion) {
      return NextResponse.json({ mensajes: await mensajesDeConversacion(conversacion.slice(0, 120)) });
    }
    const agente = url.searchParams.get('agente');
    if (!esAgenteOficina(agente)) return NextResponse.json({ error: 'Agente desconocido' }, { status: 400 });
    const rango = leerRango(url.searchParams.get('desde'), url.searchParams.get('hasta'));
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
    return NextResponse.json(await historialCompleto(agente, rango, q));
  } catch (error) {
    console.error('[agentes-ia] No se pudo leer el historial:', error);
    return NextResponse.json({ error: 'No se pudo leer el historial' }, { status: 500 });
  }
}
