'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Kanban, RefreshCcw, Info } from 'lucide-react';
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

type Datos = {
  listo: boolean;
  dias: number;
  porColumna: number;
  asesores: { id: string; name: string }[];
  columnas: { columna: string; leads: number }[];
  tarjetas: Tarjeta[];
};

const ETAPAS = [
  { id: 'NUEVO', nombre: 'Nuevo', borde: 'border-t-blue-500' },
  { id: 'CONTACTADO', nombre: 'Contactado', borde: 'border-t-orange-500' },
  { id: 'VISITA', nombre: 'Visita', borde: 'border-t-green-500' },
  { id: 'RESERVADO', nombre: 'Reservado / cliente', borde: 'border-t-emerald-600' },
  { id: 'PERDIDO', nombre: 'Perdido', borde: 'border-t-slate-400' },
];

const BANDA: Record<string, string> = {
  CALIENTE: 'bg-orange-100 text-orange-700',
  TIBIO: 'bg-amber-100 text-amber-700',
  TEMPLADO: 'bg-sky-100 text-sky-700',
  FRIO: 'bg-slate-100 text-slate-600',
};

const PERIODOS = [7, 30, 90];

const nombre = (t: Tarjeta) => [t.firstName, t.lastName].filter(Boolean).join(' ') || 'Sin nombre';

function dias(fecha: string | null) {
  if (!fecha) return '—';
  const d = Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
  return d <= 0 ? 'hoy' : `hace ${d} d`;
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

  if (datos && !datos.listo) {
    return (
      <div className="p-8 text-[#516f90]">
        Faltan las tablas del pipeline en la base. Hay que aplicar migrations_manual/2026-10-26_pipeline.sql del CRM móvil.
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#2d544c] flex items-center gap-2">
            <Kanban className="w-7 h-7 text-[#2d544c]" /> Pipeline
          </h1>
          <p className="text-[#516f90] mt-1">En qué etapa va cada cliente. Los asesores mueven las etapas desde la app.</p>
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

      {datos && (
        <>
          <p className="text-xs text-[#516f90] flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0" /> Leads que entraron a su etapa en los últimos {datos.dias} días. Cada columna muestra
            los {datos.porColumna} más recientes.
          </p>
          <div className={`grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 ${cargando ? 'opacity-60' : ''}`}>
            {ETAPAS.map((et) => {
              const total = datos.columnas.find((c) => c.columna === et.id)?.leads || 0;
              const tarjetas = datos.tarjetas.filter((t) => t.columna === et.id);
              return (
                <div key={et.id} className={`bg-slate-50 border border-[#cbd6e2] border-t-4 ${et.borde} rounded-2xl p-3 flex flex-col`}>
                  <div className="flex items-baseline justify-between px-1">
                    <h3 className="font-bold text-[#33475b]">{et.nombre}</h3>
                    <span className="text-sm font-bold text-[#516f90] tabular-nums">{total.toLocaleString('es-CL')}</span>
                  </div>
                  <div className="mt-2 space-y-2 max-h-[640px] overflow-y-auto">
                    {tarjetas.length === 0 && <p className="text-xs text-[#516f90] px-1 py-4 text-center">Sin leads</p>}
                    {tarjetas.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => router.push(`/contacts?lead=${t.id}`)}
                        className="w-full text-left bg-white rounded-xl border border-slate-200 p-2.5 hover:shadow-sm"
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
                          <p className="text-[11px] mt-0.5 text-[#33475b]">
                            {t.proximaAccion} · {fechaCorta(t.proximaAccionAt)}
                          </p>
                        )}
                        {t.motivoPerdida && <p className="text-[11px] mt-0.5 text-[#516f90]">{t.motivoPerdida}</p>}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
