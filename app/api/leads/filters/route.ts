import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';

export async function GET() {
  try {
    // 1. Obtener estados y fuentes de forma dinámica (retrocompatibilidad)
    const statusQuery = 'SELECT DISTINCT status FROM "Lead" WHERE status IS NOT NULL AND status != \'\'';
    const sourceQuery = 'SELECT DISTINCT source FROM "Lead" WHERE source IS NOT NULL AND source != \'\'';
    
    const [statusRes, sourceRes] = await Promise.all([
      queryMain(statusQuery),
      queryMain(sourceQuery)
    ]);

    // 2. Descubrimiento dinámico del esquema (Todas las columnas)
    const schemaQuery = `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Lead'
      ORDER BY ordinal_position
    `;
    const schemaRes = await queryMain(schemaQuery);
    
    // Mapeamos los nombres de las columnas para que sean legibles si es necesario
    const schema = schemaRes.rows.map(col => ({
      name: col.column_name,
      type: col.data_type,
      label: col.column_name.charAt(0).toUpperCase() + col.column_name.slice(1).replace(/_/g, ' ')
    }));

    return NextResponse.json({
      statuses: statusRes.rows.map(r => r.status),
      sources: sourceRes.rows.map(r => r.source),
      schema: schema
    });
  } catch (error) {
    console.error('Error fetching leads filters/schema:', error);
    return NextResponse.json({ message: 'Error al obtener filtros' }, { status: 500 });
  }
}
