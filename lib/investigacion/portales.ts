/**
 * Ali - Competencia, parte sin IA: lee los avisos de terrenos de Yapo y de
 * Portal Inmobiliario por comuna. Es lectura de páginas públicas, una o dos
 * por comuna al día, con pausas, como una persona mirando el portal.
 *
 * Si un portal cambia su HTML y deja de entregar avisos, devuelve 0 y un
 * error: el que compara (investigacion.ts) no marca nada como retirado ese día.
 */

export interface Aviso {
  url: string;
  fuente: 'yapo' | 'portalinmobiliario';
  titulo: string;
  tipo: string | null;
  comuna: string;
  ubicacion: string | null;
  m2: number | null;
  precio_clp: number | null;
  precio_uf: number | null;
}

export interface ResultadoFuente {
  fuente: Aviso['fuente'];
  comuna: string;
  avisos: Aviso[];
  error: string | null;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const PAUSA_MS = 2000;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function bajar(url: string) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, 'accept-language': 'es-CL,es;q=0.9' },
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const ENTIDADES: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' };
export function textoPlano(html: string) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(amp|quot|#39|lt|gt|nbsp);/g, (m) => ENTIDADES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/** "69.000.000" → 69000000; "2.550" → 2550; "1,5" → 1.5 */
function numero(s: string) {
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Precio en pesos o en UF, desde un texto como "$ 43.100.000" o "UF 2.550". */
export function leerPrecio(t: string): { clp: number | null; uf: number | null } {
  const uf = t.match(/UF\s*([\d.]+(?:,\d+)?)/i);
  if (uf) return { clp: null, uf: numero(uf[1]) };
  const clp = t.match(/\$\s*([\d.]{4,})/);
  return { clp: clp ? numero(clp[1]) : null, uf: null };
}

/** Superficie en m² ("353,16 m²", "620 m² totales", "1,1 Ha"). */
export function leerM2(t: string): number | null {
  const ha = t.match(/([\d.,]+)\s*(?:ha|hectáreas?)\b/i);
  if (ha) {
    // En hectáreas el punto suele ser decimal ("1.1 Ha" = 11.000 m²).
    const n = /^\d+\.\d{1,2}$/.test(ha[1]) ? Number(ha[1]) : numero(ha[1]);
    return n ? Math.round(n * 10_000) : null;
  }
  const m = t.match(/([\d.]+(?:,\d+)?)\s*m(?:²|2|ts2|t2)/i);
  if (!m) return null;
  const n = numero(m[1]);
  return n ? Math.round(n) : null;
}

const clase = (html: string, nombre: string) => {
  const m = html.match(new RegExp(`class="[^"]*\\b${nombre}\\b[^"]*"[^>]*>([\\s\\S]*?)</(?:span|p|h2|h3|div|a|li)>`));
  return m ? textoPlano(m[1]) : '';
};

/** Portal Inmobiliario: "sitio" son los terrenos urbanos; se descartan casas y deptos que cuelan los avisos pagados. */
export function avisosPortalInmobiliario(html: string, comuna: string): Aviso[] {
  const avisos: Aviso[] = [];
  for (const tarjeta of html.split('<li class="ui-search-layout__item').slice(1)) {
    const url = tarjeta.match(/href="(https:\/\/(?:www\.)?portalinmobiliario\.com\/MLC-[^"#?]+)/)?.[1];
    if (!url) continue;
    const tipo = clase(tarjeta, 'poly-component__headline') || null;
    if (tipo && !/sitio|terreno|parcela/i.test(tipo)) continue;
    const simbolo = tarjeta.match(/andes-money-amount__currency-symbol">([^<]+)/)?.[1] ?? '';
    const monto = tarjeta.match(/andes-money-amount__fraction"[^>]*>([^<]+)/)?.[1] ?? '';
    const precio = leerPrecio(`${simbolo.trim() === 'UF' ? 'UF' : '$'} ${monto}`);
    const atributos = textoPlano(tarjeta.match(/poly-attributes_list"[\s\S]*?<\/ul>/)?.[0] ?? '');
    avisos.push({
      url: url.replace('https://portalinmobiliario.com', 'https://www.portalinmobiliario.com'),
      fuente: 'portalinmobiliario',
      titulo: clase(tarjeta, 'poly-component__title').slice(0, 300) || 'Sin título',
      tipo,
      comuna,
      ubicacion: clase(tarjeta, 'poly-component__location').slice(0, 300) || null,
      m2: leerM2(atributos),
      precio_clp: precio.clp,
      precio_uf: precio.uf,
    });
  }
  return avisos;
}

/** Yapo: cada aviso es un <a ... item-card-link> con precio, ubicación, m² y título. */
export function avisosYapo(html: string, comuna: string): Aviso[] {
  const avisos: Aviso[] = [];
  const marcas = Array.from(html.matchAll(/<a href="([^"]+)"[^>]*class="[^"]*item-card-link[^"]*"[^>]*>/g));
  marcas.forEach((m, i) => {
    const fin = marcas[i + 1]?.index ?? m.index! + 40_000;
    const tarjeta = html.slice(m.index!, fin);
    const ruta = m[1];
    const url = ruta.startsWith('http') ? ruta : `https://www.yapo.cl${ruta}`;
    const ubicacion = clase(tarjeta, 'card_subtitle') || null;
    // Yapo a veces mete destacados de otras comunas: solo los de esta.
    if (ubicacion && !ubicacion.toLowerCase().includes(comuna.toLowerCase())) return;
    const precio = leerPrecio(clase(tarjeta, 'card_price'));
    const titulo = clase(tarjeta, 'card_title');
    // Sin m² en la ficha, se busca en el título y la descripción ("300 mts2").
    const m2 = leerM2(clase(tarjeta, 'card_specs')) ?? leerM2(`${titulo} ${clase(tarjeta, 'card_description')}`);
    avisos.push({
      url: url.split('?')[0],
      fuente: 'yapo',
      titulo: titulo.slice(0, 300) || 'Sin título',
      tipo: 'Terreno',
      comuna,
      ubicacion,
      m2,
      precio_clp: precio.clp,
      precio_uf: precio.uf,
    });
  });
  return avisos;
}

export async function leerComuna(c: { nombre: string; slug: string }): Promise<ResultadoFuente[]> {
  const resultados: ResultadoFuente[] = [];
  const fuentes: [Aviso['fuente'], string, (h: string, comuna: string) => Aviso[]][] = [
    ['portalinmobiliario', `https://www.portalinmobiliario.com/venta/sitio/${c.slug}-valparaiso`, avisosPortalInmobiliario],
    ['yapo', `https://www.yapo.cl/bienes-raices-venta-de-propiedades-lotes-y-terrenos/valparaiso-${c.slug}`, avisosYapo],
  ];
  for (const [fuente, url, leer] of fuentes) {
    try {
      const avisos = leer(await bajar(url), c.nombre);
      resultados.push({ fuente, comuna: c.nombre, avisos, error: avisos.length ? null : 'sin avisos (¿cambió la página?)' });
    } catch (error) {
      resultados.push({ fuente, comuna: c.nombre, avisos: [], error: error instanceof Error ? error.message : String(error) });
    }
    await esperar(PAUSA_MS);
  }
  return resultados;
}
