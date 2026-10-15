'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Flame,
  RefreshCcw,
  Thermometer,
  Snowflake,
  Megaphone,
  Info,
  Users,
  X,
  ChevronDown,
  ChevronRight,
  BarChart3,
} from 'lucide-react';
import { LeadScoreCell, type BandaScore } from '@/components/LeadScoreBadge';
import { statusLabel } from '@/lib/lead_status';
import ResumenGeneral, { type General } from './ResumenGeneral';

type LeadFila = {
  lead_id: string;
  score: number;
  banda: BandaScore;
  origen: string;
  motivos: string[];
  ultima_interaccion: string | null;
  creado: string | null;
  firstName: string | null;
  lastName: string | null;
  status: string | null;
  contacted: boolean;
  advisorName: string | null;
};

type Campana = {
  origen: string;
  campana: string;
  leads: number;
  promedio: number;
  calientes: number;
  tibios: number;
  con_interaccion: number;
  contactados: number;
  avanzaron: number;
};

type Datos = {
  listo: boolean;
  general?: General;
  calculadoEn?: string | null;
  reglas?: { caliente: number; tibio: number; vidaMediaDias: number };
  resumen?: Record<BandaScore, number>;
  leads?: LeadFila[];
  campanas?: Campana[];
  asesores?: { id: string; name: string }[];
};

const ORIGEN: Record<string, string> = {
  WEB: 'Web orgánica',
  LANDING_META: 'Landing de Meta',
  FORM_META: 'Formulario Meta',
  MANUAL: 'Cargado a mano',
  ANTIGUA: 'Base antigua',
};

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');

function hace(fecha: string | null) {
  if (!fecha) return '—';
  const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60000);
  if (min < 60) return `hace ${Math.max(min, 1)} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

function fechaCorta(fecha: string | null) {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleDateString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: 'short', year: 'numeric' });
}

/** YYYY-MM-DD en hora de Chile, N días atrás. */
function haceDias(dias: number) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(Date.now() - dias * 86_400_000));
}

const ATAJOS: { etiqueta: string; desde: () => string }[] = [
  { etiqueta: 'Últimos 7 días', desde: () => haceDias(7) },
  { etiqueta: 'Últimos 30 días', desde: () => haceDias(30) },
  { etiqueta: 'Desde abril', desde: () => '2026-04-01' },
];

const campo =
  'w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-[#33475b] focus:bg-white';

export default function LeadScorePage() {
  const router = useRouter();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [recalculando, setRecalculando] = useState(false);
  const [error, setError] = useState('');
  const [pestana, setPestana] = useState<'general' | 'leads' | 'campanas'>('leads');
  const [verReglas, setVerReglas] = useState(false);

  // Filtros
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [banda, setBanda] = useState('');
  const [origen, setOrigen] = useState('');
  const [asesor, setAsesor] = useState('');
  const [op, setOp] = useState('gte');
  const [puntaje, setPuntaje] = useState('');
  const hayFiltros = Boolean(desde || hasta || banda || origen || asesor || puntaje);

  const cargar = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (desde) params.set('desde', desde);
      if (hasta) params.set('hasta', hasta);
      if (banda) params.set('banda', banda);
      if (origen) params.set('origen', origen);
      if (asesor) params.set('asesor', asesor);
      if (/^\d{1,3}$/.test(puntaje)) {
        params.set('op', op);
        params.set('puntaje', puntaje);
      }
      const res = await fetch(`/api/lead-score?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.message || 'No se pudo leer el lead score');
      setDatos(json);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, banda, origen, asesor, op, puntaje]);

  // El puntaje se escribe: se espera a que termine de tipear.
  useEffect(() => {
    const t = setTimeout(cargar, 300);
    return () => clearTimeout(t);
  }, [cargar]);

  const recalcular = async () => {
    setRecalculando(true);
    try {
      const res = await fetch('/api/lead-score', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.message || 'Falló el recálculo');
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRecalculando(false);
    }
  };

  const limpiar = () => {
    setDesde('');
    setHasta('');
    setBanda('');
    setOrigen('');
    setAsesor('');
    setOp('gte');
    setPuntaje('');
  };

  const reglas = datos?.reglas || { caliente: 60, tibio: 35, vidaMediaDias: 14 };
  const leads = datos?.leads || [];
  const campanas = (datos?.campanas || []).filter((c) => c.leads >= 3);

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-[1600px] mx-auto">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#2d544c] flex items-center gap-2">
            <Flame className="w-7 h-7 text-orange-500" /> Lead Score
          </h1>
          <p className="text-[#516f90] mt-1">
            A quién llamar primero hoy. Se recalcula cada 15 minutos
            {datos?.calculadoEn ? ` · último cálculo ${hace(datos.calculadoEn)}` : ''}.
          </p>
        </div>
        <button
          onClick={recalcular}
          disabled={recalculando}
          className="flex items-center gap-2 px-4 py-2 bg-[#2d544c] text-white rounded-lg font-bold hover:bg-[#1f3a35] transition-all shadow-sm disabled:opacity-60 self-start"
        >
          <RefreshCcw className={`w-4 h-4 ${recalculando ? 'animate-spin' : ''}`} />
          {recalculando ? 'Recalculando…' : 'Recalcular ahora'}
        </button>
      </div>

      {/* Qué significa el número */}
      <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm px-5 py-4 text-sm text-[#33475b]">
        <p>
          Cada lead tiene un <b>puntaje de 0 a 100</b> según qué tanto ha interactuado con Alimin: de dónde llegó, si
          escribió, cuánto tiempo pasó en la web, si abrió o hizo clic en los correos. Mientras más alto, más interés.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold bg-orange-50 text-orange-700 border-orange-200">
            🔥 Caliente: {reglas.caliente} o más · llamar hoy
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold bg-amber-50 text-amber-700 border-amber-200">
            Tibio: {reglas.tibio} a {reglas.caliente - 1} · hacer seguimiento
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold bg-slate-50 text-slate-500 border-slate-200">
            Frío: menos de {reglas.tibio}
          </span>
        </div>
        <button
          onClick={() => setVerReglas((v) => !v)}
          className="mt-3 text-xs font-bold text-[#2d544c] hover:underline flex items-center gap-1"
        >
          {verReglas ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          ¿Cómo se calcula?
        </button>
        {verReglas && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-[#516f90]">
            <div>
              <p className="font-bold text-[#33475b] mb-1">De dónde llegó (hasta 20)</p>
              <p>Web orgánica o chat web: 20 · Landing de Meta: 12 · Formulario de Meta: 8 · Base antigua: 0</p>
            </div>
            <div>
              <p className="font-bold text-[#33475b] mb-1">Perfil (hasta 10)</p>
              <p>Tiene pie: +6 · La cuota le calza: +4. Solo existe en formularios de Meta; no tenerlo no resta.</p>
            </div>
            <div>
              <p className="font-bold text-[#33475b] mb-1">Interacción (hasta 70)</p>
              <p>
                Clic en WhatsApp: +15 · Escribió por chat, Messenger o Instagram: +15 · Tiempo en la web: +5 / +10 / +15
                (1, 5 y 15 min) · Volvió a la web otro día: +8 (hasta 2) · Clic en un correo: +8 · Abrió un correo: +3
                (hasta 2) · Clic en cotizar, plano o lotes: +4.
              </p>
              <p className="mt-1">
                Cada interacción pierde la mitad de su valor cada {reglas.vidaMediaDias} días: lo de ayer pesa más que lo
                de hace un mes.
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-semibold">{error}</div>
      )}

      {/* Filtros */}
      <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Creado desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={campo} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Creado hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={campo} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Temperatura</label>
            <select value={banda} onChange={(e) => setBanda(e.target.value)} className={campo}>
              <option value="">{puntaje ? 'Todas' : 'Calientes y tibios'}</option>
              <option value="TODAS">Todas las temperaturas</option>
              <option value="CALIENTE">🔥 Solo calientes</option>
              <option value="TIBIO">Solo tibios</option>
              <option value="FRIO">Solo fríos</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Puntaje</label>
            <div className="flex gap-1.5">
              <select
                value={op}
                onChange={(e) => setOp(e.target.value)}
                className={`${campo} !w-16 shrink-0 px-2 text-center font-bold`}
                aria-label="Comparación del puntaje"
              >
                <option value="gte">≥</option>
                <option value="gt">&gt;</option>
                <option value="eq">=</option>
                <option value="lte">≤</option>
                <option value="lt">&lt;</option>
              </select>
              <input
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                placeholder="0 a 100"
                value={puntaje}
                onChange={(e) => setPuntaje(e.target.value.replace(/\D/g, '').slice(0, 3))}
                className={campo}
                aria-label="Puntaje"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Origen</label>
            <select value={origen} onChange={(e) => setOrigen(e.target.value)} className={campo}>
              <option value="">Todos los orígenes</option>
              {Object.entries(ORIGEN).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Asesor</label>
            <select value={asesor} onChange={(e) => setAsesor(e.target.value)} className={campo}>
              <option value="">Todos</option>
              {(datos?.asesores || []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ATAJOS.map((a) => (
            <button
              key={a.etiqueta}
              onClick={() => {
                setDesde(a.desde());
                setHasta('');
              }}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                desde === a.desde() && !hasta
                  ? 'bg-[#2d544c] text-white border-[#2d544c]'
                  : 'bg-white text-[#516f90] border-[#cbd6e2] hover:bg-[#f5f8fa]'
              }`}
            >
              {a.etiqueta}
            </button>
          ))}
          {hayFiltros && (
            <button
              onClick={limpiar}
              className="px-3 py-1.5 rounded-lg border border-zinc-200 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-xs font-bold flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {cargando ? (
        <div className="flex items-center justify-center py-24 text-[#516f90] gap-3">
          <RefreshCcw className="w-6 h-6 animate-spin text-[#2d544c]" /> Cargando…
        </div>
      ) : datos && !datos.listo ? (
        <div className="bg-white border border-[#cbd6e2] rounded-2xl p-8 text-center text-[#516f90]">
          Todavía no hay puntajes. El primer cálculo corre un minuto después de desplegar, o ahora con{' '}
          <b>Recalcular ahora</b>.
        </div>
      ) : (
        <>
          {/* Tarjetas por temperatura: también filtran */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {([
              ['CALIENTE', 'Calientes', Flame, 'text-orange-600 bg-orange-50', `${reglas.caliente} o más puntos`],
              ['TIBIO', 'Tibios', Thermometer, 'text-amber-600 bg-amber-50', `${reglas.tibio} a ${reglas.caliente - 1} puntos`],
              ['FRIO', 'Fríos', Snowflake, 'text-slate-500 bg-slate-50', `menos de ${reglas.tibio} puntos`],
            ] as const).map(([b, titulo, Icono, color, rango]) => (
              <button
                key={b}
                onClick={() => {
                  setBanda(banda === b ? '' : b);
                  setPestana('leads');
                }}
                className={`text-left bg-white border rounded-2xl shadow-sm p-5 flex items-center gap-4 transition-all hover:shadow-md ${
                  banda === b ? 'border-[#2d544c] ring-2 ring-[#2d544c]/20' : 'border-[#cbd6e2]'
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
                  <Icono className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#516f90] uppercase tracking-wider">{titulo}</p>
                  <p className="text-2xl font-extrabold text-[#33475b] tabular-nums">{datos?.resumen?.[b] ?? 0}</p>
                  <p className="text-[11px] text-[#516f90]">{rango}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Pestañas */}
          <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 sm:px-6 pt-4 border-b border-[#cbd6e2] flex gap-1">
              {([
                ['general', 'Resumen general', BarChart3],
                ['leads', 'Leads para llamar', Users],
                ['campanas', 'Calidad por campaña', Megaphone],
              ] as const).map(([id, titulo, Icono]) => (
                <button
                  key={id}
                  onClick={() => setPestana(id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-all ${
                    pestana === id ? 'border-[#2d544c] text-[#2d544c]' : 'border-transparent text-[#516f90] hover:text-[#33475b]'
                  }`}
                >
                  <Icono className="w-4 h-4" />
                  {titulo}
                </button>
              ))}
            </div>

            {pestana === 'general' ? (
              datos?.general ? <ResumenGeneral g={datos.general} reglas={reglas} origenes={ORIGEN} /> : null
            ) : pestana === 'leads' ? (
              <div className="overflow-x-auto">
                {leads.length === 0 ? (
                  <p className="px-6 py-10 text-center text-sm text-[#516f90]">
                    No hay leads con estos filtros.
                    {!banda && !puntaje && ' Hoy no hay calientes ni tibios: prueba con "Todas las temperaturas" para ver el resto.'}
                  </p>
                ) : (
                  <>
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#f5f8fa] text-[#516f90] text-xs font-bold uppercase tracking-wider border-b border-[#cbd6e2]">
                          <th className="px-6 py-3">Lead</th>
                          <th className="px-6 py-3">Puntaje y porqué</th>
                          <th className="px-6 py-3">Asesor</th>
                          <th className="px-6 py-3">Estado</th>
                          <th className="px-6 py-3">Ingresó</th>
                          <th className="px-6 py-3">Última interacción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#cbd6e2]">
                        {leads.map((l) => (
                          <tr
                            key={l.lead_id}
                            onClick={() => router.push(`/contacts?lead=${l.lead_id}`)}
                            className="hover:bg-[#f5f8fa] align-top cursor-pointer group"
                            title="Abrir la ficha del cliente"
                          >
                            <td className="px-6 py-3">
                              <p className="font-bold text-[#33475b] group-hover:text-[#2d544c]">
                                {[l.firstName, l.lastName].filter(Boolean).join(' ') || 'Sin nombre'}
                              </p>
                              <p className="text-[11px] text-[#516f90]">{ORIGEN[l.origen] || l.origen}</p>
                            </td>
                            <td className="px-6 py-3">
                              <LeadScoreCell score={l.score} banda={l.banda} motivos={l.motivos} />
                            </td>
                            <td className="px-6 py-3 text-sm font-semibold text-[#516f90]">{l.advisorName || '—'}</td>
                            <td className="px-6 py-3 text-xs">
                              <span className="font-bold text-[#33475b]">{statusLabel(l.status)}</span>
                              <span className={`block mt-1 font-bold ${l.contacted ? 'text-emerald-700' : 'text-amber-700'}`}>
                                {l.contacted ? 'Atendido' : 'Pendiente'}
                              </span>
                            </td>
                            <td className="px-6 py-3 text-xs text-[#516f90] whitespace-nowrap">{fechaCorta(l.creado)}</td>
                            <td className="px-6 py-3 text-xs text-[#516f90] whitespace-nowrap">{hace(l.ultima_interaccion)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {leads.length >= 300 && (
                      <p className="px-6 py-3 text-xs text-[#516f90] border-t border-[#cbd6e2]">
                        Se muestran los 300 de mayor puntaje. Usa los filtros para acotar.
                      </p>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div>
                <p className="px-6 pt-4 text-xs text-[#516f90] flex items-start gap-1">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  Agrupado por anuncio de Meta, campaña utm o formulario de la web (mínimo 3 leads; la base antigua no tiene
                  campaña). Una campaña con muchos leads y pocos con interacción trae volumen, no interés. Usa las fechas de
                  arriba para ver un período.
                </p>
                <div className="overflow-x-auto mt-3">
                  {campanas.length === 0 ? (
                    <p className="px-6 py-10 text-center text-sm text-[#516f90]">No hay campañas con estos filtros.</p>
                  ) : (
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="bg-[#f5f8fa] text-[#516f90] text-xs font-bold uppercase tracking-wider border-y border-[#cbd6e2]">
                          <th className="px-6 py-3">Campaña</th>
                          <th className="px-6 py-3">Origen</th>
                          <th className="px-6 py-3 text-right">Leads</th>
                          <th className="px-6 py-3 text-right">Puntaje prom.</th>
                          <th className="px-6 py-3 text-right">Calientes</th>
                          <th className="px-6 py-3 text-right">Tibios</th>
                          <th className="px-6 py-3 text-right">Con interacción</th>
                          <th className="px-6 py-3 text-right">Atendidos</th>
                          <th className="px-6 py-3 text-right">Visita o reserva</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#cbd6e2]">
                        {campanas.map((c) => (
                          <tr key={`${c.origen}|${c.campana}`} className="hover:bg-[#f5f8fa]">
                            <td className="px-6 py-3 font-semibold text-[#33475b] max-w-[320px] truncate" title={c.campana}>
                              {c.campana}
                            </td>
                            <td className="px-6 py-3 text-xs text-[#516f90] whitespace-nowrap">{ORIGEN[c.origen] || c.origen}</td>
                            <td className="px-6 py-3 text-right tabular-nums">{c.leads}</td>
                            <td className="px-6 py-3 text-right tabular-nums font-bold">{c.promedio}</td>
                            <td className="px-6 py-3 text-right tabular-nums">
                              {c.calientes} <span className="text-[11px] text-[#516f90]">({pct(c.calientes, c.leads)})</span>
                            </td>
                            <td className="px-6 py-3 text-right tabular-nums">
                              {c.tibios} <span className="text-[11px] text-[#516f90]">({pct(c.tibios, c.leads)})</span>
                            </td>
                            <td className="px-6 py-3 text-right tabular-nums">{pct(c.con_interaccion, c.leads)}</td>
                            <td className="px-6 py-3 text-right tabular-nums">{pct(c.contactados, c.leads)}</td>
                            <td className="px-6 py-3 text-right tabular-nums">{c.avanzaron}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
