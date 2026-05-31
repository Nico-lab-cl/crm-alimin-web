import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/notifications - Obtener las últimas 50 notificaciones
export async function GET() {
  try {
    const res = await queryMarketing(`
      SELECT * FROM notifications 
      ORDER BY created_at DESC 
      LIMIT 50
    `);
    
    return NextResponse.json({
      success: true,
      notifications: res.rows
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { success: false, message: 'Error al obtener notificaciones', error: (error as Error).message },
      { status: 500 }
    );
  }
}

// PUT /api/notifications - Marcar todas las notificaciones como leídas
export async function PUT() {
  try {
    await queryMarketing(`
      UPDATE notifications 
      SET read = true 
      WHERE read = false
    `);
    
    return NextResponse.json({
      success: true,
      message: 'Notificaciones marcadas como leídas.'
    });
  } catch (error) {
    console.error('Error updating notifications:', error);
    return NextResponse.json(
      { success: false, message: 'Error al actualizar notificaciones', error: (error as Error).message },
      { status: 500 }
    );
  }
}

// DELETE /api/notifications - Limpiar historial de notificaciones
export async function DELETE() {
  try {
    await queryMarketing('DELETE FROM notifications');
    
    return NextResponse.json({
      success: true,
      message: 'Historial de notificaciones limpio.'
    });
  } catch (error) {
    console.error('Error clearing notifications:', error);
    return NextResponse.json(
      { success: false, message: 'Error al limpiar notificaciones', error: (error as Error).message },
      { status: 500 }
    );
  }
}
