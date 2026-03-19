import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { queryMarketing } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    const adminPassword = process.env.ADMIN_PASSWORD;

    // 1. Verificar contra la variable de entorno (Master simple)
    if (adminPassword && password === adminPassword) {
      const cookieStore = cookies();
      cookieStore.set('crm_auth_session', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
      });
      return NextResponse.json({ message: 'Login exitoso' });
    }

    // 2. Verificar contra la base de datos
    try {
      const userRes = await queryMarketing(
        'SELECT * FROM users WHERE username = $1 AND password_hash = $2',
        [username || 'admin', password]
      );
      
      if (userRes && (userRes.rowCount ?? 0) > 0) {
        const cookieStore = cookies();
        cookieStore.set('crm_auth_session', 'authenticated', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 7,
          path: '/',
        });
        return NextResponse.json({ message: 'Login exitoso' });
      }
    } catch (dbError) {
      console.warn('DB Auth fallback failed (maybe table not exists yet):', dbError);
    }

    return NextResponse.json({ message: 'Credenciales incorrectas' }, { status: 401 });
  } catch (error) {
    console.error('Login Error:', error);
    return NextResponse.json({ message: 'Error interno del servidor' }, { status: 500 });
  }
}
