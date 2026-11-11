import { NextResponse } from 'next/server';
import { configParaAgente, esAgente } from '@/lib/agentes_ia';
import { secretoValido } from '@/lib/ia_secreto';

export const dynamic = 'force-dynamic';

/**
 * Configuración de un agente para el sistema que lo corre (Ali en el sitio).
 * Solo trae el conocimiento aprobado. GET ?agente=atraccion con x-ia-secret.
 */
export async function GET(request: Request) {
  if (!secretoValido(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const agente = new URL(request.url).searchParams.get('agente') || '';
  if (!esAgente(agente)) return NextResponse.json({ error: 'Agente desconocido' }, { status: 400 });
  try {
    const config = await configParaAgente(agente);
    if (!config) return NextResponse.json({ error: 'Agente no encontrado' }, { status: 404 });
    return NextResponse.json(config);
  } catch (error) {
    console.error('[agentes-ia] No se pudo armar la config:', error);
    return NextResponse.json({ error: 'No se pudo leer la configuración' }, { status: 500 });
  }
}
