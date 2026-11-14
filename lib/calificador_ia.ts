import Anthropic from '@anthropic-ai/sdk';
import { queryMain, queryMarketing } from '@/lib/db';
import { asegurarTablas, listarConocimiento, obtenerAgente, registrarUso } from '@/lib/agentes_ia';
import { calificadorDescansa, calificadorDice, calificadorTrabaja } from '@/lib/oficina';

/**
 * Calificador: lee en silencio las conversaciones del chat web, Instagram y
 * Facebook y deja en ia_calificacion lo que el cliente dijo de su pie, forma
 * de pago, plazo, uso y objeciones, con un puntaje.
 *
 * Usa Claude Sonnet 5.5 con su propia API key (ANTHROPIC_API_KEY_CALIFICADOR)
 * para que su consumo se vea aparte en la consola de Anthropic. Corre solo con
 * CALIFICADOR_ACTIVO=true y el agente encendido en /agentes-ia; si no, la
 * pasada no hace nada. Nunca le escribe al cliente.
 */

const MAX_POR_PASADA = 20;
/** Se califica cuando la conversación lleva este rato sin mensajes nuevos del cliente. */
const ASENTADA_MIN = 10;
const VENTANA_DIAS = 14;
const MAX_CARACTERES = 12_000;

let cliente: Anthropic | null = null;
function anthropic() {
  if (!cliente) cliente = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY_CALIFICADOR });
  return cliente;
}

export function calificadorConfigurado() {
  return Boolean(process.env.ANTHROPIC_API_KEY_CALIFICADOR) && process.env.CALIFICADOR_ACTIVO === 'true';
}

const NO_DICE = 'no_dice';

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'tiene_pie', 'pie_monto', 'forma_pago', 'plazo_compra', 'uso', 'proyecto',
    'quiere_visitar', 'objeciones', 'categoria', 'puntaje', 'resumen',
  ],
  properties: {
    tiene_pie: { type: 'string', enum: ['si', 'no', NO_DICE] },
    pie_monto: { type: 'integer', description: 'Pie en pesos chilenos que el cliente dijo tener. 0 si no lo dijo.' },
    forma_pago: { type: 'string', enum: ['contado', 'credito_directo', NO_DICE] },
    plazo_compra: { type: 'string', enum: ['menos_de_3_meses', '3_a_12_meses', 'mas_de_un_ano', NO_DICE] },
    uso: { type: 'string', enum: ['vivir', 'veraneo', 'inversion', NO_DICE] },
    proyecto: { type: 'string', enum: ['Lomas del Mar', 'Arena y Sol', 'ambos', NO_DICE] },
    quiere_visitar: { type: 'string', enum: ['si', 'no', NO_DICE] },
    objeciones: { type: 'array', items: { type: 'string' }, description: 'Temas de objeción que aparecieron, con el nombre exacto de la lista.' },
    categoria: { type: 'string', enum: ['calificado', 'tibio', 'no_calificado', 'sin_datos'] },
    puntaje: { type: 'integer', description: 'De 0 a 100: qué tan cerca está de comprar.' },
    resumen: { type: 'string', description: 'Una o dos frases para el asesor: qué busca y qué le frena.' },
  },
} as const;

interface Calificacion {
  tiene_pie: 'si' | 'no' | 'no_dice';
  pie_monto: number;
  forma_pago: string;
  plazo_compra: string;
  uso: string;
  proyecto: string;
  quiere_visitar: 'si' | 'no' | 'no_dice';
  objeciones: string[];
  categoria: string;
  puntaje: number;
  resumen: string;
}

const SISTEMA_BASE = `Eres el calificador de leads de Alimin, inmobiliaria que vende terrenos urbanos en El Tabo (Lomas del Mar: 200 y 390 m²; Arena y Sol: 200 m²), al contado o con crédito directo (pie + cuotas).
Lees una conversación entre un cliente y Ali (asistente virtual) o un asesor, y llenas la ficha del cliente.
Reglas:
- Solo anotas lo que el cliente dijo o se desprende sin duda de lo que dijo. Si no lo dijo, el campo va "no_dice" (o 0 en montos).
- Los montos se escriben en pesos chilenos enteros: "5 palos" o "5 millones" = 5000000.
- Nunca inventes objeciones: usa solo los temas de la lista que se te da, con su nombre exacto.
- El resumen es para el asesor: corto, concreto, sin adjetivos.`;

/** Conversaciones con mensajes nuevos del cliente que ya se asentaron. */
async function candidatas() {
  const r = await queryMain(
    `SELECT c.id, c.platform, c."leadId" AS lead_id,
            COALESCE(NULLIF(trim(concat_ws(' ', l."firstName", l."lastName")), ''), c."metaName") AS nombre,
            MAX(m."createdAt" AT TIME ZONE 'UTC') AS ultimo,
            COUNT(*)::int AS mensajes_cliente
       FROM "Conversation" c
       JOIN "Message" m ON m."conversationId" = c.id
       LEFT JOIN "Lead" l ON l.id = c."leadId"
      WHERE c.platform IN ('web', 'instagram', 'facebook')
        AND m."senderType" IN ('meta', 'visitor')
        AND m."sourceType" <> 'COMMENT'
        AND (m."createdAt" AT TIME ZONE 'UTC') > now() - make_interval(days => $1)
      GROUP BY c.id, c.platform, c."leadId", l."firstName", l."lastName", c."metaName"
     HAVING MAX(m."createdAt" AT TIME ZONE 'UTC') < now() - make_interval(mins => $2)
      ORDER BY ultimo DESC
      LIMIT 200`,
    [VENTANA_DIAS, ASENTADA_MIN]
  );
  if (!r.rows.length) return [];
  // ia_calificacion puede vivir en otra base (marketing): se cruza acá y no en SQL.
  const ya = await queryMarketing(
    `SELECT conversacion_id, ultimo_mensaje_at FROM ia_calificacion WHERE conversacion_id = ANY($1)`,
    [r.rows.map((x) => x.id)]
  );
  const vistas = new Map<string, number>(ya.rows.map((x) => [x.conversacion_id, new Date(x.ultimo_mensaje_at).getTime()]));
  return r.rows
    .filter((x) => (vistas.get(x.id) ?? 0) < new Date(x.ultimo).getTime())
    .slice(0, MAX_POR_PASADA);
}

async function transcripcion(conversacionId: string) {
  const r = await queryMain(
    `SELECT text, "senderType" AS de, "sourceType" AS tipo
       FROM "Message" WHERE "conversationId" = $1 AND "sourceType" NOT IN ('EVENTO')
      ORDER BY "createdAt" DESC LIMIT 80`,
    [conversacionId]
  );
  const quien: Record<string, string> = { meta: 'Cliente', visitor: 'Cliente', ali: 'Ali', advisor: 'Asesor' };
  const lineas = r.rows
    .reverse()
    .filter((m) => m.text)
    .map((m) => `${quien[m.de] || m.de}: ${String(m.text).replace(/\s+/g, ' ').trim()}`);
  let texto = lineas.join('\n');
  // Si es muy larga, se queda lo más reciente.
  if (texto.length > MAX_CARACTERES) texto = '…\n' + texto.slice(-MAX_CARACTERES);
  return texto;
}

export interface ResultadoCalificador {
  revisadas: number;
  calificadas: number;
  errores: number;
  costoUSD: number;
  motivo?: string;
}

/**
 * Una pasada. Con `forzar`, corre aunque CALIFICADOR_ACTIVO no esté en true
 * (para probarlo a mano desde el panel), pero igual necesita la API key.
 */
export async function pasadaCalificador({ forzar = false, limite = MAX_POR_PASADA } = {}): Promise<ResultadoCalificador> {
  const vacio = { revisadas: 0, calificadas: 0, errores: 0, costoUSD: 0 };
  if (!process.env.ANTHROPIC_API_KEY_CALIFICADOR) return { ...vacio, motivo: 'Falta ANTHROPIC_API_KEY_CALIFICADOR' };
  if (!forzar && process.env.CALIFICADOR_ACTIVO !== 'true') return { ...vacio, motivo: 'CALIFICADOR_ACTIVO no está en true' };

  await asegurarTablas();
  const agente = await obtenerAgente('calificador');
  if (!agente?.activo) return { ...vacio, motivo: 'El calificador está apagado en /agentes-ia' };

  const temas = (await listarConocimiento({ estado: undefined }))
    .filter((c) => c.tipo === 'objecion' && c.estado !== 'archivada')
    .map((c) => c.tema);
  const sistema = [
    SISTEMA_BASE,
    agente.instrucciones ? `Criterio del equipo:\n${agente.instrucciones}` : '',
    `Temas de objeción posibles: ${temas.length ? temas.join(' | ') : '(ninguno cargado)'}`,
  ].filter(Boolean).join('\n\n');

  const lista = (await candidatas()).slice(0, Math.max(1, Math.min(limite, MAX_POR_PASADA)));
  const resultado: ResultadoCalificador = { ...vacio, revisadas: lista.length };

  for (const c of lista) {
    try {
      const texto = await transcripcion(c.id);
      if (!texto.trim()) continue;

      calificadorTrabaja(c.platform);
      const respuesta = await anthropic().beta.messages.create({
        model: agente.modelo,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA as unknown as Record<string, unknown> } },
        messages: [{ role: 'user', content: `Canal: ${c.platform}\n\nConversación:\n${texto}` }],
      });

      const uso = respuesta.usage;
      resultado.costoUSD += await registrarUso({
        agente: 'calificador',
        canal: c.platform,
        conversacion_id: c.id,
        modelo: respuesta.model || agente.modelo,
        input_tokens: uso.input_tokens,
        output_tokens: uso.output_tokens,
        cache_read_input_tokens: uso.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: uso.cache_creation_input_tokens ?? 0,
      });

      if (respuesta.stop_reason === 'refusal' || respuesta.stop_reason === 'max_tokens') {
        console.warn(`[calificador] ${c.id}: ${respuesta.stop_reason}, se salta.`);
        resultado.errores++;
        continue;
      }
      const json = respuesta.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      const f = JSON.parse(json) as Calificacion;
      const sino = (v: string) => (v === 'si' ? true : v === 'no' ? false : null);
      const nulo = (v: string) => (v && v !== NO_DICE ? v : null);
      const objeciones = (f.objeciones || []).filter((o) => temas.includes(o));

      await queryMarketing(
        `INSERT INTO ia_calificacion
           (conversacion_id, lead_id, canal, nombre, tiene_pie, pie_monto, forma_pago, plazo_compra, uso, proyecto,
            objeciones, quiere_visitar, categoria, puntaje, resumen, ultimo_mensaje_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now())
         ON CONFLICT (conversacion_id) DO UPDATE SET
           lead_id = EXCLUDED.lead_id, canal = EXCLUDED.canal, nombre = EXCLUDED.nombre,
           tiene_pie = EXCLUDED.tiene_pie, pie_monto = EXCLUDED.pie_monto, forma_pago = EXCLUDED.forma_pago,
           plazo_compra = EXCLUDED.plazo_compra, uso = EXCLUDED.uso, proyecto = EXCLUDED.proyecto,
           objeciones = EXCLUDED.objeciones, quiere_visitar = EXCLUDED.quiere_visitar, categoria = EXCLUDED.categoria,
           puntaje = EXCLUDED.puntaje, resumen = EXCLUDED.resumen, ultimo_mensaje_at = EXCLUDED.ultimo_mensaje_at,
           updated_at = now()`,
        [
          c.id, c.lead_id || null, c.platform, c.nombre || null, sino(f.tiene_pie),
          f.pie_monto > 0 ? Math.round(f.pie_monto) : null, nulo(f.forma_pago), nulo(f.plazo_compra), nulo(f.uso),
          nulo(f.proyecto), objeciones, sino(f.quiere_visitar), f.categoria,
          Math.max(0, Math.min(100, Math.round(f.puntaje || 0))), String(f.resumen || '').slice(0, 600), c.ultimo,
        ]
      );
      if (c.lead_id) {
        await escribirEnFicha(c.lead_id, c.platform, f).catch((error) =>
          console.error(`[calificador] No se pudo escribir en la ficha del lead ${c.lead_id}:`, error)
        );
      }
      resultado.calificadas++;
      calificadorDice(f);
    } catch (error) {
      resultado.errores++;
      console.error(`[calificador] Falló la conversación ${c.id}:`, error);
    }
  }
  if (lista.length) setTimeout(calificadorDescansa, 6000);
  return resultado;
}

const USO: Record<string, string> = { vivir: 'para vivir', veraneo: 'para veranear', inversion: 'como inversión' };
const CANAL: Record<string, string> = { web: 'chat web', instagram: 'Instagram', facebook: 'Facebook' };
/** Marca de las notas del calificador en lead_seguimientos (resultado). No cuentan como seguimiento de un asesor. */
export const RESULTADO_IA = 'IA';
/** Una nota de la IA por lead cada este rato: si vuelve a calificar antes, actualiza la misma. */
const HORAS_POR_NOTA = 12;

/**
 * Lo que aprendió el calificador, en la ficha del lead para que el asesor lo
 * vea (Nicolás, 12-11-2026: "sí, sin pisar nada"). Llena el pie y el interés
 * solo si están vacíos y deja el resumen como nota del historial, marcada
 * como de la IA. Nunca cambia lo que escribió un asesor.
 */
async function escribirEnFicha(leadId: string, canal: string, f: Calificacion) {
  const pie =
    f.tiene_pie === 'si'
      ? f.pie_monto > 0
        ? `$${Math.round(f.pie_monto).toLocaleString('es-CL')} (dicho en el chat)`
        : 'Sí (dicho en el chat)'
      : null;
  const proyecto = f.proyecto && f.proyecto !== NO_DICE ? f.proyecto : null;
  const interes = [proyecto, USO[f.uso]].filter(Boolean).join(' ') || null;

  await queryMain(
    `UPDATE "Lead"
        SET pie = CASE WHEN COALESCE(trim(pie), '') = '' AND $2::text IS NOT NULL THEN $2 ELSE pie END,
            interests = CASE WHEN COALESCE(trim(interests), '') = '' AND $3::text IS NOT NULL THEN $3 ELSE interests END
      WHERE id = $1`,
    [leadId, pie, interes]
  );

  const resumen = String(f.resumen || '').trim();
  if (!resumen) return;
  const nota = `Calificador IA (${CANAL[canal] || canal}, ${f.categoria}): ${resumen}`.slice(0, 700);
  const actualizada = await queryMain(
    `UPDATE lead_seguimientos SET nota = $2, created_at = LOCALTIMESTAMP
      WHERE id = (SELECT id FROM lead_seguimientos
                   WHERE lead_id = $1 AND resultado = $3 AND usuario_id IS NULL
                     AND created_at > LOCALTIMESTAMP - make_interval(hours => $4::int)
                   ORDER BY created_at DESC LIMIT 1)`,
    [leadId, nota, RESULTADO_IA, HORAS_POR_NOTA]
  );
  if (!actualizada.rowCount) {
    await queryMain(
      `INSERT INTO lead_seguimientos (lead_id, usuario_id, tipo, resultado, nota) VALUES ($1, NULL, 'NOTA', $2, $3)`,
      [leadId, RESULTADO_IA, nota]
    );
  }
}

/**
 * Señales del calificador que suman al lead score como interacción: quiere
 * visitar, compraría en menos de 3 meses y calificado. Con la fecha en que se
 * detectaron para que decaigan. Solo con "sumar_al_lead_score" prendida.
 */
export async function senalesIAPorLead(): Promise<Map<string, { quiereVisitar: Date | null; plazoCorto: Date | null; calificado: Date | null }>> {
  const resultado = new Map<string, { quiereVisitar: Date | null; plazoCorto: Date | null; calificado: Date | null }>();
  try {
    await asegurarTablas();
    const agente = await obtenerAgente('calificador');
    const prendida = agente?.activo && agente.herramientas.find((h) => h.nombre === 'sumar_al_lead_score')?.activa;
    if (!prendida) return resultado;
    const r = await queryMarketing(
      `SELECT lead_id,
              max(updated_at) FILTER (WHERE quiere_visitar IS TRUE) AS quiere_visitar,
              max(updated_at) FILTER (WHERE plazo_compra = 'menos_de_3_meses') AS plazo_corto,
              max(updated_at) FILTER (WHERE categoria = 'calificado') AS calificado
         FROM ia_calificacion WHERE lead_id IS NOT NULL GROUP BY lead_id`
    );
    const fecha = (v: unknown) => (v ? new Date(v as string) : null);
    for (const x of r.rows) {
      const s = { quiereVisitar: fecha(x.quiere_visitar), plazoCorto: fecha(x.plazo_corto), calificado: fecha(x.calificado) };
      if (s.quiereVisitar || s.plazoCorto || s.calificado) resultado.set(x.lead_id, s);
    }
  } catch (error) {
    console.error('[calificador] No se pudieron leer las señales para el lead score:', error);
  }
  return resultado;
}

/**
 * Lo que el calificador sabe de una persona, para la memoria de Ali (webhook
 * /api/webhooks/ia/calificacion). Por lead si lo hay; si no, por conversación.
 */
export async function calificacionesDe({ leadId, conversacionId }: { leadId?: string | null; conversacionId?: string | null }) {
  if (!leadId && !conversacionId) return [];
  await asegurarTablas();
  const r = await queryMarketing(
    `SELECT canal, tiene_pie, pie_monto, forma_pago, plazo_compra, uso, proyecto, quiere_visitar,
            objeciones, categoria, puntaje, resumen, updated_at
       FROM ia_calificacion
      WHERE ($1::text IS NOT NULL AND lead_id = $1) OR ($2::text IS NOT NULL AND conversacion_id = $2)
      ORDER BY updated_at DESC LIMIT 3`,
    [leadId || null, conversacionId || null]
  );
  return r.rows;
}

/**
 * Leads que el calificador marcó como "calificado" en las últimas horas, para
 * avisarle al asesor a cargo (webhook /api/webhooks/ia/calificados, lo pide el
 * CRM móvil cada 10 minutos). El CRM móvil decide a quién avisar y no repite.
 */
export async function calificadosRecientes(horas: number) {
  await asegurarTablas();
  const r = await queryMarketing(
    `SELECT DISTINCT ON (lead_id) lead_id, canal, proyecto, resumen, puntaje, updated_at
       FROM ia_calificacion
      WHERE categoria = 'calificado' AND lead_id IS NOT NULL
        AND updated_at > now() - make_interval(hours => $1::int)
      ORDER BY lead_id, updated_at DESC`,
    [Math.max(1, Math.min(48, Math.round(horas)))]
  );
  return r.rows;
}

let corriendo = false;
export async function pasadaCalificadorSinSolapar(opciones?: { forzar?: boolean; limite?: number }) {
  if (corriendo) return { revisadas: 0, calificadas: 0, errores: 0, costoUSD: 0, motivo: 'Ya hay una pasada corriendo' };
  corriendo = true;
  try {
    return await pasadaCalificador(opciones);
  } finally {
    corriendo = false;
  }
}

/**
 * Leads a los que el calificador les escuchó decir que tienen pie, para que el
 * lead score lo cuente como si lo hubieran marcado en el formulario. Solo si
 * la herramienta "sumar_al_lead_score" está prendida. Nunca rompe el lead score.
 */
export async function leadsConPieSegunIA(): Promise<string[]> {
  try {
    await asegurarTablas();
    const agente = await obtenerAgente('calificador');
    const prendida = agente?.activo && agente.herramientas.find((h) => h.nombre === 'sumar_al_lead_score')?.activa;
    if (!prendida) return [];
    const r = await queryMarketing(`SELECT DISTINCT lead_id FROM ia_calificacion WHERE tiene_pie IS TRUE AND lead_id IS NOT NULL`);
    return r.rows.map((x) => x.lead_id);
  } catch (error) {
    console.error('[calificador] No se pudo leer el pie para el lead score:', error);
    return [];
  }
}
