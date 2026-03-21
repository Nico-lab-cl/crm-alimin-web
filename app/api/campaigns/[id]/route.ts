import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const result = await queryMarketing('SELECT * FROM campaigns WHERE id = $1', [id]);
    
    if (result.rowCount === 0) {
      return NextResponse.json({ message: 'Campaña no encontrada' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching campaign:', error);
    return NextResponse.json({ message: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const body = await request.json();
    const title = body.title;
    const subject = body.subject;
    const html = body.html_content || body.html;
    const mjml = body.mjml_content || body.mjml;

    if (!title || !subject || !html) {
      return NextResponse.json(
        { message: 'Título, Asunto y Contenido son requeridos' },
        { status: 400 }
      );
    }

    const query = `
      UPDATE campaigns 
      SET name = $1, title = $2, subject = $3, html_content = $4, mjml_content = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `;
    const queryParams = [title, title, subject, html, mjml, id];

    const result = await queryMarketing(query, queryParams);
    
    if (result.rowCount === 0) {
        return NextResponse.json({ message: 'Campaña no encontrada' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error: unknown) {
    console.error('Error updating campaign:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json(
      { message: 'Error al actualizar la campaña: ' + errorMessage }, 
      { status: 500 }
    );
  }
}
