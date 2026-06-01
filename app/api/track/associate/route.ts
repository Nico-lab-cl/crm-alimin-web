import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Manejador de preflight CORS (OPTIONS)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function POST(request: Request) {
  try {
    const { lead_id, anonymous_id } = await request.json();

    if (!lead_id || !anonymous_id) {
      return new NextResponse(
        JSON.stringify({ error: 'lead_id y anonymous_id son requeridos' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // Sincronizar actividades anónimas previas
    await queryMarketing(
      `UPDATE lead_activities 
       SET lead_id = $1 
       WHERE anonymous_id = $2 AND lead_id IS NULL`,
      [lead_id, anonymous_id]
    );

    // Sincronizar notificaciones anónimas previas
    await queryMarketing(
      `UPDATE notifications 
       SET lead_id = $1 
       WHERE anonymous_id = $2 AND lead_id IS NULL`,
      [lead_id, anonymous_id]
    );

    return new NextResponse(
      JSON.stringify({ success: true, message: 'Fusión e identidad asociada con éxito.' }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    console.error('Error in /api/track/associate:', error);
    return new NextResponse(
      JSON.stringify({ error: 'Error al asociar identidad', message: (error as Error).message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
