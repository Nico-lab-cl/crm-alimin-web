import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { filters, advancedFilters, dateRange } = await request.json();

    const whereClauses = ['1=1'];
    const params: (string | number | Date)[] = [];

    // 1. Filtros Básicos (Legacy support)
    if (filters?.status) {
      params.push(filters.status);
      whereClauses.push(`status = $${params.length}`);
    }
    if (filters?.source) {
      params.push(filters.source);
      whereClauses.push(`source = $${params.length}`);
    }
    if (filters?.project) {
      params.push(filters.project);
      whereClauses.push(`(project = $${params.length} OR source = $${params.length})`);
    }

    // 2. Filtros Avanzados Dinámicos
    if (Array.isArray(advancedFilters)) {
      advancedFilters.forEach((filter: { column: string; operator: string; value: string }) => {
        if (!filter.column || !filter.value) return;
        
        // Sanitizar el nombre de la columna (solo permitir caracteres de columna válidos o envolver en comillas)
        // En Postgres las columnas sensibles a capitalización deben ir entre comillas dobles
        // Usamos una whitelist o un escape simple para este ejemplo interno
        const safeCol = `"${filter.column.replace(/"/g, '')}"`;
        
        switch (filter.operator) {
          case 'equals':
            params.push(filter.value);
            whereClauses.push(`${safeCol} = $${params.length}`);
            break;
          case 'contains':
            params.push(`%${filter.value}%`);
            whereClauses.push(`${safeCol} ILIKE $${params.length}`);
            break;
          case 'starts_with':
            params.push(`${filter.value}%`);
            whereClauses.push(`${safeCol} ILIKE $${params.length}`);
            break;
          case 'ends_with':
            params.push(`%${filter.value}`);
            whereClauses.push(`${safeCol} ILIKE $${params.length}`);
            break;
          default:
            params.push(filter.value);
            whereClauses.push(`${safeCol} = $${params.length}`);
        }
      });
    }

    // 3. Filtro de Rango de Fechas
    if (dateRange?.start) {
      params.push(new Date(dateRange.start));
      whereClauses.push(`created_at >= $${params.length}`);
    }
    if (dateRange?.end) {
      // Ajustar el fin del día para que incluya todo el día seleccionado
      const endDate = new Date(dateRange.end);
      endDate.setHours(23, 59, 59, 999);
      params.push(endDate);
      whereClauses.push(`created_at <= $${params.length}`);
    }

    const whereString = whereClauses.join(' AND ');

    // 4. Conteo Total (CRM)
    const totalCountRes = await queryMain(`SELECT COUNT(*) as total FROM "Lead" WHERE ${whereString}`, params);
    const totalCount = parseInt(totalCountRes.rows[0].total, 10);

    // 5. Conteo Enviables (Únicos)
    const mailableCountRes = await queryMain(`
      SELECT COUNT(DISTINCT email) as mailable 
      FROM "Lead" 
      WHERE ${whereString} 
      AND email IS NOT NULL AND email != ''
    `, params);
    const mailableCount = parseInt(mailableCountRes.rows[0].mailable, 10);

    // 6. Previsualización (Muestra Dinámica)
    // Ordenamos por created_at DESC para mostrar los más recientes arriba
    const previewQuery = `
      SELECT * 
      FROM "Lead" 
      WHERE ${whereString} 
      ORDER BY created_at DESC NULLS LAST
      LIMIT 100
    `;
    const leadsRes = await queryMain(previewQuery, params);

    return NextResponse.json({ 
      count: mailableCount,
      mailableCount,
      totalCount,
      preview: leadsRes.rows 
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al previsualizar leads';
    console.error('Error al previsualizar leads:', error);
    return NextResponse.json({ message }, { status: 500 });
  }
}
