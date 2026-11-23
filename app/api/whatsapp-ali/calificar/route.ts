import { entregarVotos, recibirCalificacion } from '@/lib/calificar_chat';

export const dynamic = 'force-dynamic';

/**
 * 👍/👎 sobre una respuesta de Ali desde la bandeja WhatsApp Ali.
 * POST { conversationId, messageId, voto: 'bien' | 'mal' | null, correccion?, asesor }
 * GET ?conversationId=… → { votos }
 */
export const POST = recibirCalificacion;
export const GET = entregarVotos;
