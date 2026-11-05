/**
 * Correos de los dos ebooks de aliminspa.cl y masivos programados.
 *
 * Los mismos dos diseños sirven para el masivo y para el paso "ebook" de las
 * secuencias de nutrición: comparten campaign_id, así que quien ya lo recibió
 * por un lado no lo vuelve a recibir por el otro (batch_engine excluye a los
 * que ya tienen log de la campaña y email_sequences salta el paso).
 *
 * El botón lleva a la página del ebook y no al PDF: ahí la descarga queda
 * registrada, se pide el consentimiento y la persona entra a su secuencia.
 *
 * Masivos programados: columnas programado_* en campaigns y una revisión cada
 * minuto (instrumentation.ts). Solo se lanza entre las 8:00 y las 22:00 de
 * Chile; si el CRM estuvo abajo y se pasó la hora, se corre a las 10:00 del
 * día siguiente en vez de escribirle a la base de madrugada.
 */

import { queryMarketing } from './db';
import { startBatchExecution } from './batch_engine';

const ZONA = 'America/Santiago';
const APP = 'https://marketing.aliminspa.cl';
const SITIO = 'https://aliminspa.cl';

export type ClaveEbook = 'preguntas-frecuentes' | 'terreno-urbano-o-parcela-rural';

interface DisenoEbook {
  /** campaigns.name: identifica la campaña sembrada (no se repite). */
  nombreInterno: string;
  titulo: string;
  asunto: string;
  preheader: string;
  imagen: string;
  imagenAlt: string;
  antetitulo: string;
  tituloGuia: string;
  intro: string;
  puntos: string[];
  url: string;
}

export const DISENOS_EBOOK: Record<ClaveEbook, DisenoEbook> = {
  'preguntas-frecuentes': {
    nombreInterno: 'ebook-preguntas-frecuentes',
    titulo: 'Ebook · Las preguntas que todos nos hacen',
    asunto: 'Lo que todos nos preguntan antes de comprar un terreno',
    preheader: 'Precio, cómo se paga, DICOM, construir y visitas. Descarga la guía gratis.',
    imagen: `${APP}/img/ebook-preguntas.jpg`,
    imagenAlt: 'Terrenos urbanizados en El Tabo',
    antetitulo: 'Guía gratis',
    tituloGuia: 'Las preguntas que todos nos hacen',
    intro:
      'Juntamos en una guía corta las respuestas a lo que más nos preguntan antes de comprar un terreno. Para que decidas con toda la información a mano.',
    puntos: [
      '¿Cuánto cuesta un terreno y cómo se paga?',
      '¿Se puede construir y cuándo me lo entregan?',
      '¿Me sirve si estoy en DICOM?',
      '¿Qué necesito para comprar y puedo visitar antes?',
    ],
    url: `${SITIO}/ebooks/preguntas-frecuentes`,
  },
  'terreno-urbano-o-parcela-rural': {
    nombreInterno: 'ebook-terreno-urbano-o-parcela-rural',
    titulo: 'Ebook · Terreno urbano o parcela rural',
    asunto: '¿Terreno urbano o parcela rural? La diferencia que cambia el precio',
    preheader: 'Qué es el rol propio y qué revisar antes de pagar. Descarga la guía gratis.',
    imagen: `${APP}/img/ebook-terreno-urbano.jpg`,
    imagenAlt: 'Vista aérea de terrenos en el litoral central',
    antetitulo: 'Guía gratis',
    tituloGuia: 'Terreno urbano o parcela rural',
    intro:
      'Antes de mirar el precio, conviene saber qué estás comprando. En esta guía te explicamos por qué no cuestan lo mismo y qué revisar antes de pagar por cualquier terreno.',
    puntos: [
      'Los tres tipos de suelo en Chile y qué permite cada uno',
      'Qué es el rol propio y por qué tienes que pedirlo primero',
      'Los riesgos de comprar un porcentaje y no un terreno',
      'Una lista de seis documentos y pasos antes de pagar',
    ],
    url: `${SITIO}/ebooks/terreno-urbano-o-parcela-rural`,
  },
};

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** HTML de correo: tablas, estilos en línea y ancho 600, como pide Outlook. */
export function htmlEbook(d: DisenoEbook): string {
  const verde = '#2d544c';
  const borde = '#cfe0d6';
  const texto = '#33475b';
  const puntos = d.puntos
    .map(
      (p) => `<tr><td valign="top" style="padding:0 10px 10px 0;color:${verde};font-size:18px;line-height:22px;">&#10003;</td>
        <td style="padding:0 0 10px;font-size:16px;line-height:22px;color:${texto};">${esc(p)}</td></tr>`
    )
    .join('');
  const boton = (texto_: string) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
      <td align="center" bgcolor="${verde}" style="border-radius:8px;">
        <a href="${d.url}" target="_blank" style="display:inline-block;padding:15px 34px;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">${texto_}</a>
      </td></tr></table>`;

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.tituloGuia)}</title></head>
<body style="margin:0;padding:0;background:#f2f4f3;">
<!-- PREHEADER --><div style="display:none;font-size:1px;color:#f2f4f3;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(d.preheader)}${'&#847;&zwnj;&nbsp;'.repeat(60)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f4f3;">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${borde};border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
    <tr><td align="center" style="padding:22px 24px 14px;">
      <a href="${SITIO}" target="_blank"><img src="${APP}/img/logo-alimin-correo.png" alt="Alimin Inmobiliaria" width="170" style="display:block;width:170px;max-width:170px;height:auto;border:0;"></a>
    </td></tr>
    <tr><td>
      <a href="${d.url}" target="_blank"><img src="${d.imagen}" alt="${esc(d.imagenAlt)}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></a>
    </td></tr>
    <tr><td style="padding:28px 32px 8px;">
      <p style="margin:0 0 8px;font-size:13px;letter-spacing:1px;text-transform:uppercase;font-weight:bold;color:${verde};">${esc(d.antetitulo)}</p>
      <h1 style="margin:0 0 14px;font-size:26px;line-height:32px;color:#1f2d2a;">${esc(d.tituloGuia)}</h1>
      <p style="margin:0 0 20px;font-size:16px;line-height:24px;color:${texto};">${esc(d.intro)}</p>
      <p style="margin:0 0 12px;font-size:16px;font-weight:bold;color:#1f2d2a;">Lo que vas a encontrar:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0">${puntos}</table>
    </td></tr>
    <tr><td align="center" style="padding:18px 32px 30px;">
      ${boton('Descargar el ebook')}
      <p style="margin:14px 0 0;font-size:13px;color:#6b7c78;">Es gratis. Lo descargas en aliminspa.cl.</p>
    </td></tr>
    <tr><td style="padding:0 32px;"><div style="border-top:1px solid ${borde};height:1px;line-height:1px;font-size:1px;">&nbsp;</div></td></tr>
    <tr><td align="center" style="padding:22px 32px 28px;">
      <p style="margin:0 0 12px;font-size:15px;line-height:22px;color:${texto};">¿Prefieres verlo en persona? Te mostramos los terrenos en El Tabo.</p>
      <a href="${SITIO}/agendar-visita" target="_blank" style="font-size:15px;font-weight:bold;color:${verde};text-decoration:underline;">Agendar una visita</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Siembra de las campañas y la programación
// ---------------------------------------------------------------------------

/**
 * Masivos de los ebooks pedidos el 05-11-2026: el de preguntas ese mismo día y
 * el de uso de suelo el sábado 07-11. Horas en Chile (UTC-3 en noviembre).
 * Si la campaña ya existe no se toca: lo que se cambie en el panel manda.
 */
const PROGRAMACION_INICIAL: Record<ClaveEbook, string> = {
  'preguntas-frecuentes': '2026-11-05T20:45:00-03:00',
  'terreno-urbano-o-parcela-rural': '2026-11-07T10:00:00-03:00',
};

let listo: Promise<Record<ClaveEbook, string>> | null = null;

async function sembrar(): Promise<Record<ClaveEbook, string>> {
  await queryMarketing(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS programado_para TIMESTAMPTZ`);
  await queryMarketing(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS programado_estado TEXT`);
  await queryMarketing(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS programado_detalle TEXT`);

  const ids = {} as Record<ClaveEbook, string>;
  for (const clave of Object.keys(DISENOS_EBOOK) as ClaveEbook[]) {
    const d = DISENOS_EBOOK[clave];
    const ya = await queryMarketing(`SELECT id FROM campaigns WHERE name = $1 ORDER BY created_at LIMIT 1`, [
      d.nombreInterno,
    ]);
    if (ya.rows[0]) {
      ids[clave] = ya.rows[0].id;
      continue;
    }
    const ins = await queryMarketing(
      `INSERT INTO campaigns (name, title, subject, html_content, mjml_content, status,
                              programado_para, programado_estado)
       VALUES ($1, $2, $3, $4, NULL, 'DRAFT', $5, 'PENDIENTE')
       RETURNING id`,
      [d.nombreInterno, d.titulo, d.asunto, htmlEbook(d), PROGRAMACION_INICIAL[clave]]
    );
    ids[clave] = ins.rows[0].id;
    console.log(`[masivos] Campaña "${d.titulo}" creada y programada para ${PROGRAMACION_INICIAL[clave]}.`);
  }
  return ids;
}

/** Crea (una vez) las dos campañas de ebook y devuelve sus id. */
export function asegurarCampanasEbook(): Promise<Record<ClaveEbook, string>> {
  if (!listo) {
    listo = sembrar().catch((e) => {
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
