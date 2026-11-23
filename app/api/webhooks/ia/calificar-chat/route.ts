import { NextResponse } from 'next/server';
import { secretoValido } from '@/lib/ia_secreto';
import { entregarVotos, recibirCalificacion } from '@/lib/calificar_chat';

export const dynamic = 'force-dynamic';

/**
 * 👍/👎 sobre una respuesta de Ali desde el chat del CRM móvil. Lo manda el
 * CRM móvil (x-ia-secret) con el nombre del asesor de la sesión.
 * POST { conversationId, messageId, voto: 'bien' | 'mal' | null, correccion?, asesor }
 * GET ?conversationId=… → { votos }
 */
export async function POST(request: Request) {
  if (!secretoValido(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  return recibirCalificacion(request);
}

export async function GET(request: Request) {
  if (!secretoValido(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  return entregarVotos(request);
}
