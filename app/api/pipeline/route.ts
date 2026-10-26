import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Tablero del pipeline comercial. Solo lee.
 *
 * Las etapas las mueven los asesores desde el CRM móvil y el historial lo
 * escribe un trigger de la base (ver
 * crm-aliminv2/prisma/migrations_manual/2026-10-26_pipeline.sql).
 *
 * Las fechas filtran por cuándo llegó el lead ("createdAt", en hora de Chile):
 * el tablero muestra en qué etapa está hoy cada lead que llegó en ese rango.
 * Se acepta ?dias=N (últimos N días) o ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD.
 */

// Los asesores que trabajan leads hoy (los mismos de crm-aliminv2/src/lib/assignment.ts).
const ASESORES = [
  'db1e6577-01b1-4615-b35e-0d50752452f3', // Marcela
  'a6ce92ca-f1a1-4dcf-a042-fda1c31ca485', // Orlando
  '77cea468-b4a5-44e6-aaa5-0a3f376affb1', // Bárbara
];

/** Antes de esto no hay leads propios que valga la pena mirar en el tablero. */
const FECHA_MINIMA = '2026-05-01';

const ESTADOS_CLIENTE = ['RESERVA_POR_FIRMAR', 'RESERVA_PAGADA', 'PIE_POR_PAGAR', 'PAGO_CUOTAS', 'VENTA_CERRADA'];
const ETAPAS = ['NUEVO', 'CONTACTADO', 'VISITA', 'RESERVADO', 'PERDIDO'];
const lista = (xs: string[]) => xs.map((x) => `'${x}'`).join(',');
const FUENTES_IMPORTADAS = ['kommo', 'csv import', 'old-db', 'instagram', 'clientify'];

const COLUMNA = `CASE WHEN upper(l.status) IN (${lista(ESTADOS_CLIENTE)}) THEN 'RESERVADO'
                      WHEN upper(l.status) IN (${lista(ETAPAS)}) THEN upper(l.status)
                      ELSE 'NUEVO' END`;
const POR_COLUMNA = 40;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const hoyEnChile = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
function restarDias(fecha: string, dias: number) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/** Rango pedido, siempre dentro de [FECHA_MINIMA, hoy]. */
function rangoDe(params: URLSearchParams) {
  const hoy = hoyEnChile();
  let desde = params.get('desde') || '';
  let hasta = params.get('hasta') || '';
  if (!FECHA.test(desde) || !FECHA.test(hasta)) {
    const dias = Math.min(Math.max(parseInt(params.get('dias') || '30', 10) || 30, 1), 365);
    desde = restarDias(hoy, dias - 1);
    hasta = hoy;
  }
  if (desde < FECHA_MINIMA) desde = FECHA_MINIMA;
  if (hasta > hoy) hasta = hoy;
  if (desde > hasta) desde = hasta;
  return { desde, hasta };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pedido = url.searchParams.get('asesor') || '';
  const asesores = pedido && ASESORES.includes(pedido) ? [pedido] : ASESORES;
  const { desde, hasta } = rangoDe(url.searchParams);

  try {
    const existe = await queryMain(`SELECT to_regclass('public.lead_etapa_historial') IS NOT NULL AS ok`);
    if (!existe.rows[0]?.ok) return NextResponse.json({ listo: false });

    // Solo leads que generamos nosotros (web, Meta, chat, cargados a mano): las
    // importaciones de la base antigua quedan fuera, igual que en el lead score.
    const filtro = `l."assignedToId" = ANY($1::text[])
                    AND l."createdAt" >= (($2::date)::timestamp AT TIME ZONE 'America/Santiago') AT TIME ZONE 'UTC'
                    AND l."createdAt" <  (($3::date + 1)::timestamp AT TIME ZONE 'America/Santiago') AT TIME ZONE 'UTC'
                    AND lower(trim(COALESCE(l.source, ''))) NOT IN (${lista(FUENTES_IMPORTADAS)})`;
    const p = [asesores, desde, hasta];

    const [nombres, columnas, tarjetas] = await Promise.all([
      queryMain(`SELECT id, name FROM "User" WHERE id = ANY($1::text[]) ORDER BY name`, [ASESORES]),
      queryMain(
        `SELECT ${COLUMNA} AS columna, count(*)::int AS leads
           FROM "Lead" l WHERE ${filtro} GROUP BY 1`,
        p
      ),
      queryMain(
        `SELECT * FROM (
           SELECT l.id, l."firstName", l."lastName", l.status, ${COLUMNA} AS columna, l."etapaDesde",
                  l."proximaAccion", l."proximaAccionAt", l."motivoPerdida", u.name AS asesor, s.banda, s.score,
                  row_number() OVER (PARTITION BY ${COLUMNA} ORDER BY l."etapaDesde" DESC) AS n
             FROM "Lead" l
             LEFT JOIN "User" u ON u.id = l."assignedToId"
             LEFT JOIN public.lead_score s ON s.lead_id = l.id
            WHERE ${filtro}
         ) x WHERE n <= ${POR_COLUMNA}`,
        p
      ),
    ]);

    return NextResponse.json({
      listo: true,
      desde,
      hasta,
      fechaMinima: FECHA_MINIMA,
      hoy: hoyEnChile(),
      porColumna: POR_COLUMNA,
      asesores: nombres.rows,
      columnas: columnas.rows,
      tarjetas: tarjetas.rows,
    });
  } catch (error) {
    console.error('Error in GET /api/pipeline:', error);
    return NextResponse.json({ message: 'No se pudo leer el pipeline', error: (error as Error).message }, { status: 500 });
  }
}
