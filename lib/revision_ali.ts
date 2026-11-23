import Anthropic from '@anthropic-ai/sdk';
import { queryMain, queryMarketing } from '@/lib/db';
import { actualizarConocimiento, crearConocimiento, registrarUso, type Conocimiento } from '@/lib/agentes_ia';

/**
 * Revisión semanal de Ali (Fase 1 del roadmap, 20-11-2026).
 *
 * Cada lunes después de las 10:30 (hora de Chile) toma las conversaciones en
 * que Ali respondió durante los últimos 7 días (chat web, Instagram, Facebook
 * y WhatsApp) y un juez (Haiku) las califica con una pauta fija. Los errores
 * quedan en ia_revision_ali y se revisan en /agentes-ia/revision, donde
 * Nicolás los marca como "error real" o "falso aviso". Los reales pasan a ser
 * casos de prueba (Fase 2, scripts/casos-ali.mjs del sitio).
 *
 * Idea del curso de evaluaciones de Anthropic: otra IA califica con una pauta
 * escrita, y una persona revisa una muestra de sus notas para comprobar que el
 * juez califica bien antes de confiar en él.
 *
 * Nunca le escribe al cliente. Apagar: REVISION_ALI_ACTIVA=false. Key:
 * ANTHROPIC_API_KEY_REVISION, o la de investigación o la del calificador.
 */

const MODELO = 'claude-haiku-5-5';
const DIAS = 7;
/** Tope de conversaciones por semana: cada una es una llamada a Haiku (~US$0,005). */
const MAX_POR_SEMANA = 120;
const MAX_CARACTERES = 14_000;

export const CRITERIOS = {
  no_respondio: 'No respondió lo que la persona preguntó o dijo',
  vendio_en_cierre: 'Vendió o mandó información cuando la persona agradecía o cerraba',
  precio_mal: 'Precio incompleto, repetido o del tamaño equivocado',
  insistio: 'Insistió después de un "no" o de una objeción',
  repitio: 'Repitió la presentación, una pregunta o un mensaje',
  dato_dudoso: 'Dijo algo que no calza con la información de Alimin',
  sono_a_bot: 'Sonó a bot, largo o desordenado',
  pidio_de_mas: 'Pidió datos que ya tenía o los pidió de nuevo',
  derivacion: 'Derivó sin necesidad o no derivó cuando debía',
} as const;
export type Criterio = keyof typeof CRITERIOS;
export type EstadoError = 'pendiente' | 'real' | 'falso';

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['nota', 'errores', 'resumen', 'abandono'],
  properties: {
    nota: { type: 'integer', description: 'De 0 a 100: qué tan bien atendió Ali esta conversación.' },
    errores: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['criterio', 'gravedad', 'cita', 'explicacion'],
        properties: {
          criterio: { type: 'string', enum: Object.keys(CRITERIOS) },
          gravedad: { type: 'string', enum: ['alta', 'media', 'baja'] },
          cita: { type: 'string', description: 'Texto exacto (o el comienzo) del mensaje de Ali con el error.' },
          explicacion: { type: 'string', description: 'Una frase: qué hizo mal y qué debió hacer.' },
        },
      },
    },
    resumen: { type: 'string', description: 'Una frase sobre cómo atendió Ali en general.' },
    abandono: { type: 'boolean', description: 'true si la persona dejó de responder justo después de un mensaje de Ali que probablemente lo causó.' },
  },
} as const;

/**
 * Pauta del juez. Los datos de Alimin y las reglas de Ali NO van aquí: el juez
 * lee la ficha real de Ali desde el sitio (/api/ali/ficha), así nunca queda
 * desalineado con las mejoras que se le hacen a Ali (Nicolás, 20-11-2026: el
 * juez marcaba como "dato que no está" lo que Ali sí tiene, como que en la
 * etapa 1 de Lomas del Mar ya no quedan terrenos de 390 m²).
 */
const PAUTA = `Eres el revisor de calidad de Ali, la asistente virtual de Alimin. Lees una conversación real entre un cliente y Ali (a veces también un asesor) y anotas los errores de Ali. No le escribes a nadie.

Abajo están las instrucciones completas que sigue Ali. Son la única verdad sobre Alimin y sobre cómo debe atender:
- Un dato que está en esas instrucciones NO es inventado. "Dato dudoso" es solo lo que contradice las instrucciones o lo que Ali promete sin respaldo en ellas.
- Ali tiene herramientas que consultan datos reales (lotes disponibles, horarios de visita, documentos): lo que viene de ellas tampoco es inventado, salvo que contradiga algo dicho en la misma conversación.
- Una regla que está en las instrucciones es la que manda: califica contra ella, no contra tu propio criterio.
- Si no estás seguro de que algo sea un error según las instrucciones, no lo marques.

Cómo calificas
- Marca solo errores claros de Ali, con la cita exacta de su mensaje. Si Ali lo hizo bien, la lista de errores va vacía. No marques errores de los asesores ni de los mensajes automáticos.
- Gravedad alta: puede hacer perder la venta o crear un reclamo (dato equivocado, insistir, vender en un cierre). Media: molesta o confunde. Baja: detalle de forma.
- La nota es de 0 a 100: 90 o más si atendió bien; menos de 60 si hubo un error grave.
- "abandono" es true solo si la persona dejó de responder justo después de un mensaje de Ali que probablemente lo causó (por ejemplo, un precio que nadie pidió o una insistencia). Si la conversación terminó bien, es false.`;

const SITIO = (process.env.ALI_SITIO_URL || 'https://aliminspa.cl').replace(/\/+$/, '');

/** La ficha completa de Ali (la misma que lee ella), desde el sitio. */
async function fichaDeAli(): Promise<{ texto: string; version: string }> {
  const secreto = process.env.IA_SECRET;
  if (!secreto) throw new Error('Falta IA_SECRET para leer la ficha de Ali');
  const res = await fetch(`${SITIO}/api/ali/ficha`, { headers: { 'x-ia-secret': secreto }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`El sitio no entregó la ficha de Ali (HTTP ${res.status})`);
  const j = (await res.json()) as { texto?: string; version?: string };
  if (!j.texto) throw new Error('La ficha de Ali llegó vacía');
  return { texto: j.texto, version: j.version || '?' };
}

const sistemaConFicha = (ficha: { texto: string; version: string }) =>
  `${PAUTA}\n\n# Instrucciones de Ali (versión ${ficha.version})\n${ficha.texto}`;

interface Calificacion {
  nota: number;
  errores: { criterio: Criterio; gravedad: 'alta' | 'media' | 'baja'; cita: string; explicacion: string }[];
  resumen: string;
  abandono: boolean;
}

let cliente: Anthropic | null = null;
function claveRevision() {
  return (
    process.env.ANTHROPIC_API_KEY_REVISION ||
    process.env.ANTHROPIC_API_KEY_INVESTIGACION ||
    process.env.ANTHROPIC_API_KEY_CALIFICADOR ||
    ''
  );
}
function anthropic() {
  if (!cliente) cliente = new Anthropic({ apiKey: claveRevision() });
  return cliente;
}

export function revisionActiva() {
  return process.env.REVISION_ALI_ACTIVA !== 'false';
}

let tablasListas = false;
async function asegurarTablas() {
  if (tablasListas) return;
  await queryMarketing(`
    CREATE TABLE IF NOT EXISTS ia_revision_ali (
      id BIGSERIAL PRIMARY KEY,
      semana DATE NOT NULL,
      conversacion_id TEXT NOT NULL,
      canal TEXT NOT NULL,
      nombre TEXT,
      lead_id TEXT,
      nota INT NOT NULL,
      errores JSONB NOT NULL DEFAULT '[]'::jsonb,
      resumen TEXT,
      abandono BOOLEAN NOT NULL DEFAULT FALSE,
      transcripcion TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      ultimo_mensaje_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (semana, conversacion_id)
    )`);
  await queryMarketing(`CREATE INDEX IF NOT EXISTS ia_revision_ali_semana ON ia_revision_ali (semana DESC, nota)`);
  await queryMarketing(`
    CREATE TABLE IF NOT EXISTS ia_revision_ali_corridas (
      semana DATE PRIMARY KEY,
      revisadas INT NOT NULL DEFAULT 0,
      errores INT NOT NULL DEFAULT 0,
      costo_usd NUMERIC(10, 4) NOT NULL DEFAULT 0,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await queryMarketing(`ALTER TABLE ia_revision_ali_corridas ADD COLUMN IF NOT EXISTS ficha_version TEXT`);
  // Casos de prueba que salen de errores reales (Fase 2): los lee scripts/casos-ali.mjs del sitio.
  await queryMarketing(`
    CREATE TABLE IF NOT EXISTS ia_casos_ali (
      id BIGSERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      canal TEXT NOT NULL,
      mensajes JSONB NOT NULL,
      debe JSONB NOT NULL DEFAULT '[]'::jsonb,
      revision_id BIGINT UNIQUE,
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  // Regla que salió de este error (ia_conocimiento): así Ali aprende, no solo se prueba.
  await queryMarketing(`ALTER TABLE ia_revision_ali ADD COLUMN IF NOT EXISTS regla_id UUID`);
  tablasListas = true;
}

/** Fecha (YYYY-MM-DD) del lunes de esta semana en Chile: identifica la revisión. */
function lunesDeEstaSemana() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(new Date());
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  const hoy = new Date(Date.UTC(Number(v('year')), Number(v('month')) - 1, Number(v('day'))));
  const dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(v('weekday'));
  hoy.setUTCDate(hoy.getUTCDate() - ((dia + 6) % 7));
  return hoy.toISOString().slice(0, 10);
}

function ahoraChile() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(new Date());
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  return { minutos: Number(v('hour')) * 60 + Number(v('minute')), lunes: v('weekday') === 'Mon' };
}

/** Conversaciones en que Ali respondió en los últimos DIAS días. */
async function candidatas() {
  const r = await queryMain(
    `SELECT c.id, c.platform, c."leadId" AS lead_id,
            COALESCE(NULLIF(trim(concat_ws(' ', l."firstName", l."lastName")), ''), c."metaName") AS nombre,
            MAX(m."createdAt" AT TIME ZONE 'UTC') AS ultimo
       FROM "Conversation" c
       JOIN "Message" m ON m."conversationId" = c.id
       LEFT JOIN "Lead" l ON l.id = c."leadId"
      WHERE c.platform IN ('web', 'instagram', 'facebook', 'whatsapp')
        AND m."senderType" = 'ali'
        AND m."sourceType" NOT IN ('EVENTO', 'AUTO')
        AND m."createdAt" > (now() AT TIME ZONE 'UTC') - make_interval(days => $1)
      GROUP BY c.id, c.platform, c."leadId", l."firstName", l."lastName", c."metaName"
      ORDER BY ultimo DESC
      LIMIT $2`,
    [DIAS, MAX_POR_SEMANA]
  );
  return r.rows as { id: string; platform: string; lead_id: string | null; nombre: string | null; ultimo: string }[];
}

/** La conversación como texto para el juez: quién dijo qué, en orden. */
async function transcripcion(conversacionId: string) {
  const r = await queryMain(
    `SELECT text, "senderType" AS de, "sourceType" AS tipo
       FROM "Message"
      WHERE "conversationId" = $1 AND "sourceType" <> 'EVENTO' AND text IS NOT NULL
      ORDER BY "createdAt" DESC LIMIT 80`,
    [conversacionId]
  );
  const lineas = r.rows.reverse().map((m) => {
    const texto = String(m.text).replace(/\s+/g, ' ').trim();
    if (m.de === 'ali' && m.tipo === 'AUTO') return `[Mensaje automático con el brochure]: ${texto}`;
    if (m.de === 'ali') return `Ali${m.tipo === 'HANDOFF' ? ' (deriva a un asesor)' : ''}: ${texto}`;
    if (m.de === 'advisor') return `Asesor: ${texto}`;
    if (m.tipo === 'COMMENT') return `Cliente (comentario en una publicación): ${texto}`;
    return `Cliente: ${texto}`;
  });
  let texto = lineas.join('\n');
  if (texto.length > MAX_CARACTERES) texto = '…\n' + texto.slice(-MAX_CARACTERES);
  return texto;
}

async function calificar(sistema: string, canal: string, texto: string, conversacionId: string) {
  const respuesta = await anthropic().beta.messages.create({
    model: MODELO,
    max_tokens: 2500,
    system: [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA as unknown as Record<string, unknown> } },
    messages: [{ role: 'user', content: `Canal: ${canal}\n\nConversación:\n${texto}` }],
  });
  const uso = respuesta.usage;
  const costo = await registrarUso({
    agente: 'revision',
    canal,
    conversacion_id: conversacionId,
    modelo: respuesta.model || MODELO,
    input_tokens: uso.input_tokens,
    output_tokens: uso.output_tokens,
    cache_read_input_tokens: uso.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: uso.cache_creation_input_tokens ?? 0,
  });
  if (respuesta.stop_reason === 'refusal' || respuesta.stop_reason === 'max_tokens') {
    throw new Error(`El juez terminó con ${respuesta.stop_reason}`);
  }
  const json = respuesta.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const c = JSON.parse(json) as Calificacion;
  c.errores = (c.errores || []).filter((e) => e.criterio in CRITERIOS);
  c.nota = Math.max(0, Math.min(100, Math.round(c.nota || 0)));
  return { c, costo };
}

let corriendo = false;
export function revisionEnCurso() {
  return corriendo;
}

export interface ResultadoRevision {
  semana: string;
  revisadas: number;
  conErrores: number;
  fallidas: number;
  costoUSD: number;
  motivo?: string;
}

/**
 * Revisa las conversaciones de la semana. Una conversación ya revisada esta
 * semana solo se vuelve a revisar si tuvo mensajes nuevos, salvo con
 * `rehacer` (por ejemplo, después de mejorar a Ali o al juez): ahí se revisa
 * todo de nuevo y las marcas vuelven a "pendiente".
 */
export async function correrRevision({ rehacer = false } = {}): Promise<ResultadoRevision> {
  const semana = lunesDeEstaSemana();
  const vacio = { semana, revisadas: 0, conErrores: 0, fallidas: 0, costoUSD: 0 };
  if (!claveRevision()) return { ...vacio, motivo: 'Falta la API key (ANTHROPIC_API_KEY_REVISION)' };
  if (corriendo) return { ...vacio, motivo: 'Ya hay una revisión en curso' };
  corriendo = true;
  const resultado: ResultadoRevision = { ...vacio };
  try {
    await asegurarTablas();
    // Sin la ficha real de Ali no se revisa: un juez con datos viejos marca errores que no son.
    const ficha = await fichaDeAli();
    const sistema = sistemaConFicha(ficha);
    const lista = await candidatas();
    const ya = await queryMarketing(
      `SELECT conversacion_id, ultimo_mensaje_at FROM ia_revision_ali WHERE semana = $1 AND conversacion_id = ANY($2)`,
      [semana, lista.map((x) => x.id)]
    );
    const vistas = new Map<string, number>(ya.rows.map((x) => [x.conversacion_id, new Date(x.ultimo_mensaje_at).getTime()]));

    for (const conv of lista) {
      if (!rehacer && (vistas.get(conv.id) ?? 0) >= new Date(conv.ultimo).getTime()) continue;
      try {
        const texto = await transcripcion(conv.id);
        if (!texto.trim()) continue;
        const { c, costo } = await calificar(sistema, conv.platform, texto, conv.id);
        resultado.costoUSD += costo;
        resultado.revisadas++;
        if (c.errores.length) resultado.conErrores++;
        await queryMarketing(
          `INSERT INTO ia_revision_ali
             (semana, conversacion_id, canal, nombre, lead_id, nota, errores, resumen, abandono, transcripcion, ultimo_mensaje_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (semana, conversacion_id) DO UPDATE SET
             nota = EXCLUDED.nota, errores = EXCLUDED.errores, resumen = EXCLUDED.resumen,
             abandono = EXCLUDED.abandono, transcripcion = EXCLUDED.transcripcion,
             ultimo_mensaje_at = EXCLUDED.ultimo_mensaje_at, nombre = EXCLUDED.nombre,
             estado = CASE WHEN $12 OR EXCLUDED.errores = '[]'::jsonb THEN 'pendiente' ELSE ia_revision_ali.estado END`,
          [
            semana, conv.id, conv.platform, conv.nombre || null, conv.lead_id || null, c.nota,
            JSON.stringify(c.errores), String(c.resumen || '').slice(0, 600), Boolean(c.abandono), texto, conv.ultimo,
            rehacer,
          ]
        );
      } catch (error) {
        resultado.fallidas++;
        console.error(`[revision-ali] Falló la conversación ${conv.id}:`, error);
      }
    }
    // Los totales se cuentan desde la tabla: con "rehacer" no se suman dos veces.
    await queryMarketing(
      `INSERT INTO ia_revision_ali_corridas (semana, revisadas, errores, costo_usd, ficha_version)
       SELECT $1, COUNT(*), COUNT(*) FILTER (WHERE errores <> '[]'::jsonb), $2, $3
         FROM ia_revision_ali WHERE semana = $1
       ON CONFLICT (semana) DO UPDATE SET
         revisadas = EXCLUDED.revisadas, errores = EXCLUDED.errores,
         costo_usd = ia_revision_ali_corridas.costo_usd + EXCLUDED.costo_usd,
         ficha_version = EXCLUDED.ficha_version, error = NULL, created_at = now()`,
      [semana, resultado.costoUSD, ficha.version]
    );
    return resultado;
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);
    // Queda anotado para no reintentar (y pagar) cada 15 minutos.
    await queryMarketing(
      `INSERT INTO ia_revision_ali_corridas (semana, error) VALUES ($1, $2)
       ON CONFLICT (semana) DO UPDATE SET error = EXCLUDED.error, created_at = now()`,
      [semana, motivo.slice(0, 500)]
    ).catch(() => {});
    throw error;
  } finally {
    corriendo = false;
  }
}

/** Cada 15 minutos desde instrumentation.ts: el lunes después de las 10:30, una vez por semana. */
export async function pasadaRevision() {
  if (!revisionActiva() || corriendo) return null;
  const { minutos, lunes } = ahoraChile();
  if (!lunes || minutos < 10 * 60 + 30) return null;
  await asegurarTablas();
  const ya = await queryMarketing(`SELECT 1 FROM ia_revision_ali_corridas WHERE semana = $1`, [lunesDeEstaSemana()]);
  if (ya.rows.length) return null;
  return correrRevision();
}

/* ── Lectura para el panel ──────────────────────────────────────────────── */

export interface FilaRevision {
  id: number;
  conversacion_id: string;
  canal: string;
  nombre: string | null;
  nota: number;
  errores: Calificacion['errores'];
  resumen: string | null;
  abandono: boolean;
  transcripcion: string;
  estado: EstadoError;
  ultimo_mensaje_at: string | null;
  /** Ya se convirtió en caso de prueba (ia_casos_ali). */
  caso_id?: number | null;
  /** Regla creada desde este error (ia_conocimiento) y su estado. */
  regla_id?: string | null;
  regla_estado?: string | null;
}

export async function leerRevision(semanaPedida?: string) {
  await asegurarTablas();
  const semanas = (
    await queryMarketing(
      `SELECT to_char(semana, 'YYYY-MM-DD') AS semana, revisadas, errores, costo_usd, error, ficha_version, created_at
         FROM ia_revision_ali_corridas ORDER BY semana DESC LIMIT 26`
    )
  ).rows as { semana: string; revisadas: number; errores: number; costo_usd: string; error: string | null; created_at: string }[];
  const semana = semanaPedida && /^\d{4}-\d{2}-\d{2}$/.test(semanaPedida) ? semanaPedida : semanas[0]?.semana;
  if (!semana) return { semanas, semana: null, filas: [] as FilaRevision[], enCurso: corriendo };
  const filas = (
    await queryMarketing(
      `SELECT r.id, r.conversacion_id, r.canal, r.nombre, r.nota, r.errores, r.resumen, r.abandono, r.transcripcion,
              r.estado, r.ultimo_mensaje_at, c.id AS caso_id, r.regla_id, k.estado AS regla_estado
         FROM ia_revision_ali r
         LEFT JOIN ia_casos_ali c ON c.revision_id = r.id AND c.activo
         LEFT JOIN ia_conocimiento k ON k.id = r.regla_id
        WHERE r.semana = $1 ORDER BY r.nota ASC, r.id ASC`,
      [semana]
    )
  ).rows as FilaRevision[];
  return { semanas, semana, filas, enCurso: corriendo };
}

export async function marcarEstado(id: number, estado: EstadoError) {
  await asegurarTablas();
  if (!['pendiente', 'real', 'falso'].includes(estado)) throw new Error('Estado inválido');
  await queryMarketing(`UPDATE ia_revision_ali SET estado = $2 WHERE id = $1`, [id, estado]);
}

/* ── Casos de prueba desde errores reales (Fase 2) ─────────────────────── */

type MensajeCaso = { de: 'cliente' | 'ali' | 'asesor'; texto: string };

/** De vuelta de la transcripción guardada a mensajes, para el chat de prueba. */
function mensajesDeTranscripcion(transcripcion: string): MensajeCaso[] {
  const mensajes: MensajeCaso[] = [];
  for (const linea of transcripcion.split('\n')) {
    let m: RegExpMatchArray | null;
    if ((m = linea.match(/^\[Mensaje automático con el brochure\]: (.*)$/))) mensajes.push({ de: 'ali', texto: `[Mensaje automático con el brochure] ${m[1]}` });
    else if ((m = linea.match(/^Ali(?: \(deriva a un asesor\))?: (.*)$/))) mensajes.push({ de: 'ali', texto: m[1] });
    else if ((m = linea.match(/^Asesor: (.*)$/))) mensajes.push({ de: 'asesor', texto: m[1] });
    else if ((m = linea.match(/^Cliente(?: \(comentario en una publicación\))?: (.*)$/))) mensajes.push({ de: 'cliente', texto: m[1] });
  }
  return mensajes;
}

const normalizar = (t: string) => t.toLowerCase().replace(/^ali[^:]*:\s*/, '').replace(/[«»"“”]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Convierte una conversación marcada como "error real" en un caso de prueba:
 * se corta justo antes del primer mensaje de Ali con error (y de las burbujas
 * de Ali de ese mismo turno), para que la prueba le pida a Ali responder de
 * nuevo ese momento. `debe` es lo que Ali tenía que hacer, en palabras simples.
 */
export async function crearCasoDesdeRevision(revisionId: number, debe: string[]) {
  await asegurarTablas();
  const r = await queryMarketing(`SELECT * FROM ia_revision_ali WHERE id = $1`, [revisionId]);
  const fila = r.rows[0] as FilaRevision | undefined;
  if (!fila) throw new Error('No encontré esa revisión');
  const mensajes = mensajesDeTranscripcion(fila.transcripcion);
  const citas = (fila.errores || []).map((e) => normalizar(e.cita).slice(0, 40)).filter((c) => c.length >= 8);
  let corte = mensajes.findIndex((m) => m.de === 'ali' && citas.some((c) => normalizar(m.texto).includes(c)));
  if (corte < 0) corte = mensajes.length;
  const antes = mensajes.slice(0, corte);
  // El caso tiene que terminar en un mensaje del cliente: se quitan las burbujas de Ali de ese turno.
  while (antes.length && antes[antes.length - 1].de !== 'cliente') antes.pop();
  if (!antes.length) throw new Error('No encontré un mensaje del cliente antes del error');
  const lista = debe.map((d) => d.trim()).filter(Boolean).slice(0, 8);
  if (!lista.length) throw new Error('Escribe al menos una cosa que Ali debía hacer');
  const primerError = fila.errores[0];
  const nombre = `${CRITERIOS[primerError?.criterio as Criterio] || 'Error real'} · ${fila.nombre || 'cliente'} (${fila.canal})`;
  const ins = await queryMarketing(
    `INSERT INTO ia_casos_ali (nombre, canal, mensajes, debe, revision_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (revision_id) DO UPDATE SET nombre = EXCLUDED.nombre, mensajes = EXCLUDED.mensajes, debe = EXCLUDED.debe, activo = TRUE
     RETURNING id`,
    [nombre.slice(0, 200), fila.canal === 'web' ? 'instagram' : fila.canal, JSON.stringify(antes.slice(-40)), JSON.stringify(lista), revisionId]
  );
  return { id: ins.rows[0].id as number, mensajes: antes.length };
}

/* ── Regla desde un error real: Ali aprende (23-11-2026) ───────────────── */
/*
 * El caso de prueba solo comprueba; lo que cambia a Ali es una regla aprobada
 * en ia_conocimiento (la lee el sitio cada ~5 minutos). Al marcar un error
 * real, el juez propone la regla general (sin nombres ni datos del cliente) y
 * Nicolás la aprueba con un clic. Nunca se aprueba sola: el juez también se
 * equivoca, y una regla mala la sigue Ali con todos los clientes.
 */

export interface ReglaPropuesta {
  /** La ficha ya dice esto: Ali no lo siguió, así que una regla más puede no bastar. */
  ya_cubierta: boolean;
  /** Qué parte de la ficha ya lo dice (vacío si no está). */
  donde: string;
  tema: string;
  como_lo_dice: string;
  respuesta: string;
  /** Lo que Ali debía hacer en ese momento, para el caso de prueba. */
  debe: string[];
}

const ESQUEMA_REGLA = {
  type: 'object',
  additionalProperties: false,
  required: ['ya_cubierta', 'donde', 'tema', 'como_lo_dice', 'respuesta', 'debe'],
  properties: {
    ya_cubierta: { type: 'boolean', description: 'true si las instrucciones de Ali ya dicen claramente lo que debía hacer.' },
    donde: { type: 'string', description: 'Si ya_cubierta, la frase de las instrucciones que ya lo dice (corta). Si no, vacío.' },
    tema: { type: 'string', description: 'Título corto de la regla, máximo 70 caracteres. Ej: "Clienta que ya compró y reclama".' },
    como_lo_dice: { type: 'string', description: 'Cuándo aplica: la situación o lo que dice el cliente, en general (sin su nombre).' },
    respuesta: { type: 'string', description: 'Lo que Ali debe hacer o responder, como instrucción directa y general, en 1 a 3 frases.' },
    debe: { type: 'array', items: { type: 'string' }, description: 'De 1 a 4 cosas concretas que Ali debía hacer en ESE momento de la conversación.' },
  },
} as const;

const PAUTA_REGLA = `Eres quien mejora a Ali, la asistente virtual de Alimin. Te paso una conversación real donde Ali se equivocó y los errores que encontró el revisor, ya confirmados por el equipo. Escribe UNA regla para que Ali no repita el error con ningún cliente.

Cómo escribes la regla
- General: nada de nombres, teléfonos ni detalles de este cliente. Sirve para cualquier persona en la misma situación.
- Directa, en segunda persona ("Si…, deriva…"), en español de Chile neutro, sin modismos.
- Solo sobre cómo atender. No inventes datos de Alimin (precios, plazos, obras, documentos): si el error fue un dato, la regla dice qué NO afirmar o que se use lo que está en las instrucciones.
- Corta: de 1 a 3 frases.
- Si las instrucciones de abajo ya dicen claramente lo que Ali debía hacer, marca ya_cubierta y cita dónde; igual escribe la regla, más específica para esta situación.`;

export async function proponerRegla(revisionId: number): Promise<ReglaPropuesta> {
  await asegurarTablas();
  if (!claveRevision()) throw new Error('Falta la API key (ANTHROPIC_API_KEY_REVISION)');
  const r = await queryMarketing(`SELECT * FROM ia_revision_ali WHERE id = $1`, [revisionId]);
  const fila = r.rows[0] as FilaRevision | undefined;
  if (!fila) throw new Error('No encontré esa revisión');
  if (!fila.errores?.length) throw new Error('Esta conversación no tiene errores');
  const ficha = await fichaDeAli();
  const errores = fila.errores
    .map((e) => `- ${CRITERIOS[e.criterio] || e.criterio} (gravedad ${e.gravedad}): «${e.cita}» → ${e.explicacion}`)
    .join('\n');
  const respuesta = await anthropic().beta.messages.create({
    model: MODELO,
    max_tokens: 1500,
    system: [
      { type: 'text', text: `${PAUTA_REGLA}\n\n# Instrucciones actuales de Ali (versión ${ficha.version})\n${ficha.texto}`, cache_control: { type: 'ephemeral' } },
    ],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA_REGLA as unknown as Record<string, unknown> } },
    messages: [
      { role: 'user', content: `Canal: ${fila.canal}\n\nErrores confirmados:\n${errores}\n\nConversación:\n${fila.transcripcion.slice(-8000)}` },
    ],
  });
  const uso = respuesta.usage;
  await registrarUso({
    agente: 'revision',
    canal: fila.canal,
    conversacion_id: fila.conversacion_id,
    modelo: respuesta.model || MODELO,
    input_tokens: uso.input_tokens,
    output_tokens: uso.output_tokens,
    cache_read_input_tokens: uso.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: uso.cache_creation_input_tokens ?? 0,
  });
  if (respuesta.stop_reason === 'refusal' || respuesta.stop_reason === 'max_tokens') {
    throw new Error(`El juez terminó con ${respuesta.stop_reason}`);
  }
  const json = respuesta.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const p = JSON.parse(json) as ReglaPropuesta;
  return {
    ya_cubierta: Boolean(p.ya_cubierta),
    donde: String(p.donde || '').slice(0, 400),
    tema: String(p.tema || '').slice(0, 120),
    como_lo_dice: String(p.como_lo_dice || ''),
    respuesta: String(p.respuesta || ''),
    debe: (Array.isArray(p.debe) ? p.debe : []).map(String).filter(Boolean).slice(0, 6),
  };
}

/**
 * Guarda la regla en el conocimiento de Ali (tipo "regla", fuente "Juez
 * semanal") y la deja ligada al error. Con `aprobar`, queda aprobada de
 * inmediato y Ali la usa en unos 5 minutos.
 */
export async function crearReglaDesdeRevision(
  revisionId: number,
  d: { tema: string; como_lo_dice?: string | null; respuesta: string; aprobar?: boolean }
) {
  await asegurarTablas();
  const r = await queryMarketing(`SELECT id, nombre, canal, errores, regla_id FROM ia_revision_ali WHERE id = $1`, [revisionId]);
  const fila = r.rows[0] as Pick<FilaRevision, 'id' | 'nombre' | 'canal' | 'errores' | 'regla_id'> | undefined;
  if (!fila) throw new Error('No encontré esa revisión');
  if (!d.tema?.trim() || !d.respuesta?.trim()) throw new Error('La regla necesita tema y qué debe hacer Ali');
  const cita = fila.errores?.[0]?.cita ? `Ali había respondido: «${fila.errores[0].cita.slice(0, 300)}». ` : '';
  const nota = `${cita}Revisión semanal #${fila.id} (${fila.nombre || 'cliente'}, ${fila.canal}).`;

  let regla: Conocimiento;
  if (fila.regla_id) {
    // Ya había una: se corrige la misma en vez de duplicarla.
    regla = await actualizarConocimiento(fila.regla_id, {
      tema: d.tema, como_lo_dice: d.como_lo_dice ?? null, respuesta: d.respuesta, ...(d.aprobar ? { estado: 'aprobada' } : {}),
    });
  } else {
    let tema = d.tema.trim();
    // El tema es único por tipo: si ya existe uno igual, se le agrega el número de la revisión.
    const igual = await queryMarketing(`SELECT 1 FROM ia_conocimiento WHERE tipo = 'regla' AND tema = $1`, [tema]);
    if (igual.rowCount) tema = `${tema} (#${fila.id})`;
    regla = await crearConocimiento({
      tipo: 'regla', tema, como_lo_dice: d.como_lo_dice || null, respuesta: d.respuesta, fuente: 'Juez semanal', nota, agentes: ['atraccion'],
    });
    if (d.aprobar) regla = await actualizarConocimiento(regla.id, { estado: 'aprobada' });
    await queryMarketing(`UPDATE ia_revision_ali SET regla_id = $2 WHERE id = $1`, [revisionId, regla.id]);
  }
  return { id: regla.id, estado: regla.estado };
}

/** Casos activos, para scripts/casos-ali.mjs del sitio (vía /api/webhooks/ia/casos-ali). */
export async function listarCasos() {
  await asegurarTablas();
  const r = await queryMarketing(
    `SELECT id, nombre, canal, mensajes, debe, revision_id, created_at FROM ia_casos_ali WHERE activo ORDER BY id`
  );
  return r.rows;
}
