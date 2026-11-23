'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Bot,
  ExternalLink,
  FileText,
  MessageCircle,
  Paperclip,
  Pause,
  Play,
  RefreshCw,
  Save,
  Search,
  Send,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';

/**
 * Bandeja de WhatsApp de Ali (+56 9 8257 9808), decisiones de Nicolás del
 * 22-11-2026 (ver lib/whatsapp_ali.ts):
 *   - Se ven todos los chats, también los que Ali atiende sola.
 *   - Se responde de parte del asesor elegido; escribir deja a Ali en pausa
 *     hasta que alguien aprieta "Reactivar" (también si Ali derivó).
 *   - Pasadas 24 h desde el último mensaje del cliente, WhatsApp no deja
 *     escribir sin plantilla: se avisa y se bloquea.
 *   - Al lado, la ficha del lead: contacto editable, lo que sabe la IA,
 *     historial y otros canales.
 * Los no leídos se llevan en este navegador (localStorage): este CRM entra con
 * una contraseña compartida y no distingue usuarios.
 */

const ASESOR_GUARDADO = 'chat_web_asesor'; // El mismo de Chat web: se elige una vez.
const VISTOS_GUARDADOS = 'whatsapp_ali_vistos';
const INTERVALO_MS = 5000;
const VENTANA_MS = 24 * 60 * 60 * 1000;

const DOCUMENTOS = [
  { id: 'plano_lomas_del_mar', nombre: 'Plano Lomas del Mar' },
  { id: 'plano_arena_y_sol', nombre: 'Plano Arena y Sol' },
  { id: 'brochure_lomas_del_mar', nombre: 'Brochure Lomas del Mar (PDF)' },
  { id: 'brochure_arena_y_sol', nombre: 'Brochure Arena y Sol (PDF)' },
];

interface Conversacion {
  id: string;
  nombre_whatsapp: string | null;
  psid: string;
  actualizado: string;
  lead_id: string | null;
  lead_nombre: string | null;
  lead_apellido: string | null;
  estado: string | null;
  asesor_nombre: string | null;
  ultimo_texto: string | null;
  ultimo_emisor: string | null;
  ultimo_en: string | null;
  ultimo_cliente_en: string | null;
  derivada: boolean;
  pausada_en: string | null;
}

interface Cabecera {
  id: string;
  platform: string;
  psid: string;
  nombre_whatsapp: string | null;
  lead_id: string | null;
  ultimo_cliente_en: string | null;
  pausada_en?: string | null;
  pausada_por?: string | null;
  pausa_motivo?: string | null;
}

interface Mensaje {
  id: string;
  text: string;
  /** "meta" (cliente), "advisor" o "ali". */
  emisor: string;
  /** "DIRECT", "HANDOFF" (Ali pidió un asesor), "EVENTO" (nota interna), "AUTO"... */
  origen: string | null;
  creado: string;
  media_url: string | null;
  autor: string | null;
  adjunto_id: string | null;
  adjunto_tipo: string | null;
  adjunto_mime: string | null;
  adjunto_nombre: string | null;
}

interface Lead {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  status: string | null;
  source: string | null;
  rating: string | null;
  pie: string | null;
  interests: string | null;
  notes: string | null;
  visited: boolean | null;
  visitDate: string | null;
  visitProject: string | null;
  lastActivity: string | null;
  createdAt: string | null;
  asesor_nombre: string | null;
}

interface Calificacion {
  canal: string | null;
  tiene_pie: boolean | null;
  pie_monto: number | null;
  forma_pago: string | null;
  plazo_compra: string | null;
  uso: string | null;
  proyecto: string | null;
  quiere_visitar: boolean | null;
  objeciones: string[] | null;
  categoria: string | null;
  puntaje: number | null;
  resumen: string | null;
  updated_at: string | null;
}

interface OtroCanal {
  id: string;
  platform: string;
  psid: string;
  actualizado: string;
  ultimo_texto: string | null;
  ultimo_en: string | null;
}

interface Hilo {
  conversacion: Cabecera;
  mensajes: Mensaje[];
  lead: Lead | null;
  leadScore: { score: number; banda: string; motivos: { texto: string; puntos: number }[] | null } | null;
  calificacion: Calificacion[];
  otrosCanales: OtroCanal[];
}

interface Evento {
  id: string;
  type: string;
  title: string;
  description: string;
  date: string;
}

/* ── Utilidades ───────────────────────────────────────────────────────── */

/** "+56 9 8257 9808" a partir del psid "wa:56982579808@…". */
function telefonoDePsid(psid: string) {
  const n = psid.replace(/^wa:/, '').replace(/@.*$/, '');
  if (/^569\d{8}$/.test(n)) return `+56 9 ${n.slice(3, 7)} ${n.slice(7)}`;
  return n ? `+${n}` : '';
}

function nombreDe(c: { lead_nombre?: string | null; lead_apellido?: string | null; nombre_whatsapp?: string | null; psid?: string }) {
  const completo = [c.lead_nombre, c.lead_apellido].filter(Boolean).join(' ').trim();
  return completo || c.nombre_whatsapp || (c.psid ? telefonoDePsid(c.psid) : '') || 'Cliente';
}

function hora(valor: string | null | undefined) {
  if (!valor) return '';
  return new Date(valor).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function canalLegible(platform: string, psid: string) {
  if (platform === 'whatsapp') return psid.includes('@') ? 'WhatsApp · 8257 9808' : 'WhatsApp · 8327 6034';
  if (platform === 'instagram') return 'Instagram';
  if (platform === 'facebook') return 'Messenger';
  if (platform === 'web') return 'Chat web';
  return platform;
}

/** Horas que quedan para poder escribir (ventana de 24 h de WhatsApp), o null si ya pasó. */
function horasRestantes(ultimoCliente: string | null | undefined) {
  if (!ultimoCliente) return null;
  const resta = VENTANA_MS - (Date.now() - new Date(ultimoCliente).getTime());
  return resta > 0 ? resta / 3600_000 : null;
}

function leerVistos(): Record<string, string> | null {
  try {
    const crudo = window.localStorage.getItem(VISTOS_GUARDADOS);
    return crudo ? JSON.parse(crudo) : null;
  } catch {
    return null;
  }
}

function guardarVistos(v: Record<string, string>) {
  try {
    window.localStorage.setItem(VISTOS_GUARDADOS, JSON.stringify(v));
  } catch {
    // Sin almacenamiento: los no leídos se reinician al recargar.
  }
}

/** Un "ding" corto. El navegador lo deja sonar después del primer clic en la página. */
function sonarAviso() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gan = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.12);
    gan.gain.setValueAtTime(0.0001, ctx.currentTime);
    gan.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gan.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gan).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => ctx.close();
  } catch {
    // Sin audio: queda el contador.
  }
}

/* ── Calificar a Ali (👍/👎), para retroalimentarla ────────────────────── */

type VotoAli = { voto: 'bien' | 'mal'; correccion: string | null; autor: string | null };

/**
 * 👍/👎 bajo cada respuesta de Ali. Lo que se califica llega a Agentes IA →
 * Pruebas del equipo (marcado "Chat real"), donde una corrección se convierte
 * en regla para Ali (Nicolás, 22-11-2026).
 */
function CalificarAli({
  actual,
  onCalificar,
}: {
  actual: VotoAli | undefined;
  onCalificar: (voto: 'bien' | 'mal' | null, correccion?: string) => Promise<boolean>;
}) {
  const [escribiendo, setEscribiendo] = useState(false);
  const [correccion, setCorreccion] = useState(actual?.correccion || '');
  const [guardando, setGuardando] = useState(false);

  const votar = async (voto: 'bien' | 'mal' | null, texto?: string) => {
    setGuardando(true);
    const ok = await onCalificar(voto, texto);
    setGuardando(false);
    if (ok) setEscribiendo(false);
  };

  return (
    <div className="mt-1.5 pt-1.5 border-t border-violet-200/70 text-[11px] text-slate-500">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={guardando}
          onClick={() => votar(actual?.voto === 'bien' ? null : 'bien')}
          title="Ali respondió bien"
          className={`p-1 rounded ${actual?.voto === 'bien' ? 'bg-emerald-100 text-emerald-700' : 'hover:bg-violet-100'}`}
        >
          <ThumbsUp size={13} />
        </button>
        <button
          type="button"
          disabled={guardando}
          onClick={() => {
            if (actual?.voto === 'mal' && !escribiendo) return votar(null);
            setEscribiendo(true);
          }}
          title="Ali respondió mal: escribe qué debió decir"
          className={`p-1 rounded ${actual?.voto === 'mal' ? 'bg-rose-100 text-rose-700' : 'hover:bg-violet-100'}`}
        >
          <ThumbsDown size={13} />
        </button>
        {actual?.autor && <span>calificó {actual.autor}</span>}
      </div>
      {actual?.voto === 'mal' && actual.correccion && !escribiendo && (
        <p className="mt-1 text-rose-700 whitespace-pre-wrap">Debió decir: {actual.correccion}</p>
      )}
      {escribiendo && (
        <div className="mt-1.5 space-y-1.5">
          <textarea
            value={correccion}
            onChange={(e) => setCorreccion(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="¿Qué debió decir Ali? (opcional, pero ayuda mucho)"
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs text-[#33475b] outline-none focus:ring-2 focus:ring-rose-100"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={guardando}
              onClick={() => votar('mal', correccion)}
              className="px-2.5 py-1 rounded-md bg-rose-600 text-white font-semibold disabled:opacity-50"
            >
              {guardando ? 'Guardando...' : 'Guardar 👎'}
            </button>
            <button type="button" onClick={() => setEscribiendo(false)} className="px-2.5 py-1 rounded-md hover:bg-slate-100">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Burbuja de mensaje (se usa en el chat y en "otros canales") ─────── */

function Burbuja({
  m,
  calificacion,
  onCalificar,
}: {
  m: Mensaje;
  calificacion?: VotoAli;
  onCalificar?: (voto: 'bien' | 'mal' | null, correccion?: string) => Promise<boolean>;
}) {
  if (m.origen === 'EVENTO') {
    return (
      <div className="self-center max-w-[85%] text-center text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 whitespace-pre-wrap">
        {m.text}
        <span className="block text-[10px] opacity-60 mt-0.5">{hora(m.creado)}</span>
      </div>
    );
  }

  const esAsesor = m.emisor === 'advisor';
  const esAli = m.emisor === 'ali';
  const media = m.adjunto_id ? `/api/chat-web/media/${m.adjunto_id}` : null;
  // Las fotos que manda Ali (planos) vienen con la URL pública del sitio.
  const imagenPublica = !m.adjunto_id && m.media_url && /^https:\/\//.test(m.media_url) ? m.media_url : null;

  return (
    <div
      className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words ${
        esAli
          ? 'self-end bg-violet-50 text-[#33475b] border border-violet-200 rounded-br-sm'
          : esAsesor
            ? 'self-end bg-emerald-600 text-white rounded-br-sm'
            : 'self-start bg-slate-100 text-[#33475b] rounded-bl-sm'
      }`}
    >
      {esAli && (
        <span className="block text-[10px] font-bold uppercase text-violet-600 mb-0.5">
          {m.origen === 'HANDOFF' ? 'Ali (IA) · pidió un asesor' : m.origen === 'AUTO' ? 'Respuesta automática' : 'Ali (IA)'}
        </span>
      )}
      {esAsesor && m.autor && <span className="block text-[10px] font-bold uppercase opacity-80 mb-0.5">{m.autor}</span>}

      {media && (
        <div className="mb-1.5">
          {m.adjunto_tipo === 'image' && (
            <a href={media} target="_blank" rel="noopener noreferrer">
              <img src={media} alt="Foto" loading="lazy" className="max-w-full max-h-72 rounded-xl" />
            </a>
          )}
          {m.adjunto_tipo === 'audio' && <audio controls preload="metadata" src={media} className="w-56 h-10" />}
          {m.adjunto_tipo === 'video' && (
            <video controls preload="metadata" src={media} className="max-w-full max-h-72 rounded-xl bg-black" />
          )}
          {m.adjunto_tipo === 'document' && (
            <a
              href={media}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${
                esAsesor ? 'bg-emerald-700/40 text-white' : 'bg-white border border-slate-200 text-[#33475b]'
              }`}
            >
              <FileText size={16} />
              {m.adjunto_nombre || 'Archivo'}
            </a>
          )}
        </div>
      )}
      {imagenPublica && (
        <a href={imagenPublica} target="_blank" rel="noopener noreferrer" className="block mb-1.5">
          <img src={imagenPublica} alt="Imagen" loading="lazy" className="max-w-full max-h-72 rounded-xl" />
        </a>
      )}

      {m.text}
      <span className="block text-[10px] opacity-60 mt-1">{hora(m.creado)}</span>
      {esAli && onCalificar && <CalificarAli actual={calificacion} onCalificar={onCalificar} />}
    </div>
  );
}

/* ── Página ───────────────────────────────────────────────────────────── */

type Filtro = 'todos' | 'sin_leer' | 'pausa' | 'ali';

export default function WhatsappAliPage() {
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [hilo, setHilo] = useState<Hilo | null>(null);
  const [asesores, setAsesores] = useState<{ id: string; name: string }[]>([]);
  const [asesorId, setAsesorId] = useState('');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [cambiandoPausa, setCambiandoPausa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [vistos, setVistos] = useState<Record<string, string>>({});
  const [menuDocs, setMenuDocs] = useState(false);
  const [otroCanal, setOtroCanal] = useState<string | null>(null);
  const [votos, setVotos] = useState<Record<string, VotoAli>>({});
  const [, setReloj] = useState(0); // Para que la cuenta de las 24 h avance sola.

  const inputArchivo = useRef<HTMLInputElement>(null);
  const hiloRef = useRef<HTMLDivElement>(null);
  const pegadoAbajo = useRef(true);
  const ultimoIdVisto = useRef<string | null>(null);
  const [mensajesNuevos, setMensajesNuevos] = useState(false);
  /** Último mensaje del cliente por chat en la consulta anterior, para saber cuándo sonar. */
  const previos = useRef<Map<string, string> | null>(null);
  const seleccionadaRef = useRef<string | null>(null);
  seleccionadaRef.current = seleccionada;

  const nombreAsesor = asesores.find((a) => a.id === asesorId)?.name || '';

  /* Datos */

  const marcarVisto = useCallback((id: string, fecha: string | null | undefined) => {
    if (!fecha) return;
    setVistos((v) => {
      if (v[id] && new Date(v[id]) >= new Date(fecha)) return v;
      const nuevo = { ...v, [id]: fecha };
      guardarVistos(nuevo);
      return nuevo;
    });
  }, []);

  const cargarConversaciones = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp-ali/conversations', { cache: 'no-store' });
      const datos = await res.json();
      const lista: Conversacion[] = datos.conversaciones || [];
      setConversaciones(lista);
      if (datos.error) setError(datos.error);

      // Primera vez en este navegador: todo lo anterior cuenta como leído.
      const guardados = leerVistos();
      if (!guardados) {
        const base: Record<string, string> = {};
        for (const c of lista) if (c.ultimo_cliente_en) base[c.id] = c.ultimo_cliente_en;
        guardarVistos(base);
        setVistos(base);
      }

      // Sonido: un chat con un mensaje del cliente más nuevo que en la vuelta anterior.
      const ahora = new Map(lista.map((c) => [c.id, c.ultimo_cliente_en || '']));
      if (previos.current) {
        const hayNuevo = lista.some((c) => {
          if (!c.ultimo_cliente_en) return false;
          const antes = previos.current?.get(c.id);
          const nuevo = !antes || new Date(c.ultimo_cliente_en) > new Date(antes);
          // El chat abierto y a la vista no suena: ya se está leyendo.
          const leyendo = c.id === seleccionadaRef.current && document.visibilityState === 'visible';
          return nuevo && !leyendo;
        });
        if (hayNuevo) sonarAviso();
      }
      previos.current = ahora;
    } catch {
      setError('No se pudo cargar la bandeja.');
    } finally {
      setCargando(false);
    }
  }, []);

  const cargarHilo = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/whatsapp-ali/conversations/${id}`, { cache: 'no-store' });
      if (!res.ok) return;
      const datos: Hilo = await res.json();
      if (seleccionadaRef.current !== id) return; // Se cambió de chat mientras cargaba.
      setHilo(datos);
      if (document.visibilityState === 'visible') marcarVisto(id, datos.conversacion.ultimo_cliente_en);
    } catch {
      // El siguiente ciclo reintenta.
    }
  }, [marcarVisto]);

  useEffect(() => {
    setVistos(leerVistos() || {});
    cargarConversaciones();
    fetch('/api/advisors')
      .then((r) => r.json())
      .then((d) => setAsesores(d.advisors || []))
      .catch(() => setAsesores([]));
    try {
      const guardado = window.localStorage.getItem(ASESOR_GUARDADO);
      if (guardado) setAsesorId(guardado);
    } catch {
      // Se elige a mano.
    }
  }, [cargarConversaciones]);

  useEffect(() => {
    // La lista sigue consultando con la pestaña oculta: así suena el aviso.
    const intervalo = setInterval(() => {
      cargarConversaciones();
      if (seleccionada && document.visibilityState === 'visible') cargarHilo(seleccionada);
      setReloj((n) => n + 1);
    }, INTERVALO_MS);
    return () => clearInterval(intervalo);
  }, [seleccionada, cargarConversaciones, cargarHilo]);

  /* No leídos y título de la pestaña */

  const sinLeer = useCallback(
    (c: Conversacion) => Boolean(c.ultimo_cliente_en && (!vistos[c.id] || new Date(c.ultimo_cliente_en) > new Date(vistos[c.id]))),
    [vistos]
  );
  const totalSinLeer = conversaciones.filter(sinLeer).length;

  useEffect(() => {
    document.title = totalSinLeer > 0 ? `(${totalSinLeer}) WhatsApp Ali` : 'WhatsApp Ali';
  }, [totalSinLeer]);

  /* Scroll del hilo */

  const irAlFinal = useCallback(() => {
    const el = hiloRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    pegadoAbajo.current = true;
    setMensajesNuevos(false);
  }, []);

  const alDesplazar = () => {
    const el = hiloRef.current;
    if (!el) return;
    pegadoAbajo.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (pegadoAbajo.current) setMensajesNuevos(false);
  };

  useEffect(() => {
    const mensajes = hilo?.mensajes || [];
    const ultimoId = mensajes.length ? mensajes[mensajes.length - 1].id : null;
    const llegoAlgo = ultimoId !== ultimoIdVisto.current;
    ultimoIdVisto.current = ultimoId;
    if (pegadoAbajo.current) irAlFinal();
    else if (llegoAlgo && ultimoId) setMensajesNuevos(true);
  }, [hilo, irAlFinal]);

  /* Acciones */

  const abrir = (id: string) => {
    pegadoAbajo.current = true;
    setMensajesNuevos(false);
    setSeleccionada(id);
    seleccionadaRef.current = id;
    setHilo(null);
    setError(null);
    setMenuDocs(false);
    setVotos({});
    cargarHilo(id);
    fetch(`/api/whatsapp-ali/calificar?conversationId=${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (seleccionadaRef.current === id) setVotos(d.votos || {});
      })
      .catch(() => {});
  };

  /** 👍/👎 a una respuesta de Ali; queda en Agentes IA → Pruebas del equipo. */
  const calificar = async (messageId: string, voto: 'bien' | 'mal' | null, correccion?: string) => {
    if (!seleccionada) return false;
    if (!nombreAsesor) {
      setError('Elige arriba en "Respondo como…" quién eres, para firmar la calificación.');
      return false;
    }
    try {
      const res = await fetch('/api/whatsapp-ali/calificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: seleccionada, messageId, voto, correccion, asesor: nombreAsesor }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || 'No se pudo guardar la calificación.');
        return false;
      }
      setVotos(d.votos || {});
      return true;
    } catch {
      setError('No hay conexión con el servidor.');
      return false;
    }
  };

  const elegirAsesor = (id: string) => {
    setAsesorId(id);
    try {
      window.localStorage.setItem(ASESOR_GUARDADO, id);
    } catch {
      // Sin persistencia.
    }
  };

  const necesitaAsesor = () => {
    if (asesorId) return false;
    setError('Elige arriba de parte de qué asesor estás respondiendo.');
    return true;
  };

  const trasEnviar = async () => {
    pegadoAbajo.current = true;
    if (seleccionada) await cargarHilo(seleccionada);
    cargarConversaciones();
  };

  const enviarTexto = async () => {
    const contenido = texto.trim();
    if (!contenido || !seleccionada || enviando || necesitaAsesor()) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/whatsapp-ali/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: seleccionada, advisorId: asesorId, text: contenido }),
      });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(datos.error || 'No se pudo enviar el mensaje.');
        return;
      }
      setTexto('');
      await trasEnviar();
    } catch {
      setError('No hay conexión con el servidor.');
    } finally {
      setEnviando(false);
    }
  };

  const enviarDocumento = async (documento: string) => {
    setMenuDocs(false);
    if (!seleccionada || enviando || necesitaAsesor()) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch('/api/whatsapp-ali/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: seleccionada, advisorId: asesorId, documento }),
      });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(datos.error || 'No se pudo mandar el documento.');
        return;
      }
      await trasEnviar();
    } catch {
      setError('No hay conexión con el servidor.');
    } finally {
      setEnviando(false);
    }
  };

  const enviarArchivo = async (archivo: File) => {
    if (!seleccionada || enviando || necesitaAsesor()) return;
    setEnviando(true);
    setError(null);
    try {
      const cuerpo = new FormData();
      cuerpo.append('conversationId', seleccionada);
      cuerpo.append('advisorId', asesorId);
      cuerpo.append('archivo', archivo, archivo.name);
      // Lo que esté escrito va como leyenda del archivo.
      if (texto.trim()) cuerpo.append('leyenda', texto.trim());
      const res = await fetch('/api/whatsapp-ali/archivo', { method: 'POST', body: cuerpo });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(datos.error || 'No se pudo mandar el archivo.');
        return;
      }
      setTexto('');
      await trasEnviar();
    } catch {
      setError('No hay conexión con el servidor.');
    } finally {
      setEnviando(false);
    }
  };

  const cambiarPausa = async (accion: 'pausar' | 'reactivar') => {
    if (!seleccionada || cambiandoPausa) return;
    setCambiandoPausa(true);
    setError(null);
    try {
      const res = await fetch('/api/whatsapp-ali/pausa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: seleccionada, accion, quien: nombreAsesor }),
      });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(datos.error || 'No se pudo cambiar el estado de Ali.');
        return;
      }
      await trasEnviar();
    } catch {
      setError('No hay conexión con el servidor.');
    } finally {
      setCambiandoPausa(false);
    }
  };

  /* Lista filtrada */

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const digitos = q.replace(/\D/g, '');
    return conversaciones.filter((c) => {
      if (filtro === 'sin_leer' && !sinLeer(c)) return false;
      if (filtro === 'pausa' && !c.pausada_en) return false;
      if (filtro === 'ali' && c.pausada_en) return false;
      if (!q) return true;
      const nombre = nombreDe(c).toLowerCase();
      const telefono = c.psid.replace(/\D/g, '');
      return nombre.includes(q) || (digitos.length >= 3 && telefono.includes(digitos)) || (c.ultimo_texto || '').toLowerCase().includes(q);
    });
  }, [conversaciones, busqueda, filtro, sinLeer]);

  const cabecera = hilo?.conversacion;
  const pausada = Boolean(cabecera?.pausada_en);
  const restan = horasRestantes(cabecera?.ultimo_cliente_en);
  const ventanaAbierta = restan !== null;
  const conversacionActual = conversaciones.find((c) => c.id === seleccionada);

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-[#33475b] flex items-center gap-2">
            <MessageCircle className="text-emerald-600" size={24} />
            WhatsApp Ali
            {totalSinLeer > 0 && (
              <span className="text-xs font-bold bg-emerald-600 text-white rounded-full px-2 py-0.5">{totalSinLeer} sin leer</span>
            )}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Chats del +56 9 8257 9808. Si escribes, Ali queda en pausa en ese chat hasta que la reactives.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={asesorId}
            onChange={(e) => elegirAsesor(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-100"
          >
            <option value="">Respondo como...</option>
            {asesores.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              cargarConversaciones();
              if (seleccionada) cargarHilo(seleccionada);
            }}
            className="p-2 rounded-lg bg-white border border-slate-300 text-slate-500 hover:text-emerald-600"
            title="Actualizar"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-2 text-sm flex justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600" title="Cerrar">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] xl:grid-cols-[320px_1fr_360px] gap-4 lg:h-[calc(100vh-200px)]">
        {/* Lista */}
        <div className="bg-white rounded-xl border border-slate-200 flex flex-col min-h-0 max-h-[60vh] lg:max-h-none">
          <div className="p-3 border-b border-slate-100 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, teléfono o texto"
                className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {(
                [
                  ['todos', 'Todos'],
                  ['sin_leer', `Sin leer${totalSinLeer ? ` (${totalSinLeer})` : ''}`],
                  ['pausa', 'Ali en pausa'],
                  ['ali', 'Atiende Ali'],
                ] as [Filtro, string][]
              ).map(([valor, etiqueta]) => (
                <button
                  key={valor}
                  onClick={() => setFiltro(valor)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                    filtro === valor
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-300'
                  }`}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {cargando ? (
              <p className="p-6 text-sm text-slate-400">Cargando conversaciones...</p>
            ) : visibles.length === 0 ? (
              <p className="p-6 text-sm text-slate-400">
                {conversaciones.length === 0 ? 'Todavía nadie le ha escrito a este número.' : 'Ningún chat coincide con el filtro.'}
              </p>
            ) : (
              visibles.map((c) => {
                const noLeido = sinLeer(c);
                return (
                  <button
                    key={c.id}
                    onClick={() => abrir(c.id)}
                    className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors ${
                      seleccionada === c.id ? 'bg-emerald-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`truncate flex items-center gap-2 text-[#33475b] ${noLeido ? 'font-bold' : 'font-semibold'}`}>
                        {noLeido && <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />}
                        {nombreDe(c)}
                      </span>
                      <span className="text-[11px] text-slate-400 whitespace-nowrap">{hora(c.ultimo_en || c.actualizado)}</span>
                    </div>
                    <p className={`text-xs truncate mt-1 ${noLeido ? 'text-[#33475b]' : 'text-slate-500'}`}>
                      <span className="font-bold uppercase text-[10px] mr-1">
                        {c.ultimo_emisor === 'advisor' ? 'Asesor:' : c.ultimo_emisor === 'ali' ? 'Ali:' : 'Cliente:'}
                      </span>
                      {c.ultimo_texto || 'Sin mensajes'}
                    </p>
                    <div className="mt-1.5 flex gap-1.5 flex-wrap">
                      {c.pausada_en ? (
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                          ⏸ Ali en pausa
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-violet-50 text-violet-600 border border-violet-200">
                          🤖 Atiende Ali
                        </span>
                      )}
                      {c.derivada && (
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">
                          Pidió asesor
                        </span>
                      )}
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                        {c.asesor_nombre || 'Sin asignar'}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Chat */}
        <div className="bg-white rounded-xl border border-slate-200 flex flex-col min-h-[60vh] lg:min-h-0">
          {!seleccionada ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Elige un chat para leerlo y responder.</div>
          ) : (
            <>
              <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-[#33475b] truncate">
                    {conversacionActual ? nombreDe(conversacionActual) : cabecera ? nombreDe(cabecera) : 'Cargando...'}
                  </div>
                  {cabecera && (
                    <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                      <span>{telefonoDePsid(cabecera.psid)}</span>
                      {ventanaAbierta ? (
                        <span className={restan !== null && restan < 3 ? 'text-amber-600 font-semibold' : ''}>
                          Se puede escribir por {restan !== null && restan >= 1 ? `${Math.floor(restan)} h` : 'menos de 1 h'} más
                        </span>
                      ) : (
                        <span className="text-red-600 font-semibold">Pasaron las 24 h: no se puede escribir</span>
                      )}
                    </div>
                  )}
                </div>

                {cabecera && (
                  <div className="flex items-center gap-2">
                    {pausada ? (
                      <>
                        <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 max-w-[260px]">
                          ⏸ Ali en pausa{cabecera.pausada_por ? ` · ${cabecera.pausada_por}` : ''}
                          {cabecera.pausa_motivo ? ` (${cabecera.pausa_motivo})` : ''}
                        </span>
                        <button
                          onClick={() => cambiarPausa('reactivar')}
                          disabled={cambiandoPausa}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                        >
                          <Play size={14} /> Reactivar a Ali
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1">
                          <Bot size={13} /> Ali responde sola
                        </span>
                        <button
                          onClick={() => cambiarPausa('pausar')}
                          disabled={cambiandoPausa}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-600 hover:border-amber-400 hover:text-amber-700 disabled:opacity-50"
                        >
                          <Pause size={14} /> Pausar a Ali
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="relative flex-1 min-h-0 flex flex-col">
                <div ref={hiloRef} onScroll={alDesplazar} className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
                  {!hilo ? (
                    <p className="text-sm text-slate-400">Cargando mensajes...</p>
                  ) : (
                    hilo.mensajes.map((m) => (
                      <Burbuja
                        key={m.id}
                        m={m}
                        calificacion={votos[m.id]}
                        onCalificar={(voto, correccion) => calificar(m.id, voto, correccion)}
                      />
                    ))
                  )}
                </div>
                {mensajesNuevos && (
                  <button
                    type="button"
                    onClick={irAlFinal}
                    className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-semibold shadow-md hover:bg-emerald-700"
                  >
                    Mensajes nuevos ↓
                  </button>
                )}
              </div>

              {cabecera && !ventanaAbierta ? (
                <div className="p-4 border-t border-slate-100 text-sm text-slate-600 bg-slate-50 rounded-b-xl">
                  Pasaron más de 24 horas desde el último mensaje del cliente y WhatsApp no deja escribirle sin una plantilla aprobada.
                  Llámalo desde su ficha o espera a que vuelva a escribir.
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    enviarTexto();
                  }}
                  className="p-4 border-t border-slate-100 flex gap-2 items-end"
                >
                  <input
                    ref={inputArchivo}
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    hidden
                    onChange={(e) => {
                      const archivo = e.target.files?.[0];
                      e.target.value = '';
                      if (archivo) enviarArchivo(archivo);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => inputArchivo.current?.click()}
                    disabled={enviando}
                    title="Adjuntar foto (JPG o PNG) o PDF. Lo escrito va como leyenda."
                    className="h-10 px-3 rounded-lg bg-slate-100 text-slate-500 disabled:opacity-40 hover:bg-slate-200"
                  >
                    <Paperclip size={16} />
                  </button>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setMenuDocs((v) => !v)}
                      disabled={enviando}
                      title="Mandar un plano o un brochure"
                      className="h-10 px-3 rounded-lg bg-slate-100 text-slate-500 disabled:opacity-40 hover:bg-slate-200 flex items-center gap-1 text-xs font-semibold"
                    >
                      <FileText size={16} /> Docs
                    </button>
                    {menuDocs && (
                      <div className="absolute bottom-12 left-0 z-20 w-64 bg-white border border-slate-200 rounded-lg shadow-lg py-1">
                        {DOCUMENTOS.map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => enviarDocumento(d.id)}
                            className="w-full text-left px-3 py-2 text-sm text-[#33475b] hover:bg-emerald-50"
                          >
                            {d.nombre}
                          </button>
                        ))}
                        <p className="px-3 pt-1 pb-2 text-[11px] text-slate-400">Sale la versión más nueva, la misma que manda Ali.</p>
                      </div>
                    )}
                  </div>

                  <textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        enviarTexto();
                      }
                    }}
                    rows={1}
                    placeholder={asesorId ? 'Escribe tu mensaje (Shift+Enter para otra línea)' : 'Primero elige arriba de parte de qué asesor...'}
                    maxLength={4000}
                    className="flex-1 min-h-10 max-h-40 resize-y border border-slate-300 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                  <button
                    type="submit"
                    disabled={!texto.trim() || enviando}
                    title="Enviar"
                    className="h-10 px-4 rounded-lg bg-emerald-600 text-white disabled:opacity-40 hover:bg-emerald-700"
                  >
                    <Send size={16} />
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        {/* Ficha */}
        <div className="bg-white rounded-xl border border-slate-200 min-h-0 overflow-y-auto lg:col-span-2 xl:col-span-1">
          {!seleccionada ? (
            <p className="p-6 text-sm text-slate-400">La ficha del lead aparece al abrir un chat.</p>
          ) : !hilo ? (
            <p className="p-6 text-sm text-slate-400">Cargando ficha...</p>
          ) : (
            <Ficha hilo={hilo} onGuardado={() => seleccionada && cargarHilo(seleccionada)} onAbrirCanal={setOtroCanal} />
          )}
        </div>
      </div>

      {otroCanal && <OtroCanalModal id={otroCanal} onCerrar={() => setOtroCanal(null)} />}
    </div>
  );
}

/* ── Ficha del lead ───────────────────────────────────────────────────── */

const SIN_DATO = <span className="text-slate-300">—</span>;

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-xs py-1">
      <span className="text-slate-400">{etiqueta}</span>
      <span className="text-[#33475b] text-right font-medium">{valor ?? SIN_DATO}</span>
    </div>
  );
}

function Seccion({ titulo, children, accion }: { titulo: string; children: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <section className="px-5 py-4 border-b border-slate-100">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{titulo}</h3>
        {accion}
      </div>
      {children}
    </section>
  );
}

const siNo = (v: boolean | null | undefined) => (v === true ? 'Sí' : v === false ? 'No' : null);

function Ficha({ hilo, onGuardado, onAbrirCanal }: { hilo: Hilo; onGuardado: () => void; onAbrirCanal: (id: string) => void }) {
  const lead = hilo.lead;
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '' });
  const [editado, setEditado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [verMensajes, setVerMensajes] = useState(false);

  // El formulario se llena al cambiar de lead; el refresco de cada 5 s no pisa lo que se está escribiendo.
  const leadId = lead?.id || null;
  useEffect(() => {
    if (!lead) return;
    if (editado) return;
    setForm({ firstName: lead.firstName || '', lastName: lead.lastName || '', phone: lead.phone || '', email: lead.email || '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, lead?.firstName, lead?.lastName, lead?.phone, lead?.email]);

  useEffect(() => {
    setEditado(false);
    setAviso(null);
  }, [leadId]);

  const cargarEventos = useCallback(async () => {
    if (!leadId) return;
    try {
      const res = await fetch(`/api/leads/${leadId}/activities`, { cache: 'no-store' });
      const d = await res.json();
      setEventos(d.events || []);
    } catch {
      setEventos([]);
    }
  }, [leadId]);

  useEffect(() => {
    setEventos(null);
    cargarEventos();
  }, [cargarEventos]);

  const guardar = async () => {
    if (!leadId || guardando) return;
    setGuardando(true);
    setAviso(null);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName.trim() || null,
          lastName: form.lastName.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim().toLowerCase() || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const repetido = /unique|duplicate|duplicad/i.test(`${d.error || ''} ${d.message || ''}`);
        setAviso({ ok: false, texto: repetido ? 'Ese correo ya lo tiene otro lead en la base.' : d.message || 'No se pudo guardar.' });
        return;
      }
      setEditado(false);
      setAviso({ ok: true, texto: 'Guardado en la base.' });
      onGuardado();
      cargarEventos();
    } catch {
      setAviso({ ok: false, texto: 'No hay conexión con el servidor.' });
    } finally {
      setGuardando(false);
    }
  };

  if (!lead) {
    return (
      <div className="p-6 text-sm text-slate-500">
        Este chat todavía no está vinculado a un lead. El CRM lo vincula solo con el teléfono de WhatsApp o cuando la persona da su correo.
      </div>
    );
  }

  const cal = hilo.calificacion[0];
  const historial = (eventos || []).filter((e) => verMensajes || !e.type.startsWith('CHAT_'));
  const campo = (clave: keyof typeof form, etiqueta: string, tipo = 'text') => (
    <label className="block">
      <span className="text-[11px] text-slate-400">{etiqueta}</span>
      <input
        type={tipo}
        value={form[clave]}
        onChange={(e) => {
          setForm((f) => ({ ...f, [clave]: e.target.value }));
          setEditado(true);
          setAviso(null);
        }}
        className="w-full border border-slate-200 rounded-md px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-100"
      />
    </label>
  );

  return (
    <div>
      <Seccion
        titulo="Contacto"
        accion={
          <Link href={`/contacts?lead=${lead.id}`} target="_blank" className="text-[11px] text-emerald-700 hover:underline flex items-center gap-1">
            Ficha completa <ExternalLink size={11} />
          </Link>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          {campo('firstName', 'Nombre')}
          {campo('lastName', 'Apellido')}
        </div>
        <div className="mt-2 space-y-2">
          {campo('phone', 'Teléfono', 'tel')}
          {campo('email', 'Correo', 'email')}
        </div>
        <div className="flex items-center justify-between mt-3 gap-2">
          <span className={`text-[11px] ${aviso ? (aviso.ok ? 'text-emerald-600' : 'text-red-600') : 'text-slate-400'}`}>
            {aviso ? aviso.texto : editado ? 'Hay cambios sin guardar.' : ''}
          </span>
          <button
            onClick={guardar}
            disabled={!editado || guardando}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white disabled:opacity-40 hover:bg-emerald-700"
          >
            <Save size={13} /> {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
        <div className="mt-3">
          <Dato etiqueta="Asesor" valor={lead.asesor_nombre} />
          <Dato etiqueta="Estado" valor={lead.status} />
          <Dato etiqueta="Origen" valor={lead.source} />
          <Dato etiqueta="Temperatura" valor={lead.rating} />
          <Dato etiqueta="Creado" valor={hora(lead.createdAt)} />
          {lead.visitDate && (
            <Dato etiqueta="Visita" valor={`${hora(lead.visitDate)}${lead.visitProject ? ` · ${lead.visitProject}` : ''}`} />
          )}
        </div>
      </Seccion>

      <Seccion titulo="Lo que sabe la IA">
        {hilo.leadScore && (
          <div className="mb-2 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Lead score</span>
              <span className="font-bold text-[#33475b]">
                {hilo.leadScore.score} · {hilo.leadScore.banda}
              </span>
            </div>
            {Array.isArray(hilo.leadScore.motivos) && hilo.leadScore.motivos.length > 0 && (
              <ul className="mt-1 text-[11px] text-slate-500 space-y-0.5">
                {hilo.leadScore.motivos.slice(0, 6).map((m, i) => (
                  <li key={i}>
                    +{m.puntos} {m.texto}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <Dato etiqueta="Pie" valor={lead.pie} />
        <Dato etiqueta="Interés" valor={lead.interests} />
        {cal ? (
          <>
            <Dato etiqueta="Categoría" valor={cal.categoria} />
            <Dato etiqueta="Puntaje IA" valor={cal.puntaje} />
            <Dato etiqueta="Proyecto" valor={cal.proyecto} />
            <Dato etiqueta="Tiene pie" valor={siNo(cal.tiene_pie)} />
            <Dato etiqueta="Monto del pie" valor={cal.pie_monto ? `$${cal.pie_monto.toLocaleString('es-CL')}` : null} />
            <Dato etiqueta="Forma de pago" valor={cal.forma_pago} />
            <Dato etiqueta="Plazo de compra" valor={cal.plazo_compra} />
            <Dato etiqueta="Uso" valor={cal.uso} />
            <Dato etiqueta="Quiere visitar" valor={siNo(cal.quiere_visitar)} />
            {cal.objeciones && cal.objeciones.length > 0 && <Dato etiqueta="Objeciones" valor={cal.objeciones.join(', ')} />}
            {cal.resumen && <p className="mt-2 text-xs text-slate-600 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">{cal.resumen}</p>}
            <p className="mt-1 text-[10px] text-slate-400">
              Calificador IA{cal.canal ? ` · ${cal.canal}` : ''} · {hora(cal.updated_at)}
            </p>
          </>
        ) : (
          <p className="text-[11px] text-slate-400 mt-1">El calificador todavía no revisó a este lead.</p>
        )}
        {lead.notes && <p className="mt-2 text-xs text-slate-600 whitespace-pre-wrap">{lead.notes}</p>}
      </Seccion>

      <Seccion titulo="Otros canales">
        {hilo.otrosCanales.length === 0 ? (
          <p className="text-[11px] text-slate-400">Solo ha escrito por este chat.</p>
        ) : (
          <div className="space-y-1.5">
            {hilo.otrosCanales.map((o) => (
              <button
                key={o.id}
                onClick={() => onAbrirCanal(o.id)}
                className="w-full text-left rounded-lg border border-slate-200 px-3 py-2 hover:border-emerald-300 hover:bg-emerald-50/40"
              >
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-[#33475b]">{canalLegible(o.platform, o.psid)}</span>
                  <span className="text-slate-400">{hora(o.ultimo_en || o.actualizado)}</span>
                </div>
                <p className="text-[11px] text-slate-500 truncate mt-0.5">{o.ultimo_texto || 'Sin mensajes'}</p>
              </button>
            ))}
          </div>
        )}
      </Seccion>

      <Seccion
        titulo="Historial"
        accion={
          <label className="text-[11px] text-slate-500 flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={verMensajes} onChange={(e) => setVerMensajes(e.target.checked)} />
            con mensajes
          </label>
        }
      >
        {eventos === null ? (
          <p className="text-[11px] text-slate-400">Cargando historial...</p>
        ) : historial.length === 0 ? (
          <p className="text-[11px] text-slate-400">Sin actividades registradas.</p>
        ) : (
          <ol className="space-y-2.5">
            {historial.slice(0, 80).map((e) => (
              <li key={e.id} className="border-l-2 border-slate-200 pl-3">
                <div className="text-xs font-semibold text-[#33475b]">{e.title}</div>
                <div className="text-[11px] text-slate-500 whitespace-pre-wrap break-words">{e.description}</div>
                <div className="text-[10px] text-slate-400">{hora(e.date)}</div>
              </li>
            ))}
          </ol>
        )}
      </Seccion>
    </div>
  );
}

/* ── Otro canal del lead, en modo consulta ───────────────────────────── */

function OtroCanalModal({ id, onCerrar }: { id: string; onCerrar: () => void }) {
  const [datos, setDatos] = useState<Hilo | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    fetch(`/api/whatsapp-ali/conversations/${id}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setDatos)
      .catch(() => setFallo(true));
  }, [id]);

  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', alTeclado);
    return () => window.removeEventListener('keydown', alTeclado);
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-100 flex justify-between items-center">
          <div className="font-semibold text-[#33475b]">
            {datos ? canalLegible(datos.conversacion.platform, datos.conversacion.psid) : 'Cargando...'}
            <span className="ml-2 text-[11px] font-normal text-slate-400">solo lectura</span>
          </div>
          <button onClick={onCerrar} className="text-slate-400 hover:text-slate-600" title="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
          {fallo ? (
            <p className="text-sm text-red-600">No se pudo leer esa conversación.</p>
          ) : !datos ? (
            <p className="text-sm text-slate-400">Cargando mensajes...</p>
          ) : (
            datos.mensajes.map((m) => <Burbuja key={m.id} m={m} />)
          )}
        </div>
      </div>
    </div>
  );
}
