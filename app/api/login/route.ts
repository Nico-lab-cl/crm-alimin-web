import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      return NextResponse.json(
        { message: 'Error de configuración: ADMIN_PASSWORD no definida' },
        { status: 500 }
      );
    }

    if (password === adminPassword) {
      // En Next.js 14 cookies() es síncrono.
      const cookieStore = cookies();
      cookieStore.set('crm_auth_session', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 1 semana
        path: '/',
      });

      return NextResponse.json({ message: 'Login exitoso' });
    }

    return NextResponse.json({ message: 'Contraseña incorrecta' }, { status: 401 });
  } catch (error) {
    console.error('Login Error:', error);
    return NextResponse.json({ message: 'Error interno del servidor' }, { status: 500 });
  }
}
