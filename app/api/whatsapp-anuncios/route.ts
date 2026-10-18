import { NextResponse } from 'next/server';
import { getChatsDeAnunciosMeta } from '@/lib/evolution_sync';

export const dynamic = 'force-dynamic';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DIA = 86_400_000;

/** Instante en que empieza el día YYYY-MM-DD en Chile (UTC-3 o UTC-4 según el horario). */
function inicioDiaChile(fecha: string): Date {
  const base = new Date(`${fecha}T00:00:00Z`);
  const enChile = new Date(base.toLocaleString('en-US', { timeZone: 'America/Santiago' }));
  const enUtc = new Date(base.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(base.getTime() + (enUtc.getTime() - enChile.getTime()));
}

const diaChile = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(d);

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(v.length / 2);
  return v.length % 2 ? v[mitad] : Math.round((v[mitad - 1] + v[mitad]) / 2);
}

/**
 * Chats de WhatsApp que llegaron desde anuncios de Meta, por asesor y por
 * anuncio. El asesor es el dueño del número (instancia de Evolution) que
 * recibió el chat.
 *
 *   desde / hasta  días de Chile (YYYY-MM-DD), ambos incluidos.
 *                  Sin fechas: los últimos 7 días contando hoy.
 *
 * No devuelve teléfonos ni nombres de clientes: solo cantidades.
 */
export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams;
    const hoy = diaChile(new Date());
    const hastaTxt = FECHA.test(sp.get('hasta') || '') ? sp.get('hasta')! : hoy;
    const desdeTxt = FECHA.test(sp.get('desde') || '')
      ? sp.get('desde')!
      : diaChile(new Date(inicioDiaChile(hastaTxt).getTime() - 6 * DIA + 12 * 3_600_000));

    const desde = inicioDiaChile(desdeTxt);
    const hasta = new Date(inicioDiaChile(hastaTxt).getTime() + DIA);
    if (hasta <= desde) {
      return NextResponse.json({ success: false, message: 'La fecha "desde" es posterior a "hasta".' }, { status: 400 });
    }

    const chats = await getChatsDeAnunciosMeta(desde, hasta);

    const minutosRespuesta = (c: (typeof chats)[number]) =>
      c.primeraRespuesta ? Math.max(0, Math.round((c.primeraRespuesta.getTime() - c.primerMensaje.getTime()) / 60000)) : null;

    // Por asesor
    const asesores = new Map<string, { asesor: string; chats: number; mensajes: number; respondidos: number; tiempos: number[] }>();
    for (const c of chats) {
      const a = asesores.get(c.asesor) || { asesor: c.asesor, chats: 0, mensajes: 0, respondidos: 0, tiempos: [] };
      a.chats++;
      a.mensajes += c.recibidos;
      const min = minutosRespuesta(c);
      if (min !== null) {
        a.respondidos++;
        a.tiempos.push(min);
      }
      asesores.set(c.asesor, a);
    }
    const porAsesor = Array.from(asesores.values())
      .map(({ tiempos, ...a }) => ({ ...a, sinRespuesta: a.chats - a.respondidos, medianaMinutosRespuesta: mediana(tiempos) }))
      .sort((a, b) => b.chats - a.chats);

    // Por anuncio
    const anuncios = new Map<string, { adId: string | null; titulo: string | null; url: string | null; chats: number; porAsesor: Record<string, number> }>();
    for (const c of chats) {
      const clave = c.adId || c.adTitulo || 'sin-id';
      const a = anuncios.get(clave) || { adId: c.adId, titulo: c.adTitulo, url: c.adUrl, chats: 0, porAsesor: {} };
      a.chats++;
      a.porAsesor[c.asesor] = (a.porAsesor[c.asesor] || 0) + 1;
      anuncios.set(clave, a);
    }
    const porAnuncio = Array.from(anuncios.values()).sort((a, b) => b.chats - a.chats);

    // Por día y asesor
    const dias: string[] = [];
    for (let t = desde.getTime() + 12 * 3_600_000; t < hasta.getTime(); t += DIA) dias.push(diaChile(new Date(t)));
    const porDia = dias.map((dia) => {
      const delDia = chats.filter((c) => diaChile(c.primerMensaje) === dia);
      const fila: Record<string, string | number> = { dia, total: delDia.length };
      for (const c of delDia) fila[c.asesor] = ((fila[c.asesor] as number) || 0) + 1;
      return fila;
    });

    const respondidos = porAsesor.reduce((s, a) => s + a.respondidos, 0);
    return NextResponse.json({
      success: true,
      desde: desdeTxt,
      hasta: hastaTxt,
      totales: {
        chats: chats.length,
        mensajes: chats.reduce((s, c) => s + c.recibidos, 0),
        respondidos,
        sinRespuesta: chats.length - respondidos,
        medianaMinutosRespuesta: mediana(chats.map(minutosRespuesta).filter((m): m is number => m !== null)),
      },
      porAsesor,
      porAnuncio,
      porDia,
    });
  } catch (error) {
    console.error('Error al leer chats de anuncios de Meta:', error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}
