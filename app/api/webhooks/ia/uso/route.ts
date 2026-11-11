import { NextResponse } from 'next/server';
import { registrarUso, type Uso } from '@/lib/agentes_ia';
import { secretoValido } from '@/lib/ia_secreto';

export const dynamic = 'force-dynamic';

/**
 * Una llamada a Claude hecha por otro sistema (Ali, respuesta automática).
 * Body: { agente, canal, conversacion_id, modelo, input_tokens, output_tokens,
 * cache_read_input_tokens, cache_creation_input_tokens } con x-ia-secret.
 */
export async function POST(request: Request) {
  if (!secretoValido(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  let uso: Uso;
  try {
    uso = (await request.json()) as Uso;
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  if (!uso?.agente || !uso?.modelo) return NextResponse.json({ error: 'Faltan agente o modelo' }, { status: 400 });
  try {
    const costo_usd = await registrarUso(uso);
    return NextResponse.json({ ok: true, costo_usd });
  } catch (error) {
    console.error('[agentes-ia] No se pudo registrar el uso:', error);
    return NextResponse.json({ error: 'No se pudo registrar' }, { status: 500 });
  }
}
