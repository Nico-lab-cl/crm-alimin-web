import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { COOKIE_SESION, sesionValida } from '@/lib/sesion';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Permitir acceso a las rutas de tracking y webhooks sin autenticación
  if (
    pathname.startsWith('/q/') ||
    pathname.startsWith('/unsubscribe') ||
    pathname.startsWith('/api/track') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/api/leads/webhook') ||
    pathname.startsWith('/api/leads/unsubscribe') ||
    pathname.startsWith('/api/admin/fix-db') ||
    pathname.startsWith('/api/login') ||
    pathname === '/login' ||
    pathname.startsWith('/_next') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Verificar la cookie de sesión: firmada y sin vencer (lib/sesion.ts).
  if (!(await sesionValida(request.cookies.get(COOKIE_SESION)?.value))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (REST API routes) - except specifically handled ones above
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api/track|api/webhooks|api/leads/webhook|api/admin/fix-db|_next/static|_next/image|favicon.ico).*)',
  ],
};
