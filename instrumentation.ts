/**
 * Temporizadores internos del CRM web: recalcula el lead score cada 15 minutos
 * y avanza las secuencias de correo cada 5.
 *
 * Va dentro del proceso por lo mismo que en el CRM móvil: si el CRM está
 * arriba, el cálculo está arriba, sin un agendador externo que se pueda caer
 * en silencio. Los avisos a los asesores no salen de acá: los manda el CRM
 * móvil leyendo public.lead_score.
 */

import type { ResultadoPasada } from './lib/email_sequences';

const CADA_MS = 15 * 60 * 1000;
/** La primera pasada espera a que el servidor termine de arrancar. */
const PRIMERA_PASADA_MS = 60 * 1000;

export async function register() {
  // El import va dentro del if en positivo: así el build de edge descarta el
  // bloque entero y no intenta empaquetar 'pg'.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const global_ = globalThis as { __leadScoreTimer?: boolean };
    if (global_.__leadScoreTimer) return;
    global_.__leadScoreTimer = true;

    if (process.env.SECUENCIAS_DESACTIVADAS === 'true') {
      console.log('[secuencias] Desactivadas por SECUENCIAS_DESACTIVADAS.');
    } else {
      const { pasadaSinSolapar } = await import('./lib/email_sequences');
      iniciarSecuencias(pasadaSinSolapar);
    }

    if (process.env.LEAD_SCORE_DESACTIVADO === 'true') {
      console.log('[lead-score] Desactivado por LEAD_SCORE_DESACTIVADO.');
      return;
    }

    const { recalcularSinSolapar } = await import('./lib/lead_score');

    const pasada = async () => {
      try {
        const r = await recalcularSinSolapar();
        console.log(
          `[lead-score] ${r.leads} leads: ${r.bandas.CALIENTE} calientes, ${r.bandas.TIBIO} tibios, ${r.bandas.TEMPLADO} templados, ${r.bandas.FRIO} fríos (${r.ms} ms).`
        );
      } catch (error) {
        // Nunca se relanza: mataría el temporizador hasta el próximo reinicio.
        console.error('[lead-score] Falló el recálculo:', error);
      }
    };

    setTimeout(pasada, PRIMERA_PASADA_MS).unref?.();
    setInterval(pasada, CADA_MS).unref?.();
    console.log('[lead-score] Recálculo activo: una pasada cada 15 minutos.');
  }
}

const SECUENCIAS_CADA_MS = 5 * 60 * 1000;

/**
 * Secuencias de nutrición. Mismo criterio que el lead score: dentro del
 * proceso. Cada secuencia nace apagada; sin ninguna encendida la pasada no
 * hace nada. Recibe la pasada ya importada para que el import quede dentro
 * del if de nodejs.
 */
function iniciarSecuencias(pasadaSinSolapar: () => Promise<ResultadoPasada>) {
  const pasada = async () => {
    try {
      const r = await pasadaSinSolapar();
      if (r.activas > 0) {
        console.log(
          `[secuencias] ${r.activas} activas: ${r.inscritos} inscritos, ${r.salidas} salidas, ${r.enviados} enviados, ${r.corridos} corridos (${r.ms} ms).`
        );
      }
    } catch (error) {
      // Nunca se relanza: mataría el temporizador hasta el próximo reinicio.
      console.error('[secuencias] Falló la pasada:', error);
    }
  };

  setTimeout(pasada, PRIMERA_PASADA_MS * 2).unref?.();
  setInterval(pasada, SECUENCIAS_CADA_MS).unref?.();
  console.log('[secuencias] Temporizador activo: una pasada cada 5 minutos.');
}
