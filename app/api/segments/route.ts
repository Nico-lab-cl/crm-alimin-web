import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';
import { MOCK_SEGMENTS } from '@/lib/mock_segments';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let dbConnected = false;
    let segments = [];

    try {
      const res = await queryMarketing('SELECT * FROM segments ORDER BY created_at DESC');
      segments = res.rows;
      dbConnected = true;
    } catch (e) {
      console.warn('Error fetching segments from DB, using mock:', (e as Error).message);
    }

    if (!dbConnected) {
      segments = MOCK_SEGMENTS;
    }

    return NextResponse.json(segments);
  } catch (error) {
    console.error('Error in GET /api/segments:', error);
    return NextResponse.json(
      { message: 'Error interno del servidor', error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, type, filters } = body;

    if (!name || !type || !filters) {
      return NextResponse.json(
        { message: 'Los campos name, type y filters son obligatorios.' },
        { status: 400 }
      );
    }

    const newSegment = {
      id: `seg-${Math.random().toString(36).substr(2, 9)}`,
      name,
      type,
      filters,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    let dbConnected = false;
    let savedSegment = null;

    try {
      const query = `
        INSERT INTO segments (id, name, type, filters, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      const res = await queryMarketing(query, [
        newSegment.id,
        newSegment.name,
        newSegment.type,
        JSON.stringify(newSegment.filters),
        newSegment.created_at,
        newSegment.updated_at
      ]);
      savedSegment = res.rows[0];
      dbConnected = true;
    } catch (e) {
      console.warn('Error saving segment to DB, using memory mock:', (e as Error).message);
    }

    if (!dbConnected) {
      MOCK_SEGMENTS.unshift(newSegment);
      savedSegment = newSegment;
    }

    return NextResponse.json({
      success: true,
      message: 'Segmento creado con éxito.',
      segment: savedSegment
    });
  } catch (error) {
    console.error('Error in POST /api/segments:', error);
    return NextResponse.json(
      { message: 'Error al crear el segmento', error: (error as Error).message },
      { status: 500 }
    );
  }
}
