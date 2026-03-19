import { Pool } from 'pg';

// Configuración de la Base de Datos Principal (Solo Lectura)
const mainDbUrl = process.env.MAIN_DB_URL || 'postgresql://nicolas:nicolas@n8n_db-crm:5432/crm?sslmode=disable';

export const mainDb = new Pool({
  connectionString: mainDbUrl,
});

// Configuración de la Base de Datos de Marketing (Lectura y Escritura)
// El usuario indica que es el mismo servidor.
const marketingDbUrl = process.env.MARKETING_DB_URL || mainDbUrl;

export const marketingDb = new Pool({
  connectionString: marketingDbUrl,
});

/**
 * Funciones de utilidad para consultas SQL crudas
 */
export async function queryMain(text: string, params?: unknown[]) {
  try {
    const res = await mainDb.query(text, params);
    // const duration = Date.now() - start;
    // console.log('Executed query (Main DB)', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Error executing query on Main DB:', error);
    throw error;
  }
}

export async function queryMarketing(text: string, params?: unknown[]) {
  try {
    const res = await marketingDb.query(text, params);
    // const duration = Date.now() - start;
    // console.log('Executed query (Marketing DB)', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Error executing query on Marketing DB:', error);
    throw error;
  }
}
