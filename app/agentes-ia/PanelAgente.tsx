'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Save, Loader2, RotateCcw, Lock, FlaskConical } from 'lucide-react';
import Conocimiento from './Conocimiento';
import {
  MODELOS,
  modeloCorto,
  pedir,
  usd,
  type Agente,
  type Calificacion,
  type Gasto,
  type Version,
} from './tipos';

type Pestana = 'instrucciones' | 'conocimiento' | 'herramientas' | 'gasto' | 'calificaciones' | 'historial';

export default function PanelAgente({
  agente,
  gasto,
  onCerrar,
  onGuardado,
}: {
  agente: Agente;
  gasto: Gasto | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [pestana, setPestana] = useState<Pestana>('instrucciones');
  const [versiones, setVersiones] = useState<Version[]>([]);

  const cargarVersiones = useCallback(async () => {
    try {
      const r = await pedir<{ versiones: Version[] }>(`/api/agentes-ia/${agente.id}`);
      setVersiones(r.versiones);
    } catch {
      setVersiones([]);
    }
  }, [agente.id]);

  useEffect(() => {
    setPestana('instrucciones');
    cargarVersiones();
  }, [agente.id, cargarVersiones]);

  const pestanas: { id: Pestana; nombre: string }[] = [
    { id: 'instrucciones', nombre: 'Instrucciones' },
    { id: 'conocimiento', nombre: 'Conocimiento' },
    { id: 'herramientas', nombre: 'Herramientas' },
    { id: 'gasto', nombre: 'Gasto' },
    ...(agente.id === 'calificador' ? [{ id: 'calificaciones' as Pestana, nombre: 'Calificaciones' }] : []),
    { id: 'historial', nombre: 'Historial' },
  ];

  const guardar = async (cambios: Record<string, unknown>) => {
    const r = await pedir<{ versiones: Version[] }>(`/api/agentes-ia/${agente.id}`, { method: 'PUT', body: JSON.stringify(cambios) });
    setVersiones(r.versiones);
    onGuardado();
  };

  return (
    <aside className="fixed right-0 top-0 h-screen w-full max-w-[560px] bg-[#f6f9fc] border-l border-[#cbd6e2] shadow-2xl z-50 flex flex-col">
      <div className="px-6 py-4 bg-white border-b border-[#cbd6e2] flex items-start gap-3">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-[#2d544c]">{agente.nombre}</h2>
          <p className="text-sm text-[#516f90] mt-1">{agente.rol}</p>
          <p className="text-xs text-[#516f90] mt-2">
            {modeloCorto(agente.modelo)} · versión {agente.version} ·{' '}
            {agente.enConstruccion ? 'En construcción' : agente.activo ? 'Encendido' : 'Apagado'}
          </p>
        </div>
        <button onClick={onCerrar} className="p-1 rounded hover:bg-[#f6f9fc]" aria-label="Cerrar">
          <X className="w-5 h-5 text-[#516f90]" />
        </button>
      </div>
      <nav className="px-4 bg-white border-b border-[#cbd6e2] flex gap-1 overflow-x-auto">
        {pestanas.map((p) => (
          <button
            key={p.id}
            onClick={() => setPestana(p.id)}
            className={`px-3 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 ${pestana === p.id ? 'border-[#2d544c] text-[#2d544c]' : 'border-transparent text-[#516f90] hover:text-[#33475b]'}`}
          >
            {p.nombre}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto p-6">
        {pestana === 'instrucciones' && <Instrucciones agente={agente} onGuardar={guardar} />}
        {pestana === 'conocimiento' && <Conocimiento agente={agente.id} onCambio={onGuardado} />}
        {pestana === 'herramientas' && <Herramientas agente={agente} onGuardar={guardar} />}
        {pestana === 'gasto' && <GastoAgente agente={agente} gasto={gasto} />}
        {pestana === 'calificaciones' && <Calificaciones />}
        {pestana === 'historial' && (
          <Historial
            versiones={versiones}
            onRestaurar={async (id) => {
              const r = await pedir<{ versiones: Version[] }>(`/api/agentes-ia/${agente.id}`, { method: 'POST', body: JSON.stringify({ restaurar: id }) });
              setVersiones(r.versiones);
              onGuardado();
            }}
          />
        )}
      </div>
    </aside>
  );
}

function Instrucciones({ agente, onGuardar }: { agente: Agente; onGuardar: (c: Record<string, unknown>) => Promise<void> }) {
  const [texto, setTexto] = useState(agente.instrucciones);
  const [modelo, setModelo] = useState(agente.modelo);
  const [activo, setActivo] = useState(agente.activo);
  const [nota, setNota] = useState('');
  const [estado, setEstado] = useState<'listo' | 'guardando' | 'guardado' | string>('listo');

  useEffect(() => {
    setTexto(agente.instrucciones);
    setModelo(agente.modelo);
    setActivo(agente.activo);
  }, [agente]);

  const cambiado = texto !== agente.instrucciones || modelo !== agente.modelo || activo !== agente.activo;

  const guardar = async () => {
    setEstado('guardando');
    try {
      await onGuardar({ instrucciones: texto, modelo, activo, nota });
      setNota('');
      setEstado('guardado');
    } catch (e) {
      setEstado((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-[#33475b]">
          <input type="checkbox" checked={activo} disabled={agente.enConstruccion} onChange={(e) => setActivo(e.target.checked)} />
          Encendido
        </label>
        <label className="flex items-center gap-2 text-sm text-[#33475b]">
          Modelo
          <select value={modelo} onChange={(e) => setModelo(e.target.value)} className="rounded-md border border-[#cbd6e2] px-2 py-1 text-sm">
            {MODELOS.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre}</option>
            ))}
          </select>
        </label>
      </div>
      {agente.enConstruccion && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Este agente todavía no corre: se puede ir escribiendo su criterio, pero no se puede encender.
        </p>
      )}
      {agente.id === 'cierre' && (
        <p className="text-xs text-[#516f90]">
          Atiende el chat (web, Instagram y Facebook) de quien llegó a la visita y no ha reservado. Usa el mismo motor que Ali, con sus reglas de cierre que viven en el sitio; lo de aquí se suma encima. Cuando la persona quiere reservar, pasa al asesor. Si está apagado, esas personas las sigue atendiendo Ali.
        </p>
      )}
      {agente.id === 'atraccion' && (
        <p className="text-xs text-[#516f90]">
          Esto se suma a las reglas base de Ali que viven en el sitio (estilo, precios vigentes, lo que nunca dice). Si lo de aquí o una respuesta aprobada las contradice, Ali usa lo de aquí. Ali lo lee cada 5 minutos.
        </p>
      )}
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Instrucciones extra para este agente. Lo que escribas aquí le llega tal cual."
        rows={16}
        className="w-full rounded-xl border border-[#cbd6e2] bg-white px-4 py-3 text-sm font-mono text-[#33475b] focus:outline-none focus:border-[#2d544c]"
      />
      <input
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="¿Qué cambiaste? (queda en el historial)"
        className="w-full rounded-lg border border-[#cbd6e2] bg-white px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={guardar}
          disabled={!cambiado || estado === 'guardando'}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-[#2d544c] text-white disabled:opacity-40"
        >
          {estado === 'guardando' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar versión
        </button>
        {estado === 'guardado' && <span className="text-xs text-emerald-700">Guardado</span>}
        {!['listo', 'guardando', 'guardado'].includes(estado) && <span className="text-xs text-rose-700">{estado}</span>}
      </div>
    </div>
  );
}

function Herramientas({ agente, onGuardar }: { agente: Agente; onGuardar: (c: Record<string, unknown>) => Promise<void> }) {
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cambiar = async (nombre: string, activa: boolean) => {
    setGuardando(nombre);
    setError(null);
    try {
      await onGuardar({ herramientas: { [nombre]: activa }, nota: `${activa ? 'Prendió' : 'Apagó'} ${nombre}` });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#516f90]">Lo que el agente puede hacer mientras conversa. Las que tienen candado no se pueden apagar.</p>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      {agente.herramientas.map((h) => (
        <div key={h.nombre} className="flex items-start gap-3 rounded-xl border border-[#cbd6e2] bg-white p-4">
          <div className="flex-1">
            <p className="font-mono text-sm font-bold text-[#33475b] flex items-center gap-1.5">
              {h.nombre} {h.fija && <Lock className="w-3.5 h-3.5 text-[#516f90]" />}
            </p>
            <p className="text-sm text-[#516f90] mt-1">{h.descripcion}</p>
          </div>
          {guardando === h.nombre ? (
            <Loader2 className="w-5 h-5 animate-spin text-[#2d544c]" />
          ) : (
            <button
              role="switch"
              aria-checked={h.activa}
              aria-label={`${h.activa ? 'Apagar' : 'Prender'} ${h.nombre}`}
              disabled={h.fija}
              onClick={() => cambiar(h.nombre, !h.activa)}
              className={`relative w-11 h-6 rounded-full transition ${h.activa ? 'bg-[#2d544c]' : 'bg-[#cbd6e2]'} disabled:opacity-50`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition ${h.activa ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function GastoAgente({ agente, gasto }: { agente: Agente; gasto: Gasto | null }) {
  const filas = useMemo(() => (gasto?.porAgente || []).filter((g) => g.agente === agente.id), [gasto, agente.id]);
  const dias = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of gasto?.porDia || []) if (d.agente === agente.id) m.set(d.dia, (m.get(d.dia) || 0) + d.costo);
    const lista: { dia: string; costo: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const f = new Date(Date.now() - i * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
      lista.push({ dia: f, costo: m.get(f) || 0 });
    }
    return lista;
  }, [gasto, agente.id]);
  const max = Math.max(...dias.map((d) => d.costo), 0);
  const total = filas.reduce((a, f) => a + f.costo, 0);

  if (!gasto) return <p className="text-sm text-[#516f90]">Sin datos de gasto.</p>;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[#cbd6e2] bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-[#516f90]">Este mes</p>
        <p className="text-3xl font-extrabold text-[#33475b] tabular-nums mt-1">{usd(total)}</p>
        <p className="text-xs text-[#516f90] mt-1">{filas.reduce((a, f) => a + f.llamadas, 0).toLocaleString('es-CL')} llamadas al modelo</p>
      </div>
      {filas.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[#516f90]">
              <th className="py-1">Modelo</th>
              <th className="py-1 text-right">Tokens entrada</th>
              <th className="py-1 text-right">Tokens salida</th>
              <th className="py-1 text-right">Costo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#cbd6e2]">
            {filas.map((f) => (
              <tr key={f.modelo}>
                <td className="py-1.5">{modeloCorto(f.modelo)}</td>
                <td className="py-1.5 text-right tabular-nums">{f.entrada.toLocaleString('es-CL')}</td>
                <td className="py-1.5 text-right tabular-nums">{f.salida.toLocaleString('es-CL')}</td>
                <td className="py-1.5 text-right tabular-nums font-semibold">{usd(f.costo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-[#516f90] mb-2">Últimos 30 días</p>
        <div className="flex items-end gap-[3px] h-32 rounded-xl border border-[#cbd6e2] bg-white p-3">
          {dias.map((d) => (
            <div key={d.dia} className="flex-1 h-full flex items-end" title={`${d.dia}: ${usd(d.costo)}`}>
              <div className="w-full rounded-t bg-[#2d544c]" style={{ height: max ? `${Math.max(2, (d.costo / max) * 100)}%` : '2px', opacity: d.costo ? 1 : 0.2 }} />
            </div>
          ))}
        </div>
        <p className="text-[11px] text-[#516f90] mt-1">Máximo diario: {usd(max)}</p>
      </div>
    </div>
  );
}

function Calificaciones() {
  const [filas, setFilas] = useState<Calificacion[]>([]);
  const [probando, setProbando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    pedir<{ calificaciones: Calificacion[] }>('/api/agentes-ia/calificaciones')
      .then((r) => setFilas(r.calificaciones))
      .catch((e) => setMensaje((e as Error).message));
  }, []);

  const probar = async () => {
    if (!confirm('Esto califica 3 conversaciones reales con Sonnet y gasta tokens. ¿Seguir?')) return;
    setProbando(true);
    setMensaje(null);
    try {
      const r = await pedir<{ resultado: { calificadas: number; revisadas: number; errores: number; costoUSD: number; motivo?: string }; calificaciones: Calificacion[] }>(
        '/api/agentes-ia/calificaciones',
        { method: 'POST', body: JSON.stringify({ limite: 3 }) }
      );
      setFilas(r.calificaciones);
      const x = r.resultado;
      setMensaje(x.motivo ? x.motivo : `${x.calificadas} de ${x.revisadas} calificadas, ${x.errores} errores, ${usd(x.costoUSD)}.`);
    } catch (e) {
      setMensaje((e as Error).message);
    } finally {
      setProbando(false);
    }
  };

  const sino = (v: boolean | null) => (v === true ? 'Sí' : v === false ? 'No' : '—');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={probar} disabled={probando} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold bg-[#2d544c] text-white disabled:opacity-40">
          {probando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />} Probar con 3 conversaciones
        </button>
        {mensaje && <span className="text-xs text-[#516f90]">{mensaje}</span>}
      </div>
      {filas.length === 0 ? (
        <p className="text-sm text-[#516f90]">Todavía no hay calificaciones.</p>
      ) : (
        filas.map((c) => (
          <div key={c.conversacion_id} className="rounded-xl border border-[#cbd6e2] bg-white p-4 space-y-2">
            <div className="flex items-center gap-2">
              <p className="font-bold text-[#33475b] flex-1">{c.nombre || 'Sin nombre'} <span className="text-xs font-normal text-[#516f90]">· {c.canal}</span></p>
              <span className="text-xs font-semibold rounded-full border border-[#cbd6e2] px-2 py-0.5">{c.categoria || '—'}</span>
              <span className="text-lg font-extrabold tabular-nums text-[#2d544c]">{c.puntaje ?? '—'}</span>
            </div>
            <p className="text-sm text-[#33475b]">{c.resumen}</p>
            <p className="text-xs text-[#516f90]">
              Pie: {sino(c.tiene_pie)}{c.pie_monto ? ` ($${c.pie_monto.toLocaleString('es-CL')})` : ''} · Pago: {c.forma_pago || '—'} · Plazo: {c.plazo_compra || '—'} · Uso: {c.uso || '—'} · Proyecto: {c.proyecto || '—'} · Visita: {sino(c.quiere_visitar)}
            </p>
            {c.objeciones && c.objeciones.length > 0 && <p className="text-xs text-[#516f90]">Objeciones: {c.objeciones.join(', ')}</p>}
          </div>
        ))
      )}
    </div>
  );
}

function Historial({ versiones, onRestaurar }: { versiones: Version[]; onRestaurar: (id: number) => Promise<void> }) {
  const [restaurando, setRestaurando] = useState<number | null>(null);
  if (!versiones.length) return <p className="text-sm text-[#516f90]">Todavía no hay versiones anteriores.</p>;
  return (
    <div className="space-y-3">
      {versiones.map((v) => (
        <div key={v.id} className="rounded-xl border border-[#cbd6e2] bg-white p-4">
          <div className="flex items-center gap-2">
            <p className="font-bold text-[#33475b] flex-1">
              Versión {v.version} <span className="text-xs font-normal text-[#516f90]">· {new Date(v.created_at).toLocaleString('es-CL')}</span>
            </p>
            <button
              onClick={async () => {
                if (!confirm(`¿Volver a la versión ${v.version}? La actual queda guardada en el historial.`)) return;
                setRestaurando(v.id);
                try {
                  await onRestaurar(v.id);
                } finally {
                  setRestaurando(null);
                }
              }}
              className="flex items-center gap-1 text-xs font-semibold text-[#2d544c] hover:underline"
            >
              {restaurando === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Restaurar
            </button>
          </div>
          {v.nota && <p className="text-xs text-[#516f90] mt-1">{v.nota}</p>}
          <p className="text-xs text-[#516f90] mt-1">{modeloCorto(v.modelo)} · {v.activo ? 'encendido' : 'apagado'}</p>
          <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-[#33475b] bg-[#f6f9fc] rounded-lg p-2">{v.instrucciones}</pre>
        </div>
      ))}
    </div>
  );
}
