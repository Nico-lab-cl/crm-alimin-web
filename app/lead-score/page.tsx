'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Flame, RefreshCcw, Thermometer, Snowflake, Megaphone, Info } from 'lucide-react';
import { LeadScoreCell, type BandaScore } from '@/components/LeadScoreBadge';
import { statusLabel } from '@/lib/lead_status';

type Conteo = Record<BandaScore, number>;

type LeadFila = {
  lead_id: string;
  score: number;
  banda: BandaScore;
  origen: string;
  motivos: string[];
  ultima_interaccion: string | null;
  caliente_desde: string | null;
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
  calculadoEn?: string | null;
  reglas?: { caliente: number; tibio: number; vidaMediaDias: number };
  resumen?: { vivos: Conteo; antigua: Conteo };
  leads?: LeadFila[];
  campanas?: Campana[];
};

const ORIGEN: Record<string, string> = {
  WEB: 'Web orgánica',
  LANDING_META: 'Landing de Meta',
  FORM_META: 'Formulario Meta',
  MANUAL: 'Manual',
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

export default function LeadScorePage() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [recalculando, setRecalculando] = useState(false);
  const [filtroAntigua, setFiltroAntigua] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/lead-score');
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.message || 'No se pudo leer el lead score');
      setDatos(json);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
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

  const vivos = datos?.resumen?.vivos;
  const antigua = datos?.resumen?.antigua;
  const leads = (datos?.leads || []).filter((l) => (filtroAntigua ? l.origen === 'ANTIGUA' : l.origen !== 'ANTIGUA'));
  const campanas = (datos?.campanas || []).filter((c) => c.leads >= 3);

  return (
    <div className="p-4 sm:p-8 space-y-8 max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
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
          className="flex items-center gap-2 px-4 py-2 bg-[#2d544c] text-white rounded-lg font-bold hover:bg-[#1f3a35] transition-all shadow-sm disabled:opacity-60"
        >
          <RefreshCcw className={`w-4 h-4 ${recalculando ? 'animate-spin' : ''}`} />
          {recalculando ? 'Recalculando…' : 'Recalcular ahora'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-semibold">{error}</div>
      )}

      {cargando ? (
        <div className="flex items-center justify-center py-24 text-[#516f90] gap-3">
          <RefreshCcw className="w-6 h-6 animate-spin text-[#2d544c]" /> Cargando…
        </div>
      ) : datos && !datos.listo ? (
        <div className="bg-white border border-[#cbd6e2] rounded-2xl p-8 text-center text-[#516f90]">
          Todavía no hay puntajes. El primer cálculo corre un minuto después de desplegar, o ahora con
          &nbsp;<b>Recalcular ahora</b>.
        </div>
      ) : (
        <>
          {/* Resumen por banda */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {([
              ['CALIENTE', 'Calientes', Flame, 'text-orange-600 bg-orange-50'],
              ['TIBIO', 'Tibios', Thermometer, 'text-amber-600 bg-amber-50'],
              ['FRIO', 'Fríos', Snowflake, 'text-slate-500 bg-slate-50'],
            ] as const).map(([banda, titulo, Icono, color]) => (
              <div key={banda} className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm p-5 flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
                  <Icono className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#516f90] uppercase tracking-wider">{titulo}</p>
                  <p className="text-2xl font-extrabold text-[#33475b] tabular-nums">{vivos?.[banda] ?? 0}</p>
                  <p className="text-[11px] text-[#516f90]">+ {antigua?.[banda] ?? 0} de la base antigua</p>
                </div>
              </div>
            ))}
          </div>

          {/* Leads calientes y tibios */}
          <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[#cbd6e2] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-lg font-bold text-[#33475b]">Para llamar primero</h2>
              <div className="flex bg-[#f5f8fa] border border-[#cbd6e2] rounded-lg p-1 text-xs font-bold">
                <button
                  onClick={() => setFiltroAntigua(false)}
                  className={`px-3 py-1.5 rounded-md ${!filtroAntigua ? 'bg-white shadow-sm text-[#2d544c]' : 'text-[#516f90]'}`}
                >
                  Leads desde abril
                </button>
                <button
                  onClick={() => setFiltroAntigua(true)}
                  className={`px-3 py-1.5 rounded-md ${filtroAntigua ? 'bg-white shadow-sm text-[#2d544c]' : 'text-[#516f90]'}`}
                >
                  Base antigua que volvió
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              {leads.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-[#516f90]">No hay leads calientes ni tibios en este grupo.</p>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#f5f8fa] text-[#516f90] text-xs font-bold uppercase tracking-wider border-b border-[#cbd6e2]">
                      <th className="px-6 py-3">Lead</th>
                      <th className="px-6 py-3">Puntaje y porqué</th>
                      <th className="px-6 py-3">Asesor</th>
                      <th className="px-6 py-3">Estado</th>
                      <th className="px-6 py-3">Última interacción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#cbd6e2]">
                    {leads.map((l) => (
                      <tr key={l.lead_id} className="hover:bg-[#f5f8fa] align-top">
                        <td className="px-6 py-3">
                          <p className="font-bold text-[#33475b]">
                            {[l.firstName, l.lastName].filter(Boolean).join(' ') || 'Sin nombre'}
                          </p>
                          <p className="text-[11px] text-[#516f90]">{ORIGEN[l.origen] || l.origen}</p>
                        </td>
                        <td className="px-6 py-3">
                          <LeadScoreCell score={l.score} banda={l.banda} motivos={l.motivos} />
                        </td>
                        <td className="px-6 py-3 text-sm font-semibold text-[#516f90]">
                          {l.advisorName || '—'}
                        </td>
                        <td className="px-6 py-3 text-xs">
                          <span className="font-bold text-[#33475b]">{statusLabel(l.status)}</span>
                          <span className={`block mt-1 font-bold ${l.contacted ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {l.contacted ? 'Atendido' : 'Pendiente'}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-xs text-[#516f90] whitespace-nowrap">{hace(l.ultima_interaccion)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Calidad por campaña */}
          <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[#cbd6e2]">
              <h2 className="text-lg font-bold text-[#33475b] flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-[#2d544c]" /> Calidad por campaña
              </h2>
              <p className="text-xs text-[#516f90] mt-1 flex items-start gap-1">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                Leads desde abril, agrupados por anuncio de Meta, campaña utm o formulario de la web (mínimo 3 leads).
                Una campaña con muchos leads y pocos con interacción trae volumen, no interés.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-[#f5f8fa] text-[#516f90] text-xs font-bold uppercase tracking-wider border-b border-[#cbd6e2]">
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
                      <td className="px-6 py-3 font-semibold text-[#33475b] max-w-[320px] truncate" title={c.campana}>{c.campana}</td>
                      <td className="px-6 py-3 text-xs text-[#516f90] whitespace-nowrap">{ORIGEN[c.origen] || c.origen}</td>
                      <td className="px-6 py-3 text-right tabular-nums">{c.leads}</td>
                      <td className="px-6 py-3 text-right tabular-nums font-bold">{c.promedio}</td>
                      <td className="px-6 py-3 text-right tabular-nums">{c.calientes} <span className="text-[11px] text-[#516f90]">({pct(c.calientes, c.leads)})</span></td>
                      <td className="px-6 py-3 text-right tabular-nums">{c.tibios} <span className="text-[11px] text-[#516f90]">({pct(c.tibios, c.leads)})</span></td>
                      <td className="px-6 py-3 text-right tabular-nums">{pct(c.con_interaccion, c.leads)}</td>
                      <td className="px-6 py-3 text-right tabular-nums">{pct(c.contactados, c.leads)}</td>
                      <td className="px-6 py-3 text-right tabular-nums">{c.avanzaron}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {datos?.reglas && (
            <p className="text-xs text-[#516f90]">
              Caliente desde {datos.reglas.caliente} puntos, tibio desde {datos.reglas.tibio}. Cada interacción pierde la mitad
              de su valor cada {datos.reglas.vidaMediaDias} días. Para ver el porqué completo de un lead, ábrelo en{' '}
              <Link href="/contacts" className="font-bold text-[#2d544c] hover:underline">Contactos</Link>.
            </p>
          )}
        </>
      )}
    </div>
  );
}
