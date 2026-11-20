import Anthropic from '@anthropic-ai/sdk';
import { queryMain, queryMarketing } from '@/lib/db';
import { registrarUso } from '@/lib/agentes_ia';

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

/*
 * Datos de Alimin que el juez usa para revisar precios y promesas. Si cambia un
 * precio en el sitio (src/lib/ali/conocimiento.ts), hay que cambiarlo aquí.
 */
const SISTEMA = `Eres el revisor de calidad de Ali, la asistente virtual de Alimin (inmobiliaria que vende terrenos urbanos en El Tabo, Litoral Central). Lees una conversación real entre un cliente y Ali (a veces también un asesor) y anotas los errores de Ali. No le escribes a nadie.

Datos de Alimin (para revisar precios y promesas)
- Lomas del Mar: terrenos de 200 m² ($35.000.000 al contado; crédito directo con pie de $5.500.000 y 60 cuotas de $550.000, $37.990.000 en total) y de 390 m² ($43.000.000 al contado; pie de $7.500.000 y 70 cuotas de $550.000, $45.990.000 en total). Entrega por etapas, la primera a fines de 2027 aproximadamente. A 10 minutos de la playa.
- Arena y Sol: terrenos de 200 m², $39.000.000 al contado; pie de $20.000.000 y 44 cuotas de $500.000 ($42.000.000 en total). Entrega a fines de 2026 aproximadamente. A 8 minutos de la playa.
- El rol propio, la escritura y los traspasos se dicen siempre en futuro ("se van a entregar con rol propio"). No hay descuentos ni promociones vigentes (la Mini Pie terminó).

Cómo debe atender Ali
- Responde a lo que la persona dijo en su último mensaje. Un "gracias", "ok", "ya lo vi" o solo un emoji o sticker es un cierre: se responde con una línea cálida, sin precios ni preguntas, o no se responde si Ali ya se despidió.
- Precio siempre completo: contado y crédito con el total. Si la persona no dijo el tamaño de Lomas del Mar, los dos tamaños, primero el de 200 m². Si ya vio los precios (por ejemplo, en el mensaje automático con el brochure), no los repite.
- Si dice que es caro, valida, ofrece una vez la opción más accesible y no insiste.
- Se presenta una sola vez y no repite la misma pregunta ni la misma despedida. Pide el nombre una vez; nunca pide el teléfono en WhatsApp (ya lo tiene).
- Mensajes cortos, como en un chat; nada de frases de bot ("Estoy aquí para ayudarte", "¡Excelente pregunta!").
- Un audio se escucha, no se lee: nunca "te leo" de un audio.
- Deriva a un asesor si la persona lo pide, quiere reservar o cambiar una visita, o está molesta.

Cómo calificas
- Marca solo errores claros de Ali, con la cita exacta de su mensaje. Si Ali lo hizo bien, la lista de errores va vacía. No marques errores de los asesores ni de los mensajes automáticos.
- Gravedad alta: puede hacer perder la venta o crear un reclamo (dato equivocado, insistir, vender en un cierre). Media: molesta o confunde. Baja: detalle de forma.
- La nota es de 0 a 100: 90 o más si atendió bien; menos de 60 si hubo un error grave.
- "abandono" es true solo si la persona dejó de responder justo después de un mensaje de Ali que probablemente lo causó (por ejemplo, un precio que nadie pidió o una insistencia). Si la conversación terminó bien, es false.`;

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

async function calificar(canal: string, texto: string, conversacionId: string) {
  const respuesta = await anthropic().beta.messages.create({
    model: MODELO,
    max_tokens: 2500,
    system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
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
 * semana solo se vuelve a revisar si tuvo mensajes nuevos.
 */
export async function correrRevision(): Promise<ResultadoRevision> {
  const semana = lunesDeEstaSemana();
  const vacio = { semana, revisadas: 0, conErrores: 0, fallidas: 0, costoUSD: 0 };
  if (!claveRevision()) return { ...vacio, motivo: 'Falta la API key (ANTHROPIC_API_KEY_REVISION)' };
  if (corriendo) return { ...vacio, motivo: 'Ya hay una revisión en curso' };
  corriendo = true;
  const resultado: ResultadoRevision = { ...vacio };
  try {
    await asegurarTablas();
    const lista = await candidatas();
    const ya = await queryMarketing(
      `SELECT conversacion_id, ultimo_mensaje_at FROM ia_revision_ali WHERE semana = $1 AND conversacion_id = ANY($2)`,
      [semana, lista.map((x) => x.id)]
    );
    const vistas = new Map<string, number>(ya.rows.map((x) => [x.conversacion_id, new Date(x.ultimo_mensaje_at).getTime()]));

    for (const conv of lista) {
      if ((vistas.get(conv.id) ?? 0) >= new Date(conv.ultimo).getTime()) continue;
      try {
        const texto = await transcripcion(conv.id);
        if (!texto.trim()) continue;
        const { c, costo } = await calificar(conv.platform, texto, conv.id);
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
             estado = CASE WHEN EXCLUDED.errores = '[]'::jsonb THEN 'pendiente' ELSE ia_revision_ali.estado END`,
          [
            semana, conv.id, conv.platform, conv.nombre || null, conv.lead_id || null, c.nota,
            JSON.stringify(c.errores), String(c.resumen || '').slice(0, 600), Boolean(c.abandono), texto, conv.ultimo,
          ]
        );
      } catch (error) {
        resultado.fallidas++;
        console.error(`[revision-ali] Falló la conversación ${conv.id}:`, error);
      }
    }
    await queryMarketing(
      `INSERT INTO ia_revision_ali_corridas (semana, revisadas, errores, costo_usd)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (semana) DO UPDATE SET
         revisadas = ia_revision_ali_corridas.revisadas + EXCLUDED.revisadas,
         errores = ia_revision_ali_corridas.errores + EXCLUDED.errores,
         costo_usd = ia_revision_ali_corridas.costo_usd + EXCLUDED.costo_usd,
         error = NULL, created_at = now()`,
      [semana, resultado.revisadas, resultado.conErrores, resultado.costoUSD]
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
}

export async function leerRevision(semanaPedida?: string) {
  await asegurarTablas();
  const semanas = (
    await queryMarketing(
      `SELECT to_char(semana, 'YYYY-MM-DD') AS semana, revisadas, errores, costo_usd, error, created_at
         FROM ia_revision_ali_corridas ORDER BY semana DESC LIMIT 26`
    )
  ).rows as { semana: string; revisadas: number; errores: number; costo_usd: string; error: string | null; created_at: string }[];
  const semana = semanaPedida && /^\d{4}-\d{2}-\d{2}$/.test(semanaPedida) ? semanaPedida : semanas[0]?.semana;
  if (!semana) return { semanas, semana: null, filas: [] as FilaRevision[], enCurso: corriendo };
  const filas = (
    await queryMarketing(
      `SELECT id, conversacion_id, canal, nombre, nota, errores, resumen, abandono, transcripcion, estado, ultimo_mensaje_at
         FROM ia_revision_ali WHERE semana = $1 ORDER BY nota ASC, id ASC`,
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
