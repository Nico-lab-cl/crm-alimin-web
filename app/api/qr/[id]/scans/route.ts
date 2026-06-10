import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id;
  const { searchParams } = new URL(request.url);
  
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = (page - 1) * limit;

  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const device = searchParams.get('device');
  const country = searchParams.get('country');

  try {
    // 1. Verificar existencia del QR
    const checkQr = await queryMarketing('SELECT id FROM qr_codes WHERE id = $1', [id]);
    if (checkQr.rows.length === 0) {
      return NextResponse.json(
        { error: 'Código QR no encontrado' },
        { status: 404 }
      );
    }

    // 2. Construir cláusula WHERE dinámica para filtros
    let filterSql = ' WHERE qr_code_id = $1';
    const queryParams: any[] = [id];
    let paramIndex = 2;

    if (startDate) {
      filterSql += ` AND scanned_at >= $${paramIndex}`;
      queryParams.push(new Date(startDate + 'T00:00:00'));
      paramIndex++;
    }
    if (endDate) {
      filterSql += ` AND scanned_at <= $${paramIndex}`;
      queryParams.push(new Date(endDate + 'T23:59:59'));
      paramIndex++;
    }
    if (device) {
      filterSql += ` AND device = $${paramIndex}`;
      queryParams.push(device);
      paramIndex++;
    }
    if (country) {
      filterSql += ` AND country = $${paramIndex}`;
      queryParams.push(country);
      paramIndex++;
    }

    // 3. Consultar total de registros para paginación
    const countRes = await queryMarketing(
      `SELECT COUNT(*)::int as total FROM qr_scans ${filterSql}`,
      queryParams
    );
    const total = countRes.rows[0].total;

    // 4. Consultar registros paginados
    const paginationParams = [...queryParams, limit, offset];
    const scansRes = await queryMarketing(`
      SELECT 
        id, 
        scanned_at, 
        ip_address, 
        browser, 
        os, 
        device, 
        referrer, 
        country, 
        city, 
        region, 
        latitude, 
        longitude
      FROM qr_scans 
      ${filterSql}
      ORDER BY scanned_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, paginationParams);

    return NextResponse.json({
      scans: scansRes.rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error(`Error fetching detailed scans for QR code with id ${id}:`, error);
    return NextResponse.json(
      { error: 'Error al obtener el historial de escaneos' },
      { status: 500 }
    );
  }
}
