/**
 * Avisos a la Oficina IA (Miniverse en EasyPanel, repo oficina-ia-alimin):
 * cuando el Calificador trabaja, su personaje camina al escritorio y dice lo
 * que encontró. Nunca datos de clientes: solo el canal y la señal.
 * Sin OFICINA_IA_URL no hace nada; nunca frena la pasada (2 s de timeout).
 */

const CANAL: Record<string, string> = { web: 'el chat web', instagram: 'Instagram', facebook: 'Facebook' };

function enviar(ruta: string, cuerpo: unknown) {
  const base = process.env.OFICINA_IA_URL?.replace(/\/+$/, '');
  const secreto = process.env.IA_SECRET;
  if (!base || !secreto) return;
  fetch(`${base}${ruta}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ia-secret': secreto },
    body: JSON.stringify(cuerpo),
    cache: 'no-store',
    signal: AbortSignal.timeout(2000),
  }).catch(() => {});
}

export function calificadorTrabaja(canal: string) {
  enviar('/api/heartbeat', {
    agent: 'calificador',
    name: 'Calificador',
    state: 'working',
    task: `Calificando una conversación de ${CANAL[canal] ?? canal}`,
  });
}

/** Lo más importante que encontró, para el globo del personaje. */
export function calificadorDice(c: { quiere_visitar: string; plazo_compra: string; tiene_pie: string; categoria: string }) {
  const mensaje =
    c.quiere_visitar === 'si'
      ? '+10 · quiere visitar'
      : c.plazo_compra === 'menos_de_3_meses'
        ? '+8 · compraría pronto'
        : c.categoria === 'calificado'
          ? '+6 · calificado'
          : c.tiene_pie === 'si'
            ? '+6 · tiene pie'
            : c.categoria === 'tibio'
              ? 'Lead tibio, sin señales nuevas'
              : 'Conversación sin datos para calificar';
  enviar('/api/act', { agent: 'calificador', action: { type: 'speak', message: mensaje } });
}

export function calificadorDescansa() {
  enviar('/api/heartbeat', { agent: 'calificador', name: 'Calificador', state: 'idle', task: null });
}
