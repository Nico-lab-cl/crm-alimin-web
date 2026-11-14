'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronRight, FileText, Loader2, MessageSquare, Search } from 'lucide-react';

/**
 * Historial de cada agente: lo que hizo y las conversaciones que atendió, por
 * día, semana o fechas a elección. Se llega desde la Oficina IA
 * (/agentes-ia/historial?agente=ali&desde=…&hasta=…).
 */

type AgenteId = 'ali' | 'calificador' | 'cierre' | 'competencia' | 'anuncios' | 'mercado';
const AGENTES: { id: AgenteId; nombre: string }[] = [
  { id: 'ali', nombre: 'Ali - Interacción' },
  { id: 'calificador', nombre: 'Ali - Calificador' },
  { id: 'cierre', nombre: 'Ali - Cierre' },
  { id: 'competencia', nombre: 'Ali - Competencia' },
  { id: 'anuncios', nombre: 'Ali - Anuncios' },
  { id: 'mercado', nombre: 'Ali - Mercado' },
];
const INVESTIGADORES: AgenteId[] = ['competencia', 'anuncios', 'mercado'];

interface Tarea { tipo: string; texto: string; created_at: string }
interface Conversacion {
  id: string;
  tipo: 'chat' | 'correo';
  canal: string | null;
  nombre: string | null;
  lead_id: string | null;
  paso: number | null;
  primera: string;
  ultima: string;
  respuestas: number;
  costo_usd: number;
}
interface Informe { id: number; tipo: string; texto: string; created_at: string }
interface Datos { rango: { desde: string; hasta: string }; tareas: Tarea[]; conversaciones: Conversacion[]; informes: Informe[] }
interface Mensaje { text: string; de: string; creado: string }

const CANAL: Record<string, string> = { web: 'Chat web', instagram: 'Instagram', facebook: 'Facebook', correo: 'Correo' };
const QUIEN: Record<string, string> = { meta: 'Cliente', visitor: 'Cliente', ali: 'Ali', advisor: 'Asesor' };

const hoyChile = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
const restarDias = (fecha: string, dias: number) => new Date(Date.parse(fecha) - dias * 86400000).toISOString().slice(0, 10);
const hora = (s: string) => new Date(s).toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit' });
const diaHora = (s: string) =>
  new Date(s).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

type Periodo = 'hoy' | 'ayer' | 'semana' | 'fechas';
function rangoDe(p: Periodo, desde: string, hasta: string) {
  const hoy = hoyChile();
  if (p === 'hoy') return { desde: hoy, hasta: hoy };
  if (p === 'ayer') return { desde: restarDias(hoy, 1), hasta: restarDias(hoy, 1) };
  if (p === 'semana') return { desde: restarDias(hoy, 6), hasta: hoy };
  return { desde, hasta };
}

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

function FilaConversacion({ c }: { c: Conversacion }) {
  const [abierta, setAbierta] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abrir = async () => {
    setAbierta((v) => !v);
    if (mensajes || c.tipo !== 'chat') return;
    try {
      const r = await fetch(`/api/agentes-ia/historial?conversacion=${encodeURIComponent(c.id)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      setMensajes((await r.json()).mensajes);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <li className="border border-[#cbd6e2] rounded-xl">
      <button onClick={abrir} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[#f5f8fa] rounded-xl">
        {abierta ? <ChevronDown className="w-4 h-4 text-[#516f90] shrink-0" /> : <ChevronRight className="w-4 h-4 text-[#516f90] shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#33475b] truncate">
            {c.nombre ?? 'Sin nombre'}
            {c.tipo === 'correo' && c.paso ? <span className="font-normal text-[#516f90]"> · correo post-visita, paso {c.paso}</span> : null}
          </p>
          <p className="text-[11px] text-[#516f90]">
            {CANAL[c.canal ?? ''] ?? c.canal ?? 'Sin canal'} · {diaHora(c.primera)}
            {c.ultima !== c.primera ? ` a ${diaHora(c.ultima)}` : ''} · {c.respuestas} {c.respuestas === 1 ? 'respuesta' : 'respuestas'} de la IA · US${c.costo_usd.toFixed(4)}
          </p>
        </div>
        {c.lead_id && (
          <Link href={`/contacts?lead=${encodeURIComponent(c.lead_id)}`} onClick={(e) => e.stopPropagation()} className="text-xs font-semibold text-[#2d544c] hover:underline shrink-0">
            Ver lead
          </Link>
        )}
      </button>
      {abierta && (
        <div className="px-4 pb-3 pt-1 border-t border-[#eef2f6]">
          {c.tipo === 'correo' ? (
            <p className="text-sm text-[#516f90]">Es un correo post-visita: su texto está en la ficha del lead.</p>
          ) : error ? (
            <p className="text-sm text-red-700">No se pudo cargar: {error}</p>
          ) : !mensajes ? (
            <p className="text-sm text-[#516f90] inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</p>
          ) : !mensajes.length ? (
            <p className="text-sm text-[#516f90]">Sin mensajes de texto.</p>
          ) : (
            <ul className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
              {mensajes.map((m, i) => (
                <li key={i} className={`text-sm rounded-lg px-3 py-1.5 ${m.de === 'ali' ? 'bg-[#e8f3e6]' : m.de === 'advisor' ? 'bg-[#eef2f6]' : 'bg-white border border-[#eef2f6]'}`}>
                  <span className="text-[11px] font-bold text-[#516f90]">{QUIEN[m.de] ?? m.de} · {diaHora(m.creado)}</span>
                  <p className="text-[#33475b] whitespace-pre-line">{m.text}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

export default function HistorialAgentePage() {
  const [agente, setAgente] = useState<AgenteId>('ali');
  const [periodo, setPeriodo] = useState<Periodo>('hoy');
  const [desde, setDesde] = useState(hoyChile());
  const [hasta, setHasta] = useState(hoyChile());
  const [q, setQ] = useState('');
  const [buscar, setBuscar] = useState('');
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  // Lo que viene en el enlace de la oficina. window.location en vez de
  // useSearchParams para no envolver la página en Suspense.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const a = p.get('agente');
    if (AGENTES.some((x) => x.id === a)) setAgente(a as AgenteId);
    const per = p.get('periodo');
    const d = p.get('desde'), h = p.get('hasta');
    if (per === 'hoy' || per === 'ayer' || per === 'semana') setPeriodo(per);
    else if (d && h) {
      setPeriodo('fechas');
      setDesde(d);
      setHasta(h);
    }
    const texto = p.get('q') ?? '';
    setQ(texto);
    setBuscar(texto);
    setListo(true);
  }, []);

  const cargar = useCallback(async () => {
    const r = rangoDe(periodo, desde, hasta);
    setCargando(true);
    try {
      const params = new URLSearchParams({ agente, desde: r.desde, hasta: r.hasta });
      if (buscar) params.set('q', buscar);
      const res = await fetch(`/api/agentes-ia/historial?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `Error ${res.status}`);
      setDatos(await res.json());
      setError(null);
      const enUrl = new URLSearchParams({ agente, ...(periodo === 'fechas' ? { desde: r.desde, hasta: r.hasta } : { periodo }) });
      if (buscar) enUrl.set('q', buscar);
      window.history.replaceState(null, '', `?${enUrl}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [agente, periodo, desde, hasta, buscar]);

  useEffect(() => {
    if (listo) cargar();
  }, [listo, cargar]);

  const esInvestigador = INVESTIGADORES.includes(agente);
  const nombre = AGENTES.find((a) => a.id === agente)?.nombre;
  const boton = (activo: boolean) =>
    `text-sm font-semibold rounded-xl px-3 py-1.5 border ${activo ? 'bg-[#2d544c] text-white border-[#2d544c]' : 'bg-white text-[#2d544c] border-[#9fc79b] hover:bg-[#e8f3e6]'}`;

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-5 bg-[#f5f8fa] min-h-screen">
      <header>
        <Link href="/agentes-ia" className="inline-flex items-center gap-1 text-xs font-semibold text-[#516f90] hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" /> Agentes IA
        </Link>
        <h1 className="text-2xl font-extrabold text-[#33475b] mt-1">Historial de {nombre}</h1>
        <p className="text-sm text-[#516f90] mt-1">
          Lo que hizo y {esInvestigador ? 'los informes que escribió' : 'las conversaciones que atendió'}. Es lo mismo que se ve en la Oficina IA, con el detalle que allá no se muestra.
        </p>
      </header>

      <div className="bg-white rounded-2xl border border-[#9fc79b] p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {AGENTES.map((a) => (
            <button key={a.id} onClick={() => setAgente(a.id)} className={boton(agente === a.id)}>{a.nombre}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['hoy', 'ayer', 'semana', 'fechas'] as Periodo[]).map((p) => (
            <button key={p} onClick={() => setPeriodo(p)} className={boton(periodo === p)}>
              {{ hoy: 'Hoy', ayer: 'Ayer', semana: 'Últimos 7 días', fechas: 'Elegir fechas' }[p]}
            </button>
          ))}
          {periodo === 'fechas' && (
            <span className="inline-flex items-center gap-2 text-sm text-[#33475b]">
              <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="border border-[#cbd6e2] rounded-lg px-2 py-1" />
              a
              <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className="border border-[#cbd6e2] rounded-lg px-2 py-1" />
            </span>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setBuscar(q.trim());
            }}
            className="ml-auto inline-flex items-center gap-2"
          >
            <div className="relative">
              <Search className="w-4 h-4 text-[#516f90] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={esInvestigador ? 'Buscar en tareas e informes' : 'Buscar nombre, palabra del chat o tarea'}
                className="border border-[#cbd6e2] rounded-xl pl-8 pr-3 py-1.5 text-sm w-72"
              />
            </div>
            <button type="submit" className={boton(false)}>Buscar</button>
          </form>
        </div>
      </div>

      {error && <p className="text-sm text-red-700">No se pudo cargar el historial: {error}</p>}
      {cargando && !datos && (
        <p className="text-sm text-[#516f90] inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</p>
      )}

      {datos && (
        <div className="grid lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3 space-y-5">
            {esInvestigador ? (
              <Tarjeta titulo={`Informes (${datos.informes.length})`} extra={<FileText className="w-4 h-4 text-[#516f90]" />}>
                {!datos.informes.length ? (
                  <p className="text-sm text-[#516f90]">No hay informes en estas fechas.</p>
                ) : (
                  <ul className="space-y-4">
                    {datos.informes.map((i) => (
                      <li key={i.id}>
                        <p className="text-[11px] text-[#516f90] mb-1">{i.tipo === 'semanal' ? 'Informe semanal' : 'Informe diario'} · {diaHora(i.created_at)}</p>
                        <div className="text-sm text-[#33475b] whitespace-pre-line leading-relaxed">{i.texto}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </Tarjeta>
            ) : (
              <Tarjeta titulo={`Conversaciones (${datos.conversaciones.length})`} extra={<MessageSquare className="w-4 h-4 text-[#516f90]" />}>
                {!datos.conversaciones.length ? (
                  <p className="text-sm text-[#516f90]">No atendió conversaciones en estas fechas{buscar ? ' con esa búsqueda' : ''}.</p>
                ) : (
                  <ul className="space-y-2">
                    {datos.conversaciones.map((c) => <FilaConversacion key={c.id} c={c} />)}
                  </ul>
                )}
              </Tarjeta>
            )}
          </div>
          <div className="lg:col-span-2">
            <Tarjeta titulo={`Tareas en la oficina (${datos.tareas.length})`}>
              {!datos.tareas.length ? (
                <p className="text-sm text-[#516f90]">Sin tareas registradas en estas fechas. El registro parte desde que se activó el historial.</p>
              ) : (
                <ol className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-1">
                  {datos.tareas.map((t, i) => (
                    <li key={i} className="grid grid-cols-[86px_1fr] gap-2 text-sm">
                      <time className="text-[11px] text-[#516f90] pt-0.5">{datos.rango.desde === datos.rango.hasta ? hora(t.created_at) : diaHora(t.created_at)}</time>
                      <span className={t.tipo === 'dijo' ? 'text-[#2d544c] font-semibold' : 'text-[#33475b]'}>{t.texto}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Tarjeta>
          </div>
        </div>
      )}
    </div>
  );
}
