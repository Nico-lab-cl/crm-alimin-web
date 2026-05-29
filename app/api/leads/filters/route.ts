import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';

export async function GET() {
  try {
    // 1. Descubrimiento dinámico del esquema (Todas las columnas) para saber la capitalización exacta
    let columns: string[] = [];
    let dbConnected = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let schemaRes: any = null;
    
    try {
      schemaRes = await queryMain(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'Lead'
        ORDER BY ordinal_position
      `);
      columns = schemaRes.rows.map((r: { column_name: string }) => r.column_name);
      dbConnected = columns.length > 0;
    } catch (e) {
      console.warn('Error descubriendo esquema en filtros:', (e as Error).message);
    }

    // Si no está conectada la base de datos, retornar mock
    if (!dbConnected) {
      return NextResponse.json({
        statuses: ['Nuevo', 'Contactado', 'Visita', 'Reservado'],
        sources: ['META', 'Sitio Web', 'Referido', 'Manual'],
        projects: ['Lomas del Mar', 'Arena y Sol'],
        interests: ['FRIO', 'INTERESADO', 'VENTA'],
        schema: []
      });
    }

    const findCol = (name: string) => columns.find(c => c.toLowerCase() === name.toLowerCase());

    const sourceCol = findCol('source');
    const projectCol = findCol('project');

    let sources: string[] = [];
    let projects: string[] = [];
    let interests: string[] = [];

    // Fuentes dinámicas
    if (sourceCol) {
      try {
        const sourceRes = await queryMain(`
          SELECT DISTINCT "${sourceCol}" 
          FROM "Lead" 
          WHERE "${sourceCol}" IS NOT NULL AND "${sourceCol}" != ''
          ORDER BY "${sourceCol}" ASC
        `);
        const rawSources = sourceRes.rows.map((r: Record<string, string>) => r[sourceCol]);
        
        // Unificar 'web', 'Web' o 'aliminspa.cl' a 'Sitio Web'
        const uniqueSources = new Set<string>();
        rawSources.forEach((s: string) => {
          const sLower = s.toLowerCase();
          if (sLower === 'web' || sLower.includes('aliminspa')) {
            uniqueSources.add('Sitio Web');
          } else {
            uniqueSources.add(s);
          }
        });
        sources = Array.from(uniqueSources);
      } catch (e) {
        console.error('Error fetching sources:', e);
      }
    }

    // Proyectos dinámicos
    if (projectCol) {
      try {
        const projectRes = await queryMain(`
          SELECT DISTINCT "${projectCol}" 
          FROM "Lead" 
          WHERE "${projectCol}" IS NOT NULL AND "${projectCol}" != ''
          ORDER BY "${projectCol}" ASC
        `);
        projects = projectRes.rows.map((r: Record<string, string>) => r[projectCol]);
      } catch (e) {
        console.error('Error fetching projects:', e);
      }
    }
    // Asegurarnos de que los proyectos principales se incluyan para filtros si la base de datos los tiene vacíos en el campo físico pero mapeados por FormId
    if (!projects.includes('Lomas del Mar')) projects.push('Lomas del Mar');
    if (!projects.includes('Arena y Sol')) projects.push('Arena y Sol');

    // Intereses del lead unificados (Frío, Interesado, Venta)
    interests = ['FRIO', 'INTERESADO', 'VENTA'];

    const statuses = ['Nuevo', 'Contactado', 'Visita', 'Reservado'];

    // Mapeamos los nombres de las columnas para la UI
    const schema = schemaRes!.rows.map((col: { column_name: string; data_type: string }) => {
      const name = col.column_name;
      let label = name;
      
      const friendlyLabels: Record<string, string> = {
        'FirstName': 'Nombre',
        'LastName': 'Apellido',
        'Email': 'Email',
        'Source': 'Origen',
        'Status': 'Estado',
        'AdName': 'Nombre Anuncio / Interés',
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
      interests,
      schema
    });
  } catch (error) {
    console.error('Error fetching leads filters/schema:', error);
    return NextResponse.json({ 
      statuses: ['Nuevo', 'Contactado', 'Visita', 'Reservado'], 
      sources: ['META', 'Sitio Web', 'Referido', 'Manual'], 
      projects: ['Lomas del Mar', 'Arena y Sol'], 
      interests: ['FRIO', 'INTERESADO', 'VENTA'],
      schema: [] 
    });
  }
}
