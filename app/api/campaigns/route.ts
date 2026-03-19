import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

export async function GET() {
  try {
    const result = await queryMarketing('SELECT * FROM campaigns ORDER BY created_at DESC');
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    return NextResponse.json({ message: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
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
      INSERT INTO campaigns (title, subject, html_content, mjml_content)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const params = [title, subject, html, mjml];

    const result = await queryMarketing(query, params);
    
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating campaign:', error);
    return NextResponse.json({ message: 'Error al guardar la campaña' }, { status: 500 });
  }
}
