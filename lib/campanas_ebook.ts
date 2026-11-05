/**
 * Masivos de los dos ebooks de aliminspa.cl y lanzador de masivos programados.
 *
 * Los correos son los que diseñó el equipo en el panel ("Ebook dudas" y
 * "Ebook antes de elgir un terreno", 31-10-2026): una sola imagen con el botón
 * "Descarga la guía gratuita" dibujado. Venían sin enlace, así que aquí se le
 * pone a la imagen (en el HTML y en el diseño de Unlayer, para que el editor
 * lo muestre igual), con texto alternativo y preheader.
 *
 * El enlace va directo al PDF: quien recibe el correo ya es lead y no tiene
 * que volver a llenar el formulario. El clic queda en campaign_logs (y
 * dispara la secuencia "Volvió a interesarse"). La página con formulario
 * queda para el sitio, el popup y los anuncios.
 *
 * Las mismas campañas son el paso "ebook" de las secuencias de nutrición:
 * comparten campaign_id, así que quien ya lo recibió por el masivo no lo
 * vuelve a recibir (batch_engine excluye a quien tiene log de la campaña y
 * email_sequences salta el paso).
 *
 * Masivos programados: columnas programado_* en campaigns y una revisión cada
 * minuto (instrumentation.ts). Solo se lanza entre las 8:00 y las 22:00 de
 * Chile; si el CRM estuvo abajo y se pasó la hora, se corre a las 10:00 del
 * día siguiente en vez de escribirle a la base de madrugada.
 */

import { queryMarketing } from './db';
import { startBatchExecution } from './batch_engine';

const ZONA = 'America/Santiago';
const SITIO = 'https://aliminspa.cl';

export type ClaveEbook = 'preguntas-frecuentes' | 'terreno-urbano-o-parcela-rural';

interface CampanaEbook {
  /** id de la campaña que diseñó el equipo en el panel. */
  id: string;
  /** El PDF. */
  url: string;
  alt: string;
  preheader: string;
  /** Primera programación del masivo (hora de Chile, UTC-3 en noviembre). */
  programadoPara: string;
}

/**
 * Pedido del 05-11-2026: el de dudas ese mismo día y el de uso de suelo el
 * sábado 07-11. La programación se pone una sola vez; si después se cambia
 * en la base, manda lo de la base.
 */
export const CAMPANAS_EBOOK: Record<ClaveEbook, CampanaEbook> = {
  'preguntas-frecuentes': {
    id: 'a842a432-f913-4fbd-8fd9-d9b2352b3c2d',
    url: `${SITIO}/ebooks/pdf/preguntas-frecuentes.pdf`,
    alt: 'Guía gratuita: las preguntas que todos nos hacen. Precio, construcción, formas de pago, entrega y ubicación. Descarga la guía gratuita.',
    preheader: 'Precio, formas de pago, construcción, entrega y más. Descarga la guía gratis.',
    programadoPara: '2026-11-05T20:45:00-03:00',
  },
  'terreno-urbano-o-parcela-rural': {
    id: '69629228-6823-49cb-9dee-eec418ae1052',
    url: `${SITIO}/ebooks/pdf/terreno-urbano-o-parcela-rural.pdf`,
    alt: 'Guía gratuita: antes de elegir un terreno, ¿sabes realmente qué estás adquiriendo? Uso de suelo, rol propio y checklist. Descarga la guía gratuita.',
    preheader: 'Uso de suelo, rol propio y qué revisar antes de comprar. Descarga la guía gratis.',
    programadoPara: '2026-11-07T10:00:00-03:00',
  },
};

function escAttr(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Envuelve cada <img> que no esté ya dentro de un enlace y le pone alt. */
export function enlazarImagenes(html: string, url: string, alt: string): string {
  const partes = html.split(/(<img\b[^>]*>)/i);
  let dentroDeEnlace = false;
  return partes
    .map((p) => {
      if (!/^<img\b/i.test(p)) {
        // Lo que quede abierto al final de este tramo decide si la imagen ya va enlazada.
        const abre = p.lastIndexOf('<a ');
        const cierra = p.lastIndexOf('</a>');
        if (abre !== -1 || cierra !== -1) dentroDeEnlace = abre > cierra;
        return p;
      }
      let img = p.replace(/\salt=(["'])[^"']*\1/i, '');
      img = img.replace(/^<img\b/i, `<img alt="${escAttr(alt)}"`);
      return dentroDeEnlace ? img : `<a href="${url}" target="_blank" style="display:block;">${img}</a>`;
    })
    .join('');
}

/** Lo mismo en el diseño de Unlayer: acción web de la imagen, alt y preheader. */
function ajustarDiseno(diseno: unknown, url: string, alt: string, preheader: string): unknown {
  if (!diseno || typeof diseno !== 'object') return diseno;
  const d = JSON.parse(JSON.stringify(diseno));
  const visitar = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    const o = n as Record<string, unknown>;
    if (o.type === 'image' && o.values && typeof o.values === 'object') {
      const v = o.values as Record<string, unknown>;
      v.action = { name: 'web', values: { href: url, target: '_blank' } };
      v.altText = alt;
    }
    Object.values(o).forEach(visitar);
  };
  visitar(d);
  if (d.body?.values && !d.body.values.preheaderText) d.body.values.preheaderText = preheader;
  return d;
}

let listo: Promise<Record<ClaveEbook, string>> | null = null;

async function preparar(): Promise<Record<ClaveEbook, string>> {
  await queryMarketing(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS programado_para TIMESTAMPTZ`);
  await queryMarketing(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS programado_estado TEXT`);
  await queryMarketing(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS programado_detalle TEXT`);

  const ids = {} as Record<ClaveEbook, string>;
  for (const clave of Object.keys(CAMPANAS_EBOOK) as ClaveEbook[]) {
    const c = CAMPANAS_EBOOK[clave];
    ids[clave] = c.id;
    const res = await queryMarketing(
      `SELECT html_content, mjml_content, programado_estado FROM campaigns WHERE id = $1`,
      [c.id]
    );
    const fila = res.rows[0];
    if (!fila) {
      console.error(`[masivos] No está la campaña ${c.id} del ebook ${clave}.`);
      continue;
    }
    // Enlace: solo si el correo todavía no lleva al PDF. Si llevaba a la
    // página del ebook (primera versión), se cambia por el PDF.
    if (!String(fila.html_content || '').includes(c.url)) {
      fila.html_content = String(fila.html_content || '')
        .split(`${SITIO}/ebooks/${clave}"`)
        .join(`${c.url}"`);
      const diseno = typeof fila.mjml_content === 'string' ? JSON.parse(fila.mjml_content) : fila.mjml_content;
      const nuevoDiseno = ajustarDiseno(diseno, c.url, c.alt, c.preheader);
      await queryMarketing(
        `UPDATE campaigns SET html_content = $2, mjml_content = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [
          c.id,
          enlazarImagenes(fila.html_content, c.url, c.alt),
          typeof fila.mjml_content === 'string' ? JSON.stringify(nuevoDiseno) : nuevoDiseno,
        ]
      );
      console.log(`[masivos] Enlace a ${c.url} puesto en la campaña del ebook ${clave}.`);
    }
    if (!fila.programado_estado) {
      await queryMarketing(
        `UPDATE campaigns SET programado_para = $2, programado_estado = 'PENDIENTE' WHERE id = $1 AND programado_estado IS NULL`,
        [c.id, c.programadoPara]
      );
      console.log(`[masivos] Ebook ${clave} programado para ${c.programadoPara}.`);
    }
  }
  return ids;
}

/** Deja listas (una vez por proceso) las dos campañas de ebook y devuelve sus id. */
export function asegurarCampanasEbook(): Promise<Record<ClaveEbook, string>> {
  if (!listo) {
    listo = preparar().catch((e) => {
      listo = null;
      throw e;
    });
  }
  return listo;
}

// ---------------------------------------------------------------------------
// Lanzador de masivos programados
// ---------------------------------------------------------------------------

function horaChile(fecha: Date): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: ZONA, hour: 'numeric', hourCycle: 'h23' }).formatToParts(fecha);
  return Number(p.find((x) => x.type === 'hour')?.value || 0);
}

/** 10:00 de Chile del día siguiente. */
function mananaALas10(ahora: Date): Date {
  let t = new Date(ahora.getTime() + 3600 * 1000);
  // Avanza de a 30 minutos hasta caer a las 10 de un día posterior.
  for (let i = 0; i < 96 && !(horaChile(t) === 10 && t.getTime() - ahora.getTime() > 6 * 3600 * 1000); i++) {
    t = new Date(t.getTime() + 30 * 60 * 1000);
  }
  t.setUTCMinutes(0, 0, 0);
  return t;
}

export async function lanzarProgramados(): Promise<void> {
  await asegurarCampanasEbook();
  const vencidas = await queryMarketing(
    `SELECT id, title FROM campaigns WHERE programado_estado = 'PENDIENTE' AND programado_para <= now()`
  );
  for (const c of vencidas.rows) {
    const ahora = new Date();
    const h = horaChile(ahora);
    if (h < 8 || h >= 22) {
      const nueva = mananaALas10(ahora);
      await queryMarketing(`UPDATE campaigns SET programado_para = $2, programado_detalle = $3 WHERE id = $1`, [
        c.id,
        nueva,
        `Fuera de horario: corrido a ${nueva.toISOString()}`,
      ]);
      console.log(`[masivos] "${c.title}" fuera de horario: se corre a ${nueva.toISOString()}.`);
      continue;
    }
    // Se toma la campaña antes de lanzar: otra revisión no la vuelve a tomar.
    const tomada = await queryMarketing(
      `UPDATE campaigns SET programado_estado = 'LANZANDO' WHERE id = $1 AND programado_estado = 'PENDIENTE' RETURNING id`,
      [c.id]
    );
    if (!tomada.rowCount) continue;
    try {
      const r = await startBatchExecution({ campaignId: c.id, excluirNoNutribles: true, batchSize: 50, delayMs: 5000 });
      await queryMarketing(
        `UPDATE campaigns SET programado_estado = 'LANZADA', programado_detalle = $2 WHERE id = $1`,
        [c.id, `Job ${r.jobId}: ${r.willSend} de ${r.totalLeads} leads`]
      );
      console.log(`[masivos] "${c.title}" lanzada: ${r.willSend} de ${r.totalLeads} leads (job ${r.jobId}).`);
    } catch (error) {
      await queryMarketing(`UPDATE campaigns SET programado_estado = 'FALLO', programado_detalle = $2 WHERE id = $1`, [
        c.id,
        (error as Error).message,
      ]);
      console.error(`[masivos] "${c.title}" no se pudo lanzar:`, error);
    }
  }
}
