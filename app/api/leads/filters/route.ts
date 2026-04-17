import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';

export async function GET() {
  try {
    // 1. Fuentes y Proyectos dinámicos (los dejamos porque varían)
    const sourceQuery = 'SELECT DISTINCT source FROM "Lead" WHERE source IS NOT NULL AND source != \'\'';
    const projectQuery = 'SELECT DISTINCT project FROM "Lead" WHERE project IS NOT NULL AND project != \'\'';
    
    const [sourceRes, projectRes] = await Promise.all([
      queryMain(sourceQuery),
      queryMain(projectQuery)
    ]);

    // 2. Estados Simplificados (según requerimiento del usuario)
    // Usamos los labels que pidió el usuario
    const statuses = ['Nuevo', 'Contactado', 'Visita'];

    // 3. Descubrimiento dinámico del esquema (Todas las columnas)
    const schemaQuery = `
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'Lead'
      ORDER BY ordinal_position
    `;
    const schemaRes = await queryMain(schemaQuery);
    
    // Mapeamos los nombres de las columnas para que sean legibles y respeten capitalización
    const schema = schemaRes.rows.map(col => {
      const name = col.column_name;
      let label = name;
      
      // Diccionario de labels amigables para columnas comunes
      const friendlyLabels: Record<string, string> = {
        'FirstName': 'Nombre',
        'LastName': 'Apellido',
        'Email': 'Email',
        'Source': 'Origen',
        'Status': 'Estado',
        'AdName': 'Nombre Anuncio',
        'FormId': 'ID Formulario',
        'createdAt': 'Fecha Creación',
        'CreatedAt': 'Fecha Creación',
        'Lote': 'Lote',
        'Etapa': 'Etapa',
        'Phone': 'Teléfono'
      };

      if (friendlyLabels[name]) {
        label = friendlyLabels[name];
      } else {
        // Fallback: Capitalize first letter and replace underscores
        label = name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ');
      }

      return {
        name: name,
        type: col.data_type,
        label: label
      };
    });

    return NextResponse.json({
      statuses,
      sources: sourceRes.rows.map(r => r.source),
      projects: projectRes.rows.map(r => r.project),
      schema: schema
    });
  } catch (error) {
    console.error('Error fetching leads filters/schema:', error);
    return NextResponse.json({ message: 'Error al obtener filtros' }, { status: 500 });
  }
}
