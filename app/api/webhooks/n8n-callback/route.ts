import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

export async function POST(request: Request) {
  try {
    // Verificar token opcional para seguridad básica
    const token = request.headers.get('x-callback-token');
    const expectedToken = process.env.N8N_CALLBACK_TOKEN;

    if (expectedToken && token !== expectedToken) {
      return NextResponse.json({ message: 'No autorizado' }, { status: 401 });
    }

    const { log_id, status } = await request.json();

    if (!log_id || !status) {
      return NextResponse.json({ message: 'log_id y status son requeridos' }, { status: 400 });
    }

    // Actualizar el estado del log
    const query = `
      UPDATE campaign_logs 
      SET status = $1, last_callback_at = CURRENT_TIMESTAMP 
      WHERE id = $2
    `;
    await queryMarketing(query, [status, log_id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in n8n callback:', error);
    return NextResponse.json({ message: 'Error interno' }, { status: 500 });
  }
}
