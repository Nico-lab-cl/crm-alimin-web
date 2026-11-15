import Anthropic from '@anthropic-ai/sdk';
import { queryMarketing } from '@/lib/db';
import { registrarUso } from '@/lib/agentes_ia';
import { AGENTES_OFICINA, NOMBRE_AGENTE, asegurarTablaRegistro, esAgenteOficina, type AgenteOficina } from '@/lib/oficina_registro';

/**
 * Director de la Oficina IA (Nicolás, 14-11-2026): cada 15 minutos de día,
 * Haiku 5.5 lee lo que pasó hoy en la oficina (solo canal, acción y conteos;
 * nunca datos de clientes) y decide:
 * - qué piensa cada agente (la nube gris de la oficina),
 * - una o dos charlas entre agentes sobre lo que pasó (uno camina al
 *   escritorio del otro y conversan),
 * - a veces una nota para la pizarra, que es la memoria de la oficina.
 *
 * Es ambiente con contenido real: no cambia lo que las IA que atienden le
 * dicen a los clientes (no leen la pizarra). Cuesta menos de un dólar al mes
 * y queda en ia_uso como agente "oficina".
 *
 * Se apaga con OFICINA_DIRECTOR_ACTIVO=false. Sin OFICINA_IA_URL no corre.
 */

const MODELO = 'claude-haiku-5-5';
const HORA_INICIO = 8;
const HORA_FIN = 23;
const CADA_MS = 15 * 60 * 1000;
const QUIENES_CAMINAN = ['ali', 'calificador', 'cierre'] as const;

const INICIO_HOY = `date_trunc('day', now() AT TIME ZONE 'America/Santiago') AT TIME ZONE 'America/Santiago'`;

let cliente: Anthropic | null = null;
function apiKey() {
  return process.env.ANTHROPIC_API_KEY_OFICINA || process.env.ANTHROPIC_API_KEY_INVESTIGACION || process.env.ANTHROPIC_API_KEY_CALIFICADOR || process.env.ANTHROPIC_API_KEY;
}
function anthropic() {
  const clave = apiKey();
  if (!clave) throw new Error('Falta ANTHROPIC_API_KEY_OFICINA (o la del calificador)');
  if (!cliente) cliente = new Anthropic({ apiKey: clave });
  return cliente;
}

export function directorActivo() {
  return process.env.OFICINA_DIRECTOR_ACTIVO !== 'false' && Boolean(process.env.OFICINA_IA_URL && process.env.IA_SECRET && apiKey());
}

// --- Pizarra: notas y charlas que quedan guardadas ---

let tablaLista = false;
async function asegurarPizarra() {
  if (tablaLista) return;
  await queryMarketing(`
    CREATE TABLE IF NOT EXISTS oficina_pizarra (
      id BIGSERIAL PRIMARY KEY,
      tipo TEXT NOT NULL,
      autor TEXT NOT NULL,
      para TEXT,
      texto TEXT NOT NULL,
      respuesta TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await queryMarketing(`CREATE INDEX IF NOT EXISTS oficina_pizarra_fecha ON oficina_pizarra (created_at DESC)`);
  tablaLista = true;
}

export interface EntradaPizarra {
  id: number;
  tipo: 'nota' | 'charla';
  autor: AgenteOficina;
  para: AgenteOficina | null;
  texto: string;
  respuesta: string | null;
  created_at: string;
}

export async function leerPizarra(limite = 20): Promise<EntradaPizarra[]> {
  await asegurarPizarra();
  const r = await queryMarketing(
    `SELECT id, tipo, autor, para, texto, respuesta, created_at FROM oficina_pizarra ORDER BY created_at DESC LIMIT $1`,
    [Math.min(Math.max(limite, 1), 100)]
  );
  return r.rows.map((x) => ({ ...x, id: Number(x.id), created_at: new Date(x.created_at).toISOString() }));
}

// --- Lo que pasó hoy (sin datos de clientes) ---

async function hechosDelDia() {
  await asegurarTablaRegistro();
  const lineas: string[] = [];

  const registro = await queryMarketing(
    `SELECT agente, tipo, texto, count(*)::int AS n, max(created_at) AS ultima
       FROM oficina_registro WHERE created_at >= ${INICIO_HOY}
      GROUP BY 1, 2, 3 ORDER BY n DESC, ultima DESC LIMIT 40`
  );
  for (const a of AGENTES_OFICINA) {
    const filas = registro.rows.filter((x) => x.agente === a && x.tipo === 'dijo');
    if (!filas.length) continue;
    lineas.push(`${NOMBRE_AGENTE[a]} hoy: ${filas.map((x) => `"${x.texto}" ×${x.n}`).join('; ')}`);
  }

  const conversaciones = await queryMarketing(
    `SELECT agente, count(DISTINCT conversacion_id)::int AS n FROM ia_uso
      WHERE created_at >= ${INICIO_HOY} AND agente IN ('atraccion', 'calificador', 'cierre') GROUP BY 1`
  ).catch(() => ({ rows: [] as { agente: string; n: number }[] }));
  const nombreUso: Record<string, string> = { atraccion: NOMBRE_AGENTE.ali, calificador: NOMBRE_AGENTE.calificador, cierre: NOMBRE_AGENTE.cierre };
  for (const c of conversaciones.rows) lineas.push(`${nombreUso[c.agente]}: ${c.n} conversaciones hoy.`);

  // Lo último de cada investigador: datos públicos (avisos, anuncios, noticias).
  const informes = await queryMarketing(
    `SELECT DISTINCT ON (agente) agente, texto, created_at FROM inv_informes ORDER BY agente, created_at DESC`
  ).catch(() => ({ rows: [] as { agente: string; texto: string }[] }));
  for (const i of informes.rows) {
    const agente: unknown = i.agente;
    if (esAgenteOficina(agente)) lineas.push(`Último informe de ${NOMBRE_AGENTE[agente]}: ${String(i.texto).replace(/\s+/g, ' ').slice(0, 400)}`);
  }

  const pizarra = await leerPizarra(10);
  const notas = pizarra.filter((p) => p.tipo === 'nota').slice(0, 6).map((p) => `- ${NOMBRE_AGENTE[p.autor]}: ${p.texto}`);
  const charlas = pizarra.filter((p) => p.tipo === 'charla').slice(0, 4).map((p) => `- ${NOMBRE_AGENTE[p.autor]} → ${p.para ? NOMBRE_AGENTE[p.para] : ''}: ${p.texto}`);

  const hora = new Date().toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hour12: false });
  return [
    `Hora en Chile: ${hora}.`,
    lineas.length ? `Lo que pasó hoy:\n${lineas.join('\n')}` : 'Hoy todavía no hay trabajo registrado.',
    notas.length ? `Pizarra (notas anteriores):\n${notas.join('\n')}` : 'La pizarra está vacía.',
    charlas.length ? `Charlas recientes (no las repitas):\n${charlas.join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

// --- El modelo ---

const SISTEMA = `Diriges una oficina animada donde trabajan las IA de Alimin, que vende terrenos urbanos en El Tabo (proyectos Lomas del Mar y Arena y Sol).
Los agentes:
- ali: "Ali - Interacción", atiende el chat web, Instagram y Facebook.
- calificador: "Ali - Calificador", lee las conversaciones y suma al lead score.
- cierre: "Ali - Cierre", acompaña a quien ya visitó y le escribe los correos post-visita.
- competencia: "Ali - Competencia", revisa avisos de terrenos de la competencia.
- anuncios: "Ali - Anuncios", revisa anuncios de la competencia en Meta.
- mercado: "Ali - Mercado", lee noticias del sector.

Con lo que pasó hoy, decides qué piensan y de qué conversan en la oficina. Lo leen los gerentes en globos pequeños.
Reglas:
- Usa solo los hechos que recibes. No inventes cifras, precios, nombres, fechas ni datos de Alimin. Si hoy no hubo trabajo, hablen de la rutina o de lo que dice la pizarra, sin inventar resultados.
- Nunca nombres ni describas a un cliente.
- Textos muy cortos: cada "dice", "responde" y "texto" con 45 caracteres como máximo. Español de Chile, tono de compañeros de trabajo, cordial y concreto.
- Di "terrenos" o "proyecto", nunca "loteo".
- pensamientos: uno por agente (los 6), lo que tiene en la cabeza ahora según su trabajo.
- charlas: 1 o 2. "de" es quien camina (ali, calificador o cierre) y "para" es otro agente distinto. Que sirvan para pasarse información útil de lo que pasó, no saludos vacíos.
- notas: 0 o 1. Solo si hay algo que valga la pena recordar para mañana (un patrón, algo que se repite). No repitas notas de la pizarra.`;

const AGENTES_ENUM = [...AGENTES_OFICINA] as string[];
const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['pensamientos', 'charlas', 'notas'],
  properties: {
    pensamientos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['agente', 'texto'],
        properties: { agente: { type: 'string', enum: AGENTES_ENUM }, texto: { type: 'string' } },
      },
    },
    charlas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['de', 'para', 'dice', 'responde'],
        properties: {
          de: { type: 'string', enum: [...QUIENES_CAMINAN] },
          para: { type: 'string', enum: AGENTES_ENUM },
          dice: { type: 'string' },
          responde: { type: 'string' },
        },
      },
    },
    notas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['autor', 'texto'],
        properties: { autor: { type: 'string', enum: AGENTES_ENUM }, texto: { type: 'string' } },
      },
    },
  },
} as const;

interface Guion {
  pensamientos: { agente: string; texto: string }[];
  charlas: { de: string; para: string; dice: string; responde: string }[];
  notas: { autor: string; texto: string }[];
}

const corto = (t: unknown, max = 60) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Una pasada: piensa, guarda en la pizarra y le manda el guion a la oficina. */
export async function pasadaDirector() {
  const material = await hechosDelDia();
  const respuesta = await anthropic().messages.create({
    model: MODELO,
    max_tokens: 1500,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA as unknown as Record<string, unknown> } },
    system: SISTEMA,
    messages: [{ role: 'user', content: material }],
  });
  const costo = await registrarUso({
    agente: 'oficina',
    canal: 'director',
    modelo: respuesta.model || MODELO,
    input_tokens: respuesta.usage.input_tokens,
    output_tokens: respuesta.usage.output_tokens,
    cache_read_input_tokens: respuesta.usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: respuesta.usage.cache_creation_input_tokens ?? 0,
  });
  if (respuesta.stop_reason === 'refusal' || respuesta.stop_reason === 'max_tokens') {
    throw new Error(`el director no terminó (${respuesta.stop_reason})`);
  }
  const json = respuesta.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const g = JSON.parse(json) as Guion;

  const pensamientos = (g.pensamientos ?? [])
    .filter((p) => esAgenteOficina(p.agente) && corto(p.texto))
    .map((p) => ({ agente: p.agente, texto: corto(p.texto) }));
  const charlas = (g.charlas ?? [])
    .filter((c) => (QUIENES_CAMINAN as readonly string[]).includes(c.de) && esAgenteOficina(c.para) && c.de !== c.para && corto(c.dice))
    .slice(0, 2)
    .map((c) => ({ de: c.de, para: c.para, dice: corto(c.dice), responde: corto(c.responde) }));
  const notas = (g.notas ?? [])
    .filter((n) => esAgenteOficina(n.autor) && corto(n.texto))
    .slice(0, 1)
    .map((n) => ({ autor: n.autor, texto: corto(n.texto, 120) }));

  await asegurarPizarra();
  for (const c of charlas) {
    await queryMarketing(`INSERT INTO oficina_pizarra (tipo, autor, para, texto, respuesta) VALUES ('charla', $1, $2, $3, $4)`, [c.de, c.para, c.dice, c.responde]);
  }
  for (const n of notas) {
    await queryMarketing(`INSERT INTO oficina_pizarra (tipo, autor, texto) VALUES ('nota', $1, $2)`, [n.autor, n.texto]);
  }
  // Se guarda un año de pizarra; lo más viejo se borra de vez en cuando.
  if (Math.random() < 0.02) await queryMarketing(`DELETE FROM oficina_pizarra WHERE created_at < now() - interval '400 days'`);

  const base = process.env.OFICINA_IA_URL!.replace(/\/+$/, '');
  const r = await fetch(`${base}/api/escena`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ia-secret': process.env.IA_SECRET! },
    body: JSON.stringify({ pensamientos, charlas, notas }),
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) console.warn(`[oficina] La oficina respondió ${r.status} al guion.`);
  return { pensamientos: pensamientos.length, charlas: charlas.length, notas: notas.length, costoUSD: costo };
}

let corriendo = false;
let ultima = 0;

/** La llama el temporizador cada minuto: corre cada 15 min entre 08:00 y 23:00 de Chile, sin solaparse. */
export async function pasadaDirectorSiToca() {
  const hora = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago', hour: '2-digit', hour12: false }));
  if (hora < HORA_INICIO || hora >= HORA_FIN) return null;
  if (corriendo || Date.now() - ultima < CADA_MS) return null;
  corriendo = true;
  ultima = Date.now();
  try {
    return await pasadaDirector();
  } finally {
    corriendo = false;
  }
}
