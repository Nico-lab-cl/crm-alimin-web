import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Generar un código aleatorio único de 6 caracteres
function generateRandomCode(length = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Validar que la cadena de texto solo contenga letras, números, guiones y guiones bajos
function isValidSlug(slug: string) {
  return /^[a-zA-Z0-9_-]+$/.test(slug);
}

export async function GET() {
  try {
    const res = await queryMarketing(`
      SELECT 
        q.id,
        q.code,
        q.title,
        q.description,
        q.destination_url,
        q.created_at,
        q.updated_at,
        q.is_active,
        COUNT(s.id)::int as scan_count
      FROM qr_codes q
      LEFT JOIN qr_scans s ON q.id = s.qr_code_id
      GROUP BY q.id
      ORDER BY q.created_at DESC
    `);
    
    return NextResponse.json(res.rows);
  } catch (error) {
    console.error('Error fetching QR codes:', error);
    return NextResponse.json(
      { error: 'Error al obtener los códigos QR' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, description, destination_url } = body;
    let { code } = body;

    // Validación de campos requeridos
    if (!title || !destination_url) {
      return NextResponse.json(
        { error: 'El título y la URL de destino son requeridos' },
        { status: 400 }
      );
    }

    // Validar URL de destino básica
    try {
      new URL(destination_url);
    } catch {
      return NextResponse.json(
        { error: 'La URL de destino no tiene un formato válido (debe incluir http:// o https://)' },
        { status: 400 }
      );
    }

    // Gestionar el código slug
    if (code && code.trim() !== '') {
      code = code.trim();
      if (!isValidSlug(code)) {
        return NextResponse.json(
          { error: 'El slug personalizado solo puede contener letras, números, guiones (-) y guiones bajos (_)' },
          { status: 400 }
        );
      }

      // Validar si el código personalizado ya existe
      const checkRes = await queryMarketing('SELECT id FROM qr_codes WHERE code = $1', [code]);
      if (checkRes.rows.length > 0) {
        return NextResponse.json(
          { error: `El código personalizado "${code}" ya está en uso. Por favor, elige otro.` },
          { status: 409 }
        );
      }
    } else {
      // Generar código único aleatorio y verificar colisiones
      let attempts = 0;
      let isUnique = false;
      while (!isUnique && attempts < 10) {
        code = generateRandomCode(6);
        const checkRes = await queryMarketing('SELECT id FROM qr_codes WHERE code = $1', [code]);
        if (checkRes.rows.length === 0) {
          isUnique = true;
        }
        attempts++;
      }

      if (!isUnique) {
        return NextResponse.json(
          { error: 'No se pudo generar un código único en este momento' },
          { status: 500 }
        );
      }
    }

    // Insertar en base de datos
    const insertRes = await queryMarketing(`
      INSERT INTO qr_codes (code, title, description, destination_url)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [code, title, description || null, destination_url]);

    return NextResponse.json(insertRes.rows[0], { status: 201 });

  } catch (error) {
    console.error('Error creating QR code:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor al crear el código QR' },
      { status: 500 }
    );
  }
}
