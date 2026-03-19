import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const log_id = searchParams.get('log_id');

  if (log_id) {
    try {
      // Registrar apertura en la base de datos
      await queryMarketing(
        `UPDATE campaign_logs 
         SET status = 'OPENED', opened_at = CURRENT_TIMESTAMP 
         WHERE id = $1 AND status != 'OPENED'`,
        [log_id]
      );
    } catch (error) {
      console.error('Error tracking open:', error);
    }
  }

  // Retornar un GIF transparente de 1x1
  const buffer = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
