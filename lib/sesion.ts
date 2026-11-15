/**
 * Sesión del CRM web firmada (revisión Elephant Goldfish, 15-11-2026).
 *
 * Antes la cookie valía siempre "authenticated": cualquiera que la inventara
 * entraba al CRM y podía cambiar las instrucciones de Ali desde Agentes IA.
 * Ahora la cookie lleva su vencimiento firmado con HMAC-SHA256 y una clave
 * del servidor. Usa Web Crypto para funcionar igual en el middleware (edge) y
 * en las rutas (Node 20).
 *
 * Clave: SESSION_SECRET; si no está, ADMIN_PASSWORD o IA_SECRET (así no hace
 * falta una variable nueva para implementar). Sin ninguna, nadie entra.
 * Cambiar la clave cierra todas las sesiones.
 */

export const COOKIE_SESION = 'crm_auth_session';
export const DURACION_SESION_S = 60 * 60 * 24 * 7;
const VERSION = 'v1';

function clave() {
  return process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || process.env.IA_SECRET || '';
}

async function firmar(texto: string, secreto: string) {
  const enc = new TextEncoder();
  const llave = await crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const firma = new Uint8Array(await crypto.subtle.sign('HMAC', llave, enc.encode(texto)));
  return Array.from(firma, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compara sin cortar en el primer carácter distinto. */
function iguales(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

/** Valor de la cookie para una sesión nueva, o null si el servidor no tiene clave. */
export async function crearSesion(): Promise<string | null> {
  const secreto = clave();
  if (!secreto) return null;
  const vence = Date.now() + DURACION_SESION_S * 1000;
  const cuerpo = `${VERSION}.${vence}`;
  return `${cuerpo}.${await firmar(cuerpo, secreto)}`;
}

export async function sesionValida(valor: string | undefined | null): Promise<boolean> {
  const secreto = clave();
  if (!secreto || !valor) return false;
  const partes = valor.split('.');
  if (partes.length !== 3 || partes[0] !== VERSION) return false;
  const vence = Number(partes[1]);
  if (!Number.isFinite(vence) || vence < Date.now()) return false;
  return iguales(partes[2], await firmar(`${partes[0]}.${partes[1]}`, secreto));
}
