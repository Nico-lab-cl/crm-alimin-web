import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

export const dynamic = 'force-dynamic';

function isValidSlug(slug: string) {
  return /^[a-zA-Z0-9_-]+$/.test(slug);
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id;

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
      WHERE q.id = $1
      GROUP BY q.id
    `, [id]);

    if (res.rows.length === 0) {
      return NextResponse.json(
        { error: 'Código QR no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json(res.rows[0]);
  } catch (error) {
    console.error(`Error fetching QR code with id ${id}:`, error);
    return NextResponse.json(
      { error: 'Error al obtener los detalles del código QR' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id;

  try {
    const body = await request.json();
    const { title, description, destination_url, is_active, code } = body;

    // 1. Validar que exista el QR
    const checkExist = await queryMarketing('SELECT code FROM qr_codes WHERE id = $1', [id]);
    if (checkExist.rows.length === 0) {
      return NextResponse.json(
        { error: 'Código QR no encontrado' },
        { status: 404 }
      );
    }

    const currentCode = checkExist.rows[0].code;

    // 2. Validaciones básicas
    if (!title || !destination_url) {
      return NextResponse.json(
        { error: 'El título y la URL de destino son requeridos' },
        { status: 400 }
      );
    }

    try {
      new URL(destination_url);
    } catch {
      return NextResponse.json(
        { error: 'La URL de destino no tiene un formato válido (debe incluir http:// o https://)' },
        { status: 400 }
      );
    }

    // 3. Validar código slug si cambió
    let finalCode = currentCode;
    if (code && code.trim() !== '' && code.trim() !== currentCode) {
      const trimmedCode = code.trim();
      if (!isValidSlug(trimmedCode)) {
        return NextResponse.json(
          { error: 'El slug personalizado solo puede contener letras, números, guiones (-) y guiones bajos (_)' },
          { status: 400 }
        );
      }

      // Validar que el nuevo código no esté tomado por otro QR
      const checkCodeRes = await queryMarketing(
        'SELECT id FROM qr_codes WHERE code = $1 AND id != $2',
        [trimmedCode, id]
      );
      if (checkCodeRes.rows.length > 0) {
        return NextResponse.json(
          { error: `El código personalizado "${trimmedCode}" ya está en uso por otro QR.` },
          { status: 409 }
        );
      }
      finalCode = trimmedCode;
    }

    // 4. Actualizar en BD
    const updateRes = await queryMarketing(`
      UPDATE qr_codes
      SET 
        title = $1,
        description = $2,
        destination_url = $3,
        is_active = $4,
        code = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `, [title, description || null, destination_url, is_active !== false, finalCode, id]);

    return NextResponse.json(updateRes.rows[0]);

  } catch (error) {
    console.error(`Error updating QR code with id ${id}:`, error);
    return NextResponse.json(
      { error: 'Error al actualizar el código QR' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id;

  try {
    const res = await queryMarketing('DELETE FROM qr_codes WHERE id = $1 RETURNING id', [id]);
    
    if (res.rows.length === 0) {
      return NextResponse.json(
        { error: 'Código QR no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, message: 'Código QR eliminado correctamente' });
  } catch (error) {
    console.error(`Error deleting QR code with id ${id}:`, error);
    return NextResponse.json(
      { error: 'Error al eliminar el código QR' },
      { status: 500 }
    );
  }
}
