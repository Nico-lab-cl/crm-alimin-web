import { queryMarketing } from '@/lib/db';
import { investigadorDescansa, investigadorDice, investigadorTrabaja } from '@/lib/oficina';
import { leerComuna, type Aviso } from './portales';
import { leerTema } from './noticias';
import { asegurarTablasInvestigacion, guardarInforme, leerConfig, yaHizo, type Investigador } from './tablas';

/**
 * Los tres investigadores de Alimin, a costo casi cero (Nicolás, 14-11-2026):
 * - Ali - Competencia lee Yapo y Portal Inmobiliario por comuna, todos los días.
 * - Ali - Mercado lee Google Noticias por tema, todos los días.
 * - Ali - Anuncios recibe lo que encuentra la tarea diaria de Claude Code en
 *   la Biblioteca de Anuncios de Meta (la API de Meta no entrega anuncios
 *   comerciales de Chile), por /api/webhooks/ia/investigacion/anuncios.
 * El informe diario lo arma el código, sin IA. La IA (Haiku) solo escribe el
 * informe semanal de los lunes (informe.ts).
 */

/** Un aviso que no aparece en este rato se da por retirado. */
const RETIRADO_DIAS = 3;
/** Rango de tamaño comparable con los terrenos de Alimin para la mediana por m². */
const M2_MIN = 100;
const M2_MAX = 5000;
/** Página de Alimin en Meta: no se analiza como competencia. */
const PAGINA_ALIMIN = '110751698274645';

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
const precioTexto = (clp: number | null, uf: number | null) =>
  clp ? pesos(clp) : uf ? `UF ${Number(uf).toLocaleString('es-CL')}` : 'sin precio';

function mediana(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ---------------------------------------------------------------------------
// Ali - Competencia
// ---------------------------------------------------------------------------

export interface CambioPrecio {
  url: string;
  titulo: string;
  comuna: string;
  antes: string;
  ahora: string;
  baja: boolean;
}

export async function correrCompetencia() {
  await asegurarTablasInvestigacion();
  const config = await leerConfig();
  investigadorTrabaja('competencia', `Revisando avisos de terrenos en ${config.comunas.length} comunas`);
  try {
    const primeraVez = Number((await queryMarketing(`SELECT count(*)::int AS n FROM inv_avisos`)).rows[0]?.n ?? 0) === 0;
    const vistos = new Map<string, Aviso>();
    const problemas: string[] = [];
    const leidas: { fuente: string; comuna: string }[] = [];

    for (const c of config.comunas) {
      investigadorTrabaja('competencia', `Leyendo avisos de ${c.nombre}`);
      for (const r of await leerComuna(c)) {
        if (r.error) problemas.push(`${r.fuente} en ${r.comuna}: ${r.error}`);
        if (r.avisos.length) leidas.push({ fuente: r.fuente, comuna: r.comuna });
        for (const a of r.avisos) if (!vistos.has(a.url)) vistos.set(a.url, a);
      }
    }

    const avisos = Array.from(vistos.values());
    const previos = new Map<string, { precio_clp: string | null; precio_uf: string | null }>();
    if (avisos.length) {
      const r = await queryMarketing(`SELECT url, precio_clp, precio_uf FROM inv_avisos WHERE url = ANY($1)`, [avisos.map((a) => a.url)]);
      for (const p of r.rows) previos.set(p.url, p);
    }

    const nuevos: Aviso[] = [];
    const cambios: CambioPrecio[] = [];
    for (const a of avisos) {
      const p = previos.get(a.url);
      if (!p) {
        nuevos.push(a);
      } else {
        const antesClp = p.precio_clp ? Number(p.precio_clp) : null;
        const antesUf = p.precio_uf ? Number(p.precio_uf) : null;
        const cambio = (a.precio_clp && antesClp && a.precio_clp !== antesClp) || (a.precio_uf && antesUf && a.precio_uf !== antesUf);
        if (cambio) {
          const baja = a.precio_clp && antesClp ? a.precio_clp < antesClp : (a.precio_uf ?? 0) < (antesUf ?? 0);
          cambios.push({ url: a.url, titulo: a.titulo, comuna: a.comuna, antes: precioTexto(antesClp, antesUf), ahora: precioTexto(a.precio_clp, a.precio_uf), baja });
          await queryMarketing(
            `UPDATE inv_avisos SET precio_anterior_clp = precio_clp, precio_anterior_uf = precio_uf, precio_cambio_at = now() WHERE url = $1`,
            [a.url]
          );
        }
      }
      await queryMarketing(
        `INSERT INTO inv_avisos (url, fuente, titulo, tipo, comuna, ubicacion, m2, precio_clp, precio_uf)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (url) DO UPDATE SET titulo = EXCLUDED.titulo, tipo = EXCLUDED.tipo, ubicacion = EXCLUDED.ubicacion,
           m2 = COALESCE(EXCLUDED.m2, inv_avisos.m2), precio_clp = EXCLUDED.precio_clp, precio_uf = EXCLUDED.precio_uf,
           activo = TRUE, ultima_vez = now()`,
        [a.url, a.fuente, a.titulo, a.tipo, a.comuna, a.ubicacion, a.m2, a.precio_clp, a.precio_uf]
      );
    }

    // Solo se retiran avisos de las fuentes y comunas que hoy sí se leyeron:
    // si un portal falló, sus avisos no se dan por vendidos.
    let retirados: { url: string; titulo: string; comuna: string; precio: string }[] = [];
    for (const l of leidas) {
      const r = await queryMarketing(
        `UPDATE inv_avisos SET activo = FALSE
          WHERE activo AND fuente = $1 AND comuna = $2 AND ultima_vez < now() - ($3 || ' days')::interval
          RETURNING url, titulo, comuna, precio_clp, precio_uf`,
        [l.fuente, l.comuna, String(RETIRADO_DIAS)]
      );
      retirados = retirados.concat(r.rows.map((x) => ({ url: x.url, titulo: x.titulo, comuna: x.comuna, precio: precioTexto(x.precio_clp ? Number(x.precio_clp) : null, x.precio_uf ? Number(x.precio_uf) : null) })));
    }

    const medianas = await medianasPorComuna();
    const vigentes = Number((await queryMarketing(`SELECT count(*)::int AS n FROM inv_avisos WHERE activo`)).rows[0]?.n ?? 0);

    const lineas: string[] = [];
    if (primeraVez) {
      lineas.push(`Primera lectura: guardé ${avisos.length} avisos de terrenos en ${config.comunas.length} comunas. Desde mañana informo solo lo que cambie.`);
    } else {
      lineas.push(`${vigentes} avisos vigentes en ${config.comunas.length} comunas.`);
      lineas.push(nuevos.length ? `Nuevos: ${nuevos.length} (${resumenPorComuna(nuevos)}).` : 'Sin avisos nuevos.');
      if (cambios.length) {
        lineas.push(`Cambios de precio: ${cambios.length}.`);
        for (const c of cambios.slice(0, 5)) lineas.push(`- ${c.titulo} (${c.comuna}): ${c.baja ? 'bajó' : 'subió'} de ${c.antes} a ${c.ahora}.`);
      }
      if (retirados.length) lineas.push(`Retirados: ${retirados.length}.`);
    }
    const conMediana = medianas.filter((m) => m.clp_m2);
    if (conMediana.length) {
      lineas.push(`Mediana por m² (terrenos de ${M2_MIN} a ${M2_MAX.toLocaleString('es-CL')} m² con precio en pesos): ${conMediana.map((m) => `${m.comuna} ${pesos(m.clp_m2!)}`).join(', ')}.`);
    }
    if (problemas.length) lineas.push(`No pude leer: ${problemas.join('; ')}.`);

    const texto = lineas.join('\n');
    await guardarInforme('competencia', 'diario', texto, {
      primeraVez,
      leidos: avisos.length,
      vigentes,
      nuevos: primeraVez ? [] : nuevos.slice(0, 50).map((a) => ({ url: a.url, titulo: a.titulo, comuna: a.comuna, m2: a.m2, precio: precioTexto(a.precio_clp, a.precio_uf) })),
      cambios,
      retirados: retirados.slice(0, 50),
      medianas,
      problemas,
    });

    investigadorDice(
      'competencia',
      primeraVez
        ? `Guardé ${avisos.length} avisos de la competencia`
        : cambios.length || nuevos.length
          ? `${nuevos.length} avisos nuevos, ${cambios.length} cambios de precio`
          : 'La competencia sigue igual hoy'
    );
    return { texto };
  } finally {
    investigadorDescansa('competencia');
  }
}

function resumenPorComuna(avisos: { comuna: string }[]) {
  const n: Record<string, number> = {};
  for (const a of avisos) n[a.comuna] = (n[a.comuna] ?? 0) + 1;
  return Object.entries(n).map(([c, k]) => `${c} ${k}`).join(', ');
}

/** Mediana de $/m² por comuna entre los avisos vigentes de tamaño comparable. */
export async function medianasPorComuna() {
  const r = await queryMarketing(
    `SELECT comuna, m2, precio_clp, precio_uf FROM inv_avisos WHERE activo AND m2 BETWEEN $1 AND $2`,
    [M2_MIN, M2_MAX]
  );
  const por: Record<string, { clp: number[]; uf: number[]; n: number }> = {};
  for (const a of r.rows) {
    const c = (por[a.comuna] ??= { clp: [], uf: [], n: 0 });
    c.n++;
    if (a.precio_clp) c.clp.push(Number(a.precio_clp) / a.m2);
    else if (a.precio_uf) c.uf.push(Number(a.precio_uf) / a.m2);
  }
  return Object.entries(por).map(([comuna, v]) => ({
    comuna,
    avisos: v.n,
    clp_m2: mediana(v.clp),
    uf_m2: mediana(v.uf),
  }));
}

// ---------------------------------------------------------------------------
// Ali - Mercado
// ---------------------------------------------------------------------------

export async function correrMercado() {
  await asegurarTablasInvestigacion();
  const config = await leerConfig();
  investigadorTrabaja('mercado', `Leyendo noticias de ${config.temas.length} temas`);
  try {
    const nuevas: { titulo: string; medio: string | null; tema: string; url: string }[] = [];
    const problemas: string[] = [];
    for (const t of config.temas) {
      investigadorTrabaja('mercado', `Leyendo noticias: ${t.tema}`);
      const r = await leerTema(t);
      if (r.error) problemas.push(`${t.tema}: ${r.error}`);
      for (const n of r.noticias) {
        const ins = await queryMarketing(
          `INSERT INTO inv_noticias (url, titulo, medio, tema, publicada_at) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (url) DO NOTHING RETURNING url`,
          [n.url, n.titulo, n.medio, n.tema, n.publicada_at]
        );
        if (ins.rows.length) nuevas.push({ titulo: n.titulo, medio: n.medio, tema: n.tema, url: n.url });
      }
    }
    const porTema: Record<string, number> = {};
    for (const n of nuevas) porTema[n.tema] = (porTema[n.tema] ?? 0) + 1;
    const lineas = [
      nuevas.length
        ? `${nuevas.length} noticias nuevas: ${Object.entries(porTema).map(([t, k]) => `${t} ${k}`).join(', ')}.`
        : 'Sin noticias nuevas en los temas que sigo.',
      ...config.temas.flatMap((t) => nuevas.filter((n) => n.tema === t.tema).slice(0, 3).map((n) => `- ${t.tema}: ${n.titulo}${n.medio ? ` (${n.medio})` : ''}`)),
    ];
    if (problemas.length) lineas.push(`No pude leer: ${problemas.join('; ')}.`);
    const texto = lineas.join('\n');
    await guardarInforme('mercado', 'diario', texto, { nuevas: nuevas.slice(0, 80), problemas });
    investigadorDice('mercado', nuevas.length ? `${nuevas.length} noticias nuevas del sector` : 'Sin noticias nuevas hoy');
    return { texto };
  } finally {
    investigadorDescansa('mercado');
  }
}

// ---------------------------------------------------------------------------
// Ali - Anuncios (lo manda la tarea diaria de Claude Code)
// ---------------------------------------------------------------------------

export interface AnuncioRecibido {
  id: string;
  page_id?: string | number | null;
  page_name?: string | null;
  titulo?: string | null;
  termino?: string | null;
  /** Inicio de circulación: segundos Unix o fecha ISO. */
  inicio?: number | string | null;
  snapshot_url?: string | null;
}

function fecha(v: AnuncioRecibido['inicio']) {
  if (v === null || v === undefined || v === '') return null;
  const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function anunciosEmpiezan() {
  investigadorTrabaja('anuncios', 'Revisando la Biblioteca de Anuncios de Meta');
}

export async function guardarAnuncios(recibidos: AnuncioRecibido[], resumen: string | null) {
  await asegurarTablasInvestigacion();
  investigadorTrabaja('anuncios', `Comparando ${recibidos.length} anuncios de la competencia`);
  try {
    const anuncios = new Map<string, AnuncioRecibido>();
    for (const a of recibidos) {
      if (!a?.id || String(a.page_id ?? '') === PAGINA_ALIMIN) continue;
      anuncios.set(String(a.id), a);
    }
    const ids = Array.from(anuncios.keys());
    const previos = new Set<string>(
      ids.length ? (await queryMarketing(`SELECT ad_id FROM inv_anuncios WHERE ad_id = ANY($1)`, [ids])).rows.map((r) => r.ad_id) : []
    );
    const primeraVez = Number((await queryMarketing(`SELECT count(*)::int AS n FROM inv_anuncios`)).rows[0]?.n ?? 0) === 0;

    const nuevos: { pagina: string; titulo: string; url: string | null }[] = [];
    for (const [id, a] of Array.from(anuncios.entries())) {
      if (!previos.has(id)) nuevos.push({ pagina: a.page_name || 'Sin nombre', titulo: a.titulo || '', url: a.snapshot_url || null });
      await queryMarketing(
        `INSERT INTO inv_anuncios (ad_id, page_id, page_name, titulo, termino, inicio_at, snapshot_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (ad_id) DO UPDATE SET page_name = EXCLUDED.page_name, titulo = EXCLUDED.titulo,
           snapshot_url = EXCLUDED.snapshot_url, activo = TRUE, ultima_vez = now()`,
        [id, a.page_id ? String(a.page_id) : null, a.page_name?.slice(0, 200) ?? null, a.titulo?.slice(0, 400) ?? null,
          a.termino?.slice(0, 120) ?? null, fecha(a.inicio), a.snapshot_url?.slice(0, 500) ?? null]
      );
    }

    // Solo con una revisión que trajo anuncios se dan otros por terminados.
    const retirados = ids.length
      ? (await queryMarketing(
          `UPDATE inv_anuncios SET activo = FALSE WHERE activo AND ultima_vez < now() - interval '2 days' RETURNING page_name, titulo`
        )).rows
      : [];

    const porPagina = await queryMarketing(
      `SELECT page_name, count(*)::int AS n, max(now() - inicio_at) AS mas_antiguo
         FROM inv_anuncios WHERE activo GROUP BY page_name ORDER BY n DESC LIMIT 15`
    );
    const paginas = porPagina.rows.map((p) => ({
      pagina: p.page_name || 'Sin nombre',
      activos: p.n,
      dias_el_mas_antiguo: p.mas_antiguo?.days ?? null,
    }));

    const lineas = [
      primeraVez
        ? `Primera revisión: guardé ${anuncios.size} anuncios activos de la competencia.`
        : `${anuncios.size} anuncios activos de la competencia. Nuevos: ${nuevos.length}. Terminados: ${retirados.length}.`,
      ...(!primeraVez ? nuevos.slice(0, 6).map((n) => `- Nuevo de ${n.pagina}${n.titulo ? `: ${n.titulo}` : ''}`) : []),
      paginas.length ? `Quién anuncia más: ${paginas.slice(0, 5).map((p) => `${p.pagina} (${p.activos})`).join(', ')}.` : '',
      resumen ? `Lo que vi: ${resumen.trim()}` : '',
    ].filter(Boolean);
    const texto = lineas.join('\n');
    await guardarInforme('anuncios', 'diario', texto, { primeraVez, recibidos: anuncios.size, nuevos, retirados, paginas, resumen });
    investigadorDice('anuncios', primeraVez ? `Guardé ${anuncios.size} anuncios de la competencia` : `${nuevos.length} anuncios nuevos de la competencia`);
    return { texto, nuevos: nuevos.length, activos: anuncios.size };
  } finally {
    investigadorDescansa('anuncios');
  }
}

// ---------------------------------------------------------------------------
// Temporizador (instrumentation.ts)
// ---------------------------------------------------------------------------

export function investigacionActiva() {
  return process.env.INVESTIGACION_ACTIVA !== 'false';
}

function ahoraChile() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(new Date());
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  return { minutos: Number(v('hour')) * 60 + Number(v('minute')), lunes: v('weekday') === 'Mon' };
}

let corriendo = false;

/** Cada 15 minutos: corre lo que toque hoy y no se haya hecho. */
export async function pasadaInvestigacion() {
  if (corriendo || !investigacionActiva()) return [];
  corriendo = true;
  const hechos: string[] = [];
  try {
    const { minutos, lunes } = ahoraChile();
    if (minutos >= 8 * 60 && !(await yaHizo('competencia', 'diario'))) {
      await correrCompetencia();
      hechos.push('competencia');
    }
    if (minutos >= 8 * 60 + 30 && !(await yaHizo('mercado', 'diario'))) {
      await correrMercado();
      hechos.push('mercado');
    }
    // El semanal sale el lunes después de los diarios y de la tarea de anuncios (09:00).
    if (lunes && minutos >= 10 * 60) {
      const { informeSemanal } = await import('./informe');
      for (const agente of ['competencia', 'anuncios', 'mercado'] as Investigador[]) {
        if (await yaHizo(agente, 'semanal')) continue;
        try {
          await informeSemanal(agente);
          hechos.push(`${agente} semanal`);
        } catch (error) {
          // Queda anotado para no reintentar (y pagar) cada 15 minutos.
          const motivo = error instanceof Error ? error.message : String(error);
          await guardarInforme(agente, 'semanal', `No pude escribir el informe de la semana: ${motivo}.`, { error: motivo });
          console.error(`[investigacion] Falló el semanal de ${agente}:`, error);
        }
      }
    }
  } finally {
    corriendo = false;
  }
  return hechos;
}
