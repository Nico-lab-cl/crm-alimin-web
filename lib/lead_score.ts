/**
 * Lead score: a quién llamar primero hoy.
 *
 * Puntaje de 0 a 100 con tres partes:
 *
 *   - Origen (hasta 20, fijo). La web orgánica avanza unas seis veces más que
 *     el formulario instantáneo de Meta (3,9% contra 0,6% desde abril 2026),
 *     así que parte con más.
 *   - Perfil (hasta 10, solo suma). Pie y cuota existen solo en los
 *     formularios de Meta; que un lead de la web no los tenga no lo castiga.
 *   - Interacción (hasta 70). Cada señal pierde la mitad de su valor cada 14
 *     días: en terrenos del litoral el cliente compara durante semanas, y un
 *     lead que escribió ayer vale más que uno que escribió hace un mes.
 *
 * Fuera de alcance a propósito:
 *   - Clientes (PAGO_CUOTAS, RESERVA_PAGADA...): son del portal de pagos.
 *   - WhatsApp de Evolution: solo un asesor está conectado, y puntuar con eso
 *     premiaría a sus leads sobre los del resto.
 *   - QR y firmas: son anónimos, no se pueden ligar a un lead.
 *
 * El cálculo vive en este CRM porque es el único que ve las dos bases: correos
 * y visitas web están en crm_marketing; leads y chats, en crm. El resultado se
 * guarda en public.lead_score de la base crm, donde el CRM móvil lo lee para
 * mandar los avisos (push y grupo de WhatsApp).
 */

import { queryMain, queryMarketing } from './db';

// ---------------------------------------------------------------------------
// Pesos y umbrales
// ---------------------------------------------------------------------------

export const VIDA_MEDIA_DIAS = 14;
export const UMBRAL_CALIENTE = 60;
export const UMBRAL_TIBIO = 35;
/** Entre 20 y 34 el lead ya mostró algo: el equipo no lo considera frío. */
export const UMBRAL_TEMPLADO = 20;
/**
 * Un lead caliente no se enfría apenas baja de 60: con el decaimiento
 * oscilaría entre bandas cada pasada y cada vuelta sería un aviso nuevo.
 */
export const UMBRAL_SALIDA_CALIENTE = UMBRAL_CALIENTE - 5;
/** Señales más viejas que esto ya valen menos de 2% de su peso: no se leen. */
const VENTANA_DIAS = 90;
/** Leads que entran al cálculo aunque no tengan señales: los vivos desde abril. */
const LEADS_DESDE = '2026-04-01';

export const PUNTOS_ORIGEN = {
  WEB: 20,
  LANDING_META: 12,
  FORM_META: 8,
  MANUAL: 8,
  ANTIGUA: 0,
} as const;

export const PUNTOS = {
  pie: 6,
  cuota: 4,
  whatsapp: 15,
  chat: 15,
  web1min: 5,
  web5min: 10,
  web15min: 15,
  volvioAWeb: 8,
  volvioAWebMax: 2,
  clicCorreo: 8,
  clicCorreoMax: 1,
  aperturaCorreo: 3,
  aperturaCorreoMax: 2,
  botonInteres: 4,
} as const;

const TOPE_PERFIL = 10;
const TOPE_INTERACCION = 70;

/** Una sesión web se corta tras 30 minutos sin actividad. */
const CORTE_SESION_MS = 30 * 60 * 1000;

/** Estados del portal de pagos: son clientes, no leads. */
export const ESTADOS_CLIENTE = [
  'PAGO_CUOTAS',
  'RESERVA_PAGADA',
  'PIE_POR_PAGAR',
  'VENTA_CERRADA',
  'RESERVA_POR_FIRMAR',
];

/**
 * Solo se puntúan leads de los asesores de la rueda (Marcela, Orlando y
 * Bárbara). Decisión del equipo: los leads sin asesor o de usuarios que ya no
 * están no entran ni al puntaje ni a los avisos. Mismos ids que
 * src/lib/assignment.ts del CRM móvil.
 */
export const ASESORES_RUEDA = [
  'db1e6577-01b1-4615-b35e-0d50752452f3', // Marcela
  'a6ce92ca-f1a1-4dcf-a042-fda1c31ca485', // Orlando
  '77cea468-b4a5-44e6-aaa5-0a3f376affb1', // Bárbara
];

/** Orígenes de importaciones: la base antigua. */
const FUENTES_IMPORTADAS = ['kommo', 'csv import', 'old-db', 'instagram', 'clientify'];

/** Botones de la web que muestran intención de compra. */
const BOTON_INTERES = /cotiz|plano|lote|precio|agend|visita|reserv|simul|financ|brochure|ficha|disponib|cuota/i;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type Origen = keyof typeof PUNTOS_ORIGEN;
export type Banda = 'CALIENTE' | 'TIBIO' | 'TEMPLADO' | 'FRIO';

export type LeadParaScore = {
  id: string;
  source: string | null;
  status: string | null;
  interests: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  formId: string | null;
  adId: string | null;
  pie: string | null;
  monthlyPayment: string | null;
};

export type EventoWeb = {
  fecha: Date;
  tipo: string;
  details: Record<string, unknown> | null;
};

export type Senales = {
  aperturas: Date[];
  clicsCorreo: Date[];
  web: EventoWeb[];
  mensajes: { fecha: Date; plataforma: string | null }[];
};

export type ResultadoScore = {
  score: number;
  banda: Banda;
  origen: Origen;
  puntosOrigen: number;
  puntosPerfil: number;
  puntosInteraccion: number;
  motivos: string[];
  ultimaInteraccion: Date | null;
};

// ---------------------------------------------------------------------------
// Cálculo (puro: no toca la base)
// ---------------------------------------------------------------------------

const minus = (s: unknown) => (typeof s === 'string' ? s.trim().toLowerCase() : '');

export function origenDe(lead: LeadParaScore): Origen {
  const fuente = minus(lead.source);
  if (FUENTES_IMPORTADAS.includes(fuente)) return 'ANTIGUA';
  if (fuente === 'manual') return 'MANUAL';
  if (fuente === 'meta' || lead.formId || lead.adId) return 'FORM_META';

  // Todo lo demás llegó por aliminspa.cl. Las landings de Meta (/meta/...)
  // marcan el proyecto con "- Meta"; el tráfico pagado trae su utm.
  const utm = minus(lead.utmSource);
  const medio = minus(lead.utmMedium);
  const pagado = /paid|cpc|ppc|cpm|ads?\b|pago/.test(medio);
  const utmMeta = /^(fb|ig|meta)$|facebook|instagram/.test(utm);
  if (/- ?meta\b/i.test(lead.interests || '') || utm === 'meta' || (utmMeta && pagado)) return 'LANDING_META';
  return 'WEB';
}

const ETIQUETA_ORIGEN: Record<Origen, string> = {
  WEB: 'Llegó por la web',
  LANDING_META: 'Llegó por una landing de Meta',
  FORM_META: 'Formulario de Meta',
  MANUAL: 'Cargado a mano',
  ANTIGUA: 'Base antigua',
};

/** "Sí", "si", "5.500.000 CLP" cuentan; "No" y vacío no. */
function respondioQueSi(valor: string | null): boolean {
  const v = minus(valor);
  if (!v || v.startsWith('no')) return false;
  return /^s[ií]\b/.test(v) || /\d/.test(v);
}

function decaimiento(fecha: Date, ahora: number): number {
  const dias = Math.max(0, (ahora - fecha.getTime()) / 86_400_000);
  return Math.pow(0.5, dias / VIDA_MEDIA_DIAS);
}

export function haceCuanto(fecha: Date, ahora: number): string {
  const dias = Math.floor((ahora - fecha.getTime()) / 86_400_000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}

/** Día calendario en Chile, para contar "volvió otro día". */
function diaChile(fecha: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(fecha);
}

function texto(details: Record<string, unknown> | null): string {
  if (!details) return '';
  try {
    return JSON.stringify(details);
  } catch {
    return '';
  }
}

function esClicWhatsapp(e: EventoWeb): boolean {
  return e.tipo === 'CLICK_BUTTON' && /wa\.me|whatsapp/i.test(texto(e.details));
}

function esBotonInteres(e: EventoWeb): boolean {
  if (e.tipo !== 'CLICK_BUTTON' || esClicWhatsapp(e)) return false;
  const nombre = `${e.details?.element_name ?? ''} ${e.details?.href ?? ''}`;
  return BOTON_INTERES.test(nombre);
}

/**
 * Tiempo en la web por sesión. Si el rastreador mandó PAGE_TIME (segundos con
 * la pestaña visible), manda eso; si no, se aproxima con lo que pasó entre un
 * evento y el siguiente, que no cuenta la última página y queda corto.
 */
function sesionesWeb(eventos: EventoWeb[]): { inicio: Date; segundos: number }[] {
  const ordenados = [...eventos].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  const sesiones: { inicio: Date; fin: Date; brecha: number; activo: number }[] = [];
  for (const e of ordenados) {
    const actual = sesiones[sesiones.length - 1];
    if (!actual || e.fecha.getTime() - actual.fin.getTime() > CORTE_SESION_MS) {
      sesiones.push({ inicio: e.fecha, fin: e.fecha, brecha: 0, activo: 0 });
    } else {
      actual.brecha += (e.fecha.getTime() - actual.fin.getTime()) / 1000;
      actual.fin = e.fecha;
    }
    if (e.tipo === 'PAGE_TIME') {
      const s = Number(e.details?.active_seconds);
      if (Number.isFinite(s) && s > 0) sesiones[sesiones.length - 1].activo += Math.min(s, 3600);
    }
  }
  return sesiones.map((s) => ({ inicio: s.inicio, segundos: Math.max(s.brecha, s.activo) }));
}

const masReciente = (fechas: Date[]) =>
  [...fechas].sort((a, b) => b.getTime() - a.getTime());

function etiquetaPlataforma(p: string | null): string {
  const v = minus(p);
  if (v === 'instagram') return 'Instagram';
  if (v === 'facebook') return 'Messenger';
  if (v === 'tiktok') return 'TikTok';
  return 'el chat de la web';
}

export function calcularScore(
  lead: LeadParaScore,
  senales: Senales,
  bandaAnterior: Banda | null,
  ahora = Date.now()
): ResultadoScore {
  const origen = origenDe(lead);
  const puntosOrigen = PUNTOS_ORIGEN[origen];
  const motivos: { texto: string; puntos: number }[] = [];
  const fechas: Date[] = [];

  // Perfil
  let perfil = 0;
  if (respondioQueSi(lead.pie)) {
    perfil += PUNTOS.pie;
    motivos.push({ texto: 'Tiene pie', puntos: PUNTOS.pie });
  }
  if (respondioQueSi(lead.monthlyPayment)) {
    perfil += PUNTOS.cuota;
    motivos.push({ texto: 'La cuota le calza', puntos: PUNTOS.cuota });
  }
  perfil = Math.min(perfil, TOPE_PERFIL);

  // Interacción
  let interaccion = 0;
  const sumar = (puntos: number, fecha: Date, txt: string) => {
    const p = puntos * decaimiento(fecha, ahora);
    interaccion += p;
    fechas.push(fecha);
    motivos.push({ texto: txt, puntos: p });
  };

  const web = senales.web;
  const whatsapp = masReciente(web.filter(esClicWhatsapp).map((e) => e.fecha));
  if (whatsapp[0]) sumar(PUNTOS.whatsapp, whatsapp[0], `Clic en WhatsApp ${haceCuanto(whatsapp[0], ahora)}`);

  const mensajes = [...senales.mensajes].sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  if (mensajes[0]) {
    const veces = mensajes.length > 1 ? ` (${mensajes.length} mensajes)` : '';
    sumar(
      PUNTOS.chat,
      mensajes[0].fecha,
      `Escribió por ${etiquetaPlataforma(mensajes[0].plataforma)} ${haceCuanto(mensajes[0].fecha, ahora)}${veces}`
    );
  }

  const sesiones = sesionesWeb(web);
  if (sesiones.length) {
    const segundos = sesiones.reduce((t, s) => t + s.segundos, 0);
    const ultima = sesiones[sesiones.length - 1].inicio;
    const tramo = segundos >= 900 ? PUNTOS.web15min : segundos >= 300 ? PUNTOS.web5min : segundos >= 60 ? PUNTOS.web1min : 0;
    if (tramo) sumar(tramo, ultima, `${Math.round(segundos / 60)} min en la web`);
    else fechas.push(ultima);

    // Volvió otro día: cada día distinto después del primero, los más recientes.
    const dias = Array.from(new Set(sesiones.map((s) => diaChile(s.inicio)))).sort();
    // Un solo motivo legible para todas las vueltas.
    const vueltas = dias.slice(1);
    if (vueltas.length) {
      let p = 0;
      for (const dia of vueltas.slice(-PUNTOS.volvioAWebMax)) {
        const inicio = sesiones.find((s) => diaChile(s.inicio) === dia)!.inicio;
        p += PUNTOS.volvioAWeb * decaimiento(inicio, ahora);
      }
      interaccion += p;
      motivos.push({
        texto: vueltas.length === 1 ? 'Volvió a la web otro día' : `Volvió a la web ${vueltas.length} días distintos`,
        puntos: p,
      });
    }
  }

  const clics = masReciente(senales.clicsCorreo);
  if (clics.length) {
    let p = 0;
    for (const f of clics.slice(0, PUNTOS.clicCorreoMax)) p += PUNTOS.clicCorreo * decaimiento(f, ahora);
    interaccion += p;
    fechas.push(clics[0]);
    motivos.push({
      texto: clics.length === 1
        ? `Clic en un correo ${haceCuanto(clics[0], ahora)}`
        : `Clic en ${clics.length} correos, el último ${haceCuanto(clics[0], ahora)}`,
      puntos: p,
    });
  }

  const aperturas = masReciente(senales.aperturas);
  if (aperturas.length) {
    let p = 0;
    for (const f of aperturas.slice(0, PUNTOS.aperturaCorreoMax)) p += PUNTOS.aperturaCorreo * decaimiento(f, ahora);
    interaccion += p;
    fechas.push(aperturas[0]);
    motivos.push({
      texto: aperturas.length === 1 ? `Abrió un correo ${haceCuanto(aperturas[0], ahora)}` : `Abrió ${aperturas.length} correos`,
      puntos: p,
    });
  }

  const botones = web.filter(esBotonInteres).sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  if (botones[0]) {
    const nombre = String(botones[0].details?.element_name || 'un botón de interés').slice(0, 40);
    sumar(PUNTOS.botonInteres, botones[0].fecha, `Clic en "${nombre}" ${haceCuanto(botones[0].fecha, ahora)}`);
  }

  // Las visitas web sin puntos igual cuentan como última interacción.
  for (const e of web) fechas.push(e.fecha);

  interaccion = Math.min(interaccion, TOPE_INTERACCION);
  const score = Math.min(100, Math.round(puntosOrigen + perfil + interaccion));

  let banda: Banda =
    score >= UMBRAL_CALIENTE ? 'CALIENTE' : score >= UMBRAL_TIBIO ? 'TIBIO' : score >= UMBRAL_TEMPLADO ? 'TEMPLADO' : 'FRIO';
  if (bandaAnterior === 'CALIENTE' && banda !== 'CALIENTE' && score >= UMBRAL_SALIDA_CALIENTE) banda = 'CALIENTE';

  const ultimaInteraccion = fechas.length ? masReciente(fechas)[0] : null;

  return {
    score,
    banda,
    origen,
    puntosOrigen,
    puntosPerfil: perfil,
    puntosInteraccion: Math.round(interaccion),
    // El origen va primero; después lo que más pesó.
    motivos: [
      ETIQUETA_ORIGEN[origen],
      ...motivos.filter((m) => m.puntos >= 0.5).sort((a, b) => b.puntos - a.puntos).map((m) => m.texto),
    ],
    ultimaInteraccion,
  };
}

// ---------------------------------------------------------------------------
// Base de datos
// ---------------------------------------------------------------------------

/**
 * La tabla se crea sola si no existe: así el despliegue no depende de un paso
 * manual en la base, que es lo que más veces botó la bandeja del CRM móvil.
 * El mismo SQL queda en scripts/setup_lead_score.sql.
 */
let tablaLista = false;
export async function asegurarTabla() {
  if (tablaLista) return;
  await queryMain(`
    CREATE TABLE IF NOT EXISTS public.lead_score (
      lead_id            text PRIMARY KEY,
      score              integer NOT NULL,
      banda              text NOT NULL,
      origen             text NOT NULL,
      puntos_origen      integer NOT NULL DEFAULT 0,
      puntos_perfil      integer NOT NULL DEFAULT 0,
      puntos_interaccion integer NOT NULL DEFAULT 0,
      motivos            jsonb NOT NULL DEFAULT '[]'::jsonb,
      ultima_interaccion timestamptz,
      caliente_desde     timestamptz,
      calculado_en       timestamptz NOT NULL DEFAULT now()
    )`);
  await queryMain(`CREATE INDEX IF NOT EXISTS idx_lead_score_banda ON public.lead_score (banda, score DESC)`);
  tablaLista = true;
}

/** El listado de leads lo pregunta cada 10 s: una vez que existe, no se vuelve a consultar. */
export async function tablaExiste(): Promise<boolean> {
  if (tablaLista) return true;
  const res = await queryMain(`SELECT to_regclass('public.lead_score') IS NOT NULL AS existe`);
  tablaLista = Boolean(res.rows[0]?.existe);
  return tablaLista;
}

function vacias(): Senales {
  return { aperturas: [], clicsCorreo: [], web: [], mensajes: [] };
}

/** Columnas opcionales de campaign_logs: el clic se agregó después del esquema inicial. */
async function columnasDe(tabla: string, consulta: typeof queryMarketing): Promise<Set<string>> {
  const res = await consulta(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [tabla]
  );
  return new Set(res.rows.map((r: { column_name: string }) => r.column_name));
}

async function leerSenales(): Promise<Map<string, Senales>> {
  const senales = new Map<string, Senales>();
  const de = (id: string) => {
    let s = senales.get(id);
    if (!s) senales.set(id, (s = vacias()));
    return s;
  };

  // Correos (crm_marketing). Las pruebas de envío no cuentan.
  const colLogs = await columnasDe('campaign_logs', queryMarketing);
  if (colLogs.size) {
    const conClic = colLogs.has('last_clicked_at');
    const filtroTest = colLogs.has('is_test') ? 'AND COALESCE(is_test, false) = false' : '';
    const logs = await queryMarketing(
      `SELECT lead_id::text AS lead_id, opened_at, ${conClic ? 'last_clicked_at' : 'NULL::timestamptz AS last_clicked_at'}
         FROM campaign_logs
        WHERE lead_id IS NOT NULL ${filtroTest}
          AND (opened_at > now() - make_interval(days => $1)
               ${conClic ? 'OR last_clicked_at > now() - make_interval(days => $1)' : ''})`,
      [VENTANA_DIAS]
    );
    const limite = Date.now() - VENTANA_DIAS * 86_400_000;
    for (const r of logs.rows) {
      const s = de(r.lead_id);
      if (r.opened_at && new Date(r.opened_at).getTime() > limite) s.aperturas.push(new Date(r.opened_at));
      if (r.last_clicked_at && new Date(r.last_clicked_at).getTime() > limite) s.clicsCorreo.push(new Date(r.last_clicked_at));
    }
  }

  // Actividad web (crm_marketing), incluida la anónima ya asociada al lead.
  const colAct = await columnasDe('lead_activities', queryMarketing);
  if (colAct.size) {
    const act = await queryMarketing(
      `SELECT lead_id::text AS lead_id, event_type, details, created_at
         FROM lead_activities
        WHERE lead_id IS NOT NULL
          AND event_type IN ('PAGE_VISIT', 'PAGE_VIEW', 'CLICK_BUTTON', 'PAGE_TIME')
          AND created_at > now() - make_interval(days => $1)`,
      [VENTANA_DIAS]
    );
    for (const r of act.rows) {
      de(r.lead_id).web.push({ fecha: new Date(r.created_at), tipo: r.event_type, details: r.details || null });
    }
  }

  // Lo que escribió el cliente por Messenger, Instagram o el chat web (crm).
  // createdAt es timestamp sin zona escrito en UTC por Prisma: se convierte
  // explícitamente para no depender de la zona de la sesión.
  const msgs = await queryMain(
    `SELECT c."leadId" AS lead_id, c.platform, (m."createdAt" AT TIME ZONE 'UTC') AS fecha
       FROM "Message" m
       JOIN "Conversation" c ON c.id = m."conversationId"
      WHERE c."leadId" IS NOT NULL
        AND m."senderType" IN ('meta', 'visitor')
        AND (m."createdAt" AT TIME ZONE 'UTC') > now() - make_interval(days => $1)`,
    [VENTANA_DIAS]
  );
  for (const r of msgs.rows) de(r.lead_id).mensajes.push({ fecha: new Date(r.fecha), plataforma: r.platform });

  return senales;
}

const COLUMNAS_LEAD = `id, source, status, interests, "utmSource", "utmMedium", "formId", "adId", pie, "monthlyPayment"`;

/**
 * Recalcula el puntaje de los leads vivos (desde abril 2026, sin importaciones)
 * y de cualquier lead, incluso de la base antigua, que haya interactuado en
 * los últimos 90 días; en ambos casos, solo de los asesores de la rueda.
 * Devuelve cuántos quedaron en cada banda.
 */
export async function recalcularScores() {
  const inicio = Date.now();
  await asegurarTabla();

  const senales = await leerSenales();

  const vivos = await queryMain(
    `SELECT ${COLUMNAS_LEAD} FROM "Lead"
      WHERE "createdAt" >= $1
        AND lower(COALESCE(source, '')) <> ALL($2)
        AND upper(COALESCE(status, '')) <> ALL($3)
        AND "assignedToId" = ANY($4)`,
    [LEADS_DESDE, FUENTES_IMPORTADAS, ESTADOS_CLIENTE, ASESORES_RUEDA]
  );
  const leads = new Map<string, LeadParaScore>(vivos.rows.map((l: LeadParaScore) => [l.id, l]));

  const conSenales = Array.from(senales.keys()).filter((id) => !leads.has(id));
  for (let i = 0; i < conSenales.length; i += 5000) {
    const res = await queryMain(
      `SELECT ${COLUMNAS_LEAD} FROM "Lead"
        WHERE id = ANY($1) AND upper(COALESCE(status, '')) <> ALL($2) AND "assignedToId" = ANY($3)`,
      [conSenales.slice(i, i + 5000), ESTADOS_CLIENTE, ASESORES_RUEDA]
    );
    for (const l of res.rows) leads.set(l.id, l);
  }

  const previos = await queryMain(`SELECT lead_id, banda FROM public.lead_score`);
  const bandaPrevia = new Map<string, Banda>(previos.rows.map((r: { lead_id: string; banda: Banda }) => [r.lead_id, r.banda]));

  const ahora = Date.now();
  const filas = Array.from(leads.values()).map((lead) => ({
    id: lead.id,
    r: calcularScore(lead, senales.get(lead.id) || vacias(), bandaPrevia.get(lead.id) || null, ahora),
  }));

  for (let i = 0; i < filas.length; i += 1000) {
    const lote = filas.slice(i, i + 1000);
    await queryMain(
      `INSERT INTO public.lead_score AS ls
         (lead_id, score, banda, origen, puntos_origen, puntos_perfil, puntos_interaccion,
          motivos, ultima_interaccion, caliente_desde, calculado_en)
       SELECT u.lead_id, u.score, u.banda, u.origen, u.po, u.pp, u.pi,
              u.motivos::jsonb, u.ultima,
              CASE WHEN u.banda = 'CALIENTE' THEN now() END, now()
         FROM unnest($1::text[], $2::int[], $3::text[], $4::text[], $5::int[], $6::int[], $7::int[],
                     $8::text[], $9::timestamptz[])
              AS u(lead_id, score, banda, origen, po, pp, pi, motivos, ultima)
       ON CONFLICT (lead_id) DO UPDATE SET
         score = EXCLUDED.score,
         banda = EXCLUDED.banda,
         origen = EXCLUDED.origen,
         puntos_origen = EXCLUDED.puntos_origen,
         puntos_perfil = EXCLUDED.puntos_perfil,
         puntos_interaccion = EXCLUDED.puntos_interaccion,
         motivos = EXCLUDED.motivos,
         ultima_interaccion = EXCLUDED.ultima_interaccion,
         -- Se conserva mientras siga caliente: los avisos cuentan desde ahí.
         caliente_desde = CASE
           WHEN EXCLUDED.banda <> 'CALIENTE' THEN NULL
           WHEN ls.banda = 'CALIENTE' AND ls.caliente_desde IS NOT NULL THEN ls.caliente_desde
           ELSE now() END,
         calculado_en = now()`,
      [
        lote.map((f) => f.id),
        lote.map((f) => f.r.score),
        lote.map((f) => f.r.banda),
        lote.map((f) => f.r.origen),
        lote.map((f) => f.r.puntosOrigen),
        lote.map((f) => f.r.puntosPerfil),
        lote.map((f) => f.r.puntosInteraccion),
        lote.map((f) => JSON.stringify(f.r.motivos)),
        lote.map((f) => f.r.ultimaInteraccion),
      ]
    );
  }

  // Los que salieron del cálculo (pasaron a cliente, o su señal quedó fuera
  // de la ventana y no son leads vivos) no deben seguir con un puntaje viejo.
  await queryMain(`DELETE FROM public.lead_score WHERE NOT (lead_id = ANY($1))`, [filas.map((f) => f.id)]);

  const bandas = { CALIENTE: 0, TIBIO: 0, TEMPLADO: 0, FRIO: 0 };
  for (const f of filas) bandas[f.r.banda]++;
  return { leads: filas.length, bandas, ms: Date.now() - inicio };
}

/** Evita que dos pasadas se pisen dentro del mismo proceso. */
let enCurso: Promise<Awaited<ReturnType<typeof recalcularScores>>> | null = null;
export function recalcularSinSolapar() {
  if (!enCurso) enCurso = recalcularScores().finally(() => (enCurso = null));
  return enCurso;
}
