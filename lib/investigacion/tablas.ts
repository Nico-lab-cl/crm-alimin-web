import { queryMarketing } from '@/lib/db';

/**
 * Tablas de los investigadores (Ali - Competencia, Ali - Anuncios, Ali -
 * Mercado). Todo es información pública de la web: avisos de terrenos,
 * anuncios de la competencia y noticias. Nada de clientes.
 */

export type Investigador = 'competencia' | 'anuncios' | 'mercado';
export const INVESTIGADORES: Investigador[] = ['competencia', 'anuncios', 'mercado'];

export interface ConfigInvestigacion {
  /** Comunas que vigila Ali - Competencia, con el slug que usan los portales. */
  comunas: { nombre: string; slug: string }[];
  /** Búsquedas de Google Noticias que lee Ali - Mercado. */
  temas: { tema: string; consulta: string; palabras?: string }[];
  /** Lo que busca la tarea diaria de anuncios en la Biblioteca de Anuncios de Meta. */
  terminos_anuncios: string[];
  /** Páginas de Facebook de la competencia (id numérico) para seguir sus anuncios. */
  paginas_competencia: { nombre: string; page_id: string }[];
}

/** Por defecto (Nicolás, 14-11-2026). Se editan en /investigacion. */
export const CONFIG_BASE: ConfigInvestigacion = {
  comunas: [
    { nombre: 'El Tabo', slug: 'el-tabo' },
    { nombre: 'El Quisco', slug: 'el-quisco' },
    { nombre: 'Algarrobo', slug: 'algarrobo' },
    { nombre: 'Cartagena', slug: 'cartagena' },
    { nombre: 'San Antonio', slug: 'san-antonio' },
  ],
  temas: [
    // "site:cl" deja solo medios chilenos; "palabras" filtra el título porque
    // con site:cl Google se vuelve laxo. Sin "Cartagena" suelto: trae Cartagena de Indias.
    { tema: 'Noticias del litoral', consulta: '"El Tabo" OR "El Quisco" OR "Algarrobo" OR "Las Cruces" OR "litoral central" site:cl' },
    { tema: 'Tasas y crédito', consulta: 'tasa hipotecaria site:cl', palabras: 'tasa|hipotecari|\\bUF\\b|crédito' },
    { tema: 'Normas de terrenos', consulta: '"permiso de edificación" OR loteo OR "plan regulador" site:cl', palabras: 'loteo|subdivisi|permiso de edificaci|plan regulador|urbaniza' },
    { tema: 'Estafas con terrenos', consulta: 'estafa terrenos OR parcelas site:cl', palabras: 'estaf|fraud|irregular|engañ' },
  ],
  terminos_anuncios: ['terrenos El Tabo', 'terrenos Algarrobo', 'terrenos Cartagena', 'terrenos litoral central', 'parcelas El Quisco'],
  paginas_competencia: [
    { nombre: 'Miradordeltabo', page_id: '826167107247175' },
    { nombre: 'Bosque del Tabo', page_id: '898355173371304' },
  ],
};

let listas = false;

export async function asegurarTablasInvestigacion() {
  if (listas) return;
  await queryMarketing(`
    CREATE TABLE IF NOT EXISTS inv_avisos (
      url TEXT PRIMARY KEY,
      fuente TEXT NOT NULL,
      titulo TEXT NOT NULL,
      tipo TEXT,
      comuna TEXT,
      ubicacion TEXT,
      m2 INT,
      precio_clp BIGINT,
      precio_uf NUMERIC(12, 2),
      precio_anterior_clp BIGINT,
      precio_anterior_uf NUMERIC(12, 2),
      precio_cambio_at TIMESTAMPTZ,
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      primera_vez TIMESTAMPTZ NOT NULL DEFAULT now(),
      ultima_vez TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await queryMarketing(`CREATE INDEX IF NOT EXISTS inv_avisos_comuna ON inv_avisos (comuna, activo)`);
  await queryMarketing(`
    CREATE TABLE IF NOT EXISTS inv_noticias (
      url TEXT PRIMARY KEY,
      titulo TEXT NOT NULL,
      medio TEXT,
      tema TEXT NOT NULL,
      publicada_at TIMESTAMPTZ,
      vista_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await queryMarketing(`CREATE INDEX IF NOT EXISTS inv_noticias_fecha ON inv_noticias (vista_at DESC)`);
  await queryMarketing(`
    CREATE TABLE IF NOT EXISTS inv_anuncios (
      ad_id TEXT PRIMARY KEY,
      page_id TEXT,
      page_name TEXT,
      titulo TEXT,
      termino TEXT,
      inicio_at TIMESTAMPTZ,
      snapshot_url TEXT,
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      primera_vez TIMESTAMPTZ NOT NULL DEFAULT now(),
      ultima_vez TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await queryMarketing(`
    CREATE TABLE IF NOT EXISTS inv_informes (
      id BIGSERIAL PRIMARY KEY,
      agente TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'diario',
      texto TEXT NOT NULL,
      datos JSONB NOT NULL DEFAULT '{}'::jsonb,
      costo_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await queryMarketing(`CREATE INDEX IF NOT EXISTS inv_informes_agente ON inv_informes (agente, tipo, created_at DESC)`);
  await queryMarketing(`
    CREATE TABLE IF NOT EXISTS inv_config (
      id INT PRIMARY KEY DEFAULT 1,
      config JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await queryMarketing(`INSERT INTO inv_config (id, config) VALUES (1, $1) ON CONFLICT (id) DO NOTHING`, [JSON.stringify(CONFIG_BASE)]);
  listas = true;
}

export async function leerConfig(): Promise<ConfigInvestigacion> {
  await asegurarTablasInvestigacion();
  const r = await queryMarketing(`SELECT config FROM inv_config WHERE id = 1`);
  return { ...CONFIG_BASE, ...(r.rows[0]?.config ?? {}) };
}

export async function guardarConfig(c: ConfigInvestigacion) {
  await asegurarTablasInvestigacion();
  await queryMarketing(`UPDATE inv_config SET config = $1, updated_at = now() WHERE id = 1`, [JSON.stringify(c)]);
}

export async function guardarInforme(agente: Investigador, tipo: 'diario' | 'semanal', texto: string, datos: unknown, costo = 0) {
  await asegurarTablasInvestigacion();
  await queryMarketing(`INSERT INTO inv_informes (agente, tipo, texto, datos, costo_usd) VALUES ($1, $2, $3, $4, $5)`, [
    agente, tipo, texto, JSON.stringify(datos ?? {}), costo,
  ]);
}

/** ¿Ya hay un informe de este tipo hoy (o esta semana), en hora de Chile? */
export async function yaHizo(agente: Investigador, tipo: 'diario' | 'semanal') {
  await asegurarTablasInvestigacion();
  const unidad = tipo === 'diario' ? 'day' : 'week';
  const r = await queryMarketing(
    `SELECT 1 FROM inv_informes WHERE agente = $1 AND tipo = $2
       AND created_at >= date_trunc('${unidad}', now() AT TIME ZONE 'America/Santiago') AT TIME ZONE 'America/Santiago'
     LIMIT 1`,
    [agente, tipo]
  );
  return r.rows.length > 0;
}
