import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';
import { recalcularSinSolapar, tablaExiste, UMBRAL_CALIENTE, UMBRAL_TIBIO, VIDA_MEDIA_DIAS } from '@/lib/lead_score';

export const dynamic = 'force-dynamic';

const BANDAS = ['CALIENTE', 'TIBIO', 'FRIO'];
const ORIGENES = ['WEB', 'LANDING_META', 'FORM_META', 'MANUAL', 'ANTIGUA'];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Panel del lead score. Solo lee public.lead_score; el cálculo lo hace el
 * temporizador de instrumentation.ts (o el POST de abajo).
 *
 * Filtros (todos opcionales, se aplican igual a las tarjetas, al listado y a
 * la calidad por campaña):
 *   desde / hasta  fecha de creación del lead (YYYY-MM-DD, día de Chile)
 *   banda          CALIENTE / TIBIO / FRIO; sin banda el listado muestra
 *                  calientes y tibios, que son los que hay que llamar
 *   origen         WEB / LANDING_META / FORM_META / MANUAL / ANTIGUA
 *   asesor         id del asesor
 */
export async function GET(request: Request) {
  try {
    if (!(await tablaExiste())) {
      return NextResponse.json({ success: true, listo: false });
    }

    const sp = new URL(request.url).searchParams;
    const desde = sp.get('desde') || '';
    const hasta = sp.get('hasta') || '';
    const banda = (sp.get('banda') || '').toUpperCase();
    const origen = (sp.get('origen') || '').toUpperCase();
    const asesor = sp.get('asesor') || '';

    // Filtros comunes (sin la banda, que las tarjetas cuentan por separado).
    const params: unknown[] = [];
    const where: string[] = ['1=1'];
    // createdAt es timestamp sin zona en UTC: se compara por día de Chile.
    const diaChile = `(l."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Santiago')::date`;
    if (FECHA.test(desde)) {
      params.push(desde);
      where.push(`${diaChile} >= $${params.length}::date`);
    }
    if (FECHA.test(hasta)) {
      params.push(hasta);
      where.push(`${diaChile} <= $${params.length}::date`);
    }
    if (ORIGENES.includes(origen)) {
      params.push(origen);
      where.push(`s.origen = $${params.length}`);
    }
    if (asesor) {
      params.push(asesor);
      where.push(`l."assignedToId" = $${params.length}`);
    }
    const base = where.join(' AND ');

    const paramsLista = [...params];
    let filtroBanda: string;
    if (BANDAS.includes(banda)) {
      paramsLista.push(banda);
      filtroBanda = `s.banda = $${paramsLista.length}`;
    } else {
      filtroBanda = `s.banda IN ('CALIENTE', 'TIBIO')`;
    }

    const [estado, bandas, leads, campanas, asesores] = await Promise.all([
      queryMain(`SELECT max(calculado_en) AS calculado_en FROM public.lead_score`),
      queryMain(
        `SELECT s.banda, count(*)::int AS n
           FROM public.lead_score s JOIN "Lead" l ON l.id = s.lead_id
          WHERE ${base}
          GROUP BY 1`,
        params
      ),
      queryMain(
        `SELECT s.lead_id, s.score, s.banda, s.origen, s.motivos, s.ultima_interaccion, s.caliente_desde,
                l."firstName", l."lastName", l.status, COALESCE(l.contacted, false) AS contacted,
                l."createdAt" AT TIME ZONE 'UTC' AS creado,
                u.name AS "advisorName"
           FROM public.lead_score s
           JOIN "Lead" l ON l.id = s.lead_id
           LEFT JOIN "User" u ON u.id = l."assignedToId"
          WHERE ${base} AND ${filtroBanda}
          ORDER BY s.score DESC, s.ultima_interaccion DESC NULLS LAST
          LIMIT 300`,
        paramsLista
      ),
      // Calidad por campaña: agrupada por anuncio de Meta, campaña utm o, en
      // la web, el formulario/proyecto. La base antigua no tiene campaña.
      queryMain(
        `SELECT s.origen,
                COALESCE(NULLIF(l."adName", ''), NULLIF(l."utmCampaign", ''), NULLIF(l.interests, ''), '(sin campaña)') AS campana,
                count(*)::int AS leads,
                round(avg(s.score))::int AS promedio,
                count(*) FILTER (WHERE s.banda = 'CALIENTE')::int AS calientes,
                count(*) FILTER (WHERE s.banda = 'TIBIO')::int AS tibios,
                count(*) FILTER (WHERE s.puntos_interaccion > 0)::int AS con_interaccion,
                count(*) FILTER (WHERE COALESCE(l.contacted, false))::int AS contactados,
                count(*) FILTER (WHERE COALESCE(l.visited, false) OR upper(COALESCE(l.status, '')) IN ('VISITA', 'RESERVADO'))::int AS avanzaron
           FROM public.lead_score s
           JOIN "Lead" l ON l.id = s.lead_id
          WHERE ${base} AND s.origen <> 'ANTIGUA'
          GROUP BY 1, 2
          ORDER BY leads DESC
          LIMIT 200`,
        params
      ),
      queryMain(
        `SELECT DISTINCT u.id, u.name
           FROM public.lead_score s
           JOIN "Lead" l ON l.id = s.lead_id
           JOIN "User" u ON u.id = l."assignedToId"
          ORDER BY u.name`
      ),
    ]);

    const resumen = { CALIENTE: 0, TIBIO: 0, FRIO: 0 };
    for (const r of bandas.rows) resumen[r.banda as keyof typeof resumen] = r.n;

    return NextResponse.json({
      success: true,
      listo: true,
      calculadoEn: estado.rows[0]?.calculado_en ?? null,
      reglas: { caliente: UMBRAL_CALIENTE, tibio: UMBRAL_TIBIO, vidaMediaDias: VIDA_MEDIA_DIAS },
      resumen,
      leads: leads.rows,
      campanas: campanas.rows,
      asesores: asesores.rows,
    });
  } catch (error) {
    console.error('Error in GET /api/lead-score:', error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}

/** Recalcula ahora, sin esperar al temporizador. */
export async function POST() {
  try {
    const resultado = await recalcularSinSolapar();
    return NextResponse.json({ success: true, ...resultado });
  } catch (error) {
    console.error('Error in POST /api/lead-score:', error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}
