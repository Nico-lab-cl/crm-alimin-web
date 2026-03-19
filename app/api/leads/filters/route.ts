import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';

export async function GET() {
  try {
    // Obtener estados únicos de los leads para los filtros
    const result = await queryMain('SELECT DISTINCT status FROM "Lead" WHERE status IS NOT NULL');
    return NextResponse.json(result.rows.map((r: { status: string }) => r.status));
  } catch (error) {
    console.error('Error fetching lead filters:', error);
    return NextResponse.json({ message: 'Error interno' }, { status: 500 });
  }
}
