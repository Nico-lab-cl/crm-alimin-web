import { queryMain, queryMarketing } from './db';
import { correo } from './correos_secuencias_ebook';

/**
 * Correos de "Después de la visita" escritos por la IA de Cierre (fase 3,
 * parte 4, 12-11-2026: "la IA escribe los 4").
 *
 * Cada paso de las secuencias post-visita-lomas y post-visita-arena tiene una
 * campaña "[IA Cierre] …" que es solo un marcador: al enviar, el motor de
 * secuencias (email_sequences.ts) le pide el texto al sitio
 * (/api/ali/correo-cierre, mismo cerebro y ficha que Ali) para esa persona y
 * ese paso, y lo arma con la plantilla de los correos de ebook. Las campañas
 * marcador existen para que el envío quede registrado en campaign_logs
 * (aperturas, clics y frecuencia) como cualquier otro correo.
 *
 * Las secuencias quedan apagadas: se encienden en el panel después de revisar
 * los ejemplos (webhook /api/webhooks/ia/correo-cierre).
 */

export const PREFIJO_IA = '[IA Cierre]';
const APP = 'https://marketing.aliminspa.cl';
const IMG = `${APP}/img/sec`;
const SITIO = 'https://aliminspa.cl';
const WHATSAPP = '56956654833';

export const TEMAS_POST_VISITA = [
  'gracias por visitarnos, su terreno y los números',
  'crédito directo, cómo se paga',
  'rol propio y lo que se entrega',
  'disponibilidad, conversarlo con su asesor',
];

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function esCampanaIA(c: { title?: string | null } | undefined | null): boolean {
  return Boolean(c?.title?.startsWith(PREFIJO_IA));
}

/**
 * Crea las 4 campañas marcador y las pone en los pasos sin correo de las dos
 * secuencias post-visita. No las enciende. Una sola vez (email_sequence_migraciones).
 */
export async function prepararPostVisitaIA(): Promise<void> {
  const ids: string[] = [];
  for (let i = 0; i < TEMAS_POST_VISITA.length; i++) {
    const nombre = `${PREFIJO_IA} Después de la visita · paso ${i + 1}`;
    const ya = await queryMarketing(`SELECT id FROM campaigns WHERE name = $1 ORDER BY created_at LIMIT 1`, [nombre]);
    if (ya.rows[0]) {
      ids.push(ya.rows[0].id);
      continue;
    }
    const html = `<p>Este correo lo escribe la IA de Cierre para cada persona al momento de enviarlo (${esc(TEMAS_POST_VISITA[i])}).</p>`;
    const ins = await queryMarketing(
      `INSERT INTO campaigns (name, title, subject, html_content, mjml_content, status)
       VALUES ($1, $2, $3, $4, NULL, 'DRAFT') RETURNING id`,
      [nombre, nombre, 'Lo escribe la IA de Cierre', html]
    );
    ids.push(ins.rows[0].id);
  }

  for (const clave of ['post-visita-lomas', 'post-visita-arena']) {
    const marca = `post-visita-ia:${clave}`;
    const ya = await queryMarketing(`SELECT 1 FROM email_sequence_migraciones WHERE clave = $1`, [marca]);
    if (ya.rows.length) continue;
    const seq = await queryMarketing(`SELECT id FROM email_sequences WHERE clave = $1`, [clave]);
    const id = seq.rows[0]?.id;
    if (!id) continue;
    for (let i = 0; i < ids.length; i++) {
      await queryMarketing(
        `UPDATE email_sequence_steps SET campaign_id = $3 WHERE sequence_id = $1 AND posicion = $2 AND campaign_id IS NULL`,
        [id, i + 1, ids[i]]
      );
    }
    await queryMarketing(`INSERT INTO email_sequence_migraciones (clave) VALUES ($1) ON CONFLICT DO NOTHING`, [marca]);
    console.log(`[secuencias] ${clave}: pasos con la IA de Cierre (apagada hasta encenderla en el panel).`);
  }
}

const CANAL: Record<string, string> = { web: 'chat web', instagram: 'Instagram', facebook: 'Facebook' };
const fecha = (d: Date) =>
  d.toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const corto = (t: unknown, max = 220) => {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

/** Lo que sabemos de la persona para escribirle: ficha, visita, calificador y lo último que conversó. */
async function contextoDelLead(leadId: string) {
  const r = await queryMain(
    `SELECT l."firstName", l.status, l.interests, l.pie, l.notes, l.lote, l.etapa, l."visitProject",
            (l."visitDate" AT TIME ZONE 'UTC') AS visita, u.name AS asesor
       FROM "Lead" l LEFT JOIN "User" u ON u.id = l."assignedToId"
      WHERE l.id = $1`,
    [leadId]
  );
  const l = r.rows[0];
  if (!l) return null;

  const lineas: string[] = [];
  // Con el día de la semana escrito: sin él, la IA lo adivinaba (y erraba).
  if (l.visita) {
    const dia = new Date(l.visita).toLocaleDateString('es-CL', { timeZone: 'America/Santiago', weekday: 'long', day: 'numeric', month: 'long' });
    lineas.push(`Visitó ${l.visitProject || 'el proyecto'} el ${dia}.`);
  }
  // Solo lotes con número: en el CRM hay lotes como "H" o "B" que no son el
  // número del lote y la IA los citaba tal cual (prueba del 14-11-2026).
  if (l.lote && /\d/.test(String(l.lote))) {
    lineas.push(`Lote que le interesó: ${corto(l.lote, 40)}${l.etapa && /\d/.test(String(l.etapa)) ? `, etapa ${corto(l.etapa, 20)}` : ''}.`);
  }
  if (l.interests) lineas.push(`Intereses: ${corto(l.interests, 160)}.`);
  if (l.pie) lineas.push(`Pie: ${corto(l.pie, 60)}.`);
  // La nota automática de la visita ("Visita programada: … - Lote H, Etapa H") ya está arriba.
  if (l.notes && !/^Visita programada/i.test(String(l.notes))) lineas.push(`Notas del asesor: ${corto(l.notes, 300)}`);

  const calif = await queryMarketing(
    `SELECT proyecto, forma_pago, plazo_compra, uso, objeciones, resumen FROM ia_calificacion
      WHERE lead_id = $1 ORDER BY updated_at DESC LIMIT 1`,
    [leadId]
  ).catch(() => null);
  const c = calif?.rows[0];
  if (c?.resumen) lineas.push(`Lo que entendió el calificador: ${corto(c.resumen, 400)}`);
  if (c?.objeciones?.length) lineas.push(`Objeciones que tuvo: ${c.objeciones.join(', ')}.`);

  const msgs = await queryMain(
    `SELECT m.text, m."senderType" AS de, c.platform, (m."createdAt" AT TIME ZONE 'UTC') AS fecha
       FROM "Message" m JOIN "Conversation" c ON c.id = m."conversationId"
      WHERE c."leadId" = $1 AND m."sourceType" <> 'EVENTO'
        AND (m."createdAt" AT TIME ZONE 'UTC') > now() - interval '90 days'
      ORDER BY m."createdAt" DESC LIMIT 25`,
    [leadId]
  );
  const quien: Record<string, string> = { meta: 'Cliente', visitor: 'Cliente', ali: 'Ali', advisor: 'Asesor' };
  const conversacion = msgs.rows
    .reverse()
    .filter((m) => m.text && quien[m.de])
    .map((m) => `[${fecha(new Date(m.fecha))}, ${CANAL[m.platform] || m.platform}] ${quien[m.de]}: ${corto(m.text)}`);
  if (conversacion.length) lineas.push(`\nLo último que conversó con nosotros:\n${conversacion.join('\n')}`);

  return { nombre: l.firstName as string | null, asesor: l.asesor as string | null, proyecto: (l.visitProject || c?.proyecto || null) as string | null, contexto: lineas.join('\n') };
}

export interface CorreoGenerado {
  asunto: string;
  preheader: string;
  html: string;
}

/**
 * Le pide al sitio el correo del paso para esta persona y lo arma con la
 * plantilla. Devuelve null si el sitio no respondió bien (el motor reintenta).
 */
export async function correoCierreParaLead(
  leadId: string,
  paso: { posicion: number; total: number },
  proyecto: 'LOMAS' | 'ARENA' | null
): Promise<CorreoGenerado | null> {
  const secreto = process.env.IA_SECRET;
  if (!secreto) return null;
  const datos = await contextoDelLead(leadId);
  if (!datos) return null;
  const nombreProyecto = proyecto === 'ARENA' ? 'Arena y Sol' : proyecto === 'LOMAS' ? 'Lomas del Mar' : datos.proyecto;

  const sitio = (process.env.ALI_SITIO_URL || SITIO).replace(/\/+$/, '');
  const res = await fetch(`${sitio}/api/ali/correo-cierre`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ia-secret': secreto },
    body: JSON.stringify({
      leadId,
      nombre: datos.nombre,
      proyecto: nombreProyecto,
      asesor: datos.asesor,
      paso: { posicion: paso.posicion, total: paso.total, tema: TEMAS_POST_VISITA[paso.posicion - 1] || '' },
      contexto: datos.contexto,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    console.error(`[correo-cierre] El sitio respondió ${res.status} para ${leadId} paso ${paso.posicion}.`);
    return null;
  }
  const c = (await res.json()) as { asunto?: string; preheader?: string; titulo?: string; parrafos?: string[] };
  if (!c.asunto || !Array.isArray(c.parrafos) || !c.parrafos.length) return null;

  const arena = nombreProyecto === 'Arena y Sol';
  const parrafo = (t: string) => `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#33475b;">${esc(t)}</p>`;
  const texto = encodeURIComponent(`Hola, visité ${nombreProyecto || 'sus terrenos'} y quería consultar algo`);
  const html = correo({
    imagen: {
      src: `${IMG}/${arena ? 'arena' : 'lomas'}.jpg`,
      alt: nombreProyecto || 'Alimin',
      url: `${SITIO}/proyectos/${arena ? 'arena-y-sol' : 'lomas-del-mar'}`,
    },
    antetitulo: 'Después de tu visita',
    titulo: c.titulo || c.asunto,
    intro: esc(c.parrafos[0]),
    cuerpo: c.parrafos.slice(1).map(parrafo).join(''),
    boton: { texto: 'Escríbenos por WhatsApp', url: `https://wa.me/${WHATSAPP}?text=${texto}` },
    nota: 'Te responde el equipo de Alimin.',
    cierre: null,
  });
  return { asunto: c.asunto, preheader: c.preheader || '', html };
}
