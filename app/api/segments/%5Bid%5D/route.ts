import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';
import { MOCK_SEGMENTS } from '@/lib/mock_segments';

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    let dbConnected = false;

    try {
      await queryMarketing('DELETE FROM segments WHERE id = $1', [id]);
      dbConnected = true;
    } catch (e) {
      console.warn('Error deleting segment in DB, using memory fallback:', (e as Error).message);
    }

    if (!dbConnected) {
      const index = MOCK_SEGMENTS.findIndex(s => s.id === id);
      if (index !== -1) {
        MOCK_SEGMENTS.splice(index, 1);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Segmento eliminado correctamente.'
    });
  } catch (error) {
    console.error('Error in DELETE /api/segments/[id]:', error);
    return NextResponse.json(
      { message: 'Error al eliminar el segmento', error: (error as Error).message },
      { status: 500 }
    );
  }
}
