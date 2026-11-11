'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Save, Loader2 } from 'lucide-react';
import {
  AGENTE_CORTO,
  ESTADO_COLOR,
  ESTADO_ETIQUETA,
  TIPO_ETIQUETA,
  pedir,
  type AgenteId,
  type Conocimiento as Fila,
  type Estado,
  type Tipo,
} from './tipos';

const ESTADOS: Estado[] = ['por_revisar', 'aprobada', 'corregir', 'archivada'];
const AGENTES: AgenteId[] = ['atraccion', 'calificador', 'cierre'];

/**
 * Objeciones, datos y reglas. Con `agente` muestra solo las de ese agente.
 * Solo "Aprobada" llega a la IA; para aprobar tiene que haber respuesta.
 */
export default function Conocimiento({ agente, onCambio }: { agente: AgenteId | null; onCambio?: () => void }) {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<Estado | 'todas'>('todas');
  const [error, setError] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const q = agente ? `?agente=${agente}` : '';
      const r = await pedir<{ conocimiento: Fila[] }>(`/api/agentes-ia/conocimiento${q}`);
      setFilas(r.conocimiento);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [agente]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const visibles = useMemo(
    () => filas.filter((f) => (filtro === 'todas' ? f.estado !== 'archivada' : f.estado === filtro)),
    [filas, filtro]
  );
  const conteo = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of filas) c[f.estado] = (c[f.estado] || 0) + 1;
    return c;
  }, [filas]);

  const guardada = (f: Fila) => {
    setFilas((prev) => {
      const existe = prev.some((p) => p.id === f.id);
      return existe ? prev.map((p) => (p.id === f.id ? f : p)) : [f, ...prev];
    });
    onCambio?.();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFiltro('todas')}
          className={`px-3 py-1 rounded-full text-xs font-semibold border ${filtro === 'todas' ? 'bg-[#2d544c] text-white border-[#2d544c]' : 'bg-white text-[#516f90] border-[#cbd6e2]'}`}
        >
          Activas ({filas.filter((f) => f.estado !== 'archivada').length})
        </button>
        {ESTADOS.map((e) => (
          <button
            key={e}
            onClick={() => setFiltro(e)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border ${filtro === e ? 'bg-[#2d544c] text-white border-[#2d544c]' : ESTADO_COLOR[e]}`}
          >
            {ESTADO_ETIQUETA[e]} ({conteo[e] || 0})
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setNueva((v) => !v)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#2d544c] text-white hover:opacity-90"
        >
          <Plus className="w-3.5 h-3.5" /> Agregar
        </button>
      </div>

      <p className="text-xs text-[#516f90]">
        Solo lo <b>Aprobada</b> llega a la IA. Lo nuevo siempre entra como «Por revisar».
      </p>

      {nueva && (
        <FilaEditable
          fila={null}
          agenteInicial={agente}
          onGuardada={(f) => {
            guardada(f);
            setNueva(false);
          }}
        />
      )}

      {error && <p className="text-sm text-rose-700">{error}</p>}
      {cargando ? (
        <div className="flex items-center gap-2 text-sm text-[#516f90]">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
        </div>
      ) : visibles.length === 0 ? (
        <p className="text-sm text-[#516f90]">No hay filas con este filtro.</p>
      ) : (
        <div className="space-y-3">
          {visibles.map((f) => (
            <FilaEditable key={f.id} fila={f} agenteInicial={agente} onGuardada={guardada} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilaEditable({
  fila,
  agenteInicial,
  onGuardada,
}: {
  fila: Fila | null;
  agenteInicial: AgenteId | null;
  onGuardada: (f: Fila) => void;
}) {
  const [tipo, setTipo] = useState<Tipo>(fila?.tipo || 'objecion');
  const [tema, setTema] = useState(fila?.tema || '');
  const [comoLoDice, setComoLoDice] = useState(fila?.como_lo_dice || '');
  const [respuesta, setRespuesta] = useState(fila?.respuesta || '');
  const [nota, setNota] = useState(fila?.nota || '');
  const [estado, setEstado] = useState<Estado>(fila?.estado || 'por_revisar');
  const [agentes, setAgentes] = useState<AgenteId[]>(fila?.agentes || [agenteInicial || 'atraccion']);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cambiado =
    !fila ||
    tipo !== fila.tipo ||
    tema !== fila.tema ||
    comoLoDice !== (fila.como_lo_dice || '') ||
    respuesta !== fila.respuesta ||
    nota !== (fila.nota || '') ||
    estado !== fila.estado ||
    agentes.slice().sort().join() !== fila.agentes.slice().sort().join();

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const cuerpo = { tipo, tema, como_lo_dice: comoLoDice, respuesta, nota, agentes, ...(fila ? { estado } : {}) };
      const r = fila
        ? await pedir<{ conocimiento: Fila }>(`/api/agentes-ia/conocimiento/${fila.id}`, { method: 'PATCH', body: JSON.stringify(cuerpo) })
        : await pedir<{ conocimiento: Fila }>(`/api/agentes-ia/conocimiento`, { method: 'POST', body: JSON.stringify(cuerpo) });
      onGuardada(r.conocimiento);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  const entrada = 'w-full rounded-lg border border-[#cbd6e2] bg-white px-3 py-2 text-sm text-[#33475b] focus:outline-none focus:border-[#2d544c]';

  return (
    <div className="rounded-xl border border-[#cbd6e2] bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)} className="rounded-md border border-[#cbd6e2] px-2 py-1 text-xs font-semibold text-[#33475b]">
          {(Object.keys(TIPO_ETIQUETA) as Tipo[]).map((t) => (
            <option key={t} value={t}>{TIPO_ETIQUETA[t]}</option>
          ))}
        </select>
        <input value={tema} onChange={(e) => setTema(e.target.value)} placeholder="Tema" className="flex-1 min-w-[180px] rounded-md border border-transparent hover:border-[#cbd6e2] focus:border-[#2d544c] px-2 py-1 text-sm font-bold text-[#33475b] focus:outline-none" />
        {fila?.menciones ? <span className="text-xs text-[#516f90] tabular-nums">{fila.menciones.toLocaleString('es-CL')} menciones</span> : null}
        {fila && (
          <select value={estado} onChange={(e) => setEstado(e.target.value as Estado)} className={`rounded-full border px-2 py-1 text-xs font-semibold ${ESTADO_COLOR[estado]}`}>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>{ESTADO_ETIQUETA[e]}</option>
            ))}
          </select>
        )}
      </div>

      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#516f90]">Cómo lo dice el cliente</span>
        <textarea value={comoLoDice} onChange={(e) => setComoLoDice(e.target.value)} rows={2} className={entrada} />
      </label>
      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#516f90]">Respuesta que usa la IA</span>
        <textarea value={respuesta} onChange={(e) => setRespuesta(e.target.value)} rows={3} placeholder="Vacía: la IA deriva al asesor en este tema." className={entrada} />
      </label>
      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#516f90]">Nota para el equipo (no llega a la IA)</span>
        <input value={nota} onChange={(e) => setNota(e.target.value)} className={entrada} />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-[#516f90]">Lo usa:</span>
        {AGENTES.map((a) => (
          <label key={a} className="flex items-center gap-1 text-xs text-[#33475b]">
            <input
              type="checkbox"
              checked={agentes.includes(a)}
              onChange={(e) => setAgentes((prev) => (e.target.checked ? Array.from(new Set([...prev, a])) : prev.filter((x) => x !== a)))}
            />
            {AGENTE_CORTO[a]}
          </label>
        ))}
        {fila?.fuente && <span className="text-xs text-[#516f90]">· Fuente: {fila.fuente}</span>}
        <div className="flex-1" />
        {error && <span className="text-xs text-rose-700">{error}</span>}
        <button
          onClick={guardar}
          disabled={!cambiado || guardando || !tema.trim()}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#2d544c] text-white disabled:opacity-40"
        >
          {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {fila ? 'Guardar' : 'Crear'}
        </button>
      </div>
    </div>
  );
}
