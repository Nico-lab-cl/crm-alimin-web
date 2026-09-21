/**
 * Estados del lead: una sola forma canónica.
 *
 * La columna "Lead"."status" la comparten el CRM móvil (crm-aliminv2) y este
 * CRM web. El móvil filtra con Prisma usando igualdad exacta, así que la
 * capitalización no es cosmética: un lead guardado como 'Contactado' no aparece
 * en su filtro 'CONTACTADO'. La forma canónica es MAYÚSCULAS, que es lo que el
 * móvil escribe desde siempre.
 *
 * De acá sale todo lo que este repo escriba en esa columna. Para leer no hace
 * falta: todas las consultas del repo comparan con ILIKE.
 */

export const LEAD_STATUSES = ['NUEVO', 'CONTACTADO', 'VISITA', 'RESERVADO'] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const ESTADO_INICIAL: string = 'NUEVO';

/**
 * Etapas del pipeline que implican que alguien ya habló con el cliente.
 *
 * Se usa para acoplar la etapa con la marca de atención (Lead.contacted): pasar
 * un lead a VISITA sin pasar por CONTACTADO no puede dejarlo figurando como no
 * atendido, porque los recordatorios de seguimiento del móvil seguirían
 * sonándole al asesor por un lead que ya fue a ver el terreno.
 */
export const ETAPAS_YA_CONTACTADO: readonly string[] = ['CONTACTADO', 'VISITA', 'RESERVADO'];

/**
 * Lleva cualquier variante a la forma canónica.
 *
 * Acepta lo que venga: 'Contactado', ' contactado ', 'CONTACTADO'. Un valor que
 * no reconoce lo devuelve igual pero en mayúsculas, sin inventar nada: si un
 * import viejo dejó 'PERDIDO', se respeta.
 */
export function normalizeStatus(value: unknown): string {
  if (typeof value !== 'string') return ESTADO_INICIAL;
  const limpio = value.trim().toUpperCase();
  return limpio === '' ? ESTADO_INICIAL : limpio;
}

/**
 * Etiqueta legible para la interfaz.
 *
 * En la base van en mayúsculas; en pantalla 'CONTACTADO' grita. Se muestra
 * 'Contactado'.
 */
export function statusLabel(value: unknown): string {
  const canonico = normalizeStatus(value);
  return canonico.charAt(0) + canonico.slice(1).toLowerCase();
}

/**
 * Compara dos estados sin que la capitalización importe.
 *
 * Existe porque durante un tiempo van a convivir en memoria valores que vienen
 * de la base ya normalizados y valores capitalizados que quedaron en segmentos
 * guardados o en URLs viejas.
 */
export function sameStatus(a: unknown, b: unknown): boolean {
  return normalizeStatus(a) === normalizeStatus(b);
}

/**
 * ¿Esta etapa implica que el lead ya fue atendido?
 */
export function implicaContacto(value: unknown): boolean {
  return ETAPAS_YA_CONTACTADO.includes(normalizeStatus(value));
}
