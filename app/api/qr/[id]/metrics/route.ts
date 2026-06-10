import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id;
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  try {
    // 1. Verificar existencia del QR
    const checkQr = await queryMarketing('SELECT id, title, code, destination_url FROM qr_codes WHERE id = $1', [id]);
    if (checkQr.rows.length === 0) {
      return NextResponse.json(
        { error: 'Código QR no encontrado' },
        { status: 404 }
      );
    }
    const qrCode = checkQr.rows[0];

    // 2. Construir filtros de fecha si se proveen
    let dateFilterSql = '';
    const queryParams: any[] = [id];
    let paramIndex = 2;

    if (startDate) {
      dateFilterSql += ` AND scanned_at >= $${paramIndex}`;
      queryParams.push(new Date(startDate + 'T00:00:00'));
      paramIndex++;
    }
    if (endDate) {
      dateFilterSql += ` AND scanned_at <= $${paramIndex}`;
      queryParams.push(new Date(endDate + 'T23:59:59'));
      paramIndex++;
    }

    // 3. Ejecutar consultas métricas agregadas
    
    // Totales de escaneos y visitantes únicos
    const totalsRes = await queryMarketing(`
      SELECT 
        COUNT(*)::int as total_scans, 
        COUNT(DISTINCT ip_address)::int as unique_visits, 
        MAX(scanned_at) as last_scanned_at 
      FROM qr_scans 
      WHERE qr_code_id = $1 ${dateFilterSql}
    `, queryParams);

    // Escaneos agrupados por fecha (Línea de tiempo)
    // Para bases de datos PostgreSQL, extraemos la fecha formateada
    const timelineRes = await queryMarketing(`
      SELECT 
        TO_CHAR(scanned_at, 'YYYY-MM-DD') as date, 
        COUNT(*)::int as count 
      FROM qr_scans 
      WHERE qr_code_id = $1 ${dateFilterSql}
      GROUP BY TO_CHAR(scanned_at, 'YYYY-MM-DD')
      ORDER BY date ASC
    `, queryParams);

    // Desglose por dispositivos (Móvil, Tablet, Desktop, etc.)
    const deviceRes = await queryMarketing(`
      SELECT 
        COALESCE(device, 'Desktop') as device, 
        COUNT(*)::int as count 
      FROM qr_scans 
      WHERE qr_code_id = $1 ${dateFilterSql}
      GROUP BY device 
      ORDER BY count DESC
    `, queryParams);

    // Desglose por navegadores (Chrome, Safari, Firefox, etc.)
    const browserRes = await queryMarketing(`
      SELECT 
        COALESCE(browser, 'Unknown Browser') as browser, 
        COUNT(*)::int as count 
      FROM qr_scans 
      WHERE qr_code_id = $1 ${dateFilterSql}
      GROUP BY browser 
      ORDER BY count DESC
    `, queryParams);

    // Desglose por sistemas operativos (Windows, iOS, Android, etc.)
    const osRes = await queryMarketing(`
      SELECT 
        COALESCE(os, 'Unknown OS') as os, 
        COUNT(*)::int as count 
      FROM qr_scans 
      WHERE qr_code_id = $1 ${dateFilterSql}
      GROUP BY os 
      ORDER BY count DESC
    `, queryParams);

    // Desglose por origen/referidor (Referrer)
    const referrerRes = await queryMarketing(`
      SELECT 
        CASE 
          WHEN referrer IS NULL OR referrer = '' THEN 'Directo / WhatsApp'
          WHEN referrer LIKE '%facebook.com%' THEN 'Facebook'
          WHEN referrer LIKE '%instagram.com%' THEN 'Instagram'
          WHEN referrer LIKE '%linkedin.com%' THEN 'LinkedIn'
          WHEN referrer LIKE '%twitter.com%' OR referrer LIKE '%x.com%' THEN 'X / Twitter'
          WHEN referrer LIKE '%google.com%' THEN 'Google'
          ELSE referrer
        END as referrer,
        COUNT(*)::int as count
      FROM qr_scans
      WHERE qr_code_id = $1 ${dateFilterSql}
      GROUP BY 
        CASE 
          WHEN referrer IS NULL OR referrer = '' THEN 'Directo / WhatsApp'
          WHEN referrer LIKE '%facebook.com%' THEN 'Facebook'
          WHEN referrer LIKE '%instagram.com%' THEN 'Instagram'
          WHEN referrer LIKE '%linkedin.com%' THEN 'LinkedIn'
          WHEN referrer LIKE '%twitter.com%' OR referrer LIKE '%x.com%' THEN 'X / Twitter'
          WHEN referrer LIKE '%google.com%' THEN 'Google'
          ELSE referrer
        END
      ORDER BY count DESC
    `, queryParams);

    // Desglose por ubicación geográfica (Países)
    const countryRes = await queryMarketing(`
      SELECT 
        COALESCE(country, 'Desconocido') as country, 
        COUNT(*)::int as count 
      FROM qr_scans 
      WHERE qr_code_id = $1 ${dateFilterSql}
      GROUP BY country 
      ORDER BY count DESC
      LIMIT 10
    `, queryParams);

    // Desglose por ubicación geográfica (Ciudades)
    const cityRes = await queryMarketing(`
      SELECT 
        COALESCE(city, 'Desconocido') as city, 
        COALESCE(country, 'Desconocido') as country,
        COUNT(*)::int as count 
      FROM qr_scans 
      WHERE qr_code_id = $1 ${dateFilterSql}
      GROUP BY country, city 
      ORDER BY count DESC
      LIMIT 15
    `, queryParams);

    // 4. Retornar el compilado de analíticas
    const totals = totalsRes.rows[0];
    return NextResponse.json({
      qrCode,
      totals: {
        totalScans: totals.total_scans || 0,
        uniqueVisits: totals.unique_visits || 0,
        lastScannedAt: totals.last_scanned_at || null,
      },
      timeline: timelineRes.rows,
      byDevice: deviceRes.rows,
      byBrowser: browserRes.rows,
      byOs: osRes.rows,
      byReferrer: referrerRes.rows,
      byCountry: countryRes.rows,
      byCity: cityRes.rows
    });

  } catch (error) {
    console.error(`Error calculating metrics for QR code with id ${id}:`, error);
    return NextResponse.json(
      { error: 'Error al calcular las métricas del código QR' },
      { status: 500 }
    );
  }
}
