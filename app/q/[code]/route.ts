import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Función para parsear el User Agent de forma rápida y sin dependencias externas
function parseUserAgent(ua: string) {
  let browser = 'Unknown Browser';
  let os = 'Unknown OS';
  let device = 'Desktop';

  const uaLower = ua.toLowerCase();

  // Detectar Dispositivo
  if (/mobile|android|iphone|ipad|phone/i.test(uaLower)) {
    if (/ipad|tablet/i.test(uaLower)) {
      device = 'Tablet';
    } else {
      device = 'Mobile';
    }
  } else if (/bot|crawler|spider|googlebot|bingbot|yandex|yahoo|baidu/i.test(uaLower)) {
    device = 'Bot';
  }

  // Detectar Sistema Operativo (OS)
  if (/windows/i.test(uaLower)) {
    os = 'Windows';
  } else if (/macintosh|mac os x/i.test(uaLower)) {
    os = 'macOS';
  } else if (/iphone|ipad|ipod/i.test(uaLower)) {
    os = 'iOS';
  } else if (/android/i.test(uaLower)) {
    os = 'Android';
  } else if (/linux/i.test(uaLower)) {
    os = 'Linux';
  }

  // Detectar Navegador
  if (/chrome|crios/i.test(uaLower) && !/edge|edg/i.test(uaLower) && !/opr/i.test(uaLower)) {
    browser = 'Chrome';
  } else if (/safari/i.test(uaLower) && !/chrome|crios/i.test(uaLower)) {
    browser = 'Safari';
  } else if (/firefox|fxios/i.test(uaLower)) {
    browser = 'Firefox';
  } else if (/edge|edg/i.test(uaLower)) {
    browser = 'Edge';
  } else if (/opera|opr/i.test(uaLower)) {
    browser = 'Opera';
  } else if (/msie|trident/i.test(uaLower)) {
    browser = 'Internet Explorer';
  }

  return { browser, os, device };
}

export async function GET(
  request: Request,
  { params }: { params: { code: string } }
) {
  const code = params.code;
  const fallbackUrl = 'https://aliminspa.cl';

  try {
    // 1. Buscar el QR activo en la base de datos
    const qrRes = await queryMarketing(
      'SELECT id, destination_url, is_active FROM qr_codes WHERE code = $1',
      [code]
    );

    if (qrRes.rows.length === 0) {
      console.warn(`QR scan warning: Code "${code}" not found.`);
      return NextResponse.redirect(fallbackUrl);
    }

    const qrCode = qrRes.rows[0];
    if (!qrCode.is_active) {
      console.warn(`QR scan warning: Code "${code}" is inactive.`);
      return NextResponse.redirect(fallbackUrl);
    }

    // 2. Extraer detalles del cliente
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 
               request.headers.get('x-real-ip')?.trim() || 
               '127.0.0.1';
    
    const userAgent = request.headers.get('user-agent') || '';
    const referrer = request.headers.get('referer') || '';

    const { browser, os, device } = parseUserAgent(userAgent);

    // 3. Geolocalización por IP con un timeout estricto para no ralentizar la redirección
    let country = 'Unknown';
    let city = 'Unknown';
    let region = 'Unknown';
    let latitude: number | null = null;
    let longitude: number | null = null;

    // Solo geolocalizar IPs públicas reales
    if (ip !== '127.0.0.1' && ip !== '::1' && !ip.startsWith('192.168.') && !ip.startsWith('10.')) {
      try {
        const geoPromise = fetch(`https://ipwhois.app/json/${ip}`)
          .then(res => res.json())
          .then(data => {
            if (data && data.success) {
              return {
                country: data.country || 'Unknown',
                city: data.city || 'Unknown',
                region: data.region || 'Unknown',
                latitude: data.latitude ? parseFloat(data.latitude) : null,
                longitude: data.longitude ? parseFloat(data.longitude) : null
              };
            }
            return null;
          });

        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 850));
        const geoResult = await Promise.race([geoPromise, timeoutPromise]) as any;
        
        if (geoResult) {
          country = geoResult.country;
          city = geoResult.city;
          region = geoResult.region;
          latitude = geoResult.latitude;
          longitude = geoResult.longitude;
        }
      } catch (geoErr) {
        console.error('Error fetching geolocation for IP:', ip, geoErr);
      }
    }

    // 4. Guardar escaneo en la base de datos
    // Esto se realiza de manera síncrona o asíncrona. Para asegurar que se registre antes del redirect
    // lo hacemos síncronamente, pero con manejo de errores para que la redirección ocurra de todos modos.
    try {
      await queryMarketing(`
        INSERT INTO qr_scans (
          qr_code_id, 
          ip_address, 
          user_agent, 
          browser, 
          os, 
          device, 
          referrer, 
          country, 
          city, 
          region, 
          latitude, 
          longitude
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        qrCode.id,
        ip,
        userAgent,
        browser,
        os,
        device,
        referrer,
        country,
        city,
        region,
        latitude,
        longitude
      ]);
    } catch (dbErr) {
      console.error('Error writing QR scan metrics to database:', dbErr);
    }

    // 5. Redireccionar al destino final
    return NextResponse.redirect(qrCode.destination_url);

  } catch (error) {
    console.error('General error handling QR redirect:', error);
    return NextResponse.redirect(fallbackUrl);
  }
}
