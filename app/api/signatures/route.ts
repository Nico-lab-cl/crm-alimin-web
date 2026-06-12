import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function ensureSchema() {
  try {
    // 1. Crear tabla email_signatures
    await queryMarketing(`
      CREATE TABLE IF NOT EXISTS email_signatures (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          personal_info JSONB NOT NULL DEFAULT '{}'::jsonb,
          contact_info JSONB NOT NULL DEFAULT '{}'::jsonb,
          social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
          styling JSONB NOT NULL DEFAULT '{}'::jsonb,
          html_content TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          is_active BOOLEAN DEFAULT TRUE
      )
    `);

    // 2. Crear tabla signature_clicks
    await queryMarketing(`
      CREATE TABLE IF NOT EXISTS signature_clicks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          signature_id UUID REFERENCES email_signatures(id) ON DELETE CASCADE,
          element VARCHAR(100) NOT NULL,
          destination_url TEXT NOT NULL,
          clicked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          ip_address VARCHAR(45) NOT NULL,
          user_agent TEXT,
          browser VARCHAR(100),
          os VARCHAR(100),
          device VARCHAR(100),
          referrer TEXT,
          country VARCHAR(100),
          city VARCHAR(100),
          region VARCHAR(100),
          latitude DOUBLE PRECISION,
          longitude DOUBLE PRECISION
      )
    `);

    // 3. Crear índices
    await queryMarketing(`CREATE INDEX IF NOT EXISTS idx_signature_clicks_signature_id ON signature_clicks(signature_id)`);
    await queryMarketing(`CREATE INDEX IF NOT EXISTS idx_signature_clicks_clicked_at ON signature_clicks(clicked_at)`);
    await queryMarketing(`CREATE INDEX IF NOT EXISTS idx_signature_clicks_element ON signature_clicks(element)`);
  } catch (error) {
    console.error('[ensureSchema] Error running signatures on-the-fly migration:', error);
  }
}

export async function GET() {
  try {
    await ensureSchema();
    
    const result = await queryMarketing(`
      SELECT 
        s.id, 
        s.name, 
        s.personal_info, 
        s.contact_info, 
        s.social_links, 
        s.styling, 
        s.html_content,
        s.created_at, 
        s.updated_at, 
        s.is_active,
        COALESCE(COUNT(c.id), 0)::int as total_clicks
      FROM email_signatures s
      LEFT JOIN signature_clicks c ON s.id = c.signature_id
      GROUP BY s.id
      ORDER BY s.updated_at DESC
    `);

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching email signatures:', error);
    return NextResponse.json(
      { error: 'Error al obtener las firmas de correo.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    
    const body = await request.json();
    const { name, personal_info, contact_info, social_links, styling, html_content } = body;

    if (!name || !html_content) {
      return NextResponse.json(
        { error: 'El nombre y el contenido HTML son campos obligatorios.' },
        { status: 400 }
      );
    }

    const result = await queryMarketing(`
      INSERT INTO email_signatures (
        name, 
        personal_info, 
        contact_info, 
        social_links, 
        styling, 
        html_content
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      name,
      JSON.stringify(personal_info || {}),
      JSON.stringify(contact_info || {}),
      JSON.stringify(social_links || {}),
      JSON.stringify(styling || {}),
      html_content
    ]);

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating email signature:', error);
    return NextResponse.json(
      { error: 'Error al crear la firma de correo.' },
      { status: 500 }
    );
  }
}
