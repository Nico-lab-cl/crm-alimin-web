import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const action = searchParams.get('action') || 'unsubscribe';

    if (!id) {
      return NextResponse.json({ message: 'El ID del contacto es requerido.' }, { status: 400 });
    }

    // 1. Descubrir columnas de la tabla Lead para ver si emailEnabled existe
    let columns: string[] = [];
    let dbConnected = false;
    
    try {
      const schemaRes = await queryMain(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'Lead'
      `);
      columns = schemaRes.rows.map((r: { column_name: string }) => r.column_name);
      dbConnected = columns.length > 0;
    } catch (e) {
      console.warn('DB check failed in unsubscribe API:', e);
    }

    const emailEnabledVal = action === 'subscribe';

    // 2. Si no hay base de datos (desarrollo local / mock), responder éxito simulado
    if (!dbConnected) {
      return NextResponse.json({
        success: true,
        email: 'contacto.simulado@gmail.com',
        emailEnabled: emailEnabledVal,
        message: action === 'subscribe' ? 'Suscripción reactivada (simulado)' : 'Suscripción cancelada (simulado)'
      });
    }

    const emailEnabledCol = columns.find(c => c.toLowerCase() === 'emailenabled');
    if (!emailEnabledCol) {
      return NextResponse.json({ message: 'La columna de suscripción no existe en la base de datos.' }, { status: 500 });
    }

    const emailCol = columns.find(c => c.toLowerCase() === 'email') || 'Email';
    const idCol = columns.find(c => c.toLowerCase() === 'id') || 'id';

    // Verificar si el lead existe
    const leadRes = await queryMain(`SELECT "${emailCol}" as email FROM "Lead" WHERE "${idCol}" = $1 LIMIT 1`, [id]);
    if (leadRes.rows.length === 0) {
      return NextResponse.json({ message: 'El contacto especificado no existe.' }, { status: 404 });
    }
    const email = leadRes.rows[0].email;

    // Actualizar estado de suscripción
    await queryMain(
      `UPDATE "Lead" SET "${emailEnabledCol}" = $1 WHERE "${idCol}" = $2`,
      [emailEnabledVal, id]
    );

    return NextResponse.json({
      success: true,
      email,
      emailEnabled: emailEnabledVal,
      message: action === 'subscribe' ? 'Suscripción reactivada correctamente' : 'Suscripción cancelada correctamente'
    });

  } catch (error) {
    console.error('Error in POST /api/leads/unsubscribe:', error);
    return NextResponse.json(
      { message: 'Error interno del servidor', error: (error as Error).message },
      { status: 500 }
    );
  }
}
