import { timingSafeEqual } from 'crypto';

/**
 * Los webhooks de /api/webhooks/ia los llaman el sitio y el CRM móvil, no una
 * persona: no pasan por la cookie de sesión (ver middleware.ts) y se protegen
 * con el header x-ia-secret = IA_SECRET. Sin IA_SECRET configurado quedan
 * cerrados.
 */
export function secretoValido(request: Request): boolean {
  const esperado = process.env.IA_SECRET;
  const recibido = request.headers.get('x-ia-secret');
  if (!esperado || !recibido) return false;
  const a = Buffer.from(esperado);
  const b = Buffer.from(recibido);
  return a.length === b.length && timingSafeEqual(a, b);
}
