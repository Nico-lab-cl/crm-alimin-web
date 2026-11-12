'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Bot, BookOpen, Loader2, RefreshCcw, Wrench, X, Globe, Camera, MessagesSquare, Mail, MessageCircle, Users, Save } from 'lucide-react';
import PanelAgente from './PanelAgente';
import Conocimiento from './Conocimiento';
import MetricasCanales from './MetricasCanales';
import { modeloCorto, pedir, usd, type Agente, type AgenteId, type Gasto, type Precio } from './tipos';

interface Datos {
  agentes: Agente[];
  conocimiento: Record<string, Record<string, number>>;
  gasto: Gasto;
}

type NodoAgente = Node<{ agente: Agente; aprobadas: number; porRevisar: number; gastoMes: number }, 'agente'>;
type NodoCanales = Node<Record<string, never>, 'canales'>;
type NodoAsesores = Node<Record<string, never>, 'asesores'>;

function AgenteNodo({ data, selected }: NodeProps<NodoAgente>) {
  const a = data.agente;
  const activas = a.herramientas.filter((h) => h.activa).length;
  const estado = a.enConstruccion
    ? { texto: 'En construcción', clase: 'bg-amber-50 text-amber-800 border-amber-200' }
    : a.activo
      ? { texto: 'Encendido', clase: 'bg-emerald-50 text-emerald-800 border-emerald-200' }
      : { texto: 'Apagado', clase: 'bg-slate-100 text-slate-600 border-slate-200' };
  return (
    <div
      className={`w-[260px] rounded-2xl bg-white border-2 shadow-sm cursor-pointer transition ${selected ? 'border-[#2d544c] shadow-lg' : a.enConstruccion ? 'border-dashed border-[#cbd6e2]' : 'border-[#9fc79b]'}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-[#2d544c]" />
      <Handle type="source" position={Position.Right} className="!bg-[#2d544c]" />
      <Handle type="source" id="abajo" position={Position.Bottom} className="!bg-[#2d544c]" />
      <div className="px-4 pt-4 pb-3 border-b border-[#eef2f6] flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-[#e8f3e6] flex items-center justify-center">
          <Bot className="w-5 h-5 text-[#2d544c]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-[#33475b] text-sm leading-tight">{a.nombre}</p>
          <p className="text-[11px] text-[#516f90]">{modeloCorto(a.modelo)}</p>
        </div>
        <span className={`text-[10px] font-bold border rounded-full px-2 py-0.5 ${estado.clase}`}>{estado.texto}</span>
      </div>
      <div className="px-4 py-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-lg font-extrabold text-[#33475b] tabular-nums">{data.aprobadas}</p>
          <p className="text-[10px] text-[#516f90] leading-tight">aprobadas{data.porRevisar ? ` · ${data.porRevisar} por revisar` : ''}</p>
        </div>
        <div>
          <p className="text-lg font-extrabold text-[#33475b] tabular-nums">{activas}</p>
          <p className="text-[10px] text-[#516f90] leading-tight">herramientas</p>
        </div>
        <div>
          <p className="text-lg font-extrabold text-[#33475b] tabular-nums">{usd(data.gastoMes)}</p>
          <p className="text-[10px] text-[#516f90] leading-tight">este mes</p>
        </div>
      </div>
    </div>
  );
}

const CANALES = [
  { nombre: 'Chat web', icono: Globe, activo: true },
  { nombre: 'Instagram', icono: Camera, activo: true },
  { nombre: 'Facebook', icono: MessagesSquare, activo: true },
  { nombre: 'Correo', icono: Mail, activo: false },
  { nombre: 'WhatsApp', icono: MessageCircle, activo: false },
];

function CanalesNodo() {
  return (
    <div className="w-[190px] rounded-2xl bg-white border-2 border-[#cbd6e2] p-3 space-y-1.5">
      <Handle type="source" position={Position.Right} className="!bg-[#2d544c]" />
      <p className="text-[11px] font-bold uppercase tracking-wider text-[#516f90] mb-1">Canales</p>
      {CANALES.map((c) => (
        <div key={c.nombre} className={`flex items-center gap-2 text-sm ${c.activo ? 'text-[#33475b]' : 'text-[#9aa9b8]'}`}>
          <c.icono className="w-4 h-4" /> {c.nombre}
          {!c.activo && <span className="ml-auto text-[10px]">próximamente</span>}
        </div>
      ))}
    </div>
  );
}

function AsesoresNodo() {
  return (
    <div className="w-[210px] rounded-2xl bg-[#fdf6ef] border-2 border-[#e6c3a5] p-4">
      <Handle type="target" position={Position.Left} className="!bg-[#b8561a]" />
      <Handle type="target" id="abajo" position={Position.Bottom} className="!bg-[#b8561a]" />
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-5 h-5 text-[#b8561a]" />
        <p className="font-bold text-[#33475b] text-sm">Asesores</p>
      </div>
      <ul className="text-xs text-[#516f90] space-y-1">
        <li>Guían la visita presencial</li>
        <li>Reclamos y postventa</li>
        <li>Negociaciones y casos raros</li>
      </ul>
    </div>
  );
}

const tiposDeNodo = { agente: AgenteNodo, canales: CanalesNodo, asesores: AsesoresNodo };

const flecha = { type: MarkerType.ArrowClosed, color: '#2d544c' };
const etiqueta = { labelStyle: { fill: '#33475b', fontSize: 11, fontWeight: 600 }, labelBgStyle: { fill: '#f6f9fc' }, labelBgPadding: [6, 3] as [number, number] };

export default function AgentesIA() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState<AgenteId | null>(null);
  const [verConocimiento, setVerConocimiento] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setDatos(await pedir<Datos>('/api/agentes-ia'));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const gastoDe = useCallback(
    (id: string) => (datos?.gasto.porAgente || []).filter((g) => g.agente === id).reduce((a, g) => a + g.costo, 0),
    [datos]
  );

  const nodos = useMemo<Node[]>(() => {
    if (!datos) return [];
    const x = { atraccion: 300, calificador: 700, cierre: 1100 };
    const lista: Node[] = [{ id: 'canales', type: 'canales', position: { x: 0, y: 40 }, data: {} } as NodoCanales];
    for (const a of datos.agentes) {
      lista.push({
        id: a.id,
        type: 'agente',
        position: { x: x[a.id], y: 60 },
        selected: abierto === a.id,
        data: {
          agente: a,
          aprobadas: datos.conocimiento[a.id]?.aprobada || 0,
          porRevisar: datos.conocimiento[a.id]?.por_revisar || 0,
          gastoMes: gastoDe(a.id),
        },
      } as NodoAgente);
    }
    lista.push({ id: 'asesores', type: 'asesores', position: { x: 1500, y: 50 }, data: {} } as NodoAsesores);
    return lista;
  }, [datos, abierto, gastoDe]);

  const aristas = useMemo<Edge[]>(
    () => [
      { id: 'c-a', source: 'canales', target: 'atraccion', label: 'conversa y pide datos', animated: true, markerEnd: flecha, ...etiqueta },
      { id: 'a-q', source: 'atraccion', target: 'calificador', label: 'en silencio', animated: true, markerEnd: flecha, ...etiqueta },
      { id: 'q-c', source: 'calificador', target: 'cierre', label: 'visitó · se enfrió', markerEnd: flecha, style: { strokeDasharray: '6 4' }, ...etiqueta },
      { id: 'c-h', source: 'cierre', target: 'asesores', label: 'negociación', markerEnd: flecha, style: { strokeDasharray: '6 4' }, ...etiqueta },
      {
        id: 'a-h',
        source: 'atraccion',
        sourceHandle: 'abajo',
        target: 'asesores',
        targetHandle: 'abajo',
        type: 'smoothstep',
        label: 'visita agendada · reclamo · pide una persona',
        markerEnd: { ...flecha, color: '#b8561a' },
        style: { stroke: '#b8561a' },
        ...etiqueta,
      },
    ],
    []
  );

  const agenteAbierto = datos?.agentes.find((a) => a.id === abierto) || null;
  const g = datos?.gasto;

  return (
    <div className="p-8 max-w-[1500px] mx-auto space-y-6">
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-[#2d544c] flex items-center gap-2">
            <Bot className="w-7 h-7" /> Agentes IA
          </h1>
          <p className="text-[#516f90] mt-1">
            El recorrido del cliente con la IA. Haz clic en un agente para editar sus instrucciones, su conocimiento y sus herramientas.
          </p>
        </div>
        <button
          onClick={() => setVerConocimiento(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold border border-[#2d544c] text-[#2d544c] bg-white hover:bg-[#f6f9fc]"
        >
          <BookOpen className="w-4 h-4" /> Todo el conocimiento
        </button>
        <button onClick={cargar} className="p-2 rounded-lg border border-[#cbd6e2] bg-white" aria-label="Actualizar">
          <RefreshCcw className={`w-4 h-4 text-[#516f90] ${cargando ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">{error}</p>}

      {g && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Kpi titulo="Gasto hoy" valor={usd(g.hoy)} />
          <Kpi titulo="Gasto del mes" valor={usd(g.mes)} detalle={`${g.llamadasMes.toLocaleString('es-CL')} llamadas`} />
          <Kpi titulo="Proyección fin de mes" valor={usd(g.proyeccionMes)} detalle="al ritmo actual" />
          <Kpi titulo="Por conversación" valor={usd(g.costoPorConversacion)} detalle={`${g.conversacionesMes.toLocaleString('es-CL')} conversaciones`} />
          <Kpi titulo="Por visita del mes" valor={usd(g.costoPorVisita)} detalle={g.visitasMes === null ? 'sin dato de visitas' : `${g.visitasMes} visitas`} />
          <div className="rounded-xl border border-[#cbd6e2] bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[#516f90]">Por modelo</p>
            {porModelo(g).length === 0 ? (
              <p className="text-sm text-[#516f90] mt-2">Sin llamadas este mes</p>
            ) : (
              porModelo(g).map((m) => (
                <p key={m.modelo} className="text-sm text-[#33475b] mt-1 flex justify-between gap-2">
                  <span>{modeloCorto(m.modelo)}</span>
                  <span className="font-bold tabular-nums">{usd(m.costo)}</span>
                </p>
              ))
            )}
          </div>
        </div>
      )}

      <div className="h-[460px] rounded-2xl border border-[#cbd6e2] bg-[#f6f9fc] overflow-hidden">
        {cargando && !datos ? (
          <div className="h-full flex items-center justify-center gap-2 text-[#516f90]">
            <Loader2 className="w-5 h-5 animate-spin" /> Cargando agentes…
          </div>
        ) : (
          <ReactFlow
            nodes={nodos}
            edges={aristas}
            nodeTypes={tiposDeNodo}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            nodesConnectable={false}
            edgesFocusable={false}
            onNodeClick={(_, n) => {
              if (n.type === 'agente') setAbierto(n.id as AgenteId);
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#cbd6e2" gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-[#cbd6e2] bg-white p-5">
          <p className="font-bold text-[#33475b] flex items-center gap-2"><Wrench className="w-4 h-4" /> Cómo se pasan la pelota</p>
          <ul className="text-sm text-[#516f90] mt-2 space-y-1.5 list-disc pl-5">
            <li><b>Ali</b> responde por chat web, Instagram y Facebook y agenda la visita. A quien comenta se le manda el brochure por privado y los precios en público; quien escribe por inbox conversa con Ali desde el primer mensaje, sin enlaces. Ali pide nombre, teléfono y correo y crea el lead («Instagram - IA» o «Facebook - IA») a cargo de Nicolás, con aviso al grupo de leads.</li>
            <li>El lead de Ali <b>pasa a un asesor</b> de la rueda, con aviso, al llegar a 28 puntos de lead score, al agendar una visita o si pide una persona.</li>
            <li>El <b>Calificador</b> lee cada conversación sin escribirle al cliente y deja en la ficha pie, plazo, uso y puntaje.</li>
            <li>El <b>Cierre</b> (en construcción) retoma a los que visitaron, a los indecisos y a los que quieren reservar.</li>
            <li>Los <b>asesores</b> guían la visita y reciben reclamos, postventa y lo que la IA no puede resolver.</li>
          </ul>
        </div>
        {g && <Precios precios={g.precios} fecha={g.preciosFecha} onGuardado={cargar} />}
      </div>

      <MetricasCanales />

      {agenteAbierto && (
        <PanelAgente agente={agenteAbierto} gasto={g || null} onCerrar={() => setAbierto(null)} onGuardado={cargar} />
      )}

      {verConocimiento && (
        <aside className="fixed right-0 top-0 h-screen w-full max-w-[640px] bg-[#f6f9fc] border-l border-[#cbd6e2] shadow-2xl z-50 flex flex-col">
          <div className="px-6 py-4 bg-white border-b border-[#cbd6e2] flex items-center gap-3">
            <h2 className="text-xl font-bold text-[#2d544c] flex-1">Todo el conocimiento</h2>
            <button onClick={() => setVerConocimiento(false)} className="p-1 rounded hover:bg-[#f6f9fc]" aria-label="Cerrar">
              <X className="w-5 h-5 text-[#516f90]" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <Conocimiento agente={null} onCambio={cargar} />
          </div>
        </aside>
      )}
    </div>
  );
}

function porModelo(g: Gasto) {
  const m = new Map<string, number>();
  for (const f of g.porAgente) m.set(f.modelo, (m.get(f.modelo) || 0) + f.costo);
  return Array.from(m, ([modelo, costo]) => ({ modelo, costo })).sort((a, b) => b.costo - a.costo);
}

function Kpi({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-xl border border-[#cbd6e2] bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-[#516f90]">{titulo}</p>
      <p className="text-2xl font-extrabold text-[#33475b] tabular-nums mt-1">{valor}</p>
      {detalle && <p className="text-[11px] text-[#516f90] mt-0.5">{detalle}</p>}
    </div>
  );
}

function Precios({ precios, fecha, onGuardado }: { precios: Precio[]; fecha: string; onGuardado: () => void }) {
  const [filas, setFilas] = useState(precios);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setFilas(precios), [precios]);

  const cambiar = (modelo: string, campo: keyof Precio, valor: string) =>
    setFilas((prev) => prev.map((p) => (p.modelo === modelo ? { ...p, [campo]: Number(valor) } : p)));

  const guardar = async (p: Precio) => {
    setGuardando(p.modelo);
    setError(null);
    try {
      await pedir('/api/agentes-ia/precios', { method: 'PUT', body: JSON.stringify(p) });
      onGuardado();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(null);
    }
  };

  const campos: { id: keyof Precio; nombre: string }[] = [
    { id: 'entrada', nombre: 'Entrada' },
    { id: 'salida', nombre: 'Salida' },
    { id: 'cache_lectura', nombre: 'Caché lect.' },
    { id: 'cache_escritura', nombre: 'Caché escr.' },
  ];

  return (
    <div className="rounded-xl border border-[#cbd6e2] bg-white p-5">
      <p className="font-bold text-[#33475b]">Precios por millón de tokens (US$)</p>
      <p className="text-xs text-[#516f90] mt-1">Lista de Anthropic al {fecha}. Si cambia, corrígela aquí; no recalcula lo ya registrado.</p>
      {error && <p className="text-xs text-rose-700 mt-2">{error}</p>}
      <table className="w-full text-sm mt-3">
        <thead>
          <tr className="text-left text-xs text-[#516f90]">
            <th className="py-1">Modelo</th>
            {campos.map((c) => <th key={c.id} className="py-1 text-right">{c.nombre}</th>)}
            <th />
          </tr>
        </thead>
        <tbody>
          {filas.map((p) => (
            <tr key={p.modelo}>
              <td className="py-1.5 text-[#33475b]">{modeloCorto(p.modelo)}</td>
              {campos.map((c) => (
                <td key={c.id} className="py-1.5 text-right">
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={p[c.id] as number}
                    onChange={(e) => cambiar(p.modelo, c.id, e.target.value)}
                    className="w-20 rounded border border-[#cbd6e2] px-1.5 py-0.5 text-right tabular-nums"
                  />
                </td>
              ))}
              <td className="py-1.5 text-right">
                <button onClick={() => guardar(p)} className="p-1 text-[#2d544c]" aria-label={`Guardar precio de ${p.modelo}`}>
                  {guardando === p.modelo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
