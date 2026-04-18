import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';

export async function GET() {
  try {
    // 1. Fuentes y Proyectos dinámicos (Usamos comillas dobles por la capitalización en la DB)
    const sourceQuery = 'SELECT DISTINCT "Source" FROM "Lead" WHERE "Source" IS NOT NULL AND "Source" != \'\'';
    const projectQuery = 'SELECT DISTINCT "Project" FROM "Lead" WHERE "Project" IS NOT NULL AND "Project" != \'\'';
    
    // Ejecutamos con catch individual para que un error en uno no rompa todo el filtro
    let sources: string[] = [];
    let projects: string[] = [];
    
    try {
      const sourceRes = await queryMain(sourceQuery);
      sources = sourceRes.rows.map(r => r.Source || r.source);
    } catch (e) {
      console.error('Error fetching sources:', e);
    }

    try {
      const projectRes = await queryMain(projectQuery);
      projects = projectRes.rows.map(r => r.Project || r.project);
    } catch (e) {
      console.error('Error fetching projects:', e);
    }

    // 2. Estados Simplificados (según requerimiento del usuario)
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
      sources,
      projects,
      schema: schema
    });
  } catch (error) {
    console.error('Error fetching leads filters/schema:', error);
    // Retornamos un objeto básico para que el frontend no rompa
    return NextResponse.json({ 
      statuses: ['Nuevo', 'Contactado', 'Visita'], 
      sources: [], 
      projects: [], 
      schema: [] 
    });
  }
}
