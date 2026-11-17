import { queryMarketing } from '@/lib/db';

/**
 * Conversaciones de prueba con Ali que hace el equipo en aliminspa.cl/probar-ali
 * (16-11-2026). El sitio manda la conversación completa cada vez que Ali
 * responde o el asesor marca 👍/👎, y aquí se guarda encima (una fila por
 * conversación). No son clientes reales: no crean leads ni tocan el CRM.
 *
 * Se revisan en /agentes-ia/pruebas, donde una corrección se puede convertir
 * en una regla de conocimiento (nace "por revisar", como todo lo nuevo).
 */

export type CanalPrueba = 'instagram' | 'facebook' | 'whatsapp';
export type Voto = 'bien' | 'mal';

export interface MensajePrueba {
  de: 'cliente' | 'ali' | 'aviso';
  texto: string;
  voto?: Voto | null;
  correccion?: string | null;
}

export interface Prueba {
  id: string;
  asesor: string;
  canal: CanalPrueba;
  mensajes: MensajePrueba[];
  nota: string | null;
  buenas: number;
  malas: number;
  revisada: boolean;
  created_at: string;
  updated_at: string;
}

const CANALES: CanalPrueba[] = ['instagram', 'facebook', 'whatsapp'];
const MAX_MENSAJES = 120;
const MAX_TEXTO = 4000;

let tablaLista = false;

async function asegurarTabla() {
  if (tablaLista) return;
  await queryMarketing(`
    CREATE TABLE IF NOT EXISTS ia_pruebas (
      id TEXT PRIMARY KEY,
      asesor TEXT NOT NULL,
      canal TEXT NOT NULL,
      mensajes JSONB NOT NULL DEFAULT '[]'::jsonb,
      nota TEXT,
      buenas INT NOT NULL DEFAULT 0,
      malas INT NOT NULL DEFAULT 0,
      revisada BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await queryMarketing(`CREATE INDEX IF NOT EXISTS ia_pruebas_fecha ON ia_pruebas (updated_at DESC)`);
  tablaLista = true;
}

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Valida lo que manda el sitio. Devuelve null si no calza. */
export function validarPrueba(json: unknown): Omit<Prueba, 'buenas' | 'malas' | 'revisada' | 'created_at' | 'updated_at'> | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, unknown>;
  const id = texto(j.id, 60).replace(/[^a-z0-9-]/gi, '');
  const asesor = texto(j.asesor, 60);
  const canal = CANALES.includes(j.canal as CanalPrueba) ? (j.canal as CanalPrueba) : null;
  if (!id || !asesor || !canal || !Array.isArray(j.mensajes)) return null;
  const mensajes: MensajePrueba[] = [];
  for (const m of j.mensajes.slice(0, MAX_MENSAJES)) {
    if (!m || typeof m !== 'object') continue;
    const r = m as Record<string, unknown>;
    const de = r.de === 'cliente' || r.de === 'ali' || r.de === 'aviso' ? r.de : null;
    const t = texto(r.texto, MAX_TEXTO);
    if (!de || !t) continue;
    const msg: MensajePrueba = { de, texto: t };
    if (de === 'ali') {
      msg.voto = r.voto === 'bien' || r.voto === 'mal' ? r.voto : null;
      msg.correccion = msg.voto === 'mal' ? texto(r.correccion, 2000) || null : null;
    }
    mensajes.push(msg);
  }
  if (!mensajes.length) return null;
  return { id, asesor, canal, mensajes, nota: texto(j.nota, 2000) || null };
}

/** Guarda o reemplaza la conversación. Si ya estaba revisada y cambió, vuelve a "sin revisar". */
export async function guardarPrueba(p: NonNullable<ReturnType<typeof validarPrueba>>) {
  await asegurarTabla();
  const buenas = p.mensajes.filter((m) => m.voto === 'bien').length;
  const malas = p.mensajes.filter((m) => m.voto === 'mal').length;
  await queryMarketing(
    `INSERT INTO ia_pruebas (id, asesor, canal, mensajes, nota, buenas, malas)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       asesor = EXCLUDED.asesor, canal = EXCLUDED.canal, mensajes = EXCLUDED.mensajes,
       nota = EXCLUDED.nota, buenas = EXCLUDED.buenas, malas = EXCLUDED.malas,
       revisada = CASE WHEN ia_pruebas.mensajes = EXCLUDED.mensajes AND ia_pruebas.nota IS NOT DISTINCT FROM EXCLUDED.nota
                       THEN ia_pruebas.revisada ELSE FALSE END,
       updated_at = now()`,
    [p.id, p.asesor, p.canal, JSON.stringify(p.mensajes), p.nota, buenas, malas]
  );
}

export interface FiltroPruebas {
  asesor?: string;
  canal?: string;
  /** 'mal' = con al menos un 👎 o una nota; 'pendientes' = sin revisar. */
  ver?: 'todas' | 'mal' | 'pendientes';
  dias?: number;
}

export async function listarPruebas(f: FiltroPruebas = {}) {
  await asegurarTabla();
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.asesor) {
    params.push(f.asesor);
    where.push(`asesor = $${params.length}`);
  }
  if (f.canal && CANALES.includes(f.canal as CanalPrueba)) {
    params.push(f.canal);
    where.push(`canal = $${params.length}`);
  }
  if (f.ver === 'mal') where.push(`(malas > 0 OR nota IS NOT NULL)`);
  if (f.ver === 'pendientes') where.push(`NOT revisada AND (malas > 0 OR nota IS NOT NULL)`);
  params.push(Math.min(Math.max(f.dias || 30, 1), 365));
  where.push(`updated_at >= now() - make_interval(days => $${params.length})`);
  const r = await queryMarketing(
    `SELECT * FROM ia_pruebas WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT 200`,
    params
  );
  const asesores = await queryMarketing(`SELECT asesor, count(*)::int AS n FROM ia_pruebas GROUP BY asesor ORDER BY n DESC`);
  return { pruebas: r.rows as Prueba[], asesores: asesores.rows as { asesor: string; n: number }[] };
}

export async function marcarRevisada(id: string, revisada: boolean) {
  await asegurarTabla();
  await queryMarketing(`UPDATE ia_pruebas SET revisada = $2 WHERE id = $1`, [id, revisada]);
}
