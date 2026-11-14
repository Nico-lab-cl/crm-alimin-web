import { NextResponse } from 'next/server';
import { guardarConfig, leerConfig, type ConfigInvestigacion } from '@/lib/investigacion/tablas';

export const dynamic = 'force-dynamic';

const texto = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Guarda comunas, temas, términos de anuncios y páginas de la competencia. */
export async function PUT(request: Request) {
  let c: Partial<ConfigInvestigacion>;
  try {
    c = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const actual = await leerConfig();
  const limpio: ConfigInvestigacion = {
    comunas: Array.isArray(c.comunas)
      ? c.comunas
          .map((x) => ({ nombre: texto(x?.nombre, 60), slug: texto(x?.slug, 60).toLowerCase().replace(/[^a-z0-9-]/g, '') }))
          .filter((x) => x.nombre && x.slug)
          .slice(0, 12)
      : actual.comunas,
    temas: Array.isArray(c.temas)
      ? c.temas
          .map((x) => ({ tema: texto(x?.tema, 60), consulta: texto(x?.consulta, 300), palabras: texto(x?.palabras, 200) || undefined }))
          .filter((x) => x.tema && x.consulta)
          .slice(0, 10)
      : actual.temas,
    terminos_anuncios: Array.isArray(c.terminos_anuncios)
      ? c.terminos_anuncios.map((x) => texto(x, 80)).filter(Boolean).slice(0, 15)
      : actual.terminos_anuncios,
    paginas_competencia: Array.isArray(c.paginas_competencia)
      ? c.paginas_competencia
          .map((x) => ({ nombre: texto(x?.nombre, 80), page_id: texto(x?.page_id, 30).replace(/\D/g, '') }))
          .filter((x) => x.nombre && x.page_id)
          .slice(0, 30)
      : actual.paginas_competencia,
  };
  await guardarConfig(limpio);
  return NextResponse.json({ config: limpio });
}
