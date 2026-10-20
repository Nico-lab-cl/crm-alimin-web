/**
 * Secuencias de nutrición por correo.
 *
 * El CRM decide quién entra, cuándo le toca cada correo y cuándo sale; n8n
 * solo envía, con el mismo payload que los envíos masivos (batch_engine.ts).
 *
 * Cuatro disparadores:
 *   - NUEVO_META / NUEVO_WEB  lead recién llegado (72 h) por formulario de Meta
 *                             o por la web, el chat o el newsletter.
 *   - ABANDONO_AGENDA         abrió el mapa para agendar visita (24 h) y no agendó.
 *   - VOLVIO                  lead de hace más de 14 días que volvió a mirar el
 *                             proyecto (2+ páginas) o hizo clic en un masivo.
 *   - REACTIVACION            no abre nada hace 120 días. Si tampoco abre la
 *                             reactivación, sale de los envíos masivos
 *                             (tabla email_sunset).
 *
 * Reglas comunes:
 *   - Solo leads: los clientes del portal de pagos, los reservados y los que ya
 *     tienen visita no entran, y salen si llegan a esa etapa o agendan.
 *   - Un correo por lead cada 20 horas y máximo 3 por semana, contando también
 *     los masivos. Si le toca y no cabe, el paso se corre.
 *   - Con dos secuencias activas, solo avanza la de mayor prioridad; la otra
 *     espera a que termine.
 *   - Los correos salen en horario chileno: el de bienvenida apenas llega el
 *     lead (8:00–22:00); el resto, en las ventanas con más aperturas y clics
 *     (8:00–11:00 y 19:00–22:00).
 *   - La captura mira solo hacia atrás 24–72 h: activar una secuencia no le
 *     escribe a toda la base de golpe. La reactivación entra por cupos diarios.
 *
 * Las tablas viven en crm_marketing; de la base crm solo se lee "Lead".
 */

import { queryMain, queryMarketing } from './db';
import { ESTADOS_CLIENTE } from './lead_score';
import {
  agregarUtm,
  appendUnsubscribeFooter,
  getCampaignPreheader,
  insertPreheader,
  isValidEmailSyntax,
  optimizeHtmlForDarkMode,
} from './email_utils';

// ---------------------------------------------------------------------------
// Definiciones
// ---------------------------------------------------------------------------

export type Disparador = 'NUEVO_META' | 'NUEVO_WEB' | 'ABANDONO_AGENDA' | 'VOLVIO' | 'REACTIVACION';
export type Proyecto = 'LOMAS' | 'ARENA';
export type Ventana = 'INMEDIATA' | 'OPTIMA';

interface PasoBase {
  nombre: string;
  /** Horas desde el paso anterior (el primero, desde la inscripción). */
  esperaHoras: number;
  ventana: Ventana;
}

interface SecuenciaBase {
  clave: string;
  nombre: string;
  descripcion: string;
  disparador: Disparador;
  proyecto: Proyecto | null;
  /** 1 es la más urgente. */
  prioridad: number;
  /** Inscripciones nuevas por día; 0 es sin tope. */
  topeDiario: number;
  pasos: PasoBase[];
}

const BIENVENIDA_META: PasoBase[] = [
  { nombre: 'Bienvenida: el proyecto, pie y cuota', esperaHoras: 0, ventana: 'INMEDIATA' },
  { nombre: 'Ubicación: a 10 minutos de la playa', esperaHoras: 48, ventana: 'OPTIMA' },
  { nombre: 'Urbanización: lo que se entrega', esperaHoras: 72, ventana: 'OPTIMA' },
  { nombre: 'Financiamiento directo, sin banco', esperaHoras: 96, ventana: 'OPTIMA' },
  { nombre: 'Invitación a visitar', esperaHoras: 120, ventana: 'OPTIMA' },
];

/** El lead de la web llega con más intención: se le invita antes a visitar. */
const BIENVENIDA_WEB: PasoBase[] = [
  { nombre: 'Bienvenida: el proyecto, pie y cuota', esperaHoras: 0, ventana: 'INMEDIATA' },
  { nombre: 'Invitación a visitar', esperaHoras: 24, ventana: 'OPTIMA' },
  { nombre: 'Financiamiento directo, sin banco', esperaHoras: 48, ventana: 'OPTIMA' },
  { nombre: 'Ubicación y entorno', esperaHoras: 72, ventana: 'OPTIMA' },
];

const ABANDONO: PasoBase[] = [
  { nombre: '¿Te quedó pendiente la visita?', esperaHoras: 2, ventana: 'INMEDIATA' },
  { nombre: 'Así es visitar el proyecto', esperaHoras: 22, ventana: 'OPTIMA' },
  { nombre: 'Último recordatorio para agendar', esperaHoras: 48, ventana: 'OPTIMA' },
];

const VOLVIO: PasoBase[] = [
  { nombre: 'Lo que estuviste mirando', esperaHoras: 0, ventana: 'OPTIMA' },
  { nombre: 'Avance de obra / clientes que ya están', esperaHoras: 72, ventana: 'OPTIMA' },
  { nombre: 'Invitación a visitar', esperaHoras: 96, ventana: 'OPTIMA' },
];

const REACTIVACION: PasoBase[] = [
  { nombre: '¿Sigues buscando terreno?', esperaHoras: 0, ventana: 'OPTIMA' },
  { nombre: 'Los dos proyectos en El Tabo', esperaHoras: 96, ventana: 'OPTIMA' },
  { nombre: 'Último correo: ¿te seguimos escribiendo?', esperaHoras: 168, ventana: 'OPTIMA' },
];

const NOMBRE_PROYECTO: Record<Proyecto, string> = { LOMAS: 'Lomas del Mar', ARENA: 'Arena y Sol' };

function porProyecto(
  base: Omit<SecuenciaBase, 'clave' | 'nombre' | 'proyecto'> & { clave: string; nombre: string }
): SecuenciaBase[] {
  return (['LOMAS', 'ARENA'] as Proyecto[]).map((p) => ({
    ...base,
    clave: `${base.clave}-${p === 'LOMAS' ? 'lomas' : 'arena'}`,
    nombre: `${base.nombre} · ${NOMBRE_PROYECTO[p]}`,
    proyecto: p,
  }));
}

export const SECUENCIAS_BASE: SecuenciaBase[] = [
  ...porProyecto({
    clave: 'bienvenida-meta',
    nombre: 'Bienvenida formulario Meta',
    descripcion: 'Lead nuevo del formulario instantáneo de Meta. 5 correos en 14 días que terminan en la invitación a visitar.',
    disparador: 'NUEVO_META',
    prioridad: 2,
    topeDiario: 0,
    pasos: BIENVENIDA_META,
  }),
  ...porProyecto({
    clave: 'bienvenida-web',
    nombre: 'Bienvenida web orgánica',
    descripcion: 'Lead nuevo de aliminspa.cl (formulario, chat o newsletter). Trae más intención: 4 correos en 6 días con la visita al segundo.',
    disparador: 'NUEVO_WEB',
    prioridad: 2,
    topeDiario: 0,
    pasos: BIENVENIDA_WEB,
  }),
  ...porProyecto({
    clave: 'abandono-agenda',
    nombre: 'Abandono de agenda',
    descripcion: 'Abrió el mapa para agendar visita y no agendó. 3 correos: a las 2 horas, al día siguiente y a los 3 días.',
    disparador: 'ABANDONO_AGENDA',
    prioridad: 1,
    topeDiario: 0,
    pasos: ABANDONO,
  }),
  ...porProyecto({
    clave: 'volvio',
    nombre: 'Volvió a interesarse',
    descripcion: 'Lead de hace más de 14 días que volvió a mirar el proyecto en la web (2 o más páginas) o hizo clic en un correo masivo.',
    disparador: 'VOLVIO',
    prioridad: 3,
    topeDiario: 0,
    pasos: VOLVIO,
  }),
  {
    clave: 'reactivacion',
    nombre: 'Reactivación de dormidos',
    descripcion:
      'Recibió 4 o más correos en 120 días y no abrió ninguno. 3 correos en 11 días; si tampoco los abre, deja de recibir los envíos masivos.',
    disparador: 'REACTIVACION',
    proyecto: null,
    prioridad: 4,
    topeDiario: 3000,
    pasos: REACTIVACION,
  },
];

// Ventanas de captura: activar no le escribe a toda la base de golpe.
const CAPTURA_NUEVO_HORAS = 72;
const CAPTURA_AGENDA_HORAS = 24;
const CAPTURA_VOLVIO_HORAS = 72;
const VOLVIO_ANTIGUEDAD_DIAS = 14;
const DORMIDO_DIAS = 120;
const DORMIDO_MIN_ENVIOS = 4;
/** Tras el último correo de reactivación se espera esto antes de decidir. */
const REACTIVACION_ESPERA_CIERRE_HORAS = 7 * 24;

// Frecuencia
const SEPARACION_MIN_HORAS = 20;
const MAX_POR_SEMANA = 3;

// Ritmo de envío
const MAX_ENVIOS_POR_PASADA = 300;
const PAUSA_ENTRE_ENVIOS_MS = 300;
const LIMITE_DIARIO_SES = 50000;
/** Margen para no dejar sin cupo a un masivo del mismo día. */
const RESERVA_MASIVOS = 35000;

const ZONA = 'America/Santiago';
const VENTANAS: Record<Ventana, Array<[number, number]>> = {
  INMEDIATA: [[8, 22]],
  OPTIMA: [
    [8, 11],
    [19, 22],
  ],
};

/** Estados con los que el lead ya no es para nutrir: ya está con el asesor o es cliente. */
const ESTADOS_FUERA = [...ESTADOS_CLIENTE, 'RESERVADO', 'VISITA'];
const FUENTES_WEB = ['web', 'sitio web', 'newsletter', 'lomasdelmar'];
/** UTM de anuncios: quien llega así a la web no es orgánico. */
const UTM_PAGADO = ['meta', 'fb', 'facebook', 'ig', 'instagram'];
const MEDIO_PAGADO = ['paid', 'paid_social', 'cpc'];

function vieneDeAnuncio(l: LeadFila): boolean {
  return (
    UTM_PAGADO.includes((l.utmSource || '').toLowerCase()) || MEDIO_PAGADO.includes((l.utmMedium || '').toLowerCase())
  );
}

// ---------------------------------------------------------------------------
// Proyecto del lead
// ---------------------------------------------------------------------------

/** Formularios de Meta por proyecto (sacados de los anuncios que los usan). */
const FORMULARIOS: Record<string, Proyecto> = {
  '2053702978840750': 'LOMAS',
  '798890826611593': 'LOMAS',
  '4410004195897067': 'LOMAS',
  '1548368090109031': 'LOMAS', // Mini Pie, que era de Lomas
  '1659606081838859': 'ARENA',
  '1896385304349584': 'ARENA',
};

function proyectoDeTexto(texto: string): Proyecto | null {
  const t = texto.toLowerCase();
  const lomas = /lomas|minipie|mini pie/.test(t);
  const arena = /arena/.test(t);
  if (lomas && !arena) return 'LOMAS';
  if (arena && !lomas) return 'ARENA';
  return null;
}

function proyectoDeUrl(url: string): Proyecto | null {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    // ya venía como ruta
  }
  path = path.replace(/\/$/, '');
  if (/arena-y-sol|agendar-visita-arenas/.test(path)) return 'ARENA';
  if (/lomas-del-mar|minipie/.test(path) || path.endsWith('/agendar-visita')) return 'LOMAS';
  return null;
}

interface LeadFila {
  id: string;
  email: string;
  firstName: string | null;
  source: string | null;
  status: string | null;
  interests: string | null;
  adName: string | null;
  utmCampaign: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  visitProject: string | null;
  formId: string | null;
  emailEnabled: boolean | null;
  emailBounced: boolean | null;
  creado: Date;
  visita: Date | null;
}

const COLUMNAS_LEAD = `id::text AS id, email, "firstName", source, status, interests, "adName",
  "utmCampaign", "utmSource", "utmMedium", "visitProject", "formId", "emailEnabled", "emailBounced",
  ("createdAt" AT TIME ZONE 'UTC') AS creado, ("visitDate" AT TIME ZONE 'UTC') AS visita`;

/**
 * Lo que el lead dijo (formulario, anuncio, campaña) pesa más que lo que miró;
 * lo que miró decide si no dijo nada. Sin ninguna pista va a Lomas del Mar,
 * que tiene el pie más bajo y le calza a más gente.
 */
function proyectoDe(lead: LeadFila, paginas: string[] = []): Proyecto {
  const declarado = proyectoDeTexto(
    [lead.visitProject, lead.interests, lead.adName, lead.utmCampaign].filter(Boolean).join(' ')
  );
  if (declarado) return declarado;
  if (lead.formId && FORMULARIOS[lead.formId]) return FORMULARIOS[lead.formId];
  const cuenta = { LOMAS: 0, ARENA: 0 };
  for (const p of paginas) {
    const pr = proyectoDeUrl(p);
    if (pr) cuenta[pr]++;
  }
  if (cuenta.ARENA > cuenta.LOMAS) return 'ARENA';
  return 'LOMAS';
}

function esLeadParaNutrir(l: LeadFila): boolean {
  return (
    isValidEmailSyntax(l.email) &&
    l.emailEnabled !== false &&
    l.emailBounced !== true &&
    !ESTADOS_FUERA.includes((l.status || '').toUpperCase())
  );
}

// ---------------------------------------------------------------------------
// Tablas
// ---------------------------------------------------------------------------

let tablasListas = false;

export async function asegurarTablas() {
  if (tablasListas) return;
  await queryMarketing(`
    CREATE TABLE IF NOT EXISTS email_sequences (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      clave TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      disparador TEXT NOT NULL,
      proyecto TEXT,
      prioridad INT NOT NULL DEFAULT 5,
      tope_diario INT NOT NULL DEFAULT 0,
      activa BOOLEAN NOT NULL DEFAULT FALSE,
      activada_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await queryMarketing(`
    CREATE TABLE IF NOT EXISTS email_sequence_steps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sequence_id UUID NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
      posicion INT NOT NULL,
      nombre TEXT NOT NULL,
      espera_horas INT NOT NULL,
      ventana TEXT NOT NULL DEFAULT 'OPTIMA',
      campaign_id UUID,
      UNIQUE (sequence_id, posicion)
    )`);
  await queryMarketing(`
    CREATE TABLE IF NOT EXISTS email_sequence_enrollments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sequence_id UUID NOT NULL REFERENCES email_sequences(id) ON DELETE CASCADE,
      lead_id TEXT NOT NULL,
      email TEXT NOT NULL,
      proyecto TEXT,
      estado TEXT NOT NULL DEFAULT 'ACTIVA',
      motivo_salida TEXT,
      pasos_enviados INT NOT NULL DEFAULT 0,
      proximo_envio_at TIMESTAMPTZ,
      ultimo_envio_at TIMESTAMPTZ,
      inscrito_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      actualizado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (sequence_id, lead_id)
    )`);
  await queryMarketing(
    `CREATE INDEX IF NOT EXISTS email_seq_enr_pendientes ON email_sequence_enrollments (estado, proximo_envio_at)`
  );
  await queryMarketing(`CREATE INDEX IF NOT EXISTS email_seq_enr_lead ON email_sequence_enrollments (lead_id)`);
  await queryMarketing(`
    CREATE TABLE IF NOT EXISTS email_sunset (
      email TEXT PRIMARY KEY,
      lead_id TEXT,
      motivo TEXT,
      desde TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await queryMarketing(`ALTER TABLE campaign_logs ADD COLUMN IF NOT EXISTS sequence_step_id UUID`);
  // Asunto y preheader propios del paso: el mismo diseño puede ir en varias
  // secuencias, y el asunto de una campaña ya enviada no se toca.
  await queryMarketing(`ALTER TABLE email_sequence_steps ADD COLUMN IF NOT EXISTS asunto TEXT`);
  await queryMarketing(`ALTER TABLE email_sequence_steps ADD COLUMN IF NOT EXISTS preheader TEXT`);
  // CONCURRENTLY: campaign_logs es grande y un masivo puede estar escribiendo.
  // El índice solo acelera el control de frecuencia: si falla, se sigue.
  try {
    await queryMarketing(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS campaign_logs_email_sent ON campaign_logs (lower(email), sent_at)`
    );
  } catch (error) {
    console.warn('[secuencias] No se pudo crear el índice de campaign_logs:', (error as Error).message);
  }

  // Las secuencias base se crean una vez; lo que el equipo cambie (correo de
  // cada paso, esperas, encendido) no se pisa.
  for (const s of SECUENCIAS_BASE) {
    const ins = await queryMarketing(
      `INSERT INTO email_sequences (clave, nombre, descripcion, disparador, proyecto, prioridad, tope_diario)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (clave) DO NOTHING
       RETURNING id`,
      [s.clave, s.nombre, s.descripcion, s.disparador, s.proyecto, s.prioridad, s.topeDiario]
    );
    if (ins.rows.length === 0) continue;
    const id = ins.rows[0].id;
    for (let i = 0; i < s.pasos.length; i++) {
      const p = s.pasos[i];
      await queryMarketing(
        `INSERT INTO email_sequence_steps (sequence_id, posicion, nombre, espera_horas, ventana)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, i + 1, p.nombre, p.esperaHoras, p.ventana]
      );
    }
  }
  tablasListas = true;
}

// ---------------------------------------------------------------------------
// Horario
// ---------------------------------------------------------------------------

function horaChile(fecha: Date): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const h = Number(partes.find((p) => p.type === 'hour')?.value || 0);
  const m = Number(partes.find((p) => p.type === 'minute')?.value || 0);
  return h + m / 60;
}

export function enVentana(fecha: Date, ventana: Ventana): boolean {
  const h = horaChile(fecha);
  return VENTANAS[ventana].some(([desde, hasta]) => h >= desde && h < hasta);
}

/** Primer momento desde `fecha` que cae dentro de la ventana (pasos de 10 minutos). */
export function siguienteEnVentana(fecha: Date, ventana: Ventana): Date {
  let t = new Date(fecha);
  for (let i = 0; i < 6 * 48 && !enVentana(t, ventana); i++) {
    t = new Date(t.getTime() + 10 * 60 * 1000);
  }
  return t;
}

// ---------------------------------------------------------------------------
// Lectura de secuencias
// ---------------------------------------------------------------------------

export interface PasoFila {
  id: string;
  posicion: number;
  nombre: string;
  espera_horas: number;
  ventana: Ventana;
  campaign_id: string | null;
  asunto: string | null;
  preheader: string | null;
}

export interface SecuenciaFila {
  id: string;
  clave: string;
  nombre: string;
  descripcion: string;
  disparador: Disparador;
  proyecto: Proyecto | null;
  prioridad: number;
  tope_diario: number;
  activa: boolean;
  activada_at: string | null;
  pasos: PasoFila[];
}

export async function leerSecuencias(): Promise<SecuenciaFila[]> {
  await asegurarTablas();
  const seqs = await queryMarketing(`SELECT * FROM email_sequences ORDER BY prioridad, clave`);
  const pasos = await queryMarketing(`SELECT * FROM email_sequence_steps ORDER BY sequence_id, posicion`);
  return seqs.rows.map((s) => ({
    ...s,
    pasos: pasos.rows.filter((p) => p.sequence_id === s.id),
  }));
}

/** Una secuencia sin correo en algún paso no puede encenderse. */
export function pasosSinCorreo(s: SecuenciaFila): PasoFila[] {
  return s.pasos.filter((p) => !p.campaign_id);
}

/**
 * Los correos son una sola imagen: si la imagen no tiene enlace, el clic no
 * lleva a ninguna parte y no se mide. Vale la web (donde van los UTM) o
 * WhatsApp, que el equipo ya usa en algunos correos.
 */
export function tieneEnlaceWeb(html: string | null | undefined): boolean {
  return /<a\s[^>]*href=["']https?:\/\/(?:(?:[a-z0-9-]+\.)*aliminspa\.cl|wa\.me|(?:api\.|www\.)?whatsapp\.com)(?:[/?#][^"']*)?["']/i.test(
    html || ''
  );
}

// ---------------------------------------------------------------------------
// Candidatos por disparador
// ---------------------------------------------------------------------------

interface Candidato {
  lead: LeadFila;
  proyecto: Proyecto | null;
  /** Momento desde el que corre la espera del primer paso. */
  desde: Date;
}

async function leadsPorId(ids: string[]): Promise<Map<string, LeadFila>> {
  const mapa = new Map<string, LeadFila>();
  for (let i = 0; i < ids.length; i += 5000) {
    const res = await queryMain(`SELECT ${COLUMNAS_LEAD} FROM "Lead" WHERE id::text = ANY($1)`, [
      ids.slice(i, i + 5000),
    ]);
    for (const l of res.rows) mapa.set(l.id, l);
  }
  return mapa;
}

async function paginasDe(ids: string[], dias: number): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>();
  if (ids.length === 0) return mapa;
  const res = await queryMarketing(
    `SELECT lead_id::text AS lead_id, page_url
       FROM lead_activities
      WHERE lead_id::text = ANY($1) AND event_type IN ('PAGE_VISIT', 'PAGE_VIEW')
        AND created_at > now() - make_interval(days => $2)`,
    [ids, dias]
  );
  for (const r of res.rows) {
    if (!mapa.has(r.lead_id)) mapa.set(r.lead_id, []);
    mapa.get(r.lead_id)!.push(r.page_url || '');
  }
  return mapa;
}

/**
 * El formulario de la web recibe también a quien viene de un anuncio de Meta
 * (la landing de los anuncios). Ese lead va a la bienvenida de Meta: la de la
 * web es para el orgánico (Google, directo, redes sin pagar).
 */
async function candidatosNuevos(disparador: 'NUEVO_META' | 'NUEVO_WEB'): Promise<Candidato[]> {
  const res = await queryMain(
    `SELECT ${COLUMNAS_LEAD} FROM "Lead"
      WHERE ("createdAt" AT TIME ZONE 'UTC') > now() - make_interval(hours => $1)
        AND (lower(COALESCE(source, '')) = 'meta'
             OR lower(COALESCE(source, '')) = ANY($2) OR source ILIKE '%aliminspa%')`,
    [CAPTURA_NUEVO_HORAS, FUENTES_WEB]
  );
  const leads: LeadFila[] = res.rows.filter((l: LeadFila) => {
    if (!esLeadParaNutrir(l)) return false;
    const deMeta = (l.source || '').toLowerCase() === 'meta' || vieneDeAnuncio(l);
    return disparador === 'NUEVO_META' ? deMeta : !deMeta;
  });
  const paginas = await paginasDe(
    leads.map((l) => l.id),
    7
  );
  return leads.map((l) => ({ lead: l, proyecto: proyectoDe(l, paginas.get(l.id)), desde: new Date(l.creado) }));
}

async function candidatosAbandono(): Promise<Candidato[]> {
  const res = await queryMarketing(
    `SELECT lead_id::text AS lead_id, page_url, max(created_at) AS ultima
       FROM lead_activities
      WHERE lead_id IS NOT NULL AND event_type IN ('PAGE_VISIT', 'PAGE_VIEW')
        AND page_url ~ '/agendar-visita(-arenas)?/?(\\?|#|$)'
        AND created_at > now() - make_interval(hours => $1)
      GROUP BY 1, 2`,
    [CAPTURA_AGENDA_HORAS]
  );
  // Por lead, el proyecto del mapa que miró al último.
  const porLead = new Map<string, { url: string; ultima: Date }>();
  for (const r of res.rows) {
    const previo = porLead.get(r.lead_id);
    if (!previo || new Date(r.ultima) > previo.ultima) porLead.set(r.lead_id, { url: r.page_url, ultima: new Date(r.ultima) });
  }
  const leads = await leadsPorId(Array.from(porLead.keys()));
  const out: Candidato[] = [];
  porLead.forEach((v, id) => {
    const l = leads.get(id);
    if (!l || !esLeadParaNutrir(l)) return;
    // Si ya tiene una visita agendada después de mirar el mapa, no abandonó.
    if (l.visita && new Date(l.visita) >= new Date(v.ultima.getTime() - 24 * 3600 * 1000)) return;
    out.push({ lead: l, proyecto: proyectoDeUrl(v.url) || proyectoDe(l), desde: v.ultima });
  });
  return out;
}

async function candidatosVolvio(): Promise<Candidato[]> {
  const web = await queryMarketing(
    `SELECT lead_id::text AS lead_id, array_agg(page_url) AS paginas, max(created_at) AS ultima
       FROM lead_activities
      WHERE lead_id IS NOT NULL AND event_type IN ('PAGE_VISIT', 'PAGE_VIEW')
        AND page_url ~ '/(proyectos/(lomas-del-mar|arena-y-sol)|agendar-visita)'
        AND created_at > now() - make_interval(hours => $1)
      GROUP BY 1
     HAVING count(*) >= 2`,
    [CAPTURA_VOLVIO_HORAS]
  );
  const clics = await queryMarketing(
    `SELECT l.lead_id::text AS lead_id, c.title, max(l.last_clicked_at) AS ultima
       FROM campaign_logs l
       JOIN campaigns c ON c.id = l.campaign_id
      WHERE l.is_test = FALSE AND l.sequence_step_id IS NULL AND l.lead_id IS NOT NULL
        AND l.last_clicked_at > now() - make_interval(hours => $1)
      GROUP BY 1, 2`,
    [CAPTURA_VOLVIO_HORAS]
  );
  const senal = new Map<string, { pista: string[]; ultima: Date }>();
  for (const r of web.rows) senal.set(r.lead_id, { pista: r.paginas || [], ultima: new Date(r.ultima) });
  for (const r of clics.rows) {
    const s = senal.get(r.lead_id) || { pista: [], ultima: new Date(r.ultima) };
    s.pista.push(r.title || '');
    if (new Date(r.ultima) > s.ultima) s.ultima = new Date(r.ultima);
    senal.set(r.lead_id, s);
  }
  const leads = await leadsPorId(Array.from(senal.keys()));
  const corte = Date.now() - VOLVIO_ANTIGUEDAD_DIAS * 86_400_000;
  const out: Candidato[] = [];
  senal.forEach((s, id) => {
    const l = leads.get(id);
    if (!l || !esLeadParaNutrir(l) || new Date(l.creado).getTime() > corte) return;
    const cuenta = { LOMAS: 0, ARENA: 0 };
    for (const p of s.pista) {
      const pr = proyectoDeUrl(p) || proyectoDeTexto(p);
      if (pr) cuenta[pr]++;
    }
    const proyecto = cuenta.LOMAS === cuenta.ARENA ? proyectoDe(l) : cuenta.ARENA > cuenta.LOMAS ? 'ARENA' : 'LOMAS';
    out.push({ lead: l, proyecto, desde: new Date() });
  });
  return out;
}

async function candidatosReactivacion(limite: number): Promise<Candidato[]> {
  if (limite <= 0) return [];
  // Dormidos según los correos: muchos envíos y ninguna apertura ni clic.
  const res = await queryMarketing(
    `WITH dormidos AS (
       SELECT lower(email) AS email, max(lead_id::text) AS lead_id, max(sent_at) AS ultimo
         FROM campaign_logs
        WHERE is_test = FALSE AND sent_at > now() - make_interval(days => $1)
        GROUP BY lower(email)
       HAVING count(*) >= $2
          AND count(*) FILTER (WHERE opened_at IS NOT NULL OR status IN ('OPENED', 'CLICKED')
                                OR clicks > 0 OR last_clicked_at IS NOT NULL) = 0
     )
     SELECT d.lead_id, d.email
       FROM dormidos d
      WHERE NOT EXISTS (SELECT 1 FROM email_sunset s WHERE s.email = d.email)
        AND NOT EXISTS (
          SELECT 1 FROM email_sequence_enrollments e
            JOIN email_sequences q ON q.id = e.sequence_id
           WHERE q.disparador = 'REACTIVACION' AND lower(e.email) = d.email)
      ORDER BY d.ultimo DESC
      LIMIT $3`,
    [DORMIDO_DIAS, DORMIDO_MIN_ENVIOS, limite * 2]
  );
  const ids = res.rows.map((r) => r.lead_id).filter(Boolean);
  // Los que anduvieron por la web en ese tiempo no están dormidos.
  const conWeb = await queryMarketing(
    `SELECT DISTINCT lead_id::text AS lead_id FROM lead_activities
      WHERE lead_id::text = ANY($1) AND created_at > now() - make_interval(days => $2)`,
    [ids, DORMIDO_DIAS]
  );
  const activos = new Set(conWeb.rows.map((r) => r.lead_id));
  const leads = await leadsPorId(ids.filter((id) => !activos.has(id)));
  const out: Candidato[] = [];
  leads.forEach((l) => {
    if (out.length < limite && esLeadParaNutrir(l)) out.push({ lead: l, proyecto: null, desde: new Date() });
  });
  return out;
}

async function candidatosDe(s: SecuenciaFila, cupo: number): Promise<Candidato[]> {
  switch (s.disparador) {
    case 'NUEVO_META':
    case 'NUEVO_WEB':
      return candidatosNuevos(s.disparador);
    case 'ABANDONO_AGENDA':
      return candidatosAbandono();
    case 'VOLVIO':
      return candidatosVolvio();
    case 'REACTIVACION':
      return candidatosReactivacion(cupo);
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Inscripción
// ---------------------------------------------------------------------------

async function inscritosHoy(sequenceId: string): Promise<number> {
  const res = await queryMarketing(
    `SELECT count(*)::int AS n FROM email_sequence_enrollments
      WHERE sequence_id = $1 AND (inscrito_at AT TIME ZONE '${ZONA}')::date = (now() AT TIME ZONE '${ZONA}')::date`,
    [sequenceId]
  );
  return res.rows[0]?.n || 0;
}

/**
 * Candidatos que entrarían ahora a cada secuencia, ya filtrados por proyecto
 * y sin los que ya pasaron por ella. Sirve para la inscripción y para la vista
 * previa del panel (que no escribe nada).
 */
export async function candidatosPorSecuencia(
  secuencias: SecuenciaFila[]
): Promise<Map<string, Candidato[]>> {
  const salida = new Map<string, Candidato[]>();
  const cache = new Map<string, Candidato[]>();
  for (const s of secuencias) {
    const cupo = s.tope_diario > 0 ? Math.max(0, s.tope_diario - (await inscritosHoy(s.id))) : Infinity;
    if (cupo === 0) {
      salida.set(s.id, []);
      continue;
    }
    // Las variantes por proyecto comparten disparador: se consulta una vez.
    let todos = cache.get(s.disparador);
    if (!todos) {
      todos = await candidatosDe(s, Number.isFinite(cupo) ? cupo : 0);
      cache.set(s.disparador, todos);
    }
    const propios = todos.filter((c) => !s.proyecto || c.proyecto === s.proyecto);
    const ya = await queryMarketing(
      `SELECT lead_id FROM email_sequence_enrollments WHERE sequence_id = $1 AND lead_id = ANY($2)`,
      [s.id, propios.map((c) => c.lead.id)]
    );
    const yaInscritos = new Set(ya.rows.map((r) => r.lead_id));
    const nuevos = propios.filter((c) => !yaInscritos.has(c.lead.id));
    salida.set(s.id, Number.isFinite(cupo) ? nuevos.slice(0, cupo) : nuevos);
  }
  return salida;
}

async function inscribir(secuencias: SecuenciaFila[]): Promise<number> {
  const porSecuencia = await candidatosPorSecuencia(secuencias);
  let total = 0;
  for (const s of secuencias) {
    const primero = s.pasos[0];
    for (const c of porSecuencia.get(s.id) || []) {
      const cuando = siguienteEnVentana(
        new Date(Math.max(Date.now(), c.desde.getTime() + primero.espera_horas * 3600 * 1000)),
        primero.ventana
      );
      const ins = await queryMarketing(
        `INSERT INTO email_sequence_enrollments (sequence_id, lead_id, email, proyecto, proximo_envio_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (sequence_id, lead_id) DO NOTHING`,
        [s.id, c.lead.id, c.lead.email.trim(), c.proyecto, cuando]
      );
      total += ins.rowCount || 0;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Salidas
// ---------------------------------------------------------------------------

async function salir(id: string, estado: 'SALIO' | 'TERMINADA', motivo: string | null) {
  await queryMarketing(
    `UPDATE email_sequence_enrollments
        SET estado = $2, motivo_salida = $3, proximo_envio_at = NULL, actualizado_at = now()
      WHERE id = $1`,
    [id, estado, motivo]
  );
}

/** Saca a los que ya agendaron, avanzaron, se desuscribieron o rebotaron. */
async function revisarSalidas(): Promise<number> {
  const activas = await queryMarketing(
    `SELECT e.id, e.lead_id, e.inscrito_at, q.disparador
       FROM email_sequence_enrollments e
       JOIN email_sequences q ON q.id = e.sequence_id
      WHERE e.estado = 'ACTIVA'`
  );
  if (activas.rows.length === 0) return 0;
  const leads = await leadsPorId(Array.from(new Set(activas.rows.map((r) => r.lead_id))));

  const reactivacion = activas.rows.filter((r) => r.disparador === 'REACTIVACION').map((r) => r.id);
  const reactivados = new Set<string>();
  if (reactivacion.length) {
    const res = await queryMarketing(
      `SELECT DISTINCT e.id
         FROM email_sequence_enrollments e
         JOIN campaign_logs l ON lower(l.email) = lower(e.email) AND l.sent_at >= e.inscrito_at
        WHERE e.id = ANY($1) AND (l.opened_at IS NOT NULL OR l.clicks > 0 OR l.last_clicked_at IS NOT NULL)`,
      [reactivacion]
    );
    res.rows.forEach((r) => reactivados.add(r.id));
  }

  let n = 0;
  for (const r of activas.rows) {
    const l = leads.get(r.lead_id);
    let motivo: string | null = null;
    if (!l) motivo = 'El lead ya no existe';
    else if (l.emailEnabled === false) motivo = 'Se desuscribió';
    else if (l.emailBounced === true) motivo = 'El correo rebotó';
    else if (ESTADOS_FUERA.includes((l.status || '').toUpperCase())) motivo = `Avanzó a ${l.status}`;
    else if (l.visita && new Date(l.visita) >= new Date(new Date(r.inscrito_at).getTime() - 24 * 3600 * 1000))
      motivo = 'Agendó visita';
    if (motivo) {
      await salir(r.id, 'SALIO', motivo);
      n++;
    } else if (reactivados.has(r.id)) {
      await salir(r.id, 'TERMINADA', 'Se reactivó: abrió o hizo clic');
      n++;
    }
  }
  return n;
}

/** Un dormido que vuelve a la web deja de estar fuera de los masivos. */
async function devolverDespiertos(): Promise<void> {
  await queryMarketing(
    `DELETE FROM email_sunset s
      WHERE EXISTS (
        SELECT 1 FROM lead_activities a
         WHERE a.lead_id::text = s.lead_id AND a.created_at > s.desde)`
  );
}

// ---------------------------------------------------------------------------
// Envío
// ---------------------------------------------------------------------------

async function enviadosHoy(): Promise<number> {
  const res = await queryMarketing(
    `SELECT count(*)::int AS n FROM campaign_logs WHERE status IN ('SENT', 'PENDING') AND sent_at >= CURRENT_DATE`
  );
  return res.rows[0]?.n || 0;
}

/** Cuándo puede recibir otro correo este email según la frecuencia; null si ya. */
async function frenoPorFrecuencia(email: string): Promise<Date | null> {
  const res = await queryMarketing(
    `SELECT max(sent_at) AS ultimo,
            count(*) FILTER (WHERE sent_at > now() - interval '7 days')::int AS semana,
            min(sent_at) FILTER (WHERE sent_at > now() - interval '7 days') AS primero_semana
       FROM campaign_logs
      WHERE lower(email) = lower($1) AND is_test = FALSE AND sent_at > now() - interval '7 days'`,
    [email]
  );
  const r = res.rows[0];
  if (!r?.ultimo) return null;
  const candidatos: number[] = [];
  const porSeparacion = new Date(r.ultimo).getTime() + SEPARACION_MIN_HORAS * 3600 * 1000;
  if (porSeparacion > Date.now()) candidatos.push(porSeparacion);
  if (r.semana >= MAX_POR_SEMANA && r.primero_semana) {
    candidatos.push(new Date(r.primero_semana).getTime() + 7 * 86_400_000);
  }
  return candidatos.length ? new Date(Math.max(...candidatos)) : null;
}

function reescribirEnlaces(html: string, logId: string, appUrl: string): string {
  if (!html) return html;
  const hrefRegex = /<a\s+(?:[^>]*?\s+)?href=["'](https?:\/\/[^"']+)["']/gi;
  return html.replace(hrefRegex, (match, url) => {
    if (url.includes('/api/track/')) return match;
    return match.replace(url, `${appUrl}/api/track/click?log_id=${logId}&url=${encodeURIComponent(url)}`);
  });
}

interface Campana {
  id: string;
  title: string;
  subject: string;
  html_content: string;
  mjml_content: unknown;
}

/**
 * Mismo payload que batch_engine.ts: el flujo de n8n no distingue un masivo
 * de un paso de secuencia. Los enlaces a aliminspa.cl llevan UTM de la
 * secuencia y el paso, y el clic agrega lead_id para que la web lo reconozca.
 */
async function enviarPaso(
  campana: Campana,
  lead: { id: string; email: string; nombre?: string | null },
  utm: { campaign: string; content: string },
  paso: PasoFila,
  senderIndex: number,
  prueba?: { prefijo: string }
): Promise<boolean> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://marketing.aliminspa.cl';
  const n8nUrl = process.env.N8N_WEBHOOK_URL;
  if (!n8nUrl) throw new Error('N8N_WEBHOOK_URL no configurada');
  const pasoId = paso.id;
  const preheader = paso.preheader?.trim()
    ? personalizar(paso.preheader, lead.nombre)
    : getCampaignPreheader(campana);
  const asunto = personalizar(paso.asunto?.trim() || campana.subject, lead.nombre);

  // El correo provisorio de una prueba no es una campaña: va sin registro ni
  // seguimiento, con el enlace directo.
  let logId: string | null = null;
  if (campana.id) {
    const logRes = await queryMarketing(
      `INSERT INTO campaign_logs (campaign_id, lead_id, email, status, sequence_step_id, is_test)
       VALUES ($1, $2, $3, $5, $4, $6) RETURNING id`,
      [campana.id, lead.id, lead.email, pasoId, prueba ? 'TEST' : 'PENDING', !!prueba]
    );
    logId = logRes.rows[0].id;
  }

  const conUtm = agregarUtm(campana.html_content, {
    utm_source: 'email',
    utm_medium: 'secuencia',
    utm_campaign: utm.campaign,
    utm_content: utm.content,
  });
  const trackingPixel = logId
    ? `<img src="${appUrl}/api/track/open?log_id=${logId}" width="1" height="1" style="display:none;" />`
    : '';
  const conSeguimiento = logId ? reescribirEnlaces(conUtm, logId, appUrl) : conUtm;
  const html = optimizeHtmlForDarkMode(
    insertPreheader(appendUnsubscribeFooter(conSeguimiento, lead.id, lead.email, appUrl) + trackingPixel, preheader)
  );

  const response = await fetch(n8nUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      log_id: logId,
      campaign_id: campana.id,
      title: prueba ? `[PRUEBA] ${campana.title}` : campana.title,
      email: lead.email,
      subject: prueba ? `${prueba.prefijo} ${asunto}` : asunto,
      preheader,
      html,
      design: campana.mjml_content,
      senderIndex,
      senderName: 'Alimin Inmobiliaria',
      lead_id: lead.id,
      appUrl,
      unsubscribeUrl: `${appUrl}/unsubscribe?id=${lead.id}`,
    }),
  });

  if (logId) {
    // Un FAILED queda sin sent_at: no cuenta como envío para la frecuencia.
    await queryMarketing(
      `UPDATE campaign_logs
          SET status = $2::text, sent_at = CASE WHEN $2::text = 'FAILED' THEN sent_at ELSE CURRENT_TIMESTAMP END
        WHERE id = $1`,
      [logId, !response.ok ? 'FAILED' : prueba ? 'TEST' : 'SENT']
    );
  }
  return response.ok;
}

/** "MARÍA JOSÉ pérez" -> "María" */
function primerNombre(nombre: string | null | undefined): string {
  const primero = (nombre || '').trim().split(/\s+/)[0] || '';
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ'-]{2,}$/.test(primero)) return '';
  return primero.charAt(0).toLocaleUpperCase('es-CL') + primero.slice(1).toLocaleLowerCase('es-CL');
}

/**
 * Reemplaza {nombre}. Sin nombre se quita junto con su coma o espacio
 * ("{nombre}, tu terreno" -> "Tu terreno"; "¿Dudas, {nombre}?" -> "¿Dudas?").
 */
export function personalizar(texto: string, nombre: string | null | undefined): string {
  const n = primerNombre(nombre);
  if (n) return texto.replace(/\{nombre\}/gi, n);
  const limpio = texto
    .replace(/\{nombre\}\s*,\s*/gi, '')
    .replace(/\s*,\s*\{nombre\}/gi, '')
    .replace(/\s*\{nombre\}\s*/gi, ' ')
    .trim();
  return limpio.replace(/^([¿¡]?)([a-záéíóúüñ])/, (_m, signo: string, letra: string) => signo + letra.toLocaleUpperCase('es-CL'));
}

// ---------------------------------------------------------------------------
// Prueba de cadenas completas
// ---------------------------------------------------------------------------

const SITIO = 'https://aliminspa.cl';
const DESTINOS: Record<Proyecto, { ficha: string; agenda: string }> = {
  LOMAS: { ficha: '/proyectos/lomas-del-mar', agenda: '/agendar-visita' },
  ARENA: { ficha: '/proyectos/arena-y-sol', agenda: '/agendar-visita-arenas' },
};

/** A dónde lleva cada paso según el guion (SECUENCIAS-NUTRICION-CORREOS.md). */
function destinoDe(s: SecuenciaFila, paso: PasoFila): string {
  if (!s.proyecto) return `${SITIO}/reunion`;
  const agenda = /visita|agendar|lote|recordatorio|mirando|avance/i.test(paso.nombre);
  return SITIO + (agenda ? DESTINOS[s.proyecto].agenda : DESTINOS[s.proyecto].ficha);
}

/** Correo de reemplazo para un paso que aún no tiene diseño. */
function correoProvisorio(s: SecuenciaFila, paso: PasoFila): Campana {
  const url = destinoDe(s, paso);
  const cuando = paso.espera_horas === 0 ? 'apenas entran' : `${paso.espera_horas} h después del paso anterior`;
  const html = `<html><body style="margin:0;background:#f5f8fa;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:24px auto;background:#ffffff;border:1px solid #cbd6e2;border-radius:12px;padding:28px;color:#33475b;">
    <p style="margin:0 0 6px;font-size:12px;color:#516f90;text-transform:uppercase;letter-spacing:1px;">Correo provisorio · sin diseño todavía</p>
    <h1 style="margin:0 0 12px;font-size:22px;color:#2d544c;">${s.nombre}</h1>
    <p style="margin:0 0 4px;font-size:16px;"><b>Paso ${paso.posicion} de ${s.pasos.length}:</b> ${paso.nombre}</p>
    <p style="margin:0 0 20px;font-size:14px;color:#516f90;">A los leads les llega ${cuando}. Este paso lleva a la página de abajo.</p>
    <a href="${url}" style="display:inline-block;background:#2d544c;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px;">Abrir la página del paso</a>
    <p style="margin:16px 0 0;font-size:12px;color:#a3b8cc;">${url}</p>
  </div></body></html>`;
  return { id: '', title: `${s.nombre} · paso ${paso.posicion}`, subject: paso.nombre, html_content: html, mjml_content: null };
}

export interface ResultadoPrueba {
  secuencia: string;
  paso: number;
  nombre: string;
  provisorio: boolean;
  ok: boolean;
  error?: string;
}

/**
 * Manda a un correo todos los pasos de las secuencias pedidas, seguidos y sin
 * esperas, por el mismo camino que a los leads (n8n). Los pasos sin diseño van
 * con un correo provisorio. No inscribe a nadie ni cuenta en las métricas.
 */
export async function enviarPrueba(
  email: string,
  ids: string[] | null,
  nombre?: string | null
): Promise<ResultadoPrueba[]> {
  if (!isValidEmailSyntax(email)) throw new Error('Correo de prueba inválido');
  const secuencias = (await leerSecuencias()).filter((s) => !ids || ids.includes(s.id));

  let leadId = '00000000-0000-0000-0000-000000000000';
  let nombreLead: string | null = null;
  try {
    const res = await queryMain(
      `SELECT id::text AS id, "firstName" FROM "Lead" WHERE lower(email) = lower($1) LIMIT 1`,
      [email]
    );
    if (res.rows[0]) {
      leadId = res.rows[0].id;
      nombreLead = res.rows[0].firstName;
    }
  } catch {
    // Sin lead: el pie de desuscripción usa el id vacío, como en las pruebas de campaña.
  }

  const conDiseno = Array.from(new Set(secuencias.flatMap((s) => s.pasos.map((p) => p.campaign_id)).filter(Boolean)));
  const campanas = new Map<string, Campana>();
  if (conDiseno.length) {
    const res = await queryMarketing(
      `SELECT id, title, subject, html_content, mjml_content FROM campaigns WHERE id = ANY($1::uuid[])`,
      [conDiseno]
    );
    res.rows.forEach((c) => campanas.set(c.id, c));
  }

  const resultados: ResultadoPrueba[] = [];
  let indice = 0;
  for (const s of secuencias) {
    for (const paso of s.pasos) {
      const real = paso.campaign_id ? campanas.get(paso.campaign_id) : undefined;
      const campana = real || correoProvisorio(s, paso);
      const prefijo = `[PRUEBA ${s.nombre} · ${paso.posicion}/${s.pasos.length}]`;
      const fila = { secuencia: s.nombre, paso: paso.posicion, nombre: paso.nombre, provisorio: !real };
      try {
        const ok = await enviarPaso(
          campana,
          { id: leadId, email, nombre: nombre?.trim() || nombreLead },
          { campaign: s.clave, content: `paso-${paso.posicion}` },
          // Sin diseño, el asunto es el nombre del paso.
          real ? paso : { ...paso, asunto: paso.asunto || paso.nombre },
          indice++ % 5,
          { prefijo }
        );
        resultados.push({ ...fila, ok });
      } catch (error) {
        resultados.push({ ...fila, ok: false, error: (error as Error).message });
      }
      // Con pausa para que la bandeja los muestre en orden.
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return resultados;
}

async function enviarPendientes(secuencias: SecuenciaFila[]): Promise<{ enviados: number; corridos: number }> {
  const porId = new Map(secuencias.map((s) => [s.id, s]));
  const pendientes = await queryMarketing(
    `SELECT e.*, q.prioridad
       FROM email_sequence_enrollments e
       JOIN email_sequences q ON q.id = e.sequence_id
      WHERE e.estado = 'ACTIVA' AND q.activa = TRUE AND e.proximo_envio_at <= now()
      ORDER BY q.prioridad, e.proximo_envio_at
      LIMIT $1`,
    [MAX_ENVIOS_POR_PASADA]
  );
  if (pendientes.rows.length === 0) return { enviados: 0, corridos: 0 };

  const campanas = new Map<string, Campana>();
  const ids = Array.from(new Set(secuencias.flatMap((s) => s.pasos.map((p) => p.campaign_id)).filter(Boolean)));
  if (ids.length) {
    const res = await queryMarketing(
      `SELECT id, title, subject, html_content, mjml_content FROM campaigns WHERE id = ANY($1::uuid[])`,
      [ids]
    );
    res.rows.forEach((c) => campanas.set(c.id, c));
  }

  // Otras secuencias activas del mismo lead: solo avanza la más urgente.
  const leadIds = Array.from(new Set(pendientes.rows.map((r) => r.lead_id)));
  const otras = await queryMarketing(
    `SELECT e.lead_id, min(q.prioridad) AS prioridad
       FROM email_sequence_enrollments e
       JOIN email_sequences q ON q.id = e.sequence_id
      WHERE e.estado = 'ACTIVA' AND q.activa = TRUE AND e.lead_id = ANY($1)
      GROUP BY e.lead_id`,
    [leadIds]
  );
  const prioridadMinima = new Map<string, number>(otras.rows.map((r) => [r.lead_id, r.prioridad]));

  let cupo = LIMITE_DIARIO_SES - RESERVA_MASIVOS - (await enviadosHoy());
  let enviados = 0;
  let corridos = 0;
  let indice = 0;
  const yaEnEstaPasada = new Set<string>();

  const correr = async (id: string, fecha: Date) => {
    await queryMarketing(
      `UPDATE email_sequence_enrollments SET proximo_envio_at = $2, actualizado_at = now() WHERE id = $1`,
      [id, fecha]
    );
    corridos++;
  };

  for (const e of pendientes.rows) {
    if (cupo <= 0) break;
    const s = porId.get(e.sequence_id);
    if (!s) continue;
    const paso = s.pasos[e.pasos_enviados];

    // Reactivación: pasó la espera tras el último correo y no abrió nada.
    if (!paso) {
      if (s.disparador === 'REACTIVACION') {
        await queryMarketing(
          `INSERT INTO email_sunset (email, lead_id, motivo) VALUES (lower($1), $2, $3)
           ON CONFLICT (email) DO NOTHING`,
          [e.email, e.lead_id, 'No abrió la reactivación']
        );
        await salir(e.id, 'TERMINADA', 'Sin respuesta: fuera de los masivos');
      } else {
        await salir(e.id, 'TERMINADA', null);
      }
      continue;
    }

    const campana = paso.campaign_id ? campanas.get(paso.campaign_id) : undefined;
    if (!campana) continue; // secuencia mal armada: el panel no deja encenderla así

    if ((prioridadMinima.get(e.lead_id) ?? s.prioridad) < s.prioridad) {
      await correr(e.id, new Date(Date.now() + 12 * 3600 * 1000));
      continue;
    }
    if (!enVentana(new Date(), paso.ventana)) {
      await correr(e.id, siguienteEnVentana(new Date(), paso.ventana));
      continue;
    }
    if (yaEnEstaPasada.has(e.lead_id)) {
      await correr(e.id, new Date(Date.now() + SEPARACION_MIN_HORAS * 3600 * 1000));
      continue;
    }
    const freno = await frenoPorFrecuencia(e.email);
    if (freno) {
      await correr(e.id, siguienteEnVentana(freno, paso.ventana));
      continue;
    }

    // Revalidar justo antes de enviar: pudo desuscribirse hace un minuto.
    const fresco = (await leadsPorId([e.lead_id])).get(e.lead_id);
    if (!fresco || fresco.emailEnabled === false || fresco.emailBounced === true) {
      await salir(e.id, 'SALIO', fresco ? 'Se desuscribió o rebotó' : 'El lead ya no existe');
      continue;
    }

    try {
      const ok = await enviarPaso(
        campana,
        { id: e.lead_id, email: e.email, nombre: fresco.firstName },
        { campaign: s.clave, content: `paso-${paso.posicion}` },
        paso,
        indice++ % 5
      );
      yaEnEstaPasada.add(e.lead_id);
      if (!ok) {
        // n8n no lo tomó: se reintenta en una hora sin avanzar el paso.
        await correr(e.id, new Date(Date.now() + 3600 * 1000));
        continue;
      }
      enviados++;
      cupo--;
      const siguiente = s.pasos[e.pasos_enviados + 1];
      const espera = siguiente
        ? siguiente.espera_horas
        : s.disparador === 'REACTIVACION'
          ? REACTIVACION_ESPERA_CIERRE_HORAS
          : 0;
      const proximo = siguiente
        ? siguienteEnVentana(new Date(Date.now() + espera * 3600 * 1000), siguiente.ventana)
        : new Date(Date.now() + espera * 3600 * 1000);
      if (!siguiente && s.disparador !== 'REACTIVACION') {
        await queryMarketing(
          `UPDATE email_sequence_enrollments
              SET pasos_enviados = pasos_enviados + 1, ultimo_envio_at = now(), estado = 'TERMINADA',
                  proximo_envio_at = NULL, actualizado_at = now()
            WHERE id = $1`,
          [e.id]
        );
      } else {
        await queryMarketing(
          `UPDATE email_sequence_enrollments
              SET pasos_enviados = pasos_enviados + 1, ultimo_envio_at = now(),
                  proximo_envio_at = $2, actualizado_at = now()
            WHERE id = $1`,
          [e.id, proximo]
        );
      }
    } catch (error) {
      console.error(`[secuencias] Falló el envío a ${e.email}:`, error);
      await correr(e.id, new Date(Date.now() + 3600 * 1000));
    }
    await new Promise((r) => setTimeout(r, PAUSA_ENTRE_ENVIOS_MS));
  }
  return { enviados, corridos };
}

// ---------------------------------------------------------------------------
// Pasada completa
// ---------------------------------------------------------------------------

let corriendo: Promise<ResultadoPasada> | null = null;

export interface ResultadoPasada {
  activas: number;
  inscritos: number;
  salidas: number;
  enviados: number;
  corridos: number;
  ms: number;
}

async function pasada(): Promise<ResultadoPasada> {
  const t0 = Date.now();
  const todas = await leerSecuencias();
  const activas = todas.filter((s) => s.activa && pasosSinCorreo(s).length === 0);
  if (activas.length === 0) return { activas: 0, inscritos: 0, salidas: 0, enviados: 0, corridos: 0, ms: 0 };

  const salidas = await revisarSalidas();
  const inscritos = await inscribir(activas);
  await devolverDespiertos();
  const { enviados, corridos } = await enviarPendientes(activas);
  return { activas: activas.length, inscritos, salidas, enviados, corridos, ms: Date.now() - t0 };
}

/** Dos pasadas a la vez mandarían el mismo paso dos veces: la segunda espera a la primera. */
export function pasadaSinSolapar(): Promise<ResultadoPasada> {
  if (!corriendo) {
    corriendo = pasada().finally(() => {
      corriendo = null;
    });
  }
  return corriendo;
}

/** Emails fuera de los envíos masivos (no abrieron la reactivación). */
export async function emailsDormidos(): Promise<Set<string>> {
  try {
    await asegurarTablas();
    const res = await queryMarketing(`SELECT email FROM email_sunset`);
    return new Set(res.rows.map((r) => r.email));
  } catch (error) {
    console.error('[secuencias] No se pudo leer email_sunset:', error);
    return new Set();
  }
}
