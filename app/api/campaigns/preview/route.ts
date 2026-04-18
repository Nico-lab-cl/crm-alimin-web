import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { filters, advancedFilters, dateRange } = await request.json();

    const whereClauses = ['1=1'];
    const params: (string | number | Date)[] = [];

    // 1. Filtros Básicos (Legacy support) - Agregamos comillas dobles e ILIKE para robustez
    if (filters?.status) {
      params.push(filters.status);
      whereClauses.push(`"Status" ILIKE $${params.length}`);
    }
    if (filters?.source) {
      params.push(filters.source);
      whereClauses.push(`"Source" ILIKE $${params.length}`);
    }
    if (filters?.project) {
      params.push(filters.project);
      whereClauses.push(`("Project" ILIKE $${params.length} OR "Source" ILIKE $${params.length})`);
    }

    // 2. Filtros Avanzados Dinámicos
    if (Array.isArray(advancedFilters)) {
      advancedFilters.forEach((filter: { column: string; operator: string; value: string }) => {
        if (!filter.column || !filter.value) return;
        
        // Postgres es sensible a mayúsculas en nombres de columnas si fueron creadas con ellas
        const safeCol = `"${filter.column.replace(/"/g, '')}"`;
        
        switch (filter.operator) {
          case 'equals':
            params.push(filter.value);
            whereClauses.push(`${safeCol} ILIKE $${params.length}`); // Cambiamos a ILIKE por defecto para evitar errores de capitalización
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
            whereClauses.push(`${safeCol} ILIKE $${params.length}`);
        }
      });
    }

    const dateCol = `"CreatedAt"`; 

    if (dateRange?.start) {
      params.push(new Date(dateRange.start));
      whereClauses.push(`${dateCol} >= $${params.length}`);
    }
    if (dateRange?.end) {
      const endDate = new Date(dateRange.end);
      endDate.setHours(23, 59, 59, 999);
      params.push(endDate);
      whereClauses.push(`${dateCol} <= $${params.length}`);
    }

    const whereString = whereClauses.join(' AND ');

    // 4. Conteo Total (CRM)
    const totalCountRes = await queryMain(`SELECT COUNT(*) as total FROM "Lead" WHERE ${whereString}`, params);
    const totalCount = parseInt(totalCountRes.rows[0].total, 10);

    // 5. Conteo Enviables (Únicos) - Usando comillas en Email por si acaso
    const mailableCountRes = await queryMain(`
      SELECT COUNT(DISTINCT "Email") as mailable 
      FROM "Lead" 
      WHERE ${whereString} 
      AND "Email" IS NOT NULL AND "Email" != ''
    `, params);
    const mailableCount = parseInt(mailableCountRes.rows[0].mailable, 10);

    // 6. Previsualización (Muestra Dinámica)
    const previewQuery = `
      SELECT * 
      FROM "Lead" 
      WHERE ${whereString} 
      ORDER BY "CreatedAt" DESC NULLS LAST
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
    // Retornamos un 200 con error para que la UI pueda mostrarlo sin explotar
    return NextResponse.json({ message, preview: [], count: 0 }, { status: 200 });
  }
}
