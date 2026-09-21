import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Marca (o desmarca) que un lead ya fue atendido.
 *
 * Es una ruta propia y no un campo más del PATCH general de /api/leads/[id] por
 * la misma razón que en el CRM móvil: marcar el contacto no es escribir una
 * columna, son cuatro que tienen que moverse juntas o el dato queda mintiendo.
 * La que importa de verdad es "followupStage", que es la que apaga los
 * recordatorios de seguimiento; si "contacted" se pudiera escribir por el PATCH
 * genérico, un lead podría quedar figurando atendido mientras el cron del móvil
 * le sigue mandando push al asesor a los 5 minutos, a los 30 y al día.
 *
 * Al ser un solo UPDATE, las cuatro columnas se mueven o no se mueven: no hace
 * falta transacción para que sean atómicas.
 *
 * Sobre "contactedById": el CRM web no tiene identidad por asesor. Su login es
 * una sola sesión compartida contra ADMIN_PASSWORD, así que acá no hay ningún
 * id de "User" que poner sin inventarlo. Se deja en NULL a propósito -- atribuir
 * la marca al dueño del lead sería afirmar que él la hizo, y no es cierto. La
 * ficha del móvil ya sabe mostrar la marca sin nombre, y "lastActivity" queda
 * diciendo que vino de la web.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    let body: { contacted?: boolean } = {};
    try {
      body = await request.json();
    } catch {
      // Sin cuerpo se asume que la intención es marcar como contactado, que es
      // el caso de lejos más frecuente.
    }

    const contactado = body?.contacted !== false;

    // Descubrimiento del esquema, igual que el resto de las rutas de este repo.
    // Acá no es defensa cosmética: las columnas de la marca de contacto las crea
    // una migración manual del repo del CRM móvil y el Dockerfile de ninguno de
    // los dos aplica migraciones. Si el CRM web se despliega antes de que
    // alguien corra ese .sql, esto tiene que decirlo con claridad en vez de
    // fallar con un error de Postgres sobre una columna inexistente.
    let columns: string[] = [];
    try {
      const schemaRes = await queryMain(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'Lead'
      `);
      columns = schemaRes.rows.map((r) => r.column_name);
    } catch {
      return NextResponse.json(
        { message: 'No hay conexión con la base de datos principal.' },
        { status: 503 }
      );
    }

    const tiene = (nombre: string) =>
      columns.some((c) => c.toLowerCase() === nombre.toLowerCase());

    const faltantes = ['contacted', 'contactedAt', 'followupStage'].filter(
      (c) => !tiene(c)
    );
    if (faltantes.length > 0) {
      return NextResponse.json(
        {
          message:
            'La base de datos no tiene las columnas de la marca de contacto. ' +
            'Correr scripts/chat_media_y_contacto.sql del repo del CRM móvil ' +
            'antes de usar esta función.',
          faltantes,
        },
        { status: 501 }
      );
    }

    const idCol = columns.find((c) => c.toLowerCase() === 'id') || 'id';

    // Se arma con la capitalización exacta que tenga la base, no con la que
    // suponemos: el resto del repo descubre los nombres así y la tabla "Lead"
    // tiene columnas en camelCase que Postgres solo acepta entrecomilladas.
    const col = (nombre: string) =>
      `"${columns.find((c) => c.toLowerCase() === nombre.toLowerCase())}"`;

    const asignaciones: string[] = [
      `${col('contacted')} = $2`,
      `${col('contactedAt')} = $3`,
      `${col('followupStage')} = $4`,
    ];
    const valores: unknown[] = [
      id,
      contactado,
      contactado ? new Date() : null,
      // La escalera se cierra completa al marcar, y se reabre en 0 al desmarcar.
      // El cron del móvil decide después qué aviso le toca por antigüedad, así
      // que un lead de ayer que se reabre recibe el recordatorio de un día, no
      // el de cinco minutos.
      contactado ? 3 : 0,
    ];

    if (tiene('contactedById')) {
      asignaciones.push(`${col('contactedById')} = NULL`);
    }
    if (tiene('lastActivity')) {
      valores.push(
        contactado
          ? 'Marcado como contactado desde el CRM web'
          : 'Marcado como pendiente de contactar desde el CRM web'
      );
      asignaciones.push(`${col('lastActivity')} = $${valores.length}`);
    }
    if (tiene('lastNoteAt')) {
      valores.push(new Date());
      asignaciones.push(`${col('lastNoteAt')} = $${valores.length}`);
    }

    const devolver = ['id', 'contacted', 'contactedAt', 'contactedById', 'followupStage']
      .filter(tiene)
      .map(col)
      .join(', ');

    const res = await queryMain(
      `
      UPDATE "Lead"
      SET ${asignaciones.join(', ')}
      WHERE "${idCol}" = $1
      RETURNING ${devolver}
    `,
      valores
    );

    if (res.rowCount === 0) {
      return NextResponse.json(
        { message: 'Contacto no encontrado en la base de datos.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, lead: res.rows[0] });
  } catch (error) {
    console.error('Error en POST /api/leads/[id]/contacted:', error);
    return NextResponse.json(
      { message: 'Error interno del servidor', error: (error as Error).message },
      { status: 500 }
    );
  }
}
