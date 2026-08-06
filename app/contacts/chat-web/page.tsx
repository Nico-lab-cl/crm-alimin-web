'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Globe, Send, User, Mail, Phone, RefreshCw } from 'lucide-react';

/**
 * Bandeja del chat en vivo de aliminspa.cl.
 *
 * Es la misma conversación que ven los asesores en el CRM móvil: ambos leen la
 * base principal. Como este CRM entra con una sola contraseña compartida y no
 * distingue usuarios, el asesor elige de parte de quién responde.
 */

const ASESOR_GUARDADO = 'chat_web_asesor';
const INTERVALO_MS = 5000;

interface Conversacion {
  id: string;
  nombre_visitante: string | null;
  actualizado: string;
  visto_por_ultima_vez: string | null;
  lead_nombre: string | null;
  lead_apellido: string | null;
  telefono: string | null;
  correo: string | null;
  estado: string | null;
  asesor_nombre: string | null;
  ultimo_texto: string | null;
  ultimo_emisor: string | null;
  ultimo_en: string | null;
}

interface Mensaje {
  id: string;
  text: string;
  emisor: string;
  autor: string | null;
  creado: string;
}

function nombreDe(c: Pick<Conversacion, 'lead_nombre' | 'lead_apellido' | 'nombre_visitante'>) {
  const completo = [c.lead_nombre, c.lead_apellido].filter(Boolean).join(' ').trim();
  return completo || c.nombre_visitante || 'Visitante';
}

function enLinea(visto: string | null) {
  return !!visto && Date.now() - new Date(visto).getTime() < 60_000;
}

function hora(valor: string | null) {
  if (!valor) return '';
  return new Date(valor).toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ChatWebPage() {
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [cabecera, setCabecera] = useState<Conversacion | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [asesores, setAsesores] = useState<{ id: string; name: string }[]>([]);
  const [asesorId, setAsesorId] = useState('');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const hiloRef = useRef<HTMLDivElement>(null);

  const cargarConversaciones = useCallback(async () => {
    try {
      const res = await fetch('/api/chat-web/conversations', { cache: 'no-store' });
      const datos = await res.json();
      setConversaciones(datos.conversaciones || []);
      if (datos.error) setError(datos.error);
    } catch {
      setError('No se pudo cargar la bandeja.');
    } finally {
      setCargando(false);
    }
  }, []);

  const cargarHilo = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/chat-web/conversations/${id}`, { cache: 'no-store' });
      if (!res.ok) return;
      const datos = await res.json();
      setCabecera(datos.conversacion);
      setMensajes(datos.mensajes || []);
    } catch {
      // El siguiente ciclo reintenta.
    }
  }, []);

  useEffect(() => {
    cargarConversaciones();
    fetch('/api/advisors')
      .then((r) => r.json())
      .then((d) => setAsesores(d.advisors || []))
      .catch(() => setAsesores([]));

    try {
      const guardado = window.localStorage.getItem(ASESOR_GUARDADO);
      if (guardado) setAsesorId(guardado);
    } catch {
      // Almacenamiento bloqueado: el selector queda vacío y se elige a mano.
    }
  }, [cargarConversaciones]);

  useEffect(() => {
    const intervalo = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      cargarConversaciones();
      if (seleccionada) cargarHilo(seleccionada);
    }, INTERVALO_MS);
    return () => clearInterval(intervalo);
  }, [seleccionada, cargarConversaciones, cargarHilo]);

  useEffect(() => {
    if (hiloRef.current) hiloRef.current.scrollTop = hiloRef.current.scrollHeight;
  }, [mensajes]);

  const abrir = (id: string) => {
    setSeleccionada(id);
    setMensajes([]);
    setCabecera(null);
    cargarHilo(id);
  };

  const elegirAsesor = (id: string) => {
    setAsesorId(id);
    try {
      window.localStorage.setItem(ASESOR_GUARDADO, id);
    } catch {
      // Sin persistencia; hay que elegirlo de nuevo en la próxima sesión.
    }
  };

  const responder = async (e: React.FormEvent) => {
    e.preventDefault();
    const contenido = texto.trim();
    if (!contenido || !seleccionada || enviando) return;

    if (!asesorId) {
      setError('Elige de parte de qué asesor estás respondiendo.');
      return;
    }

    setEnviando(true);
    setError(null);

    try {
      const res = await fetch('/api/chat-web/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: seleccionada, advisorId: asesorId, text: contenido }),
      });

      const datos = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(datos.error || 'No se pudo enviar la respuesta.');
        return;
      }

      setTexto('');
      await cargarHilo(seleccionada);
      cargarConversaciones();
    } catch {
      setError('No hay conexión con el servidor.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-[#33475b] flex items-center gap-2">
            <Globe className="text-emerald-600" size={24} />
            Chat Web
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Conversaciones en vivo desde aliminspa.cl. Es la misma bandeja que ven los asesores en
            el celular.
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
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-2 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 h-[calc(100vh-220px)]">
        {/* Lista */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-y-auto">
          {cargando ? (
            <p className="p-6 text-sm text-slate-400">Cargando conversaciones...</p>
          ) : conversaciones.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">
              Todavía no hay conversaciones del chat web.
            </p>
          ) : (
            conversaciones.map((c) => (
              <button
                key={c.id}
                onClick={() => abrir(c.id)}
                className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors ${
                  seleccionada === c.id ? 'bg-emerald-50' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#33475b] truncate flex items-center gap-2">
                    {enLinea(c.visto_por_ultima_vez) && (
                      <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                    )}
                    {nombreDe(c)}
                  </span>
                  <span className="text-[11px] text-slate-400 whitespace-nowrap">
                    {hora(c.ultimo_en || c.actualizado)}
                  </span>
                </div>
                <p className="text-xs text-slate-500 truncate mt-1">
                  <span className="font-bold uppercase text-[10px] mr-1">
                    {c.ultimo_emisor === 'advisor' ? 'Asesor:' : 'Cliente:'}
                  </span>
                  {c.ultimo_texto || 'Sin mensajes'}
                </p>
                <div className="mt-1.5 flex gap-2 flex-wrap">
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                    {c.asesor_nombre || 'Sin asignar'}
                  </span>
                  {c.estado && (
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                      {c.estado}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Hilo */}
        <div className="bg-white rounded-xl border border-slate-200 flex flex-col min-h-0">
          {!seleccionada ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              Elige una conversación para leerla y responder.
            </div>
          ) : (
            <>
              <div className="px-5 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2 font-semibold text-[#33475b]">
                  <User size={16} className="text-slate-400" />
                  {cabecera ? nombreDe(cabecera) : 'Cargando...'}
                  {cabecera && enLinea(cabecera.visto_por_ultima_vez) && (
                    <span className="text-[10px] uppercase font-bold text-green-600">
                      en la página
                    </span>
                  )}
                </div>
                {cabecera && (
                  <div className="flex gap-4 mt-1 text-xs text-slate-500">
                    {cabecera.telefono && (
                      <span className="flex items-center gap-1">
                        <Phone size={12} /> {cabecera.telefono}
                      </span>
                    )}
                    {cabecera.correo && (
                      <span className="flex items-center gap-1">
                        <Mail size={12} /> {cabecera.correo}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div ref={hiloRef} className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
                {mensajes.map((m) => {
                  const esAsesor = m.emisor === 'advisor';
                  return (
                    <div
                      key={m.id}
                      className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                        esAsesor
                          ? 'self-end bg-emerald-600 text-white rounded-br-sm'
                          : 'self-start bg-slate-100 text-[#33475b] rounded-bl-sm'
                      }`}
                    >
                      {esAsesor && m.autor && (
                        <span className="block text-[10px] font-bold uppercase opacity-80 mb-0.5">
                          {m.autor}
                        </span>
                      )}
                      {m.text}
                      <span className="block text-[10px] opacity-60 mt-1">{hora(m.creado)}</span>
                    </div>
                  );
                })}
              </div>

              <form onSubmit={responder} className="p-4 border-t border-slate-100 flex gap-2">
                <input
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder={
                    asesorId ? 'Escribe tu respuesta...' : 'Primero elige de parte de qué asesor...'
                  }
                  maxLength={2000}
                  className="flex-1 border border-slate-300 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-100"
                />
                <button
                  type="submit"
                  disabled={!texto.trim() || enviando}
                  className="px-4 rounded-lg bg-emerald-600 text-white disabled:opacity-40 hover:bg-emerald-700 transition-colors"
                >
                  <Send size={16} />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
