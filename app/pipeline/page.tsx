'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Kanban, RefreshCcw, AlertTriangle, Clock, Info } from 'lucide-react';
import { statusLabel } from '@/lib/lead_status';

type Tarjeta = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  columna: string;
  etapaDesde: string | null;
  proximaAccion: string | null;
  proximaAccionAt: string | null;
  motivoPerdida: string | null;
  asesor: string | null;
  banda: string | null;
  score: number | null;
};

type Asesor = {
  id: string;
  name: string;
  abiertos: number;
  atrasados: number;
  sin_accion: number;
  seguimientos: number;
  leads_seguidos: number;
  visitas: number;
  reservas: number;
  perdidos: number;
};

type Datos = {
  listo: boolean;
  dias: number;
  diasEstancado: number;
  porColumna: number;
  asesores: { id: string; name: string }[];
  columnas: { columna: string; leads: number; atrasados: number; sin_accion: number }[];
  tarjetas: Tarjeta[];
  embudo: { ingresaron: number; contactados: number; visitas: number; reservas: number; perdidos: number };
  entradas: { etapa: string; origen: string; leads: number }[];
  tiempos: { etapa: string; casos: number; promedio_dias: number; mediana_dias: number }[];
  primerContacto: { leads: number; mediana_horas: number | null };
  porAsesor: Asesor[];
  perdidas: { motivo: string; leads: number }[];
  estancados: (Tarjeta & { ultimo_seguimiento: string | null })[];
};

const ETAPAS = [
  { id: 'NUEVO', nombre: 'Nuevo', borde: 'border-t-blue-500' },
  { id: 'CONTACTADO', nombre: 'Contactado', borde: 'border-t-orange-500' },
  { id: 'VISITA', nombre: 'Visita', borde: 'border-t-green-500' },
  { id: 'RESERVADO', nombre: 'Reservado / cliente', borde: 'border-t-emerald-600' },
  { id: 'PERDIDO', nombre: 'Perdido', borde: 'border-t-slate-400' },
];

const ORIGEN: Record<string, string> = {
  ASESOR: 'Asesor',
  CRM_WEB: 'CRM web',
  VISITA_WEB: 'Visita agendada en la web',
  PORTAL_PAGOS: 'Portal de pagos',
  SISTEMA: 'Automático',
  RECONSTRUIDO: 'Registro anterior',
};

const BANDA: Record<string, string> = {
  CALIENTE: 'bg-orange-100 text-orange-700',
  TIBIO: 'bg-amber-100 text-amber-700',
  TEMPLADO: 'bg-sky-100 text-sky-700',
  FRIO: 'bg-slate-100 text-slate-600',
};

const PERIODOS = [7, 30, 90];

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');
const nombre = (t: { firstName: string | null; lastName: string | null }) =>
  [t.firstName, t.lastName].filter(Boolean).join(' ') || 'Sin nombre';

function dias(fecha: string | null) {
  if (!fecha) return '—';
  const d = Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
  return d <= 0 ? 'hoy' : `${d} d`;
}

function fechaCorta(fecha: string) {
  return new Date(fecha).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function PipelinePage() {
  const router = useRouter();
  const [asesor, setAsesor] = useState('');
  const [periodo, setPeriodo] = useState(30);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const qs = new URLSearchParams({ dias: String(periodo) });
      if (asesor) qs.set('asesor', asesor);
      const res = await fetch(`/api/pipeline?${qs}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'No se pudo cargar');
      setDatos(json);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [asesor, periodo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abrir = (id: string) => router.push(`/contacts?lead=${id}`);

  if (datos && !datos.listo) {
    return (
      <div className="p-8 text-[#516f90]">
        Faltan las tablas del pipeline en la base. Hay que aplicar migrations_manual/2026-10-26_pipeline.sql del CRM móvil.
      </div>
    );
  }

  const e = datos?.embudo;
  const columna = (id: string) => datos?.columnas.find((c) => c.columna === id);
  const entradasDe = (etapa: string) => (datos?.entradas || []).filter((x) => x.etapa === etapa);

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#2d544c] flex items-center gap-2">
            <Kanban className="w-7 h-7 text-[#2d544c]" /> Pipeline
          </h1>
          <p className="text-[#516f90] mt-1">
            En qué etapa va cada cliente, qué tan rápido avanza y dónde se queda. Los asesores lo gestionan desde la app.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={asesor}
            onChange={(ev) => setAsesor(ev.target.value)}
            className="px-3 py-2 border border-[#cbd6e2] rounded-lg text-sm bg-white text-[#33475b]"
          >
            <option value="">Todos los asesores</option>
            {(datos?.asesores || []).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <div className="flex rounded-lg border border-[#cbd6e2] overflow-hidden bg-white">
            {PERIODOS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                className={`px-3 py-2 text-sm font-bold ${periodo === p ? 'bg-[#2d544c] text-white' : 'text-[#516f90] hover:bg-slate-50'}`}
              >
                {p} días
              </button>
            ))}
          </div>
          <button
            onClick={cargar}
            disabled={cargando}
            className="flex items-center gap-2 px-3 py-2 bg-[#2d544c] text-white rounded-lg text-sm font-bold hover:bg-[#1f3a35] disabled:opacity-60"
          >
            <RefreshCcw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-semibold">{error}</div>}

      {datos && e && (
        <>
          {/* Embudo de la cohorte del período */}
          <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm p-5">
            <h2 className="font-bold text-[#33475b]">Embudo de los leads que llegaron en los últimos {datos.dias} días</h2>
            <p className="text-xs text-[#516f90] mt-0.5">Cuántos de esos leads llegaron a cada etapa, aunque después hayan seguido avanzando o se hayan perdido.</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
              {[
                { nombre: 'Ingresaron', n: e.ingresaron, base: e.ingresaron },
                { nombre: 'Contactados', n: e.contactados, base: e.ingresaron },
                { nombre: 'Visita', n: e.visitas, base: e.ingresaron },
                { nombre: 'Reserva', n: e.reservas, base: e.ingresaron },
                { nombre: 'Perdidos', n: e.perdidos, base: e.ingresaron },
              ].map((x, i) => (
                <div key={x.nombre} className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                  <p className="text-xs font-bold text-[#516f90] uppercase tracking-wide">{x.nombre}</p>
                  <p className="text-2xl font-bold text-[#2d544c] tabular-nums">{x.n.toLocaleString('es-CL')}</p>
                  {i > 0 && <p className="text-xs text-[#516f90]">{pct(x.n, x.base)} de los que ingresaron</p>}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 mt-4 text-sm text-[#33475b]">
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#2d544c]" /> Primer contacto (mediana):{' '}
                <b>{datos.primerContacto.mediana_horas != null ? `${datos.primerContacto.mediana_horas} h` : '—'}</b>
                <span className="text-xs text-[#516f90]">({datos.primerContacto.leads} leads)</span>
              </span>
              {['NUEVO', 'CONTACTADO', 'VISITA'].map((et) => {
                const t = datos.tiempos.find((x) => x.etapa === et);
                return (
                  <span key={et}>
                    Tiempo en {statusLabel(et)}: <b>{t ? `${t.mediana_dias} d` : '—'}</b>
                    {t && <span className="text-xs text-[#516f90]"> (mediana, {t.casos} casos)</span>}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Por asesor */}
          <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm overflow-x-auto">
            <div className="px-5 pt-5">
              <h2 className="font-bold text-[#33475b]">Seguimiento por asesor</h2>
              <p className="text-xs text-[#516f90] mt-0.5">Abiertos, atrasados y sin acción son de hoy; el resto, de los últimos {datos.dias} días.</p>
            </div>
            <table className="w-full text-sm mt-3">
              <thead className="text-xs uppercase text-[#516f90] bg-slate-50">
                <tr>
                  {['Asesor', 'Abiertos', 'Atrasados', 'Sin próxima acción', 'Seguimientos', 'Leads seguidos', 'Visitas', 'Reservas', 'Perdidos'].map((h) => (
                    <th key={h} className="px-4 py-2 text-left font-bold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {datos.porAsesor.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-bold text-[#33475b] whitespace-nowrap">{a.name}</td>
                    <td className="px-4 py-2 tabular-nums">{a.abiertos}</td>
                    <td className={`px-4 py-2 tabular-nums ${a.atrasados ? 'text-red-600 font-bold' : ''}`}>{a.atrasados}</td>
                    <td className={`px-4 py-2 tabular-nums ${a.sin_accion ? 'text-amber-600 font-bold' : ''}`}>{a.sin_accion}</td>
                    <td className="px-4 py-2 tabular-nums">{a.seguimientos}</td>
                    <td className="px-4 py-2 tabular-nums">{a.leads_seguidos}</td>
                    <td className="px-4 py-2 tabular-nums">{a.visitas}</td>
                    <td className="px-4 py-2 tabular-nums">{a.reservas}</td>
                    <td className="px-4 py-2 tabular-nums">{a.perdidos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Estancados */}
            <div className="lg:col-span-2 bg-white border border-[#cbd6e2] rounded-2xl shadow-sm p-5">
              <h2 className="font-bold text-[#33475b] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> Estancados
              </h2>
              <p className="text-xs text-[#516f90] mt-0.5">
                Abiertos con más de {datos.diasEstancado} días en la misma etapa, nada agendado a futuro y ningún seguimiento anotado en ese tiempo.
              </p>
              {datos.estancados.length === 0 ? (
                <p className="text-sm text-[#516f90] mt-4">No hay leads estancados.</p>
              ) : (
                <ul className="mt-3 divide-y divide-slate-100 max-h-[360px] overflow-y-auto">
                  {datos.estancados.map((t) => (
                    <li key={t.id}>
                      <button onClick={() => abrir(t.id)} className="w-full text-left py-2 flex items-center justify-between gap-3 hover:bg-slate-50 px-1">
                        <span className="min-w-0">
                          <span className="font-bold text-[#33475b]">{nombre(t)}</span>
                          <span className="text-xs text-[#516f90]"> · {statusLabel(t.status)} hace {dias(t.etapaDesde)} · {t.asesor || 'Sin asesor'}</span>
                        </span>
                        <span className="text-xs text-[#516f90] shrink-0">
                          {t.ultimo_seguimiento ? `Último seguimiento ${fechaCorta(t.ultimo_seguimiento)}` : 'Nunca se anotó seguimiento'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Motivos de pérdida */}
            <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm p-5">
              <h2 className="font-bold text-[#33475b]">Por qué se pierden</h2>
              <p className="text-xs text-[#516f90] mt-0.5">Leads marcados como perdidos en los últimos {datos.dias} días.</p>
              {datos.perdidas.length === 0 ? (
                <p className="text-sm text-[#516f90] mt-4">Ninguno en el período.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {datos.perdidas.map((m) => {
                    const total = datos.perdidas.reduce((s, x) => s + x.leads, 0);
                    return (
                      <li key={m.motivo}>
                        <div className="flex justify-between text-sm text-[#33475b]">
                          <span>{m.motivo}</span>
                          <span className="tabular-nums font-bold">{m.leads}</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full mt-1">
                          <div className="h-1.5 bg-slate-400 rounded-full" style={{ width: pct(m.leads, total) }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Tablero */}
          <div>
            <h2 className="font-bold text-[#33475b] mb-1">Tablero</h2>
            <p className="text-xs text-[#516f90] mb-3 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0" /> Etapas abiertas de los últimos 60 días o con algo agendado, clientes y perdidos de los últimos 90.
              Cada columna muestra hasta {datos.porColumna}; los asesores mueven las etapas desde la app para que quede quién y por qué.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
              {ETAPAS.map((et) => {
                const c = columna(et.id);
                const tarjetas = datos.tarjetas.filter((t) => t.columna === et.id);
                const vias = entradasDe(et.id);
                return (
                  <div key={et.id} className={`bg-slate-50 border border-[#cbd6e2] border-t-4 ${et.borde} rounded-2xl p-3 flex flex-col`}>
                    <div className="flex items-baseline justify-between px-1">
                      <h3 className="font-bold text-[#33475b]">{et.nombre}</h3>
                      <span className="text-sm font-bold text-[#516f90] tabular-nums">{(c?.leads || 0).toLocaleString('es-CL')}</span>
                    </div>
                    <div className="px-1 text-[11px] text-[#516f90] min-h-[16px]">
                      {c?.atrasados ? <span className="text-red-600 font-bold">{c.atrasados} atrasados </span> : null}
                      {c?.sin_accion ? <span className="text-amber-600 font-bold">{c.sin_accion} sin acción</span> : null}
                    </div>
                    {vias.length > 0 && (
                      <p className="px-1 text-[11px] text-[#516f90]">
                        Entraron en {datos.dias} d: {vias.map((v) => `${v.leads} ${ORIGEN[v.origen] || v.origen}`).join(' · ')}
                      </p>
                    )}
                    <div className="mt-2 space-y-2 max-h-[520px] overflow-y-auto">
                      {tarjetas.map((t) => {
                        const atrasada = t.proximaAccionAt && new Date(t.proximaAccionAt) < new Date();
                        return (
                          <button
                            key={t.id}
                            onClick={() => abrir(t.id)}
                            className={`w-full text-left bg-white rounded-xl border p-2.5 hover:shadow-sm ${atrasada ? 'border-red-200' : 'border-slate-200'}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-sm font-bold text-[#33475b] truncate">{nombre(t)}</span>
                              {t.banda && t.score != null && (
                                <span className={`text-[11px] font-bold px-1.5 rounded-full tabular-nums ${BANDA[t.banda] || BANDA.FRIO}`}>{t.score}</span>
                              )}
                            </div>
                            <p className="text-[11px] text-[#516f90] truncate">
                              {t.asesor || 'Sin asesor'} · {dias(t.etapaDesde)}
                              {t.columna === 'RESERVADO' && t.status !== 'RESERVADO' && ` · ${statusLabel(t.status).replace(/_/g, ' ')}`}
                            </p>
                            {t.proximaAccion && t.proximaAccionAt && (
                              <p className={`text-[11px] mt-0.5 ${atrasada ? 'text-red-600 font-bold' : 'text-[#33475b]'}`}>
                                {t.proximaAccion} · {fechaCorta(t.proximaAccionAt)}
                              </p>
                            )}
                            {t.motivoPerdida && <p className="text-[11px] mt-0.5 text-[#516f90]">{t.motivoPerdida}</p>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
