import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { filters } = await request.json();

    // 1. Construir filtros comunes
    let filterClause = '1=1';
    const params: string[] = [];
    
    if (filters?.status) {
      params.push(filters.status);
      filterClause += ` AND status = $${params.length}`;
    }

    if (filters?.source) {
      params.push(filters.source);
      filterClause += ` AND source = $${params.length}`;
    }

    if (filters?.project) {
      params.push(filters.project);
      // Intentamos filtrar por columna 'project', si falla asumimos que el valor viene de 'source'
      // Esto es para compatibilidad con la lógica de fallback de la API de filtros.
      filterClause += ` AND (project = $${params.length} OR (NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Lead' AND column_name = 'project') AND source = $${params.length}))`;
    }

    // 2. Query para el Conteo Total (Coincide con CRM Móvil)
    const totalCountRes = await queryMain(`SELECT COUNT(*) as total FROM "Lead" WHERE ${filterClause}`, params);
    const totalCount = parseInt(totalCountRes.rows[0].total, 10);

    // 3. Query para Leads Enviables (Emails Únicos)
    const mailableCountRes = await queryMain(`
      SELECT COUNT(DISTINCT email) as mailable 
      FROM "Lead" 
      WHERE ${filterClause} 
      AND email IS NOT NULL AND email != ''
    `, params);
    const mailableCount = parseInt(mailableCountRes.rows[0].mailable, 10);

    // 4. Query para Previsualización (muestra de leads)
    const previewQuery = `
      SELECT id, email, source 
      FROM "Lead" 
      WHERE ${filterClause} 
      AND email IS NOT NULL AND email != ''
      LIMIT 50
    `;
    const leadsRes = await queryMain(previewQuery, params);

    return NextResponse.json({ 
      count: mailableCount, // El frontend actual usa 'count', lo mantenemos para compatibilidad inicial
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
