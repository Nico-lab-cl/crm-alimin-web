import { textoPlano } from './portales';

/**
 * Ali - Mercado, parte sin IA: titulares de Google Noticias (RSS público)
 * por tema, en español de Chile. Solo título, medio, fecha y link.
 */

export interface Noticia {
  url: string;
  titulo: string;
  medio: string | null;
  tema: string;
  publicada_at: string | null;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
/** Noticias de más de este tiempo no se guardan como nuevas. */
const MAX_DIAS = 14;

const etiqueta = (item: string, nombre: string) => {
  const m = item.match(new RegExp(`<${nombre}[^>]*>([\\s\\S]*?)</${nombre}>`));
  if (!m) return '';
  return textoPlano(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, ''));
};

export function leerRss(xml: string, tema: string): Noticia[] {
  const limite = Date.now() - MAX_DIAS * 24 * 60 * 60 * 1000;
  const noticias: Noticia[] = [];
  for (const [, item] of Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g))) {
    const url = etiqueta(item, 'link');
    if (!url) continue;
    const medio = etiqueta(item, 'source').replace(/^[|\s]+/, '') || null;
    let titulo = etiqueta(item, 'title');
    // Google pone " - Medio" al final del título.
    if (medio && titulo.endsWith(` - ${medio}`)) titulo = titulo.slice(0, -(medio.length + 3));
    const fecha = new Date(etiqueta(item, 'pubDate'));
    const valida = !Number.isNaN(fecha.getTime());
    if (valida && fecha.getTime() < limite) continue;
    noticias.push({ url, titulo: titulo.slice(0, 400), medio, tema, publicada_at: valida ? fecha.toISOString() : null });
  }
  return noticias;
}

/** Expresión del panel; si viene mal escrita se ignora en vez de romper la pasada. */
function filtro(palabras?: string) {
  if (!palabras?.trim()) return null;
  try {
    return new RegExp(palabras, 'i');
  } catch {
    return null;
  }
}

export async function leerTema(t: { tema: string; consulta: string; palabras?: string }): Promise<{ tema: string; noticias: Noticia[]; error: string | null }> {
  const debe = filtro(t.palabras);
  // Google ordena por relevancia: sin "when:" trae noticias de hace meses.
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${t.consulta} when:${MAX_DIAS}d`)}&hl=es-419&gl=CL&ceid=CL:es-419`;
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, cache: 'no-store', signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const noticias = leerRss(await res.text(), t.tema).filter((n) => !debe || debe.test(n.titulo));
    return { tema: t.tema, noticias: noticias.slice(0, 30), error: null };
  } catch (error) {
    return { tema: t.tema, noticias: [], error: error instanceof Error ? error.message : String(error) };
  }
}
