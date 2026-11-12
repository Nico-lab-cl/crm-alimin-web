import { queryMain, queryMarketing } from '@/lib/db';
import { CONOCIMIENTO_INICIAL } from '@/lib/conocimiento_inicial';

/**
 * Agentes IA: lo que se ve y se edita en /agentes-ia.
 *
 * El flujo (Atracción → Calificador → Cierre → Asesores) está fijo en el
 * código; en cada agente el equipo cambia sus instrucciones, el conocimiento
 * que usa y qué herramientas tiene prendidas. Los otros sistemas (Ali en el
 * sitio, la respuesta automática de IG/FB) leen esta configuración por
 * /api/webhooks/ia/config y reportan cada llamada a Claude por
 * /api/webhooks/ia/uso, que es de donde sale el indicador de gasto.
 *
 * Solo el conocimiento "aprobada" llega a la IA. Todo lo que se carga nace
 * "por_revisar": nada de lo que diga una objeción cargada sin revisar puede
 * terminar en la boca de Ali.
 */

export type AgenteId = 'atraccion' | 'calificador' | 'cierre';
export const AGENTES: AgenteId[] = ['atraccion', 'calificador', 'cierre'];

export type EstadoConocimiento = 'por_revisar' | 'aprobada' | 'corregir' | 'archivada';
export const ESTADOS: EstadoConocimiento[] = ['por_revisar', 'aprobada', 'corregir', 'archivada'];
export type TipoConocimiento = 'objecion' | 'dato' | 'regla';
export const TIPOS: TipoConocimiento[] = ['objecion', 'dato', 'regla'];

export interface Herramienta {
  nombre: string;
  descripcion: string;
  /** No se puede apagar desde el panel. */
  fija?: boolean;
}

interface AgenteBase {
  id: AgenteId;
  nombre: string;
  rol: string;
  modelo: string;
  /** El agente todavía no corre: se muestra en el mapa, pero no se usa. */
  enConstruccion?: boolean;
  instrucciones: string;
  herramientas: Herramienta[];
}

/** Catálogo de cada agente. Las herramientas son las que existen en el código. */
export const AGENTES_BASE: Record<AgenteId, AgenteBase> = {
  atraccion: {
    id: 'atraccion',
    nombre: 'Ali · Atracción',
    rol: 'Atiende el chat web, Instagram y Facebook, responde dudas y objeciones y lleva a agendar la visita.',
    modelo: 'claude-haiku-5-5',
    // Vacío a propósito: Ali recibe este texto tal cual en su prompt.
    instrucciones: '',
    herramientas: [
      { nombre: 'lotes_disponibles', descripcion: 'Cuántos lotes quedan por proyecto y etapa, desde los planos de la agenda.' },
      { nombre: 'horarios_disponibles', descripcion: 'Horarios libres de visita en el calendario del equipo.' },
      { nombre: 'agendar_visita', descripcion: 'Deja la visita agendada en el calendario y en el CRM.' },
      { nombre: 'derivar_a_asesor', descripcion: 'Avisa a los asesores y les pasa la conversación con un resumen.', fija: true },
      { nombre: 'buscar_en_sitio', descripcion: 'Busca en las páginas y el blog de aliminspa.cl.' },
      { nombre: 'leer_pagina', descripcion: 'Lee el texto de una página de aliminspa.cl.' },
    ],
  },
  calificador: {
    id: 'calificador',
    nombre: 'Calificador',
    rol: 'Lee cada conversación en silencio y deja en la ficha el pie, la forma de pago, el plazo, el uso y un puntaje.',
    modelo: 'claude-sonnet-5-5',
    instrucciones: [
      'Criterio inicial, en borrador hasta que marketing lo confirme:',
      '- Calificado: dice que tiene el pie (o que paga al contado) y quiere visitar o comprar en 3 meses o menos.',
      '- Tibio: muestra interés concreto (pregunta cuotas, ubicación o visita) pero no dice cuánto tiene ni cuándo.',
      '- No calificado: busca otra cosa (parcela de 5.000 m², otra comuna, arriendo) o dice que no tiene cómo pagar el pie.',
      'Solo anota lo que el cliente dijo. Si no lo dijo, el campo queda vacío.',
    ].join('\n'),
    herramientas: [
      { nombre: 'leer_conversacion', descripcion: 'Lee los mensajes del cliente en el chat web, Instagram o Facebook.', fija: true },
      { nombre: 'guardar_calificacion', descripcion: 'Guarda pie, forma de pago, plazo, uso, objeciones y puntaje en la ficha.', fija: true },
      { nombre: 'sumar_al_lead_score', descripcion: 'Suma al lead score lo que el cliente dice en el chat: tiene pie (+6), quiere visitar (+10), compraría en menos de 3 meses (+8) y calificado (+6).' },
    ],
  },
  cierre: {
    id: 'cierre',
    nombre: 'Cierre',
    rol: 'Hace el seguimiento después de la visita, rescata a los indecisos y manda el link de reserva o pago.',
    modelo: 'claude-haiku-5-5',
    enConstruccion: true,
    instrucciones: [
      'En construcción. Tres casos:',
      '- Visita realizada sin reserva: volver a escribir y resolver lo que quedó pendiente.',
      '- Indeciso ("lo veo con mi pareja") o 3 días sin responder: retomar con una pregunta concreta.',
      '- Quiere reservar: mandar el link de reserva o pago.',
    ].join('\n'),
    herramientas: [
      { nombre: 'enviar_correo', descripcion: 'Escribe por correo usando las secuencias existentes.' },
      { nombre: 'responder_instagram_facebook', descripcion: 'Escribe por Instagram o Facebook dentro de la ventana de 24 h.' },
      { nombre: 'enviar_link_reserva', descripcion: 'Manda el link de reserva o pago del pie. Falta definir cuál.' },
      { nombre: 'agendar_visita', descripcion: 'Reagenda una visita que no se hizo.' },
      { nombre: 'derivar_a_asesor', descripcion: 'Pasa la conversación al asesor.', fija: true },
    ],
  },
};

/** Precios por millón de tokens (US$) al 03-11-2026. Editables en la tabla ia_precios. */
const PRECIOS_BASE = [
  { modelo: 'claude-haiku-5-5', entrada: 0.1, salida: 0.5, cache_lectura: 0.01, cache_escritura: 0.125 },
  { modelo: 'claude-sonnet-5-5', entrada: 2, salida: 10, cache_lectura: 0.1, cache_escritura: 2.5 },
];
export const PRECIOS_FECHA = '2026-11-03';

// ---------------------------------------------------------------------------
// Tablas
// ---------------------------------------------------------------------------

let tablasListas = false;

export async function asegurarTablas() {
  if (tablasListas) return;
  await queryMarketing(`
    CREATE TABLE IF NOT EXISTS ia_agentes (
      id TEXT PRIMARY KEY,
      modelo TEXT NOT NULL,
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      instrucciones TEXT NOT NULL DEFAULT '',
      herramientas JSONB NOT NULL DEFAULT '{}'::jsonb,
      version INT NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await queryMarketing(`
    CREATE TABLE IF NOT EXISTS ia_agentes_versiones (
      id BIGSERIAL PRIMARY KEY,
      agente TEXT NOT NULL,
      version INT NOT NULL,
      modelo TEXT NOT NULL,
      activo BOOLEAN NOT NULL,
      instrucciones TEXT NOT NULL,
      herramientas JSONB NOT NULL,
      nota TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await queryMarketing(`CREATE INDEX IF NOT EXISTS ia_agentes_versiones_agente ON ia_agentes_versiones (agente, version DESC)`);
  await queryMarketing(`
    CREATE TABLE IF NOT EXISTS ia_conocimiento (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tipo TEXT NOT NULL DEFAULT 'objecion',
      tema TEXT NOT NULL,
      como_lo_dice TEXT,
      respuesta TEXT NOT NULL DEFAULT '',
      estado TEXT NOT NULL DEFAULT 'por_revisar',
      menciones INT,
      fuente TEXT,
      nota TEXT,
      agentes TEXT[] NOT NULL DEFAULT ARRAY['atraccion']::TEXT[],
      orden INT NOT NULL DEFAULT 100,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await queryMarketing(`CREATE UNIQUE INDEX IF NOT EXISTS ia_conocimiento_tema ON ia_conocimiento (tipo, tema)`);
  await queryMarketing(`
    CREATE TABLE IF NOT EXISTS ia_uso (
      id BIGSERIAL PRIMARY KEY,
      agente TEXT NOT NULL,
      canal TEXT,
      conversacion_id TEXT,
      modelo TEXT NOT NULL,
      input_tokens INT NOT NULL DEFAULT 0,
      output_tokens INT NOT NULL DEFAULT 0,
      cache_read_tokens INT NOT NULL DEFAULT 0,
      cache_write_tokens INT NOT NULL DEFAULT 0,
      costo_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await queryMarketing(`CREATE INDEX IF NOT EXISTS ia_uso_fecha ON ia_uso (created_at)`);
  await queryMarketing(`
    CREATE TABLE IF NOT EXISTS ia_precios (
      modelo TEXT PRIMARY KEY,
      entrada NUMERIC(10, 4) NOT NULL,
      salida NUMERIC(10, 4) NOT NULL,
      cache_lectura NUMERIC(10, 4) NOT NULL,
      cache_escritura NUMERIC(10, 4) NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await queryMarketing(`
    CREATE TABLE IF NOT EXISTS ia_calificacion (
      conversacion_id TEXT PRIMARY KEY,
      lead_id TEXT,
      canal TEXT,
      nombre TEXT,
      tiene_pie BOOLEAN,
      pie_monto INT,
      forma_pago TEXT,
      plazo_compra TEXT,
      uso TEXT,
      proyecto TEXT,
      objeciones TEXT[],
      quiere_visitar BOOLEAN,
      categoria TEXT,
      puntaje INT,
      resumen TEXT,
      ultimo_mensaje_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await queryMarketing(`CREATE INDEX IF NOT EXISTS ia_calificacion_lead ON ia_calificacion (lead_id)`);

  // Los agentes y precios base se crean una vez; lo que cambie el equipo no se pisa.
  for (const a of Object.values(AGENTES_BASE)) {
    const herramientas = Object.fromEntries(a.herramientas.map((h) => [h.nombre, true]));
    await queryMarketing(
      `INSERT INTO ia_agentes (id, modelo, activo, instrucciones, herramientas)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
      [a.id, a.modelo, !a.enConstruccion, a.instrucciones, JSON.stringify(herramientas)]
    );
  }
  for (const p of PRECIOS_BASE) {
    await queryMarketing(
      `INSERT INTO ia_precios (modelo, entrada, salida, cache_lectura, cache_escritura)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (modelo) DO NOTHING`,
      [p.modelo, p.entrada, p.salida, p.cache_lectura, p.cache_escritura]
    );
  }
  // Nunca se borra una fila (solo se archiva), así que ON CONFLICT basta para no resucitar nada.
  for (const c of CONOCIMIENTO_INICIAL) {
    await queryMarketing(
      `INSERT INTO ia_conocimiento (tipo, tema, como_lo_dice, respuesta, estado, menciones, fuente, nota, agentes, orden)
       VALUES ($1, $2, $3, $4, 'por_revisar', $5, $6, $7, $8, $9) ON CONFLICT (tipo, tema) DO NOTHING`,
      [c.tipo, c.tema, c.como_lo_dice, c.respuesta, c.menciones, c.fuente, c.nota, c.agentes, c.orden]
    );
  }
  tablasListas = true;
}

// ---------------------------------------------------------------------------
// Agentes
// ---------------------------------------------------------------------------

export interface Agente {
  id: AgenteId;
  nombre: string;
  rol: string;
  enConstruccion: boolean;
  modelo: string;
  activo: boolean;
  instrucciones: string;
  herramientas: (Herramienta & { activa: boolean })[];
  version: number;
  updated_at: string;
}

interface FilaAgente {
  id: AgenteId;
  modelo: string;
  activo: boolean;
  instrucciones: string;
  herramientas: Record<string, boolean>;
  version: number;
  updated_at: string;
}

function armarAgente(fila: FilaAgente): Agente {
  const base = AGENTES_BASE[fila.id];
  return {
    id: fila.id,
    nombre: base.nombre,
    rol: base.rol,
    enConstruccion: Boolean(base.enConstruccion),
    modelo: fila.modelo,
    activo: fila.activo,
    instrucciones: fila.instrucciones,
    herramientas: base.herramientas.map((h) => ({ ...h, activa: h.fija ? true : fila.herramientas?.[h.nombre] !== false })),
    version: fila.version,
    updated_at: fila.updated_at,
  };
}

export function esAgente(id: string): id is AgenteId {
  return (AGENTES as string[]).includes(id);
}

export async function listarAgentes(): Promise<Agente[]> {
  await asegurarTablas();
  const r = await queryMarketing(`SELECT * FROM ia_agentes`);
  const filas = r.rows as FilaAgente[];
  return AGENTES.map((id) => filas.find((f) => f.id === id)).filter(Boolean).map((f) => armarAgente(f as FilaAgente));
}

export async function obtenerAgente(id: AgenteId): Promise<Agente | null> {
  await asegurarTablas();
  const r = await queryMarketing(`SELECT * FROM ia_agentes WHERE id = $1`, [id]);
  return r.rows[0] ? armarAgente(r.rows[0] as FilaAgente) : null;
}

export interface CambiosAgente {
  modelo?: string;
  activo?: boolean;
  instrucciones?: string;
  herramientas?: Record<string, boolean>;
  nota?: string;
}

/** Guarda los cambios y deja la versión anterior en el historial. */
export async function guardarAgente(id: AgenteId, cambios: CambiosAgente): Promise<Agente> {
  const actual = await obtenerAgente(id);
  if (!actual) throw new Error('Agente no encontrado');
  const base = AGENTES_BASE[id];

  const herramientas: Record<string, boolean> = {};
  for (const h of base.herramientas) {
    const pedida = cambios.herramientas?.[h.nombre];
    const vigente = actual.herramientas.find((x) => x.nombre === h.nombre)?.activa ?? true;
    herramientas[h.nombre] = h.fija ? true : typeof pedida === 'boolean' ? pedida : vigente;
  }
  const modelo = typeof cambios.modelo === 'string' && cambios.modelo.trim() ? cambios.modelo.trim() : actual.modelo;
  const instrucciones = typeof cambios.instrucciones === 'string' ? cambios.instrucciones : actual.instrucciones;
  // Un agente en construcción no se puede prender: todavía no hay nada que lo corra.
  const activo = base.enConstruccion ? false : typeof cambios.activo === 'boolean' ? cambios.activo : actual.activo;

  await queryMarketing(
    `INSERT INTO ia_agentes_versiones (agente, version, modelo, activo, instrucciones, herramientas, nota)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, actual.version, actual.modelo, actual.activo, actual.instrucciones,
      JSON.stringify(Object.fromEntries(actual.herramientas.map((h) => [h.nombre, h.activa]))), cambios.nota || null]
  );
  await queryMarketing(
    `UPDATE ia_agentes SET modelo = $2, activo = $3, instrucciones = $4, herramientas = $5,
            version = version + 1, updated_at = now() WHERE id = $1`,
    [id, modelo, activo, instrucciones, JSON.stringify(herramientas)]
  );
  return (await obtenerAgente(id)) as Agente;
}

export async function listarVersiones(id: AgenteId) {
  await asegurarTablas();
  const r = await queryMarketing(
    `SELECT id, version, modelo, activo, instrucciones, herramientas, nota, created_at
       FROM ia_agentes_versiones WHERE agente = $1 ORDER BY version DESC LIMIT 30`,
    [id]
  );
  return r.rows;
}

/** Vuelve a una versión anterior; la actual queda guardada en el historial. */
export async function restaurarVersion(id: AgenteId, versionId: number) {
  const r = await queryMarketing(`SELECT * FROM ia_agentes_versiones WHERE agente = $1 AND id = $2`, [id, versionId]);
  const v = r.rows[0];
  if (!v) throw new Error('Versión no encontrada');
  return guardarAgente(id, {
    modelo: v.modelo,
    activo: v.activo,
    instrucciones: v.instrucciones,
    herramientas: v.herramientas,
    nota: `Restaurada la versión ${v.version}`,
  });
}

// ---------------------------------------------------------------------------
// Conocimiento
// ---------------------------------------------------------------------------

export interface Conocimiento {
  id: string;
  tipo: TipoConocimiento;
  tema: string;
  como_lo_dice: string | null;
  respuesta: string;
  estado: EstadoConocimiento;
  menciones: number | null;
  fuente: string | null;
  nota: string | null;
  agentes: AgenteId[];
  orden: number;
  updated_at: string;
}

export async function listarConocimiento(filtro: { agente?: AgenteId; estado?: EstadoConocimiento } = {}) {
  await asegurarTablas();
  const where: string[] = [];
  const params: unknown[] = [];
  if (filtro.agente) {
    params.push(filtro.agente);
    where.push(`$${params.length} = ANY(agentes)`);
  }
  if (filtro.estado) {
    params.push(filtro.estado);
    where.push(`estado = $${params.length}`);
  }
  const r = await queryMarketing(
    `SELECT * FROM ia_conocimiento ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY orden, menciones DESC NULLS LAST, tema`,
    params
  );
  return r.rows as Conocimiento[];
}

function limpiarAgentes(valor: unknown): AgenteId[] {
  const lista = Array.isArray(valor) ? valor.filter((v): v is AgenteId => typeof v === 'string' && esAgente(v)) : [];
  return lista.length ? Array.from(new Set(lista)) : ['atraccion'];
}

export interface DatosConocimiento {
  tipo?: string;
  tema?: string;
  como_lo_dice?: string | null;
  respuesta?: string;
  estado?: string;
  menciones?: number | null;
  fuente?: string | null;
  nota?: string | null;
  agentes?: unknown;
  orden?: number;
}

export async function crearConocimiento(d: DatosConocimiento) {
  await asegurarTablas();
  if (!d.tema?.trim()) throw new Error('Falta el tema');
  const tipo = TIPOS.includes(d.tipo as TipoConocimiento) ? d.tipo : 'objecion';
  // Lo nuevo siempre nace por revisar: aprobar es un paso aparte.
  const r = await queryMarketing(
    `INSERT INTO ia_conocimiento (tipo, tema, como_lo_dice, respuesta, estado, menciones, fuente, nota, agentes, orden)
     VALUES ($1, $2, $3, $4, 'por_revisar', $5, $6, $7, $8, $9) RETURNING *`,
    [tipo, d.tema.trim(), d.como_lo_dice || null, d.respuesta || '', d.menciones ?? null, d.fuente || 'Equipo',
      d.nota || null, limpiarAgentes(d.agentes), d.orden ?? 100]
  );
  return r.rows[0] as Conocimiento;
}

export async function actualizarConocimiento(id: string, d: DatosConocimiento) {
  await asegurarTablas();
  const campos: string[] = [];
  const params: unknown[] = [id];
  const poner = (columna: string, valor: unknown) => {
    params.push(valor);
    campos.push(`${columna} = $${params.length}`);
  };
  if (d.tipo !== undefined && TIPOS.includes(d.tipo as TipoConocimiento)) poner('tipo', d.tipo);
  if (d.tema !== undefined && d.tema.trim()) poner('tema', d.tema.trim());
  if (d.como_lo_dice !== undefined) poner('como_lo_dice', d.como_lo_dice || null);
  if (d.respuesta !== undefined) poner('respuesta', d.respuesta);
  if (d.estado !== undefined && ESTADOS.includes(d.estado as EstadoConocimiento)) poner('estado', d.estado);
  if (d.menciones !== undefined) poner('menciones', d.menciones);
  if (d.fuente !== undefined) poner('fuente', d.fuente || null);
  if (d.nota !== undefined) poner('nota', d.nota || null);
  if (d.agentes !== undefined) poner('agentes', limpiarAgentes(d.agentes));
  if (d.orden !== undefined) poner('orden', d.orden);
  if (!campos.length) throw new Error('Nada que cambiar');

  // Aprobar algo sin respuesta dejaría a la IA con una objeción y nada que decir.
  if (d.estado === 'aprobada') {
    const actual = await queryMarketing(`SELECT respuesta FROM ia_conocimiento WHERE id = $1`, [id]);
    const respuesta = d.respuesta !== undefined ? d.respuesta : actual.rows[0]?.respuesta;
    if (!String(respuesta || '').trim()) throw new Error('No se puede aprobar sin respuesta');
  }

  const r = await queryMarketing(
    `UPDATE ia_conocimiento SET ${campos.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`,
    params
  );
  if (!r.rows[0]) throw new Error('No encontrado');
  return r.rows[0] as Conocimiento;
}

/** Lo que la IA recibe: agente + conocimiento aprobado. */
export async function configParaAgente(id: AgenteId) {
  const agente = await obtenerAgente(id);
  if (!agente) return null;
  const conocimiento = (await listarConocimiento({ agente: id, estado: 'aprobada' })).map((c) => ({
    tipo: c.tipo,
    tema: c.tema,
    como_lo_dice: c.como_lo_dice,
    respuesta: c.respuesta,
  }));
  const version = `${agente.version}-${conocimiento.length}-${new Date(agente.updated_at).getTime()}`;
  return {
    agente: {
      id: agente.id,
      nombre: agente.nombre,
      modelo: agente.modelo,
      activo: agente.activo,
      instrucciones: agente.instrucciones,
      herramientas: Object.fromEntries(agente.herramientas.map((h) => [h.nombre, h.activa])),
    },
    conocimiento,
    version,
  };
}

// ---------------------------------------------------------------------------
// Uso y gasto
// ---------------------------------------------------------------------------

export interface Uso {
  agente: string;
  canal?: string | null;
  conversacion_id?: string | null;
  modelo: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

const entero = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : 0);

export interface Precio {
  modelo: string;
  entrada: number;
  salida: number;
  cache_lectura: number;
  cache_escritura: number;
}

export async function listarPrecios(): Promise<Precio[]> {
  await asegurarTablas();
  const r = await queryMarketing(`SELECT modelo, entrada, salida, cache_lectura, cache_escritura FROM ia_precios ORDER BY modelo`);
  return r.rows.map((p) => ({
    modelo: p.modelo,
    entrada: Number(p.entrada),
    salida: Number(p.salida),
    cache_lectura: Number(p.cache_lectura),
    cache_escritura: Number(p.cache_escritura),
  }));
}

/** Costo en US$: los precios son por millón de tokens. Un modelo sin precio cuesta 0 y se avisa. */
export function costoUSD(precio: Precio | undefined, t: { input: number; output: number; cacheRead: number; cacheWrite: number }) {
  if (!precio) return 0;
  return (
    (t.input * precio.entrada + t.output * precio.salida + t.cacheRead * precio.cache_lectura + t.cacheWrite * precio.cache_escritura) /
    1_000_000
  );
}

export async function registrarUso(u: Uso) {
  await asegurarTablas();
  if (!u.agente || !u.modelo) throw new Error('Faltan agente o modelo');
  const t = {
    input: entero(u.input_tokens),
    output: entero(u.output_tokens),
    cacheRead: entero(u.cache_read_input_tokens),
    cacheWrite: entero(u.cache_creation_input_tokens),
  };
  const precios = await listarPrecios();
  const precio = precios.find((p) => p.modelo === u.modelo);
  if (!precio) console.warn(`[agentes-ia] El modelo ${u.modelo} no tiene precio en ia_precios: queda con costo 0.`);
  const costo = costoUSD(precio, t);
  await queryMarketing(
    `INSERT INTO ia_uso (agente, canal, conversacion_id, modelo, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, costo_usd)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [String(u.agente).slice(0, 40), u.canal ? String(u.canal).slice(0, 40) : null,
      u.conversacion_id ? String(u.conversacion_id).slice(0, 120) : null, String(u.modelo).slice(0, 80),
      t.input, t.output, t.cacheRead, t.cacheWrite, costo]
  );
  return costo;
}

/** Inicio del día y del mes en hora de Chile, como timestamptz. */
const INICIO_HOY = `date_trunc('day', now() AT TIME ZONE 'America/Santiago') AT TIME ZONE 'America/Santiago'`;
const INICIO_MES = `date_trunc('month', now() AT TIME ZONE 'America/Santiago') AT TIME ZONE 'America/Santiago'`;

export async function resumenGasto() {
  await asegurarTablas();
  const totales = await queryMarketing(`
    SELECT
      COALESCE(SUM(costo_usd) FILTER (WHERE created_at >= ${INICIO_HOY}), 0) AS hoy,
      COALESCE(SUM(costo_usd) FILTER (WHERE created_at >= ${INICIO_MES}), 0) AS mes,
      COUNT(DISTINCT conversacion_id) FILTER (WHERE created_at >= ${INICIO_MES}) AS conversaciones_mes,
      COUNT(*) FILTER (WHERE created_at >= ${INICIO_MES}) AS llamadas_mes
    FROM ia_uso`);
  const porAgente = await queryMarketing(`
    SELECT agente, modelo, COALESCE(SUM(costo_usd), 0) AS costo, COUNT(*) AS llamadas,
           SUM(input_tokens + cache_read_tokens + cache_write_tokens) AS entrada, SUM(output_tokens) AS salida
      FROM ia_uso WHERE created_at >= ${INICIO_MES}
     GROUP BY agente, modelo ORDER BY costo DESC`);
  const porCanal = await queryMarketing(`
    SELECT COALESCE(canal, 'sin canal') AS canal, COALESCE(SUM(costo_usd), 0) AS costo, COUNT(DISTINCT conversacion_id) AS conversaciones
      FROM ia_uso WHERE created_at >= ${INICIO_MES} GROUP BY 1 ORDER BY costo DESC`);
  const porDia = await queryMarketing(`
    SELECT to_char(created_at AT TIME ZONE 'America/Santiago', 'YYYY-MM-DD') AS dia, agente, COALESCE(SUM(costo_usd), 0) AS costo
      FROM ia_uso WHERE created_at >= now() - interval '30 days'
     GROUP BY 1, 2 ORDER BY 1`);

  // Visitas del mes: leads con fecha de visita en el mes (base principal).
  let visitasMes: number | null = null;
  try {
    const v = await queryMain(
      `SELECT COUNT(*)::int AS n FROM "Lead"
        WHERE "visitDate" >= date_trunc('month', now() AT TIME ZONE 'America/Santiago')
          AND "visitDate" < date_trunc('month', now() AT TIME ZONE 'America/Santiago') + interval '1 month'`
    );
    visitasMes = v.rows[0]?.n ?? 0;
  } catch (error) {
    console.error('[agentes-ia] No se pudieron contar las visitas del mes:', error);
  }

  const t = totales.rows[0];
  const mes = Number(t.mes);
  const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }));
  const diasMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate();
  const diaActual = ahora.getDate() - 1 + (ahora.getHours() * 60 + ahora.getMinutes()) / 1440;
  const conversaciones = Number(t.conversaciones_mes);

  return {
    hoy: Number(t.hoy),
    mes,
    proyeccionMes: diaActual > 0.25 ? (mes / diaActual) * diasMes : null,
    llamadasMes: Number(t.llamadas_mes),
    conversacionesMes: conversaciones,
    costoPorConversacion: conversaciones ? mes / conversaciones : null,
    visitasMes,
    costoPorVisita: visitasMes ? mes / visitasMes : null,
    porAgente: porAgente.rows.map((r) => ({
      agente: r.agente,
      modelo: r.modelo,
      costo: Number(r.costo),
      llamadas: Number(r.llamadas),
      entrada: Number(r.entrada || 0),
      salida: Number(r.salida || 0),
    })),
    porCanal: porCanal.rows.map((r) => ({ canal: r.canal, costo: Number(r.costo), conversaciones: Number(r.conversaciones) })),
    porDia: porDia.rows.map((r) => ({ dia: r.dia, agente: r.agente, costo: Number(r.costo) })),
    precios: await listarPrecios(),
    preciosFecha: PRECIOS_FECHA,
  };
}

export async function actualizarPrecio(p: Precio) {
  await asegurarTablas();
  const numeros = [p.entrada, p.salida, p.cache_lectura, p.cache_escritura];
  if (!p.modelo || numeros.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0)) {
    throw new Error('Precio inválido');
  }
  await queryMarketing(
    `INSERT INTO ia_precios (modelo, entrada, salida, cache_lectura, cache_escritura, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (modelo) DO UPDATE SET entrada = $2, salida = $3, cache_lectura = $4, cache_escritura = $5, updated_at = now()`,
    [p.modelo, p.entrada, p.salida, p.cache_lectura, p.cache_escritura]
  );
}

/** Cuántas filas de conocimiento aprobado usa cada agente (para los nodos del mapa). */
export async function conteoConocimiento() {
  await asegurarTablas();
  const r = await queryMarketing(`
    SELECT a AS agente, estado, COUNT(*)::int AS n
      FROM ia_conocimiento, unnest(agentes) AS a
     GROUP BY 1, 2`);
  const conteo: Record<string, Record<string, number>> = {};
  for (const row of r.rows) {
    conteo[row.agente] = conteo[row.agente] || {};
    conteo[row.agente][row.estado] = row.n;
  }
  return conteo;
}

/* ── Métricas de Ali por canal ────────────────────────────────────────── */

export interface MetricaCanal {
  canal: 'web' | 'instagram' | 'facebook';
  conversaciones: number;
  conTelefono: number;
  leads: number;
  visitas: number;
}

const FUENTE_LEADS: Record<MetricaCanal['canal'], string> = {
  web: 'Chat web aliminspa.cl',
  instagram: 'Instagram - IA',
  facebook: 'Facebook - IA',
};

/**
 * Conversaciones que atendió Ali, % con teléfono, leads que creó y
 * conversaciones con visita, en los últimos `dias`. Misma definición que
 * lib/metricasIA.ts del CRM móvil (resumen del grupo): si cambia una, cambiar la otra.
 */
export async function metricasCanales(dias = 7): Promise<MetricaCanal[]> {
  const conv = await queryMain(
    `WITH atendidas AS (
       SELECT DISTINCT c.id, c.platform, c."leadId"
         FROM "Conversation" c
         JOIN "Message" m ON m."conversationId" = c.id
        WHERE c.platform IN ('web', 'instagram', 'facebook')
          AND m."senderType" = 'ali' AND m."sourceType" IN ('DIRECT', 'HANDOFF')
          AND (m."createdAt" AT TIME ZONE 'UTC') >= now() - make_interval(days => $1)
     )
     SELECT a.platform,
            COUNT(*)::int AS conversaciones,
            COUNT(*) FILTER (WHERE COALESCE(l.phone, '') <> '')::int AS con_telefono,
            COUNT(*) FILTER (
              WHERE l."bookingId" IS NOT NULL
                 OR EXISTS (SELECT 1 FROM "Message" e WHERE e."conversationId" = a.id
                              AND e."sourceType" = 'EVENTO' AND e.text LIKE '📅 Ali agendó%')
            )::int AS visitas
       FROM atendidas a
       LEFT JOIN "Lead" l ON l.id = a."leadId"
      GROUP BY a.platform`,
    [dias]
  );
  const leads = await queryMain(
    `SELECT source, COUNT(*)::int AS n FROM "Lead"
      WHERE source = ANY($1) AND ("createdAt" AT TIME ZONE 'UTC') >= now() - make_interval(days => $2)
      GROUP BY source`,
    [Object.values(FUENTE_LEADS), dias]
  );
  return (['web', 'instagram', 'facebook'] as const).map((canal) => {
    const c = conv.rows.find((x) => x.platform === canal);
    return {
      canal,
      conversaciones: c?.conversaciones ?? 0,
      conTelefono: c?.con_telefono ?? 0,
      leads: leads.rows.find((x) => x.source === FUENTE_LEADS[canal])?.n ?? 0,
      visitas: c?.visitas ?? 0,
    };
  });
}

/** Últimas calificaciones, para el panel del calificador. */
export async function ultimasCalificaciones(limite = 20) {
  await asegurarTablas();
  const r = await queryMarketing(
    `SELECT * FROM ia_calificacion ORDER BY updated_at DESC LIMIT $1`,
    [Math.min(Math.max(limite, 1), 100)]
  );
  return r.rows;
}
