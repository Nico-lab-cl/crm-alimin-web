import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export const dynamic = 'force-dynamic';

export async function GET() {
  const evolutionDbUrl = process.env.EVOLUTION_DB_URL || 'postgres://postgres:c886f4677c481efad228@n8n_evolution-api-db:5432/n8n?sslmode=disable';
  const pool = new Pool({ connectionString: evolutionDbUrl, connectionTimeoutMillis: 5000 });
  
  try {
    const client = await pool.connect();
    try {
      // Query instances
      const instances = await client.query('SELECT * FROM "Instance"');
      
      return NextResponse.json({
        success: true,
        instances: instances.rows
      });
    } finally {
      client.release();
    }
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message
    }, { status: 500 });
  } finally {
    await pool.end();
  }
}
