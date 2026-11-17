'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, ChevronDown, ChevronRight, ExternalLink, Loader2, RefreshCcw, ThumbsDown, ThumbsUp, Wand2 } from 'lucide-react';
import { pedir } from '../tipos';

/**
 * Pruebas del equipo (16-11-2026): las conversaciones que los asesores tienen
 * con Ali en aliminspa.cl/probar-ali, con sus 👍/👎 y correcciones. Una
 * corrección se convierte en regla de conocimiento (nace "por revisar"; se
 * aprueba en "Todo el conocimiento" y Ali la usa en unos 5 minutos).
 */

interface Mensaje {
  de: 'cliente' | 'ali' | 'aviso';
  texto: string;
  voto?: 'bien' | 'mal' | null;
  correccion?: string | null;
}
interface Prueba {
  id: string;
  asesor: string;
  canal: 'instagram' | 'facebook' | 'whatsapp';
  mensajes: Mensaje[];
  nota: string | null;
  buenas: number;
  malas: number;
  revisada: boolean;
  created_at: string;
  updated_at: string;
}
interface Datos {
  pruebas: Prueba[];
  asesores: { asesor: string; n: number }[];
}

const CANAL: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp' };
const diaHora = (s: string) =>
  new Date(s).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const boton = (activo: boolean) =>
  `text-sm font-semibold rounded-xl px-3 py-1.5 border ${activo ? 'bg-[#2d544c] text-white border-[#2d544c]' : 'bg-white text-[#2d544c] border-[#9fc79b] hover:bg-[#e8f3e6]'}`;

/** El último mensaje del cliente antes de la respuesta i de Ali. */
function clienteAntes(mensajes: Mensaje[], i: number) {
  for (let j = i - 1; j >= 0; j--) if (mensajes[j].de === 'cliente') return mensajes[j].texto;
  return '';
}

function NuevaRegla({ prueba, i }: { prueba: Prueba; i: number }) {
  const m = prueba.mensajes[i];
  const cliente = clienteAntes(prueba.mensajes, i);
  const [tema, setTema] = useState(cliente.slice(0, 70));
  const [como, setComo] = useState(cliente);
  const [respuesta, setRespuesta] = useState(m.correccion || '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lista, setLista] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await pedir('/api/agentes-ia/conocimiento', {
        method: 'POST',
        body: JSON.stringify({
          tipo: 'regla',
          tema,
          como_lo_dice: como || null,
          respuesta,
          fuente: `Prueba de ${prueba.asesor}`,
          nota: `Ali había respondido: «${m.texto.slice(0, 400)}»`,
          agentes: ['atraccion'],
        }),
      });
      setLista(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  if (lista) {
    return (
      <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mt-2">
        Regla creada «por revisar». Apruébala en <Link href="/agentes-ia" className="font-bold underline">Agentes IA → Todo el conocimiento</Link> y Ali la usa en unos 5 minutos.
      </p>
    );
  }
  const entrada = 'w-full rounded-md border border-[#cbd6e2] px-2 py-1 text-sm text-[#33475b] focus:border-[#2d544c] focus:outline-none';
  return (
    <div className="mt-2 rounded-lg border border-[#9fc79b] bg-white p-3 space-y-2">
      <label className="block text-[11px] font-bold text-[#516f90]">
        Tema
        <input value={tema} onChange={(e) => setTema(e.target.value)} className={entrada} />
      </label>
      <label className="block text-[11px] font-bold text-[#516f90]">
        Cuando el cliente dice
        <textarea value={como} onChange={(e) => setComo(e.target.value)} rows={2} className={entrada} />
      </label>
      <label className="block text-[11px] font-bold text-[#516f90]">
        Ali debe responder o hacer
        <textarea value={respuesta} onChange={(e) => setRespuesta(e.target.value)} rows={3} className={entrada} />
      </label>
      {error && <p className="text-xs text-rose-700">{error}</p>}
      <button
        onClick={guardar}
        disabled={guardando || !tema.trim() || !respuesta.trim()}
        className="inline-flex items-center gap-1.5 text-sm font-bold rounded-lg px-3 py-1.5 bg-[#2d544c] text-white disabled:opacity-50"
      >
        {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Crear regla por revisar
      </button>
    </div>
  );
}

function MensajeAli({ prueba, i }: { prueba: Prueba; i: number }) {
  const m = prueba.mensajes[i];
  const [regla, setRegla] = useState(false);
  const borde = m.voto === 'mal' ? 'border-rose-300' : m.voto === 'bien' ? 'border-emerald-300' : 'border-[#9fc79b]';
  return (
    <li className={`text-sm rounded-lg px-3 py-1.5 bg-[#e8f3e6] border ${borde}`}>
      <span className="text-[11px] font-bold text-[#516f90] inline-flex items-center gap-1">
        Ali
        {m.voto === 'bien' && <ThumbsUp className="w-3.5 h-3.5 text-emerald-700" />}
        {m.voto === 'mal' && <ThumbsDown className="w-3.5 h-3.5 text-rose-700" />}
      </span>
      <p className="text-[#33475b] whitespace-pre-line">{m.texto}</p>
      {m.voto === 'mal' && (
        <div className="mt-2 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2">
          <p className="text-[11px] font-bold text-rose-800">Qué debió decir ({prueba.asesor})</p>
          <p className="text-[#33475b] whitespace-pre-line">{m.correccion || <i className="text-[#516f90]">Sin comentario</i>}</p>
          {!regla && (
            <button onClick={() => setRegla(true)} className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-[#2d544c] hover:underline">
              <Wand2 className="w-3.5 h-3.5" /> Convertir en regla
            </button>
          )}
          {regla && <NuevaRegla prueba={prueba} i={i} />}
        </div>
      )}
    </li>
  );
}

function FilaPrueba({ p, onRevisada }: { p: Prueba; onRevisada: (id: string, v: boolean) => void }) {
  const [abierta, setAbierta] = useState(false);
  const primera = p.mensajes.find((m) => m.de === 'cliente')?.texto || '';
  return (
    <li className={`border rounded-xl bg-white ${p.malas && !p.revisada ? 'border-rose-200' : 'border-[#cbd6e2]'}`}>
      <div className="flex items-center gap-3 px-3 py-2">
        <button onClick={() => setAbierta((v) => !v)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
          {abierta ? <ChevronDown className="w-4 h-4 text-[#516f90] shrink-0" /> : <ChevronRight className="w-4 h-4 text-[#516f90] shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#33475b] truncate">
              {p.asesor} <span className="font-normal text-[#516f90]">· {CANAL[p.canal]} · {diaHora(p.updated_at)}</span>
            </p>
            <p className="text-xs text-[#516f90] truncate">{p.nota ? `📝 ${p.nota}` : `«${primera}»`}</p>
          </div>
          <span className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1 shrink-0"><ThumbsUp className="w-3.5 h-3.5" />{p.buenas}</span>
          <span className="text-xs font-bold text-rose-700 inline-flex items-center gap-1 shrink-0"><ThumbsDown className="w-3.5 h-3.5" />{p.malas}</span>
        </button>
        <label className="text-xs text-[#516f90] inline-flex items-center gap-1.5 shrink-0 cursor-pointer">
          <input type="checkbox" checked={p.revisada} onChange={(e) => onRevisada(p.id, e.target.checked)} /> Revisada
        </label>
      </div>
      {abierta && (
        <div className="px-4 pb-3 pt-2 border-t border-[#eef2f6] space-y-2">
          {p.nota && (
            <p className="text-sm bg-[#fdf6ef] border border-[#e6c3a5] rounded-lg px-3 py-2 text-[#33475b] whitespace-pre-line">
              <b>Comentario general:</b> {p.nota}
            </p>
          )}
          <ul className="space-y-1.5 max-h-[32rem] overflow-y-auto pr-1">
            {p.mensajes.map((m, i) =>
              m.de === 'ali' ? (
                <MensajeAli key={i} prueba={p} i={i} />
              ) : m.de === 'aviso' ? (
                <li key={i} className="text-xs text-center text-[#6b5a2e] bg-[#f6f1e3] rounded-lg px-3 py-1">{m.texto}</li>
              ) : (
                <li key={i} className="text-sm rounded-lg px-3 py-1.5 bg-white border border-[#eef2f6]">
                  <span className="text-[11px] font-bold text-[#516f90]">Cliente (asesor probando)</span>
                  <p className="text-[#33475b] whitespace-pre-line">{m.texto}</p>
                </li>
              )
            )}
          </ul>
        </div>
      )}
    </li>
  );
}

export default function PruebasPage() {
  const [asesor, setAsesor] = useState('');
  const [canal, setCanal] = useState('');
  const [ver, setVer] = useState<'todas' | 'mal' | 'pendientes'>('pendientes');
  const [dias, setDias] = useState(30);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const q = new URLSearchParams({ ver, dias: String(dias) });
      if (asesor) q.set('asesor', asesor);
      if (canal) q.set('canal', canal);
      setDatos(await pedir<Datos>(`/api/agentes-ia/pruebas?${q}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [asesor, canal, ver, dias]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const revisada = async (id: string, v: boolean) => {
    setDatos((d) => d && { ...d, pruebas: d.pruebas.map((p) => (p.id === id ? { ...p, revisada: v } : p)) });
    try {
      await pedir('/api/agentes-ia/pruebas', { method: 'PATCH', body: JSON.stringify({ id, revisada: v }) });
    } catch (e) {
      setError((e as Error).message);
      cargar();
    }
  };

  const lista = datos?.pruebas || [];
  const total = (k: 'buenas' | 'malas') => lista.reduce((a, p) => a + p[k], 0);

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-5 bg-[#f5f8fa] min-h-screen">
      <header className="flex items-start gap-4">
        <div className="flex-1">
          <Link href="/agentes-ia" className="inline-flex items-center gap-1 text-xs font-semibold text-[#516f90] hover:underline">
            <ArrowLeft className="w-3.5 h-3.5" /> Agentes IA
          </Link>
          <h1 className="text-2xl font-bold text-[#2d544c] mt-1">Pruebas del equipo</h1>
          <p className="text-sm text-[#516f90] mt-1">
            Lo que los asesores conversan con Ali en el chat de prueba, con sus 👍/👎 y lo que Ali debió decir. Convierte una
            corrección en regla y apruébala en el conocimiento.
          </p>
        </div>
        <a
          href="https://aliminspa.cl/probar-ali"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold border border-[#2d544c] text-[#2d544c] bg-white hover:bg-[#f6f9fc] shrink-0"
        >
          <ExternalLink className="w-4 h-4" /> Abrir chat de prueba
        </a>
        <button onClick={cargar} className="p-2 rounded-lg border border-[#cbd6e2] bg-white shrink-0" aria-label="Actualizar">
          <RefreshCcw className={`w-4 h-4 text-[#516f90] ${cargando ? 'animate-spin' : ''}`} />
        </button>
      </header>

      <section className="bg-white rounded-2xl border border-[#9fc79b] p-4 flex flex-wrap items-center gap-2">
        {([['pendientes', 'Por revisar'], ['mal', 'Con 👎 o comentario'], ['todas', 'Todas']] as const).map(([id, nombre]) => (
          <button key={id} onClick={() => setVer(id)} className={boton(ver === id)}>{nombre}</button>
        ))}
        <span className="w-px h-6 bg-[#cbd6e2] mx-1" />
        <select value={asesor} onChange={(e) => setAsesor(e.target.value)} className="text-sm rounded-xl border border-[#9fc79b] px-3 py-1.5 bg-white text-[#33475b]">
          <option value="">Todos los asesores</option>
          {(datos?.asesores || []).map((a) => (
            <option key={a.asesor} value={a.asesor}>{a.asesor} ({a.n})</option>
          ))}
        </select>
        <select value={canal} onChange={(e) => setCanal(e.target.value)} className="text-sm rounded-xl border border-[#9fc79b] px-3 py-1.5 bg-white text-[#33475b]">
          <option value="">Todos los canales</option>
          {Object.entries(CANAL).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="text-sm rounded-xl border border-[#9fc79b] px-3 py-1.5 bg-white text-[#33475b]">
          <option value={7}>Últimos 7 días</option>
          <option value={30}>Últimos 30 días</option>
          <option value={90}>Últimos 90 días</option>
        </select>
      </section>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[#cbd6e2] bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#516f90]">Conversaciones</p>
          <p className="text-2xl font-extrabold text-[#33475b] tabular-nums mt-1">{lista.length}</p>
        </div>
        <div className="rounded-xl border border-[#cbd6e2] bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#516f90]">Respuestas 👍</p>
          <p className="text-2xl font-extrabold text-emerald-700 tabular-nums mt-1">{total('buenas')}</p>
        </div>
        <div className="rounded-xl border border-[#cbd6e2] bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-[#516f90]">Respuestas 👎</p>
          <p className="text-2xl font-extrabold text-rose-700 tabular-nums mt-1">{total('malas')}</p>
        </div>
      </div>

      {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">{error}</p>}

      {cargando && !datos ? (
        <p className="text-sm text-[#516f90] inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</p>
      ) : !lista.length ? (
        <p className="text-sm text-[#516f90] bg-white rounded-xl border border-[#cbd6e2] px-4 py-6 text-center">
          {ver === 'pendientes' ? 'No hay pruebas con 👎 o comentarios por revisar.' : 'Todavía no hay pruebas en este rango.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {lista.map((p) => <FilaPrueba key={p.id} p={p} onRevisada={revisada} />)}
        </ul>
      )}
    </div>
  );
}
