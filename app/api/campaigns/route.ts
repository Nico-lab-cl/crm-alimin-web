import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const dbNameRes = await queryMarketing('SELECT current_database()');
    const dbName = dbNameRes.rows[0].current_database;
    const result = await queryMarketing('SELECT * FROM campaigns ORDER BY created_at DESC');
    console.log(`Connected to DB: ${dbName}. Fetched ${result.rowCount} campaigns from MARKETING_DB`);
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
      INSERT INTO campaigns (name, title, subject, html_content, mjml_content, status)
      VALUES ($1, $2, $3, $4, $5, 'DRAFT')
      RETURNING *
    `;
    const params = [title, title, subject, html, mjml];

    const result = await queryMarketing(query, params);
    
    return NextResponse.json(result.rows[0]);
  } catch (error: unknown) {
    console.error('Error creating campaign:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json(
      { message: 'Error al guardar la campaña: ' + errorMessage }, 
      { status: 500 }
    );
  }
}
