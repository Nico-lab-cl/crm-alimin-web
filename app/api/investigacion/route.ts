import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';
import { medianasPorComuna } from '@/lib/investigacion/investigacion';
import { asegurarTablasInvestigacion, leerConfig } from '@/lib/investigacion/tablas';

export const dynamic = 'force-dynamic';

/** Todo lo que muestra /investigacion. */
export async function GET() {
  try {
    await asegurarTablasInvestigacion();
    const [informes, avisos, anuncios, noticias, gasto, config, medianas] = await Promise.all([
      queryMarketing(
        `SELECT DISTINCT ON (agente, tipo) agente, tipo, texto, datos, costo_usd, created_at
           FROM inv_informes ORDER BY agente, tipo, created_at DESC`
      ),
      queryMarketing(
        `SELECT url, fuente, titulo, tipo, comuna, ubicacion, m2, precio_clp, precio_uf, precio_anterior_clp, precio_anterior_uf,
                precio_cambio_at, primera_vez, ultima_vez
           FROM inv_avisos WHERE activo ORDER BY primera_vez DESC LIMIT 400`
      ),
      queryMarketing(
        `SELECT ad_id, page_name, titulo, termino, inicio_at, snapshot_url, primera_vez, ultima_vez
           FROM inv_anuncios WHERE activo ORDER BY primera_vez DESC LIMIT 300`
      ),
      queryMarketing(
        `SELECT url, titulo, medio, tema, publicada_at, vista_at FROM inv_noticias
          WHERE vista_at >= now() - interval '14 days' ORDER BY COALESCE(publicada_at, vista_at) DESC LIMIT 200`
      ),
      queryMarketing(
        `SELECT COALESCE(sum(costo_usd), 0)::float AS usd FROM inv_informes
          WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'America/Santiago') AT TIME ZONE 'America/Santiago'`
      ),
      leerConfig(),
      medianasPorComuna(),
    ]);
    return NextResponse.json({
      informes: informes.rows,
      avisos: avisos.rows,
      anuncios: anuncios.rows,
      noticias: noticias.rows,
      gastoMesUSD: gasto.rows[0]?.usd ?? 0,
      config,
      medianas,
    });
  } catch (error) {
    console.error('[investigacion] No se pudo leer:', error);
    return NextResponse.json({ error: 'No se pudo leer la investigación' }, { status: 500 });
  }
}
