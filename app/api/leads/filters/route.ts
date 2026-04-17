import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';

export async function GET() {
  try {
    // Obtener estados únicos
    const statusResult = await queryMain('SELECT DISTINCT status FROM "Lead" WHERE status IS NOT NULL');
    const statuses = statusResult.rows.map((r: { status: string }) => r.status);

    // Obtener orígenes únicos
    const sourceResult = await queryMain('SELECT DISTINCT source FROM "Lead" WHERE source IS NOT NULL');
    const sources = sourceResult.rows.map((r: { source: string }) => r.source);

    // Obtener proyectos únicos
    let projects: string[] = [];
    try {
      // Intentamos buscar una columna 'project'. Si falla, usamos 'source' como base de proyectos.
      const projectResult = await queryMain('SELECT DISTINCT project FROM "Lead" WHERE project IS NOT NULL');
      projects = projectResult.rows.map((r: { project: string }) => r.project);
    } catch (e) {
      // Si la columna no existe, el CRM probablemente usa 'source' o 'formid' para identificar proyectos.
      // Por ahora devolvemos sources como proyectos para que la UI no rompa.
      projects = sources;
    }

    return NextResponse.json({ statuses, sources, projects });
  } catch (error) {
    console.error('Error fetching lead filters:', error);
    return NextResponse.json({ message: 'Error interno' }, { status: 500 });
  }
}
