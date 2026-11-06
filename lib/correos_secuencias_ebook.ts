/**
 * Correos de las secuencias de ebook (EBOOK_SUELO y EBOOK_PREGUNTAS), según el
 * guion de SECUENCIAS-NUTRICION-CORREOS.md (E1–E5 y R2). Pedido del
 * 05-11-2026: que las secuencias de ebook tengan todos sus correos y queden
 * encendidas.
 *
 * Se crean como campañas con el nombre del guion ("SEC · Ebook · E1 …"), se
 * asignan a los pasos que estén sin correo y las dos secuencias se encienden
 * una sola vez (email_sequence_migraciones). Lo que el equipo cambie después
 * en el panel (otro correo en un paso, apagarlas) no se pisa.
 *
 * Son HTML con tablas y estilos en línea: mjml_content queda NULL, así que no
 * se editan en el editor del panel (guardar ahí pisa el HTML).
 *
 * Datos: precios y urbanización confirmados el 22/26-10-2026; Arena y Sol a 8
 * minutos de la playa y Lomas del Mar a 10.
 */

import { queryMarketing } from './db';

const APP = 'https://marketing.aliminspa.cl';
const SITIO = 'https://aliminspa.cl';
const IMG = `${APP}/img/sec`;

const VERDE = '#2d544c';
const VERDE_CLARO = '#4caf50';
const BORDE = '#cfe0d6';
const TEXTO = '#33475b';
const OSCURO = '#1f2d2a';

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function boton(texto: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
    <td align="center" bgcolor="${VERDE}" style="border-radius:8px;">
      <a href="${url}" target="_blank" style="display:inline-block;padding:15px 32px;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">${esc(texto)}</a>
    </td></tr></table>`;
}

function lista(puntos: string[]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">${puntos
    .map(
      (p) => `<tr><td valign="top" style="padding:0 10px 10px 0;color:${VERDE_CLARO};font-size:18px;line-height:22px;">&#10003;</td>
      <td style="padding:0 0 10px;font-size:16px;line-height:22px;color:${TEXTO};">${p}</td></tr>`
    )
    .join('')}</table>`;
}

function pasos(items: Array<{ titulo: string; texto: string }>): string {
  return items
    .map(
      (it, i) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;border:1px solid ${BORDE};border-radius:10px;">
      <tr><td valign="top" width="44" style="padding:14px 0 14px 14px;">
        <div style="width:30px;height:30px;line-height:30px;border-radius:15px;background:${VERDE};color:#ffffff;font-weight:bold;font-size:15px;text-align:center;">${i + 1}</div>
      </td><td style="padding:14px 14px 14px 10px;">
        <p style="margin:0 0 4px;font-size:16px;font-weight:bold;color:${OSCURO};">${esc(it.titulo)}</p>
        <p style="margin:0;font-size:14px;line-height:20px;color:${TEXTO};">${esc(it.texto)}</p>
      </td></tr></table>`
    )
    .join('');
}

function proyectos(): string {
  const tarjeta = (img: string, nombre: string, url: string, puntos: string[]) => `
    <td valign="top" width="50%" style="padding:0 6px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${BORDE};border-radius:10px;overflow:hidden;">
        <tr><td><a href="${url}" target="_blank"><img src="${img}" alt="${esc(nombre)}" width="260" style="display:block;width:100%;height:auto;border:0;"></a></td></tr>
        <tr><td style="padding:14px 14px 6px;">
          <p style="margin:0 0 8px;font-size:17px;font-weight:bold;color:${OSCURO};">${esc(nombre)}</p>
          ${puntos.map((p) => `<p style="margin:0 0 6px;font-size:14px;line-height:19px;color:${TEXTO};">${p}</p>`).join('')}
        </td></tr>
        <tr><td style="padding:4px 14px 16px;"><a href="${url}" target="_blank" style="font-size:14px;font-weight:bold;color:${VERDE};text-decoration:underline;">Ver el proyecto</a></td></tr>
      </table>
    </td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    ${tarjeta(`${IMG}/lomas.jpg`, 'Lomas del Mar', `${SITIO}/proyectos/lomas-del-mar`, [
      '200 o 390 m²',
      'Pie desde <b>$5.500.000</b>',
      'Cuotas de <b>$550.000</b>',
      'A 10 minutos de la playa',
    ])}
    ${tarjeta(`${IMG}/arena.jpg`, 'Arena y Sol', `${SITIO}/proyectos/arena-y-sol`, [
      '200 m² · Últimos terrenos',
      'Pie de <b>$20.000.000</b>',
      'Cuotas de <b>$500.000</b>',
      'Entrega inmediata, a 8 minutos de la playa',
    ])}
  </tr></table>`;
}

interface Bloques {
  imagen: { src: string; alt: string; url: string };
  antetitulo: string;
  titulo: string;
  intro: string;
  cuerpo?: string;
  boton: { texto: string; url: string };
  nota?: string;
  /** Cierre bajo la línea: por defecto, invitación a visitar. */
  cierre?: string | null;
}

const CIERRE_VISITA = `<p style="margin:0 0 12px;font-size:15px;line-height:22px;color:${TEXTO};">¿Prefieres verlo en persona? Te mostramos los terrenos en El Tabo.</p>
  <a href="${SITIO}/agendar-visita" target="_blank" style="font-size:15px;font-weight:bold;color:${VERDE};text-decoration:underline;">Agendar una visita</a>`;

export function correo(b: Bloques): string {
  const cierre = b.cierre === undefined ? CIERRE_VISITA : b.cierre;
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(b.titulo)}</title></head>
<body style="margin:0;padding:0;background:#f2f4f3;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f4f3;">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${BORDE};border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
    <tr><td align="center" style="padding:22px 24px 16px;">
      <a href="${SITIO}" target="_blank"><img src="${IMG}/logo.png" alt="Alimin" width="170" style="display:block;width:170px;max-width:170px;height:auto;border:0;"></a>
    </td></tr>
    <tr><td><a href="${b.imagen.url}" target="_blank"><img src="${b.imagen.src}" alt="${esc(b.imagen.alt)}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></a></td></tr>
    <tr><td style="padding:28px 32px 8px;">
      <p style="margin:0 0 8px;font-size:13px;letter-spacing:1px;text-transform:uppercase;font-weight:bold;color:${VERDE_CLARO};">${esc(b.antetitulo)}</p>
      <h1 style="margin:0 0 14px;font-size:26px;line-height:32px;color:${OSCURO};">${esc(b.titulo)}</h1>
      <p style="margin:0 0 20px;font-size:16px;line-height:24px;color:${TEXTO};">${b.intro}</p>
      ${b.cuerpo || ''}
    </td></tr>
    <tr><td align="center" style="padding:16px 32px 30px;">
      ${boton(b.boton.texto, b.boton.url)}
      ${b.nota ? `<p style="margin:14px 0 0;font-size:13px;color:#6b7c78;">${esc(b.nota)}</p>` : ''}
    </td></tr>
    ${
      cierre
        ? `<tr><td style="padding:0 32px;"><div style="border-top:1px solid ${BORDE};height:1px;line-height:1px;font-size:1px;">&nbsp;</div></td></tr>
    <tr><td align="center" style="padding:22px 32px 28px;">${cierre}</td></tr>`
        : ''
    }
  </table>
</td></tr></table>
</body></html>`;
}

const PDF_SUELO = `${SITIO}/ebooks/pdf/terreno-urbano-o-parcela-rural.pdf`;
const PDF_PREGUNTAS = `${SITIO}/ebooks/pdf/preguntas-frecuentes.pdf`;
const BLOG_VERIFICAR = `${SITIO}/blog/como-verificar-legalidad-terreno-antes-de-comprar`;

export type ClaveCorreo = 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'R2';

interface CorreoSecuencia {
  nombre: string;
  asunto: string;
  preheader: string;
  html: string;
}

export const CORREOS_EBOOK: Record<ClaveCorreo, CorreoSecuencia> = {
  E1: {
    nombre: 'SEC · Ebook · E1 Tu guía de uso de suelo',
    asunto: 'Tu guía: terreno urbano o parcela rural 📘',
    preheader: 'Descárgala aquí y léela con calma.',
    html: correo({
      imagen: { src: `${IMG}/guia-suelo.jpg`, alt: 'Vista aérea de terrenos en el litoral central', url: PDF_SUELO },
      antetitulo: 'Tu guía gratuita',
      titulo: 'Aquí está tu guía',
      intro:
        'Gracias por descargar <b>Terreno urbano o parcela rural</b>. En ella te contamos qué diferencia un terreno urbano de una parcela rural y por qué importa el rol propio.',
      cuerpo: `<p style="margin:0 0 12px;font-size:16px;font-weight:bold;color:${OSCURO};">Lo que vas a encontrar:</p>${lista([
        'Los tres tipos de suelo en Chile y qué permite cada uno',
        'Qué es el rol propio y por qué tienes que pedirlo primero',
        'Los riesgos de comprar un porcentaje y no un terreno',
        'Una lista para revisar antes de pagar',
      ])}`,
      boton: { texto: 'Descargar la guía', url: PDF_SUELO },
      nota: 'Es un PDF: puedes guardarlo y leerlo cuando quieras.',
    }),
  },
  E2: {
    nombre: 'SEC · Ebook · E2 Tu guía de preguntas',
    asunto: 'Tu guía: lo que todos nos preguntan 📘',
    preheader: 'Precio, pago, construcción, visitas y más.',
    html: correo({
      imagen: { src: `${IMG}/guia-preguntas.jpg`, alt: 'Terrenos del proyecto Arena y Sol en El Tabo', url: PDF_PREGUNTAS },
      antetitulo: 'Tu guía gratuita',
      titulo: 'Aquí está tu guía',
      intro:
        'Gracias por descargar <b>Las preguntas que todos nos hacen</b>: las respuestas a lo que más nos preguntan antes de comprar un terreno.',
      cuerpo: `<p style="margin:0 0 12px;font-size:16px;font-weight:bold;color:${OSCURO};">Lo que vas a encontrar:</p>${lista([
        '¿Cuánto cuesta un terreno y cómo se paga?',
        '¿Se puede construir y cuándo me lo entregan?',
        '¿Me sirve si estoy en DICOM?',
        '¿Qué necesito para comprar y puedo visitar antes?',
      ])}`,
      boton: { texto: 'Descargar la guía', url: PDF_PREGUNTAS },
      nota: 'Es un PDF: puedes guardarlo y leerlo cuando quieras.',
    }),
  },
  E3: {
    nombre: 'SEC · Ebook · E3 Cómo revisar un terreno',
    asunto: 'Antes de comprar un terreno, revisa esto 🔍',
    preheader: 'Los documentos que tienes que pedir.',
    html: correo({
      imagen: { src: `${IMG}/revisar-terreno.jpg`, alt: 'Cómo verificar la legalidad de un terreno', url: BLOG_VERIFICAR },
      antetitulo: 'Antes de pagar',
      titulo: 'Cómo verificar un terreno antes de comprar',
      intro: 'Son cuatro documentos. Pídelos siempre, sea quien sea el que vende:',
      cuerpo: pasos([
        {
          titulo: 'Certificado de dominio vigente',
          texto: 'Lo emite el Conservador de Bienes Raíces de la comuna, con menos de 30 días. Dice quién es el dueño y si puede vender.',
        },
        {
          titulo: 'Certificado de hipotecas y gravámenes',
          texto: 'También del Conservador: confirma que el terreno no tiene hipotecas, embargos ni prohibiciones de venta.',
        },
        {
          titulo: 'Rol propio en el SII',
          texto: 'Consulta el rol en el SII: tiene que ser de tu lote y no de un predio grande con muchos lotes adentro.',
        },
        {
          titulo: 'Certificado de Informaciones Previas',
          texto: 'Lo da la Dirección de Obras Municipales: qué se puede construir, si es zona de riesgo y cómo es el acceso.',
        },
      ]),
      boton: { texto: 'Leer la guía completa', url: BLOG_VERIFICAR },
    }),
  },
  E4: {
    nombre: 'SEC · Ebook · E4 Lo que viene urbanizado',
    asunto: 'Lo que trae tu terreno en El Tabo ✅',
    preheader: 'Rol propio, agua, luz y acceso controlado.',
    html: correo({
      imagen: { src: `${IMG}/urbanizado.jpg`, alt: 'Terrenos urbanizados en Arena y Sol, El Tabo', url: `${SITIO}/proyectos` },
      antetitulo: 'Terrenos urbanizados',
      titulo: 'Lo que trae tu terreno en El Tabo',
      intro: 'En Lomas del Mar y en Arena y Sol el terreno se entrega con lo necesario para empezar tu proyecto:',
      cuerpo: `${lista([
        '<b>Rol propio:</b> el terreno es tuyo, con su propia inscripción',
        '<b>Agua y luz</b>',
        '<b>Portón y acceso privado</b>',
        '<b>Calles, luminarias solares y áreas verdes</b>',
      ])}<div style="height:12px;line-height:12px;font-size:12px;">&nbsp;</div>${proyectos()}`,
      boton: { texto: 'Ver los proyectos', url: `${SITIO}/proyectos` },
    }),
  },
  E5: {
    nombre: 'SEC · Ebook · E5 Ven a conocerlos',
    asunto: 'Conoce los terrenos en persona 📍',
    preheader: 'Agenda tu visita a El Tabo el día que te acomode.',
    html: correo({
      imagen: { src: `${IMG}/visita.jpg`, alt: 'Asesores de Alimin en El Tabo', url: `${SITIO}/agendar-visita` },
      antetitulo: 'Visítanos',
      titulo: 'Lo mejor es verlo con tus propios ojos',
      intro:
        'Recorre los terrenos con un asesor el día que te acomode. Elige el proyecto y agenda tu visita en el mapa:',
      cuerpo: proyectos(),
      boton: { texto: 'Agendar en Lomas del Mar', url: `${SITIO}/agendar-visita` },
      cierre: `<a href="${SITIO}/agendar-visita-arenas" target="_blank" style="font-size:15px;font-weight:bold;color:${VERDE};text-decoration:underline;">Agendar visita en Arena y Sol</a>`,
    }),
  },
  R2: {
    nombre: 'SEC · Reactivación · R2',
    asunto: '¿Lomas del Mar o Arena y Sol? 🤔',
    preheader: 'Compara tamaño, pie y cuota en un minuto.',
    html: correo({
      imagen: { src: `${IMG}/guia-suelo.jpg`, alt: 'Terrenos en El Tabo, cerca de la playa', url: `${SITIO}/proyectos` },
      antetitulo: 'Dos proyectos en El Tabo',
      titulo: '¿Lomas del Mar o Arena y Sol?',
      intro: 'Los dos con crédito directo, sin banco y sin importar tu DICOM. Compáralos en un minuto:',
      cuerpo: proyectos(),
      boton: { texto: 'Comparar y agendar', url: `${SITIO}/proyectos` },
    }),
  },
};

/** Qué correo va en cada paso (posición) de las dos secuencias de ebook. */
const PASOS: Record<string, ClaveCorreo[]> = {
  'ebook-suelo': ['E1', 'E3', 'R2', 'E5'],
  'ebook-preguntas': ['E2', 'R2', 'E4', 'E5'],
};

/**
 * Crea las campañas que falten (por nombre), las pone en los pasos sin correo
 * y enciende las dos secuencias, una sola vez. Lo llama asegurarTablas.
 */
export async function prepararSecuenciasEbook(): Promise<void> {
  const ids = {} as Record<ClaveCorreo, string>;
  for (const clave of Object.keys(CORREOS_EBOOK) as ClaveCorreo[]) {
    const c = CORREOS_EBOOK[clave];
    const ya = await queryMarketing(`SELECT id FROM campaigns WHERE name = $1 ORDER BY created_at LIMIT 1`, [c.nombre]);
    if (ya.rows[0]) {
      ids[clave] = ya.rows[0].id;
      continue;
    }
    const ins = await queryMarketing(
      `INSERT INTO campaigns (name, title, subject, html_content, mjml_content, status)
       VALUES ($1, $2, $3, $4, NULL, 'DRAFT') RETURNING id`,
      // name y title tienen tipos distintos: un mismo $1 en los dos falla
      // ("inconsistent types deduced for parameter $1").
      [c.nombre, c.nombre, c.asunto, c.html]
    );
    ids[clave] = ins.rows[0].id;
    console.log(`[secuencias] Correo "${c.nombre}" creado.`);
  }

  for (const [claveSeq, correos] of Object.entries(PASOS)) {
    const marca = `correos-ebook:${claveSeq}`;
    const ya = await queryMarketing(`SELECT 1 FROM email_sequence_migraciones WHERE clave = $1`, [marca]);
    if (ya.rows.length) continue;
    const seq = await queryMarketing(`SELECT id FROM email_sequences WHERE clave = $1`, [claveSeq]);
    const id = seq.rows[0]?.id;
    if (!id) continue;
    for (let i = 0; i < correos.length; i++) {
      const c = CORREOS_EBOOK[correos[i]];
      await queryMarketing(
        `UPDATE email_sequence_steps
            SET campaign_id = $3, asunto = COALESCE(asunto, $4), preheader = COALESCE(preheader, $5)
          WHERE sequence_id = $1 AND posicion = $2 AND campaign_id IS NULL`,
        [id, i + 1, ids[correos[i]], c.asunto, c.preheader]
      );
    }
    // Solo se enciende si quedó con correo en todos los pasos.
    const sinCorreo = await queryMarketing(
      `SELECT count(*)::int AS n FROM email_sequence_steps WHERE sequence_id = $1 AND campaign_id IS NULL`,
      [id]
    );
    if (sinCorreo.rows[0].n === 0) {
      await queryMarketing(
        `UPDATE email_sequences SET activa = TRUE, activada_at = now(), updated_at = now() WHERE id = $1 AND activa = FALSE`,
        [id]
      );
      console.log(`[secuencias] ${claveSeq}: correos asignados y encendida.`);
    }
    await queryMarketing(`INSERT INTO email_sequence_migraciones (clave) VALUES ($1) ON CONFLICT DO NOTHING`, [marca]);
  }
}
