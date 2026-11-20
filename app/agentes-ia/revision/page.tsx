'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, ChevronDown, ChevronRight, Loader2, Play, RefreshCcw, X } from 'lucide-react';
import { pedir } from '../tipos';

/**
 * Revisión semanal de Ali (Fase 1, 20-11-2026): un juez (Haiku) califica cada
 * lunes las conversaciones reales de Ali con una pauta (lib/revision_ali.ts).
 * Aquí se ven los errores y se marcan como "error real" (pasa a caso de
 * prueba) o "falso aviso" (sirve para ajustar al juez).
 */

const CRITERIOS: Record<string, string> = {
  no_respondio: 'No respondió lo que le dijeron',
  vendio_en_cierre: 'Vendió en un cierre',
  precio_mal: 'Precio incompleto o repetido',
  insistio: 'Insistió',
  repitio: 'Repitió',
  dato_dudoso: 'Dato dudoso',
  sono_a_bot: 'Sonó a bot',
  pidio_de_mas: 'Pidió datos de más',
  derivacion: 'Derivación',
};
const CANAL: Record<string, string> = { web: 'Chat web', instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp' };
const GRAVEDAD: Record<string, string> = {
  alta: 'bg-rose-100 text-rose-800 border-rose-200',
  media: 'bg-amber-100 text-amber-800 border-amber-200',
  baja: 'bg-slate-100 text-slate-700 border-slate-200',
};

interface ErrorAli {
  criterio: string;
  gravedad: 'alta' | 'media' | 'baja';
  cita: string;
  explicacion: string;
}
interface Fila {
  id: number;
  conversacion_id: string;
  canal: string;
  nombre: string | null;
  nota: number;
  errores: ErrorAli[];
  resumen: string | null;
  abandono: boolean;
  transcripcion: string;
  estado: 'pendiente' | 'real' | 'falso';
  ultimo_mensaje_at: string | null;
}
interface Semana {
  semana: string;
  revisadas: number;
  errores: number;
  costo_usd: string;
  error: string | null;
}
interface Datos {
  semanas: Semana[];
  semana: string | null;
  filas: Fila[];
  enCurso: boolean;
}

const fecha = (s: string) =>
  new Date(`${s}T12:00:00`).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
const boton = (activo: boolean) =>
  `text-sm font-semibold rounded-xl px-3 py-1.5 border ${activo ? 'bg-[#2d544c] text-white border-[#2d544c]' : 'bg-white text-[#2d544c] border-[#9fc79b] hover:bg-[#e8f3e6]'}`;
const colorNota = (n: number) => (n >= 85 ? 'text-emerald-700' : n >= 60 ? 'text-amber-700' : 'text-rose-700');

function FilaConversacion({ f, onEstado }: { f: Fila; onEstado: (id: number, estado: Fila['estado']) => void }) {
  const [abierta, setAbierta] = useState(false);
  const alta = f.errores.some((e) => e.gravedad === 'alta');
  return (
    <li className={`border rounded-xl bg-white ${alta && f.estado === 'pendiente' ? 'border-rose-200' : 'border-[#cbd6e2]'}`}>
      <div className="flex items-center gap-3 px-3 py-2">
        <button onClick={() => setAbierta((v) => !v)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
          {abierta ? <ChevronDown className="w-4 h-4 text-[#516f90] shrink-0" /> : <ChevronRight className="w-4 h-4 text-[#516f90] shrink-0" />}
          <span className={`text-lg font-extrabold tabular-nums w-10 shrink-0 ${colorNota(f.nota)}`}>{f.nota}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#33475b] truncate">
              {f.nombre || 'Sin nombre'} <span className="font-normal text-[#516f90]">· {CANAL[f.canal] || f.canal}</span>
              {f.abandono && <span className="ml-2 text-[11px] font-bold text-rose-700">dejó de responder</span>}
            </p>
            <p className="text-xs text-[#516f90] truncate">
              {f.errores.length ? f.errores.map((e) => CRITERIOS[e.criterio] || e.criterio).join(' · ') : f.resumen || 'Sin errores'}
            </p>
          </div>
        </button>
        {f.errores.length > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onEstado(f.id, f.estado === 'real' ? 'pendiente' : 'real')}
              className={`text-xs font-bold rounded-lg px-2 py-1 border inline-flex items-center gap-1 ${f.estado === 'real' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50'}`}
            >
              <Check className="w-3.5 h-3.5" /> Error real
            </button>
            <button
              onClick={() => onEstado(f.id, f.estado === 'falso' ? 'pendiente' : 'falso')}
              className={`text-xs font-bold rounded-lg px-2 py-1 border inline-flex items-center gap-1 ${f.estado === 'falso' ? 'bg-slate-600 text-white border-slate-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
            >
              <X className="w-3.5 h-3.5" /> Falso aviso
            </button>
          </div>
        )}
      </div>
      {abierta && (
        <div className="px-4 pb-3 pt-2 border-t border-[#eef2f6] space-y-3">
          {f.resumen && <p className="text-sm text-[#33475b]"><b>Juez:</b> {f.resumen}</p>}
          {f.errores.length > 0 && (
            <ul className="space-y-2">
              {f.errores.map((e, i) => (
                <li key={i} className={`text-sm rounded-lg border px-3 py-2 ${GRAVEDAD[e.gravedad]}`}>
                  <p className="font-bold">{CRITERIOS[e.criterio] || e.criterio} · gravedad {e.gravedad}</p>
                  <p className="italic mt-0.5">«{e.cita}»</p>
                  <p className="mt-0.5">{e.explicacion}</p>
                </li>
              ))}
            </ul>
          )}
          <details>
            <summary className="text-xs font-semibold text-[#516f90] cursor-pointer">Ver conversación</summary>
            <pre className="mt-2 text-xs text-[#33475b] whitespace-pre-wrap bg-[#f5f8fa] rounded-lg p-3 max-h-[28rem] overflow-y-auto font-sans">
              {f.transcripcion}
            </pre>
          </details>
        </div>
      )}
    </li>
  );
}

export default function RevisionPage() {
  const [semana, setSemana] = useState('');
  const [ver, setVer] = useState<'errores' | 'pendientes' | 'todas'>('errores');
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const q = semana ? `?semana=${semana}` : '';
      setDatos(await pedir<Datos>(`/api/agentes-ia/revision${q}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [semana]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Mientras corre, consulta cada 15 segundos.
  useEffect(() => {
    if (!datos?.enCurso) return;
    const t = setInterval(cargar, 15_000);
    return () => clearInterval(t);
  }, [datos?.enCurso, cargar]);

  const correr = async () => {
    try {
      await pedir('/api/agentes-ia/revision', { method: 'POST' });
      setDatos((d) => (d ? { ...d, enCurso: true } : d));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const marcar = async (id: number, estado: Fila['estado']) => {
    setDatos((d) => d && { ...d, filas: d.filas.map((f) => (f.id === id ? { ...f, estado } : f)) });
    try {
      await pedir('/api/agentes-ia/revision', { method: 'PATCH', body: JSON.stringify({ id, estado }) });
    } catch (e) {
      setError((e as Error).message);
      cargar();
    }
  };

  const filas = datos?.filas || [];
  const lista = filas.filter((f) =>
    ver === 'todas' ? true : ver === 'pendientes' ? f.errores.length > 0 && f.estado === 'pendiente' : f.errores.length > 0
  );
  const resumen = useMemo(() => {
    const conErrores = filas.filter((f) => f.errores.length);
    const porCriterio = new Map<string, number>();
    for (const f of filas) for (const e of f.errores) porCriterio.set(e.criterio, (porCriterio.get(e.criterio) || 0) + 1);
    return {
      revisadas: filas.length,
      conErrores: conErrores.length,
      promedio: filas.length ? Math.round(filas.reduce((a, f) => a + f.nota, 0) / filas.length) : 0,
      abandonos: filas.filter((f) => f.abandono).length,
      reales: filas.filter((f) => f.estado === 'real').length,
      falsos: filas.filter((f) => f.estado === 'falso').length,
      criterios: Array.from(porCriterio.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [filas]);
  const corrida = datos?.semanas.find((s) => s.semana === datos.semana);

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-5 bg-[#f5f8fa] min-h-screen">
      <header className="flex items-start gap-4">
        <div className="flex-1">
          <Link href="/agentes-ia" className="inline-flex items-center gap-1 text-xs font-semibold text-[#516f90] hover:underline">
            <ArrowLeft className="w-3.5 h-3.5" /> Agentes IA
          </Link>
          <h1 className="text-2xl font-bold text-[#2d544c] mt-1">Revisión semanal de Ali</h1>
          <p className="text-sm text-[#516f90] mt-1">
            Cada lunes un juez revisa las conversaciones reales de Ali de los últimos 7 días con una pauta fija. Marca cada caso
            como <b>error real</b> o <b>falso aviso</b>: los reales se convierten en casos de prueba y los falsos sirven para
            afinar al juez.
          </p>
        </div>
        <button
          onClick={correr}
          disabled={datos?.enCurso}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold border border-[#2d544c] text-white bg-[#2d544c] hover:bg-[#244640] disabled:opacity-60 shrink-0"
        >
          {datos?.enCurso ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {datos?.enCurso ? 'Revisando…' : 'Revisar ahora'}
        </button>
        <button onClick={cargar} className="p-2 rounded-lg border border-[#cbd6e2] bg-white shrink-0" aria-label="Actualizar">
          <RefreshCcw className={`w-4 h-4 text-[#516f90] ${cargando ? 'animate-spin' : ''}`} />
        </button>
      </header>

      <section className="bg-white rounded-2xl border border-[#9fc79b] p-4 flex flex-wrap items-center gap-2">
        {([['errores', 'Con errores'], ['pendientes', 'Por marcar'], ['todas', 'Todas']] as const).map(([id, nombre]) => (
          <button key={id} onClick={() => setVer(id)} className={boton(ver === id)}>{nombre}</button>
        ))}
        <span className="w-px h-6 bg-[#cbd6e2] mx-1" />
        <select
          value={datos?.semana || ''}
          onChange={(e) => setSemana(e.target.value)}
          className="text-sm rounded-xl border border-[#9fc79b] px-3 py-1.5 bg-white text-[#33475b]"
        >
          {!datos?.semanas.length && <option value="">Sin revisiones todavía</option>}
          {(datos?.semanas || []).map((s) => (
            <option key={s.semana} value={s.semana}>Semana del {fecha(s.semana)}</option>
          ))}
        </select>
        {corrida && (
          <span className="text-xs text-[#516f90]">Costo US${Number(corrida.costo_usd).toFixed(3)}</span>
        )}
      </section>

      {corrida?.error && (
        <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">La revisión falló: {corrida.error}</p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['Revisadas', String(resumen.revisadas), 'text-[#33475b]'],
          ['Con errores', String(resumen.conErrores), 'text-rose-700'],
          ['Nota promedio', String(resumen.promedio), colorNota(resumen.promedio)],
          ['Dejaron de responder', String(resumen.abandonos), 'text-amber-700'],
        ].map(([t, v, c]) => (
          <div key={t} className="rounded-xl border border-[#cbd6e2] bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[#516f90]">{t}</p>
            <p className={`text-2xl font-extrabold tabular-nums mt-1 ${c}`}>{v}</p>
          </div>
        ))}
      </div>

      {resumen.criterios.length > 0 && (
        <section className="bg-white rounded-2xl border border-[#cbd6e2] p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#516f90] mb-2">Errores más repetidos</p>
          <ul className="flex flex-wrap gap-2">
            {resumen.criterios.map(([c, n]) => (
              <li key={c} className="text-sm rounded-lg border border-[#e6c3a5] bg-[#fdf6ef] px-3 py-1 text-[#33475b]">
                {CRITERIOS[c] || c} <b className="tabular-nums">{n}</b>
              </li>
            ))}
          </ul>
          <p className="text-xs text-[#516f90] mt-3">
            Marcados: {resumen.reales} errores reales y {resumen.falsos} falsos avisos.
          </p>
        </section>
      )}

      {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">{error}</p>}

      {cargando && !datos ? (
        <p className="text-sm text-[#516f90] inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</p>
      ) : !lista.length ? (
        <p className="text-sm text-[#516f90] bg-white rounded-xl border border-[#cbd6e2] px-4 py-6 text-center">
          {!datos?.semanas.length
            ? 'Todavía no hay revisiones. La primera corre el lunes después de las 10:30, o aprieta "Revisar ahora".'
            : ver === 'todas'
              ? 'No hay conversaciones revisadas esta semana.'
              : 'No hay errores por mostrar con este filtro.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {lista.map((f) => <FilaConversacion key={f.id} f={f} onEstado={marcar} />)}
        </ul>
      )}
    </div>
  );
}
