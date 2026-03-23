import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { filters } = await request.json();

    let leadQuery = 'SELECT id, email, source FROM "Lead" WHERE email IS NOT NULL AND email != \'\'';
    const params: string[] = [];
    
    if (filters?.status) {
      params.push(filters.status);
      leadQuery += ` AND status = $${params.length}`;
    }

    if (filters?.source) {
      params.push(filters.source);
      leadQuery += ` AND source = $${params.length}`;
    }

    // Limitamos la lista a 20 leads para la UI para no pesar mucho la db ni red, aunque la query devuelve todos.
    // Lo ideal seria hacer un COUNT(*) separado y un LIMIT, pero para listas de cientos de leads, cargar todos es rapido en PG.
    // Lo optimizaremos haciendo la query de COUNT separada del preview.
    const countQuery = leadQuery.replace('SELECT id, email, source', 'SELECT COUNT(*) as exact_count');
    const countRes = await queryMain(countQuery, params);
    const count = parseInt(countRes.rows[0].exact_count, 10);

    // Agregamos un limit solo para los leads de prueba que se van a retornar
    const previewQuery = leadQuery + ' LIMIT 50';
    const leadsRes = await queryMain(previewQuery, params);

    return NextResponse.json({ 
      count, 
      preview: leadsRes.rows 
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al previsualizar leads';
    console.error('Error al previsualizar leads:', error);
    return NextResponse.json({ message }, { status: 500 });
  }
}
