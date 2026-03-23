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

    return NextResponse.json({ statuses, sources });
  } catch (error) {
    console.error('Error fetching lead filters:', error);
    return NextResponse.json({ message: 'Error interno' }, { status: 500 });
  }
}
