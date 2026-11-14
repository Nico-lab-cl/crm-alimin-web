'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, Megaphone, Newspaper, RefreshCcw, Save, Settings2, Telescope } from 'lucide-react';

type Agente = 'competencia' | 'anuncios' | 'mercado';

interface Informe {
  agente: Agente;
  tipo: 'diario' | 'semanal';
  texto: string;
  costo_usd: string;
  created_at: string;
}
interface Aviso {
  url: string;
  fuente: string;
  titulo: string;
  comuna: string;
  ubicacion: string | null;
  m2: number | null;
  precio_clp: string | null;
  precio_uf: string | null;
  precio_anterior_clp: string | null;
  precio_anterior_uf: string | null;
  precio_cambio_at: string | null;
  primera_vez: string;
}
interface Anuncio {
  ad_id: string;
  page_name: string | null;
  titulo: string | null;
  termino: string | null;
  inicio_at: string | null;
  snapshot_url: string | null;
  primera_vez: string;
}
interface Noticia {
  url: string;
  titulo: string;
  medio: string | null;
  tema: string;
  publicada_at: string | null;
  vista_at: string;
}
interface Config {
  comunas: { nombre: string; slug: string }[];
  temas: { tema: string; consulta: string; palabras?: string }[];
  terminos_anuncios: string[];
  paginas_competencia: { nombre: string; page_id: string }[];
}
interface Datos {
  informes: Informe[];
  avisos: Aviso[];
  anuncios: Anuncio[];
  noticias: Noticia[];
  gastoMesUSD: number;
  config: Config;
  medianas: { comuna: string; avisos: number; clp_m2: number | null; uf_m2: number | null }[];
}

const PESTANAS: { id: Agente; nombre: string; icono: typeof Telescope; quien: string; cuando: string }[] = [
  { id: 'competencia', nombre: 'Competencia', icono: Telescope, quien: 'Ali - Competencia', cuando: 'Yapo y Portal Inmobiliario, todos los días a las 08:00' },
  { id: 'anuncios', nombre: 'Anuncios', icono: Megaphone, quien: 'Ali - Anuncios', cuando: 'Biblioteca de Anuncios de Meta, todos los días a las 09:00' },
  { id: 'mercado', nombre: 'Mercado', icono: Newspaper, quien: 'Ali - Mercado', cuando: 'Google Noticias, todos los días a las 08:30' },
];

const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
const precio = (clp: string | null, uf: string | null) =>
  clp ? pesos(Number(clp)) : uf ? `UF ${Number(uf).toLocaleString('es-CL')}` : '—';
const fecha = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'short' }) : '—';
const fechaHora = (s: string) =>
  new Date(s).toLocaleString('es-CL', { timeZone: 'America/Santiago', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const haceDias = (s: string) => (Date.now() - new Date(s).getTime()) / 86_400_000;

function Tarjeta({ titulo, children, extra }: { titulo: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-[#9fc79b] p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-sm font-bold text-[#33475b]">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

function InformeBloque({ informe, vacio }: { informe?: Informe; vacio: string }) {
  if (!informe) return <p className="text-sm text-[#516f90]">{vacio}</p>;
  return (
    <div>
      <p className="text-[11px] text-[#516f90] mb-2">{fechaHora(informe.created_at)}</p>
      <div className="text-sm text-[#33475b] whitespace-pre-line leading-relaxed">{informe.texto}</div>
    </div>
  );
}

export default function InvestigacionPage() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pestana, setPestana] = useState<Agente>('competencia');
  const [revisando, setRevisando] = useState<Agente | null>(null);
  const [comuna, setComuna] = useState<string>('todas');
  const [verConfig, setVerConfig] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/investigacion', { cache: 'no-store' });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `Error ${r.status}`);
      setDatos(await r.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);

  const revisarAhora = async (agente: Agente) => {
    setRevisando(agente);
    try {
      const r = await fetch(`/api/investigacion/correr?agente=${agente}`, { method: 'POST' });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `Error ${r.status}`);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRevisando(null);
    }
  };

  const informe = (agente: Agente, tipo: 'diario' | 'semanal') => datos?.informes.find((i) => i.agente === agente && i.tipo === tipo);
  const avisos = useMemo(
    () => (datos?.avisos ?? []).filter((a) => comuna === 'todas' || a.comuna === comuna),
    [datos, comuna]
  );
  const actual = PESTANAS.find((p) => p.id === pestana)!;

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-5 bg-[#f5f8fa] min-h-screen">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#33475b]">Investigación</h1>
          <p className="text-sm text-[#516f90] mt-1">
            Lo que encuentran Ali - Competencia, Ali - Anuncios y Ali - Mercado en la web pública. La recolección es gratis; la IA solo escribe el
            informe de los lunes{datos ? ` (este mes: US$${datos.gastoMesUSD.toFixed(3)})` : ''}.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setVerConfig((v) => !v)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#2d544c] border border-[#9fc79b] bg-white rounded-xl px-3 py-2 hover:bg-[#e8f3e6]">
            <Settings2 className="w-4 h-4" /> Qué vigilan
          </button>
          <button onClick={cargar} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#2d544c] border border-[#9fc79b] bg-white rounded-xl px-3 py-2 hover:bg-[#e8f3e6]">
            <RefreshCcw className="w-4 h-4" /> Actualizar
          </button>
        </div>
      </header>

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{error}</p>}
      {verConfig && datos && <EditorConfig config={datos.config} alGuardar={cargar} />}

      <nav className="flex gap-2 flex-wrap">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPestana(p.id)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold border transition ${
              pestana === p.id ? 'bg-[#2d544c] text-white border-[#2d544c]' : 'bg-white text-[#33475b] border-[#cbd6e2] hover:border-[#9fc79b]'
            }`}
          >
            <p.icono className="w-4 h-4" /> {p.nombre}
          </button>
        ))}
      </nav>

      {!datos ? (
        <div className="flex items-center gap-2 text-sm text-[#516f90]"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>
      ) : (
        <>
          <p className="text-xs text-[#516f90]">{actual.quien} · {actual.cuando}</p>
          <div className="grid md:grid-cols-2 gap-5">
            <Tarjeta
              titulo="Hoy"
              extra={
                pestana !== 'anuncios' && (
                  <button
                    onClick={() => revisarAhora(pestana)}
                    disabled={revisando !== null}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2d544c] border border-[#9fc79b] rounded-lg px-2.5 py-1 hover:bg-[#e8f3e6] disabled:opacity-50"
                  >
                    {revisando === pestana ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
                    Revisar ahora
                  </button>
                )
              }
            >
              <InformeBloque informe={informe(pestana, 'diario')} vacio="Todavía no hay informe del día." />
            </Tarjeta>
            <Tarjeta titulo="Informe de la semana (IA)">
              <InformeBloque informe={informe(pestana, 'semanal')} vacio="El primer informe semanal sale el lunes a las 10:00." />
            </Tarjeta>
          </div>

          {pestana === 'competencia' && (
            <>
              <Tarjeta titulo="Precio por m² (mediana, terrenos de 100 a 5.000 m²)">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {datos.medianas.map((m) => (
                    <div key={m.comuna} className="rounded-xl border border-[#cbd6e2] p-3">
                      <p className="text-xs text-[#516f90]">{m.comuna} · {m.avisos} avisos</p>
                      <p className="text-lg font-extrabold text-[#33475b] tabular-nums">{m.clp_m2 ? pesos(m.clp_m2) : '—'}</p>
                      {m.uf_m2 ? <p className="text-[11px] text-[#516f90]">UF {m.uf_m2.toFixed(2)}/m² en avisos en UF</p> : null}
                    </div>
                  ))}
                </div>
              </Tarjeta>
              <Tarjeta
                titulo={`Avisos vigentes (${avisos.length})`}
                extra={
                  <select value={comuna} onChange={(e) => setComuna(e.target.value)} className="text-xs border border-[#cbd6e2] rounded-lg px-2 py-1 text-[#33475b]">
                    <option value="todas">Todas las comunas</option>
                    {datos.config.comunas.map((c) => <option key={c.slug} value={c.nombre}>{c.nombre}</option>)}
                  </select>
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase text-[#516f90] border-b border-[#eef2f6]">
                        <th className="py-2 pr-3">Aviso</th><th className="py-2 pr-3">Comuna</th><th className="py-2 pr-3 text-right">m²</th>
                        <th className="py-2 pr-3 text-right">Precio</th><th className="py-2 pr-3">Desde</th>
                      </tr>
                    </thead>
                    <tbody>
                      {avisos.map((a) => (
                        <tr key={a.url} className="border-b border-[#f3f6f9] align-top">
                          <td className="py-2 pr-3">
                            <a href={a.url} target="_blank" rel="noreferrer" className="text-[#2d544c] hover:underline inline-flex gap-1">
                              {a.titulo} <ExternalLink className="w-3 h-3 mt-1 shrink-0" />
                            </a>
                            <p className="text-[11px] text-[#516f90]">{a.fuente === 'yapo' ? 'Yapo' : 'Portal Inmobiliario'}{a.ubicacion ? ` · ${a.ubicacion}` : ''}</p>
                          </td>
                          <td className="py-2 pr-3 text-[#33475b]">{a.comuna}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{a.m2?.toLocaleString('es-CL') ?? '—'}</td>
                          <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                            {precio(a.precio_clp, a.precio_uf)}
                            {a.precio_cambio_at && haceDias(a.precio_cambio_at) < 14 && (
                              <p className="text-[11px] text-amber-700">antes {precio(a.precio_anterior_clp, a.precio_anterior_uf)}</p>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-[#516f90] whitespace-nowrap">
                            {fecha(a.primera_vez)}
                            {haceDias(a.primera_vez) < 2 && <span className="ml-1 text-[10px] font-bold text-emerald-700">NUEVO</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Tarjeta>
            </>
          )}

          {pestana === 'anuncios' && (
            <Tarjeta titulo={`Anuncios activos de la competencia (${datos.anuncios.length})`}>
              {datos.anuncios.length === 0 ? (
                <p className="text-sm text-[#516f90]">Todavía no llegan anuncios. Los manda la tarea diaria de Claude Code a las 09:00.</p>
              ) : (
                <ul className="divide-y divide-[#f3f6f9]">
                  {datos.anuncios.map((a) => (
                    <li key={a.ad_id} className="py-2 flex items-start justify-between gap-3 text-sm">
                      <div>
                        <p className="font-semibold text-[#33475b]">{a.page_name || 'Sin nombre'}</p>
                        <p className="text-[#516f90]">{a.titulo || 'Sin título'}{a.termino ? ` · "${a.termino}"` : ''}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[11px] text-[#516f90]">
                          {a.inicio_at ? `corre hace ${Math.max(0, Math.round(haceDias(a.inicio_at)))} días` : `visto desde ${fecha(a.primera_vez)}`}
                        </p>
                        {a.snapshot_url && (
                          <a href={a.snapshot_url} target="_blank" rel="noreferrer" className="text-xs text-[#2d544c] hover:underline inline-flex items-center gap-1">
                            Ver anuncio <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
          )}

          {pestana === 'mercado' && (
            <Tarjeta titulo={`Noticias de los últimos 14 días (${datos.noticias.length})`}>
              {datos.config.temas.map((t) => {
                const lista = datos.noticias.filter((n) => n.tema === t.tema);
                if (!lista.length) return null;
                return (
                  <div key={t.tema} className="mb-4">
                    <p className="text-xs font-bold text-[#2d544c] mb-1">{t.tema}</p>
                    <ul className="space-y-1">
                      {lista.slice(0, 12).map((n) => (
                        <li key={n.url} className="text-sm">
                          <a href={n.url} target="_blank" rel="noreferrer" className="text-[#33475b] hover:underline">{n.titulo}</a>
                          <span className="text-[11px] text-[#516f90]"> · {n.medio ?? 'Sin medio'} · {fecha(n.publicada_at ?? n.vista_at)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </Tarjeta>
          )}
        </>
      )}
    </div>
  );
}

/** Una línea por elemento; los campos van separados por "|". */
function EditorConfig({ config, alGuardar }: { config: Config; alGuardar: () => void }) {
  const [comunas, setComunas] = useState(config.comunas.map((c) => `${c.nombre} | ${c.slug}`).join('\n'));
  const [temas, setTemas] = useState(config.temas.map((t) => [t.tema, t.consulta, t.palabras ?? ''].join(' | ').replace(/ \| $/, '')).join('\n'));
  const [terminos, setTerminos] = useState(config.terminos_anuncios.join('\n'));
  const [paginas, setPaginas] = useState(config.paginas_competencia.map((p) => `${p.nombre} | ${p.page_id}`).join('\n'));
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const lineas = (s: string) => s.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p[0]);

  const guardar = async () => {
    setGuardando(true);
    setAviso(null);
    try {
      const r = await fetch('/api/investigacion/config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          comunas: lineas(comunas).map(([nombre, slug]) => ({ nombre, slug })),
          temas: lineas(temas).map(([tema, consulta, palabras]) => ({ tema, consulta, palabras })),
          terminos_anuncios: lineas(terminos).map(([t]) => t),
          paginas_competencia: lineas(paginas).map(([nombre, page_id]) => ({ nombre, page_id })),
        }),
      });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      setAviso('Guardado. Se usa desde la próxima revisión.');
      alGuardar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  const campo = (titulo: string, ayuda: string, valor: string, cambiar: (v: string) => void) => (
    <label className="block">
      <span className="text-xs font-bold text-[#33475b]">{titulo}</span>
      <span className="block text-[11px] text-[#516f90] mb-1">{ayuda}</span>
      <textarea value={valor} onChange={(e) => cambiar(e.target.value)} rows={5} className="w-full text-xs font-mono border border-[#cbd6e2] rounded-lg p-2 text-[#33475b]" />
    </label>
  );

  return (
    <Tarjeta
      titulo="Qué vigilan los investigadores"
      extra={
        <button onClick={guardar} disabled={guardando} className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[#2d544c] rounded-lg px-3 py-1.5 disabled:opacity-50">
          {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Guardar
        </button>
      }
    >
      <div className="grid md:grid-cols-2 gap-4">
        {campo('Comunas (Competencia)', 'Nombre | slug del portal (ej. El Tabo | el-tabo)', comunas, setComunas)}
        {campo('Temas (Mercado)', 'Tema | búsqueda en Google Noticias | palabras que debe tener el título (opcional)', temas, setTemas)}
        {campo('Búsquedas de anuncios (Anuncios)', 'Una por línea, se buscan en la Biblioteca de Anuncios de Meta (Chile)', terminos, setTerminos)}
        {campo('Páginas de la competencia (Anuncios)', 'Nombre | id de la página de Facebook', paginas, setPaginas)}
      </div>
      {aviso && <p className="text-xs text-[#516f90] mt-2">{aviso}</p>}
    </Tarjeta>
  );
}
