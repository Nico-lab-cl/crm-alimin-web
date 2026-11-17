import { NextResponse } from 'next/server';
import { secretoValido } from '@/lib/ia_secreto';
import { guardarPrueba, validarPrueba } from '@/lib/ia_pruebas';

export const dynamic = 'force-dynamic';

/**
 * Conversación de prueba con Ali desde aliminspa.cl/probar-ali, con el
 * feedback del asesor. La manda el sitio (x-ia-secret), completa, cada vez que
 * cambia: { id, asesor, canal, mensajes: [{ de, texto, voto?, correccion? }], nota }.
 */
export async function POST(request: Request) {
  if (!secretoValido(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const prueba = validarPrueba(json);
  if (!prueba) return NextResponse.json({ error: 'La prueba no calza con el formato' }, { status: 400 });
  try {
    await guardarPrueba(prueba);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[ia-pruebas] No se pudo guardar:', error);
    return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 });
  }
}
