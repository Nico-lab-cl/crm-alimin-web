import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { is_automation, automation_formid } = body;

    const query = `
      UPDATE campaigns 
      SET is_automation = $1, automation_formid = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;
    const result = await queryMarketing(query, [is_automation, automation_formid, id]);

    if (result.rowCount === 0) {
      return NextResponse.json({ message: 'Campaña no encontrada' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating automation settings:', error);
    return NextResponse.json({ message: 'Error interno' }, { status: 500 });
  }
}
