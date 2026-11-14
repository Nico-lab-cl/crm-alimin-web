import { queryMain, queryMarketing } from '@/lib/db';

/**
 * Historial de la Oficina IA (Nicolás, 14-11-2026): al tocar un agente en la
 * oficina se ve lo que hizo hoy, ayer, en la semana o en las fechas que se
 * elijan, y un botón al CRM con las conversaciones que atendió.
 *
 * - oficina_registro guarda las tareas que la oficina recibe (el servidor de
 *   la oficina las reenvía aquí). Son los mismos textos de la oficina: canal y
 *   acción, sin datos de clientes.
 * - Las conversaciones salen de ia_uso (cada llamada al modelo con su
 *   conversación) y su texto de la base principal. Eso solo se ve en el CRM,
 *   con sesión iniciada; a la oficina solo le llegan conteos.
 */

export const AGENTES_OFICINA = ['ali', 'calificador', 'cierre', 'competencia', 'anuncios', 'mercado'] as const;
export type AgenteOficina = (typeof AGENTES_OFICINA)[number];
export const INVESTIGADORES: AgenteOficina[] = ['competencia', 'anuncios', 'mercado'];

/** Cómo se llama cada uno en ia_uso. Ali - Interacción registra como "atraccion". */
const AGENTE_USO: Partial<Record<AgenteOficina, string>> = { ali: 'atraccion', calificador: 'calificador', cierre: 'cierre' };

export const NOMBRE_AGENTE: Record<AgenteOficina, string> = {
  ali: 'Ali - Interacción',
  calificador: 'Ali - Calificador',
  cierre: 'Ali - Cierre',
  competencia: 'Ali - Competencia',
  anuncios: 'Ali - Anuncios',
  mercado: 'Ali - Mercado',
};

export function esAgenteOficina(v: unknown): v is AgenteOficina {
  return typeof v === 'string' && (AGENTES_OFICINA as readonly string[]).includes(v);
}

let tablaLista = false;
export async function asegurarTablaRegistro() {
  if (tablaLista) return;
  await queryMarketing(`
    CREATE TABLE IF NOT EXISTS oficina_registro (
      id BIGSERIAL PRIMARY KEY,
      agente TEXT NOT NULL,
      tipo TEXT NOT NULL,
      texto TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await queryMarketing(`CREATE INDEX IF NOT EXISTS oficina_registro_agente_fecha ON oficina_registro (agente, created_at)`);
  tablaLista = true;
}

/** tipo: "tarea" (se puso a trabajar en algo) o "dijo" (lo que contó al terminar). */
export async function registrarEnOficina(agente: AgenteOficina, tipo: 'tarea' | 'dijo', texto: string) {
  await asegurarTablaRegistro();
  const limpio = texto.replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!limpio) return;
  // La oficina repite la misma tarea mientras trabaja: no se duplica dentro de 2 minutos.
  await queryMarketing(
    `INSERT INTO oficina_registro (agente, tipo, texto)
     SELECT $1, $2, $3
      WHERE NOT EXISTS (SELECT 1 FROM oficina_registro
                         WHERE agente = $1 AND tipo = $2 AND texto = $3 AND created_at > now() - interval '2 minutes')`,
    [agente, tipo, limpio]
  );
  if (Math.random() < 0.01) {
    await queryMarketing(`DELETE FROM oficina_registro WHERE created_at < now() - interval '400 days'`);
  }
}

export interface Rango {
  /** YYYY-MM-DD en hora de Chile, ambos incluidos. */
  desde: string;
  hasta: string;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Fechas de la URL, o hoy si vienen mal. Máximo un año. */
export function leerRango(desde: string | null, hasta: string | null): Rango {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
  let d = desde && FECHA.test(desde) ? desde : hoy;
  let h = hasta && FECHA.test(hasta) ? hasta : d;
  if (d > h) [d, h] = [h, d];
  const unAno = new Date(Date.parse(h) - 366 * 86400000).toISOString().slice(0, 10);
  if (d < unAno) d = unAno;
  return { desde: d, hasta: h };
}

/** Condición SQL de rango sobre una columna timestamptz, con $desde y $hasta en las posiciones dadas. */
const enRango = (col: string, pd: number, ph: number) =>
  `${col} >= ($${pd}::date)::timestamp AT TIME ZONE 'America/Santiago'
   AND ${col} < ($${ph}::date + 1)::timestamp AT TIME ZONE 'America/Santiago'`;

const comoBuscar = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

async function tareas(agente: AgenteOficina, r: Rango, q: string) {
  await asegurarTablaRegistro();
  const params: unknown[] = [agente, r.desde, r.hasta];
  let filtro = '';
  if (q) {
    params.push(comoBuscar(q));
    filtro = `AND texto ILIKE $4`;
  }
  const res = await queryMarketing(
    `SELECT tipo, texto, created_at FROM oficina_registro
      WHERE agente = $1 AND ${enRango('created_at', 2, 3)} ${filtro}
      ORDER BY created_at DESC LIMIT 500`,
    params
  );
  return res.rows as { tipo: string; texto: string; created_at: string }[];
}

interface UsoConversacion {
  conversacion_id: string;
  canal: string | null;
  primera: string;
  ultima: string;
  respuestas: number;
  costo_usd: number;
}

async function usoPorConversacion(agente: AgenteOficina, r: Rango): Promise<UsoConversacion[]> {
  const id = AGENTE_USO[agente];
  if (!id) return [];
  const res = await queryMarketing(
    `SELECT conversacion_id, max(canal) AS canal, min(created_at) AS primera, max(created_at) AS ultima,
            count(*)::int AS respuestas, COALESCE(sum(costo_usd), 0)::float AS costo_usd
       FROM ia_uso
      WHERE agente = $1 AND conversacion_id IS NOT NULL AND ${enRango('created_at', 2, 3)}
      GROUP BY conversacion_id
      ORDER BY ultima DESC
      LIMIT 500`,
    [id, r.desde, r.hasta]
  );
  return res.rows;
}

/** Lo que ve la oficina: tareas (sin datos de clientes) y cuántas conversaciones atendió. */
export async function historialOficina(agente: AgenteOficina, r: Rango, q: string) {
  const [lista, usos, informes] = await Promise.all([
    tareas(agente, r, q),
    usoPorConversacion(agente, r),
    INVESTIGADORES.includes(agente)
      ? queryMarketing(`SELECT count(*)::int AS n FROM inv_informes WHERE agente = $1 AND ${enRango('created_at', 2, 3)}`, [agente, r.desde, r.hasta])
          .then((x) => x.rows[0]?.n ?? 0)
          .catch(() => 0)
      : Promise.resolve(0),
  ]);
  return {
    agente,
    rango: r,
    tareas: lista.slice(0, 200),
    resumen: {
      tareas: lista.length,
      conversaciones: usos.length,
      respuestas: usos.reduce((s, u) => s + u.respuestas, 0),
      informes,
    },
  };
}

/** Correos post-visita de Cierre: "correo:<leadId>:paso-N". */
function leerCorreo(id: string) {
  const m = /^correo:([^:]+):paso-(\d+)$/.exec(id);
  return m ? { leadId: m[1], paso: Number(m[2]) } : null;
}

export interface ConversacionHistorial {
  id: string;
  tipo: 'chat' | 'correo';
  canal: string | null;
  nombre: string | null;
  lead_id: string | null;
  paso: number | null;
  primera: string;
  ultima: string;
  respuestas: number;
  costo_usd: number;
}

/** Lo que ve el CRM: tareas, conversaciones con nombre y, en investigadores, sus informes. */
export async function historialCompleto(agente: AgenteOficina, r: Rango, q: string) {
  const [lista, usos] = await Promise.all([tareas(agente, r, ''), usoPorConversacion(agente, r)]);

  const chats = usos.filter((u) => !leerCorreo(u.conversacion_id)).map((u) => u.conversacion_id);
  const leadsCorreo = Array.from(new Set(usos.map((u) => leerCorreo(u.conversacion_id)?.leadId).filter((x): x is string => !!x)));

  const [infoChats, infoLeads, coinciden] = await Promise.all([
    chats.length
      ? queryMain(
          `SELECT c.id, c.platform, c."leadId" AS lead_id,
                  COALESCE(NULLIF(trim(concat_ws(' ', l."firstName", l."lastName")), ''), c."metaName") AS nombre
             FROM "Conversation" c LEFT JOIN "Lead" l ON l.id = c."leadId"
            WHERE c.id = ANY($1)`,
          [chats]
        ).then((x) => x.rows)
      : Promise.resolve([]),
    leadsCorreo.length
      ? queryMain(
          `SELECT id, NULLIF(trim(concat_ws(' ', "firstName", "lastName")), '') AS nombre FROM "Lead" WHERE id = ANY($1)`,
          [leadsCorreo]
        ).then((x) => x.rows)
      : Promise.resolve([]),
    q && chats.length
      ? queryMain(
          `SELECT DISTINCT "conversationId" AS id FROM "Message" WHERE "conversationId" = ANY($1) AND text ILIKE $2`,
          [chats, comoBuscar(q)]
        ).then((x) => new Set(x.rows.map((m) => m.id as string)))
      : Promise.resolve(new Set<string>()),
  ]);
  const porChat = new Map(infoChats.map((c) => [c.id as string, c]));
  const porLead = new Map(infoLeads.map((l) => [l.id as string, l.nombre as string | null]));

  let conversaciones: ConversacionHistorial[] = usos.map((u) => {
    const correo = leerCorreo(u.conversacion_id);
    if (correo) {
      return {
        id: u.conversacion_id, tipo: 'correo', canal: 'correo', nombre: porLead.get(correo.leadId) ?? null, lead_id: correo.leadId,
        paso: correo.paso, primera: u.primera, ultima: u.ultima, respuestas: u.respuestas, costo_usd: u.costo_usd,
      };
    }
    const c = porChat.get(u.conversacion_id);
    return {
      id: u.conversacion_id, tipo: 'chat', canal: (c?.platform as string) ?? u.canal, nombre: (c?.nombre as string) ?? null,
      lead_id: (c?.lead_id as string) ?? null, paso: null, primera: u.primera, ultima: u.ultima, respuestas: u.respuestas, costo_usd: u.costo_usd,
    };
  });

  let tareasFiltradas = lista;
  if (q) {
    const t = q.toLowerCase();
    tareasFiltradas = lista.filter((x) => x.texto.toLowerCase().includes(t));
    conversaciones = conversaciones.filter((c) => coinciden.has(c.id) || (c.nombre ?? '').toLowerCase().includes(t));
  }

  const informes = INVESTIGADORES.includes(agente)
    ? await queryMarketing(
        `SELECT id, tipo, texto, created_at FROM inv_informes
          WHERE agente = $1 AND ${enRango('created_at', 2, 3)} ${q ? `AND texto ILIKE $4` : ''}
          ORDER BY created_at DESC LIMIT 100`,
        q ? [agente, r.desde, r.hasta, comoBuscar(q)] : [agente, r.desde, r.hasta]
      ).then((x) => x.rows).catch(() => [])
    : [];

  return { agente, rango: r, tareas: tareasFiltradas, conversaciones, informes };
}

/** Mensajes de una conversación (chat web, Instagram o Facebook). */
export async function mensajesDeConversacion(id: string) {
  const r = await queryMain(
    `SELECT text, "senderType" AS de, "sourceType" AS tipo, "createdAt" AT TIME ZONE 'UTC' AS creado
       FROM "Message" WHERE "conversationId" = $1 AND "sourceType" NOT IN ('EVENTO') AND text IS NOT NULL
      ORDER BY "createdAt" ASC LIMIT 400`,
    [id]
  );
  return r.rows as { text: string; de: string; tipo: string; creado: string }[];
}
