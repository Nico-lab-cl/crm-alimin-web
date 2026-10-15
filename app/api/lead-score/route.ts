import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';
import { recalcularSinSolapar, tablaExiste, UMBRAL_CALIENTE, UMBRAL_TIBIO, VIDA_MEDIA_DIAS } from '@/lib/lead_score';

export const dynamic = 'force-dynamic';

/**
 * Panel del lead score: cuántos hay por banda, los calientes y la calidad de
 * cada campaña. Solo lee public.lead_score; el cálculo lo hace el temporizador
 * de instrumentation.ts (o el POST de abajo).
 */
export async function GET() {
  try {
    if (!(await tablaExiste())) {
      return NextResponse.json({ success: true, listo: false });
    }

    const [estado, bandas, calientes, campanas] = await Promise.all([
      queryMain(`SELECT max(calculado_en) AS calculado_en FROM public.lead_score`),
      queryMain(`
        SELECT (origen = 'ANTIGUA') AS antigua, banda, count(*)::int AS n
          FROM public.lead_score GROUP BY 1, 2`),
      // Los 100 mejores de cada grupo: que la base antigua no tape a los vivos.
      queryMain(`
        SELECT * FROM (
          SELECT s.lead_id, s.score, s.banda, s.origen, s.motivos, s.ultima_interaccion, s.caliente_desde,
                 l."firstName", l."lastName", l.status, COALESCE(l.contacted, false) AS contacted,
                 u.name AS "advisorName",
                 row_number() OVER (PARTITION BY (s.origen = 'ANTIGUA')
                                    ORDER BY s.score DESC, s.ultima_interaccion DESC NULLS LAST) AS puesto
            FROM public.lead_score s
            JOIN "Lead" l ON l.id = s.lead_id
            LEFT JOIN "User" u ON u.id = l."assignedToId"
           WHERE s.banda IN ('CALIENTE', 'TIBIO')
        ) t
        WHERE puesto <= 100
        ORDER BY score DESC, ultima_interaccion DESC NULLS LAST`),
      // Calidad por campaña: solo leads vivos (no la base antigua), agrupados
      // por anuncio de Meta, campaña utm o, en la web, el formulario/proyecto.
      queryMain(`
        SELECT s.origen,
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
         WHERE s.origen <> 'ANTIGUA'
         GROUP BY 1, 2
         ORDER BY leads DESC
         LIMIT 200`),
    ]);

    const resumen = { vivos: { CALIENTE: 0, TIBIO: 0, FRIO: 0 }, antigua: { CALIENTE: 0, TIBIO: 0, FRIO: 0 } };
    for (const r of bandas.rows) {
      const grupo = r.antigua ? resumen.antigua : resumen.vivos;
      grupo[r.banda as keyof typeof grupo] = r.n;
    }

    return NextResponse.json({
      success: true,
      listo: true,
      calculadoEn: estado.rows[0]?.calculado_en ?? null,
      reglas: { caliente: UMBRAL_CALIENTE, tibio: UMBRAL_TIBIO, vidaMediaDias: VIDA_MEDIA_DIAS },
      resumen,
      leads: calientes.rows,
      campanas: campanas.rows,
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
