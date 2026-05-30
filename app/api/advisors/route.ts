import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let dbConnected = false;
    let advisors: Array<{ id: string; name: string; email?: string }> = [];

    try {
      // Intentar obtener usuarios de la tabla "User" de la base de datos principal
      const res = await queryMain('SELECT id, name, email FROM "User" ORDER BY name ASC');
      advisors = res.rows;
      dbConnected = true;
    } catch (e) {
      console.warn('No se pudo conectar a la DB para listar asesores, usando mock:', (e as Error).message);
    }

    if (!dbConnected || advisors.length === 0) {
      // Mock advisors compatibles con MOCK_LEADS
      advisors = [
        { id: 'usr-1', name: 'Orlando Castillo', email: 'orlando@aliminspa.cl' },
        { id: 'usr-2', name: 'Marcela Espinoza', email: 'marcela@aliminspa.cl' },
        { id: 'usr-3', name: 'Claudia Riquelme', email: 'claudia@aliminspa.cl' }
      ];
    }

    return NextResponse.json({ advisors });
  } catch (error) {
    console.error('Error fetching advisors:', error);
    return NextResponse.json(
      { message: 'Error interno del servidor', error: (error as Error).message },
      { status: 500 }
    );
  }
}
