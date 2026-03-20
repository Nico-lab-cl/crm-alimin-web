import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await queryMarketing(`
      SELECT l.*, c.title as campaign_title 
      FROM campaign_logs l
      JOIN campaigns c ON l.campaign_id = c.id
      ORDER BY l.created_at DESC
      LIMIT 100
    `);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching logs:', error);
    return NextResponse.json({ message: 'Error interno' }, { status: 500 });
  }
}
