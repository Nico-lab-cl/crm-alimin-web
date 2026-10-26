import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Pipeline comercial: tablero y análisis de seguimiento. Solo lee.
 *
 * El historial (lead_etapa_historial) lo escribe un trigger de la base sobre
 * "Lead".status y los seguimientos (lead_seguimientos) los anotan los asesores
 * desde el CRM móvil. Las filas con origen RECONSTRUIDO salen del relleno
 * inicial del 2026-10-26: la fecha de contacto es real, la de etapas más
 * avanzadas es una cota, así que los tiempos por etapa las excluyen.
 * Ver crm-aliminv2/prisma/migrations_manual/2026-10-26_pipeline.sql.
 */

const ESTADOS_CLIENTE = ['RESERVA_POR_FIRMAR', 'RESERVA_PAGADA', 'PIE_POR_PAGAR', 'PAGO_CUOTAS', 'VENTA_CERRADA'];
const ETAPAS = ['NUEVO', 'CONTACTADO', 'VISITA', 'RESERVADO', 'PERDIDO'];
const lista = (xs: string[]) => xs.map((x) => `'${x}'`).join(',');

const COLUMNA = `CASE WHEN upper(l.status) IN (${lista(ESTADOS_CLIENTE)}) THEN 'RESERVADO'
                      WHEN upper(l.status) IN (${lista(ETAPAS)}) THEN upper(l.status)
                      ELSE 'NUEVO' END`;
const CERRADAS = lista(['RESERVADO', 'PERDIDO', ...ESTADOS_CLIENTE]);
const GANADAS = lista(['RESERVADO', ...ESTADOS_CLIENTE]);
const AHORA = `(now() AT TIME ZONE 'UTC')`;
// Mismo alcance que el pipeline del móvil (src/lib/pipeline.ts).
// CONTACTADO se marca solo al responder, así que hay miles de contactados viejos
// que nadie está trabajando: las etapas abiertas entran solo si son recientes o
// tienen algo agendado.
const EN_PIPELINE = `(CASE
  WHEN upper(l.status) IN (${GANADAS}) THEN true
  WHEN upper(l.status) = 'PERDIDO' THEN l."etapaDesde" > ${AHORA} - interval '90 days'
  ELSE l."etapaDesde" > ${AHORA} - interval '60 days' OR l."proximaAccionAt" IS NOT NULL
END)`;
const DIAS_ESTANCADO = 14;
const POR_COLUMNA = 40;

async function tablasListas() {
  const r = await queryMain(`SELECT to_regclass('public.lead_etapa_historial') IS NOT NULL AS h,
                                    to_regclass('public.lead_seguimientos') IS NOT NULL AS s`);
  return r.rows[0]?.h && r.rows[0]?.s;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const asesor = url.searchParams.get('asesor') || null;
  const dias = Math.min(Math.max(parseInt(url.searchParams.get('dias') || '30', 10) || 30, 1), 365);

  try {
    if (!(await tablasListas())) return NextResponse.json({ listo: false });

    const filtroAsesor = `($1::text IS NULL OR l."assignedToId" = $1)`;
    const desde = `${AHORA} - make_interval(days => $2)`;
    const p = [asesor, dias];

    const [asesores, columnas, tarjetas, embudo, entradas, tiempos, primerContacto, porAsesor, perdidas, estancados] =
      await Promise.all([
        queryMain(
          `SELECT u.id, u.name FROM "User" u
            WHERE EXISTS (SELECT 1 FROM "Lead" l WHERE l."assignedToId" = u.id AND l."createdAt" > ${AHORA} - interval '120 days')
            ORDER BY u.name`
        ),

        queryMain(
          `SELECT ${COLUMNA} AS columna, count(*)::int AS leads,
                  count(*) FILTER (WHERE l."proximaAccionAt" < ${AHORA} AND upper(l.status) NOT IN (${CERRADAS}))::int AS atrasados,
                  count(*) FILTER (WHERE l."proximaAccionAt" IS NULL AND upper(l.status) NOT IN ('NUEVO', ${CERRADAS}))::int AS sin_accion
             FROM "Lead" l
            WHERE ${filtroAsesor} AND ${EN_PIPELINE}
            GROUP BY 1`,
          [asesor]
        ),

        queryMain(
          `SELECT * FROM (
             SELECT l.id, l."firstName", l."lastName", l.status, ${COLUMNA} AS columna, l."etapaDesde",
                    l."proximaAccion", l."proximaAccionAt", l."motivoPerdida", u.name AS asesor, s.banda, s.score,
                    row_number() OVER (PARTITION BY ${COLUMNA}
                                       ORDER BY CASE WHEN ${COLUMNA} IN ('NUEVO', 'RESERVADO', 'PERDIDO') THEN NULL ELSE l."proximaAccionAt" END ASC NULLS FIRST,
                                                l."etapaDesde" DESC) AS n
               FROM "Lead" l
               LEFT JOIN "User" u ON u.id = l."assignedToId"
               LEFT JOIN public.lead_score s ON s.lead_id = l.id
              WHERE ${filtroAsesor} AND ${EN_PIPELINE}
           ) x WHERE n <= ${POR_COLUMNA}`,
          [asesor]
        ),

        // Cohorte: de los leads que entraron en el período, cuántos llegaron a cada etapa.
        queryMain(
          `WITH c AS (
             SELECT l.id, upper(l.status) AS actual FROM "Lead" l
              WHERE ${filtroAsesor} AND l."createdAt" > ${desde}
           ), alcanzo AS (
             SELECT c.id,
                    bool_or(h.a = 'CONTACTADO') OR bool_or(c.actual NOT IN ('NUEVO', 'PERDIDO')) AS contactado,
                    bool_or(h.a = 'VISITA') OR bool_or(c.actual IN ('VISITA', ${GANADAS})) AS visita,
                    bool_or(h.a IN (${GANADAS})) OR bool_or(c.actual IN (${GANADAS})) AS reservado,
                    bool_or(c.actual = 'PERDIDO') AS perdido
               FROM c LEFT JOIN lead_etapa_historial h ON h.lead_id = c.id
              GROUP BY c.id
           )
           SELECT count(*)::int AS ingresaron,
                  count(*) FILTER (WHERE contactado)::int AS contactados,
                  count(*) FILTER (WHERE visita)::int AS visitas,
                  count(*) FILTER (WHERE reservado)::int AS reservas,
                  count(*) FILTER (WHERE perdido)::int AS perdidos
             FROM alcanzo`,
          p
        ),

        // Movimientos del período: cuántos leads entraron a cada etapa y por qué vía.
        queryMain(
          `SELECT CASE WHEN h.a IN (${GANADAS}) THEN 'RESERVADO' ELSE h.a END AS etapa, h.origen, count(DISTINCT h.lead_id)::int AS leads
             FROM lead_etapa_historial h JOIN "Lead" l ON l.id = h.lead_id
            WHERE ${filtroAsesor} AND h.created_at > ${desde} AND h.de IS NOT NULL
            GROUP BY 1, 2`,
          p
        ),

        // Días promedio y mediana que pasa un lead en cada etapa antes de moverse.
        queryMain(
          `WITH pasos AS (
             SELECT h.lead_id, h.a, h.origen, h.created_at,
                    lead(h.created_at) OVER (PARTITION BY h.lead_id ORDER BY h.created_at) AS salida,
                    lead(h.origen) OVER (PARTITION BY h.lead_id ORDER BY h.created_at) AS origen_salida
               FROM lead_etapa_historial h JOIN "Lead" l ON l.id = h.lead_id
              WHERE ${filtroAsesor}
           )
           SELECT a AS etapa, count(*)::int AS casos,
                  round(avg(extract(epoch FROM salida - created_at) / 86400)::numeric, 1)::float AS promedio_dias,
                  round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM salida - created_at)) / 86400)::numeric, 1)::float AS mediana_dias
             FROM pasos
            WHERE salida IS NOT NULL AND salida > ${desde}
              AND NOT (origen = 'RECONSTRUIDO' AND a NOT IN ('NUEVO', 'CONTACTADO'))
              AND NOT (origen_salida = 'RECONSTRUIDO' AND a <> 'NUEVO')
              AND a IN ('NUEVO', 'CONTACTADO', 'VISITA')
            GROUP BY 1`,
          [asesor]
        ),

        queryMain(
          `SELECT count(*)::int AS leads,
                  round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM l."contactedAt" - l."createdAt")) / 3600)::numeric, 1)::float AS mediana_horas
             FROM "Lead" l
            WHERE ${filtroAsesor} AND l."createdAt" > ${desde} AND l."contactedAt" IS NOT NULL AND l."contactedAt" >= l."createdAt"`,
          p
        ),

        queryMain(
          `SELECT u.id, u.name,
                  (SELECT count(*) FROM "Lead" l WHERE l."assignedToId" = u.id AND ${EN_PIPELINE} AND upper(l.status) NOT IN (${CERRADAS}))::int AS abiertos,
                  (SELECT count(*) FROM "Lead" l WHERE l."assignedToId" = u.id AND upper(l.status) NOT IN (${CERRADAS}) AND l."proximaAccionAt" < ${AHORA})::int AS atrasados,
                  (SELECT count(*) FROM "Lead" l WHERE l."assignedToId" = u.id AND ${EN_PIPELINE} AND upper(l.status) NOT IN ('NUEVO', ${CERRADAS}) AND l."proximaAccionAt" IS NULL)::int AS sin_accion,
                  (SELECT count(*) FROM lead_seguimientos s WHERE s.usuario_id = u.id AND s.created_at > ${AHORA} - make_interval(days => $1))::int AS seguimientos,
                  (SELECT count(DISTINCT s.lead_id) FROM lead_seguimientos s WHERE s.usuario_id = u.id AND s.created_at > ${AHORA} - make_interval(days => $1))::int AS leads_seguidos,
                  (SELECT count(*) FROM lead_etapa_historial h JOIN "Lead" l ON l.id = h.lead_id WHERE l."assignedToId" = u.id AND h.a = 'VISITA' AND h.created_at > ${AHORA} - make_interval(days => $1))::int AS visitas,
                  (SELECT count(*) FROM lead_etapa_historial h JOIN "Lead" l ON l.id = h.lead_id WHERE l."assignedToId" = u.id AND h.a IN (${GANADAS}) AND h.de NOT IN (${GANADAS}) AND h.created_at > ${AHORA} - make_interval(days => $1))::int AS reservas,
                  (SELECT count(*) FROM lead_etapa_historial h JOIN "Lead" l ON l.id = h.lead_id WHERE l."assignedToId" = u.id AND h.a = 'PERDIDO' AND h.created_at > ${AHORA} - make_interval(days => $1))::int AS perdidos
             FROM "User" u
            WHERE u.role = 'ASESOR'
              AND EXISTS (SELECT 1 FROM "Lead" l WHERE l."assignedToId" = u.id AND l."createdAt" > ${AHORA} - interval '120 days')
            ORDER BY abiertos DESC`,
          [dias]
        ),

        queryMain(
          `SELECT COALESCE(l."motivoPerdida", 'Sin motivo') AS motivo, count(*)::int AS leads
             FROM "Lead" l
            WHERE ${filtroAsesor} AND upper(l.status) = 'PERDIDO' AND l."etapaDesde" > ${desde}
            GROUP BY 1 ORDER BY 2 DESC`,
          p
        ),

        // Abiertos que llevan semanas en la misma etapa y sin que nadie anote nada.
        queryMain(
          `SELECT l.id, l."firstName", l."lastName", upper(l.status) AS status, l."etapaDesde", l."proximaAccion", l."proximaAccionAt",
                  u.name AS asesor, (SELECT max(created_at) FROM lead_seguimientos s WHERE s.lead_id = l.id) AS ultimo_seguimiento
             FROM "Lead" l LEFT JOIN "User" u ON u.id = l."assignedToId"
            WHERE ${filtroAsesor} AND ${EN_PIPELINE}
              AND upper(l.status) NOT IN ('NUEVO', ${CERRADAS})
              AND l."etapaDesde" < ${AHORA} - interval '${DIAS_ESTANCADO} days'
              AND (l."proximaAccionAt" IS NULL OR l."proximaAccionAt" < ${AHORA})
              AND NOT EXISTS (SELECT 1 FROM lead_seguimientos s WHERE s.lead_id = l.id AND s.created_at > ${AHORA} - interval '${DIAS_ESTANCADO} days')
            ORDER BY l."etapaDesde" ASC
            LIMIT 50`,
          [asesor]
        ),
      ]);

    return NextResponse.json({
      listo: true,
      dias,
      diasEstancado: DIAS_ESTANCADO,
      porColumna: POR_COLUMNA,
      asesores: asesores.rows,
      columnas: columnas.rows,
      tarjetas: tarjetas.rows,
      embudo: embudo.rows[0],
      entradas: entradas.rows,
      tiempos: tiempos.rows,
      primerContacto: primerContacto.rows[0],
      porAsesor: asesor ? porAsesor.rows.filter((a: any) => a.id === asesor) : porAsesor.rows,
      perdidas: perdidas.rows,
      estancados: estancados.rows,
    });
  } catch (error) {
    console.error('Error in GET /api/pipeline:', error);
    return NextResponse.json({ message: 'No se pudo leer el pipeline', error: (error as Error).message }, { status: 500 });
  }
}
