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
 * El período filtra por "etapaDesde": un lead aparece si entró a su etapa
 * actual dentro de los últimos N días.
 */

// Los asesores que trabajan leads hoy (los mismos de crm-aliminv2/src/lib/assignment.ts).
const ASESORES = [
  'db1e6577-01b1-4615-b35e-0d50752452f3', // Marcela
  'a6ce92ca-f1a1-4dcf-a042-fda1c31ca485', // Orlando
  '77cea468-b4a5-44e6-aaa5-0a3f376affb1', // Bárbara
];

const ESTADOS_CLIENTE = ['RESERVA_POR_FIRMAR', 'RESERVA_PAGADA', 'PIE_POR_PAGAR', 'PAGO_CUOTAS', 'VENTA_CERRADA'];
const ETAPAS = ['NUEVO', 'CONTACTADO', 'VISITA', 'RESERVADO', 'PERDIDO'];
const lista = (xs: string[]) => xs.map((x) => `'${x}'`).join(',');

const COLUMNA = `CASE WHEN upper(l.status) IN (${lista(ESTADOS_CLIENTE)}) THEN 'RESERVADO'
                      WHEN upper(l.status) IN (${lista(ETAPAS)}) THEN upper(l.status)
                      ELSE 'NUEVO' END`;
const POR_COLUMNA = 40;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pedido = url.searchParams.get('asesor') || '';
  const asesores = pedido && ASESORES.includes(pedido) ? [pedido] : ASESORES;
  const dias = Math.min(Math.max(parseInt(url.searchParams.get('dias') || '30', 10) || 30, 1), 365);

  try {
    const existe = await queryMain(`SELECT to_regclass('public.lead_etapa_historial') IS NOT NULL AS ok`);
    if (!existe.rows[0]?.ok) return NextResponse.json({ listo: false });

    const filtro = `l."assignedToId" = ANY($1::text[])
                    AND l."etapaDesde" > (now() AT TIME ZONE 'UTC') - make_interval(days => $2)`;
    const p = [asesores, dias];

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
      dias,
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
