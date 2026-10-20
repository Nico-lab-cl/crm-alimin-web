'use client';

import { useCallback, useEffect, useState } from 'react';
import { Workflow, RefreshCcw, Eye, Play, Save, Info, Power, Clock, Mail, AlertTriangle, Send } from 'lucide-react';

type Stats = { enviados: number; aperturas: number; clics: number };

type Paso = {
  id: string;
  posicion: number;
  nombre: string;
  espera_horas: number;
  ventana: 'INMEDIATA' | 'OPTIMA';
  campaign_id: string | null;
  stats: Stats;
};

type Secuencia = {
  id: string;
  clave: string;
  nombre: string;
  descripcion: string;
  disparador: string;
  proyecto: 'LOMAS' | 'ARENA' | null;
  prioridad: number;
  tope_diario: number;
  activa: boolean;
  incompleta: boolean;
  estados: Record<string, number>;
  motivos: { motivo: string; n: number }[];
  pasos: Paso[];
};

type Campana = { id: string; title: string; subject: string; conEnlace: boolean };

type Reciente = {
  id: string;
  secuencia: string;
  email: string;
  proyecto: string | null;
  estado: string;
  motivo_salida: string | null;
  pasos_enviados: number;
  proximo_envio_at: string | null;
};

type ResultadoPrueba = {
  secuencia: string;
  paso: number;
  nombre: string;
  provisorio: boolean;
  ok: boolean;
  error?: string;
};

type Datos = {
  secuencias: Secuencia[];
  campanas: Campana[];
  fueraDeMasivos: number;
  recientes: Reciente[];
};

const DISPARADOR: Record<string, string> = {
  NUEVO_META: 'Lead nuevo de Meta',
  NUEVO_WEB: 'Lead nuevo de la web',
  ABANDONO_AGENDA: 'Abrió la agenda y no agendó',
  VOLVIO: 'Volvió a interesarse',
  REACTIVACION: 'Dormido 120 días',
};

const PROYECTO: Record<string, string> = { LOMAS: 'Lomas del Mar', ARENA: 'Arena y Sol' };

const VENTANA: Record<string, string> = {
  INMEDIATA: '8:00–22:00',
  OPTIMA: '8–11 / 19–22',
};

function esperaTexto(h: number, primero: boolean): string {
  if (h === 0) return primero ? 'al entrar' : 'enseguida';
  if (h < 24) return `${h} h después`;
  const d = Math.round((h / 24) * 10) / 10;
  return `${d} ${d === 1 ? 'día' : 'días'} después`;
}

function pct(n: number, d: number): string {
  return d > 0 ? `${((100 * n) / d).toFixed(1)}%` : '—';
}

function fecha(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('es-CL', {
    timeZone: 'America/Santiago',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SecuenciasPage() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [vistaPrevia, setVistaPrevia] = useState<Record<string, number> | null>(null);
  const [ocupado, setOcupado] = useState('');
  // Cambios sin guardar por paso: { [pasoId]: { campaign_id, espera_horas } }
  const [cambios, setCambios] = useState<Record<string, { campaign_id?: string | null; espera_horas?: number }>>({});
  const [topes, setTopes] = useState<Record<string, number>>({});
  const [correoPrueba, setCorreoPrueba] = useState('');
  const [prueba, setPrueba] = useState<ResultadoPrueba[] | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch('/api/sequences');
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'No se pudieron leer las secuencias');
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

  const accion = async (cual: 'vista-previa' | 'pasada') => {
    setOcupado(cual);
    try {
      const res = await fetch(`/api/sequences?accion=${cual}`, { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      if (cual === 'vista-previa') setVistaPrevia(json.vistaPrevia);
      else {
        const r = json.resultado;
        alert(
          r.activas === 0
            ? 'No hay secuencias encendidas: la pasada no hizo nada.'
            : `Pasada lista: ${r.inscritos} inscritos, ${r.enviados} correos enviados, ${r.salidas} salidas.`
        );
        await cargar();
      }
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setOcupado('');
    }
  };

  const guardar = async (s: Secuencia, extra: { activa?: boolean } = {}) => {
    setOcupado(s.id);
    try {
      const pasos = s.pasos.filter((p) => cambios[p.id]).map((p) => ({ id: p.id, ...cambios[p.id] }));
      const body: Record<string, unknown> = { pasos, ...extra };
      if (topes[s.id] !== undefined) body.tope_diario = topes[s.id];
      const res = await fetch(`/api/sequences/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setCambios((c) => {
        const n = { ...c };
        s.pasos.forEach((p) => delete n[p.id]);
        return n;
      });
      setTopes((t) => {
        const n = { ...t };
        delete n[s.id];
        return n;
      });
      await cargar();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setOcupado('');
    }
  };

  /** Todos los pasos seguidos al correo de prueba; sin ids, todas las secuencias. */
  const enviarPrueba = async (ids: string[] | null) => {
    const email = correoPrueba.trim();
    if (!email) return alert('Escribe el correo de prueba arriba.');
    const pasos = (datos?.secuencias || [])
      .filter((s) => !ids || ids.includes(s.id))
      .reduce((a, s) => a + s.pasos.length, 0);
    if (!confirm(`Se enviarán ${pasos} correos de prueba a ${email}, uno tras otro (tarda ~${Math.ceil(pasos * 1.6)} s). ¿Seguir?`)) return;
    setOcupado('prueba');
    setPrueba(null);
    try {
      const res = await fetch('/api/sequences?accion=prueba', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, secuencias: ids || [] }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      setPrueba(json.resultados);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setOcupado('');
    }
  };

  const encender = (s: Secuencia) => {
    if (!s.activa) {
      const ok = confirm(
        `¿Encender "${s.nombre}"?\n\nDesde la próxima pasada (máx. 5 min) empieza a inscribir leads y a enviar correos de verdad.`
      );
      if (!ok) return;
    }
    guardar(s, { activa: !s.activa });
  };

  const secuencias = datos?.secuencias || [];
  const campanas = datos?.campanas || [];

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#2d544c] flex items-center gap-2">
            <Workflow className="w-7 h-7 text-[#2d544c]" /> Secuencias de nutrición
          </h1>
          <p className="text-[#516f90] mt-1">
            El CRM inscribe a cada lead según lo que hizo y le manda cada correo a su hora, por el mismo flujo de n8n
            que los masivos.
          </p>
        </div>
        <div className="flex gap-2 self-start flex-wrap">
          <button
            onClick={() => accion('vista-previa')}
            disabled={!!ocupado}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#cbd6e2] text-[#2d544c] rounded-lg font-bold hover:bg-[#f5f8fa] disabled:opacity-60"
          >
            <Eye className="w-4 h-4" /> {ocupado === 'vista-previa' ? 'Calculando…' : '¿Quién entraría ahora?'}
          </button>
          <button
            onClick={() => accion('pasada')}
            disabled={!!ocupado}
            className="flex items-center gap-2 px-4 py-2 bg-[#2d544c] text-white rounded-lg font-bold hover:bg-[#1f3a35] disabled:opacity-60"
          >
            <Play className="w-4 h-4" /> {ocupado === 'pasada' ? 'Corriendo…' : 'Correr pasada ahora'}
          </button>
          <button
            onClick={cargar}
            className="p-2 bg-white border border-[#cbd6e2] rounded-lg text-[#516f90] hover:bg-[#f5f8fa]"
            title="Actualizar"
          >
            <RefreshCcw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm px-5 py-4 text-sm text-[#33475b] space-y-2">
        <p className="flex items-center gap-2 font-bold text-[#2d544c]">
          <Info className="w-4 h-4" /> Reglas para todas las secuencias
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Solo leads: no entran clientes, reservados ni quien ya tiene visita. Salen solos si <b>agendan visita</b>,
            avanzan de etapa, se desuscriben o el correo rebota.
          </li>
          <li>
            Máximo <b>un correo cada 20 horas</b> y <b>3 por semana</b> por persona, contando también los masivos. Si
            no cabe, el paso se corre.
          </li>
          <li>
            Si alguien está en dos secuencias, avanza solo la más urgente (abandono de agenda → bienvenida → volvió →
            reactivación).
          </li>
          <li>
            Horario de Chile: la bienvenida y el aviso de agenda salen entre 8:00 y 22:00; el resto, en las ventanas con
            más aperturas y clics (8:00–11:00 y 19:00–22:00).
          </li>
          <li>
            Al encender una secuencia solo entran los leads de las últimas 24–72 h, nunca toda la base. Los enlaces a
            aliminspa.cl llevan UTM de la secuencia y del paso.
          </li>
          <li>
            Fuera de los masivos (no abrieron la reactivación): <b>{datos?.fueraDeMasivos ?? '—'}</b> correos. Vuelven
            solos si visitan la web.
          </li>
        </ul>
      </div>

      <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm px-5 py-4 space-y-3">
        <p className="flex items-center gap-2 font-bold text-[#2d544c]">
          <Send className="w-4 h-4" /> Probar las cadenas en tu correo
        </p>
        <p className="text-sm text-[#516f90]">
          Manda todos los pasos seguidos, sin las esperas, por el mismo camino que a los leads (n8n). Los pasos que aún no
          tienen diseño llegan como correo provisorio con el link a su página. No inscribe a nadie ni cuenta en las
          métricas.
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="email"
            value={correoPrueba}
            onChange={(e) => setCorreoPrueba(e.target.value)}
            placeholder="tu@correo.cl"
            className="border border-[#cbd6e2] rounded-lg px-3 py-2 text-sm w-72"
          />
          <button
            onClick={() => enviarPrueba(null)}
            disabled={!!ocupado}
            className="flex items-center gap-2 px-4 py-2 bg-[#2d544c] text-white rounded-lg font-bold hover:bg-[#1f3a35] disabled:opacity-60"
          >
            <Send className="w-4 h-4" /> {ocupado === 'prueba' ? 'Enviando…' : 'Enviar prueba de todas'}
          </button>
        </div>
        {prueba && (
          <div className="text-sm">
            <p className="font-bold text-[#33475b]">
              {prueba.filter((r) => r.ok).length} de {prueba.length} correos entregados a n8n
              {prueba.some((r) => !r.ok) ? ' · revisa los que fallaron' : ''}.
            </p>
            <ul className="mt-1 text-xs text-[#516f90] max-h-48 overflow-y-auto">
              {prueba.map((r, i) => (
                <li key={i} className={r.ok ? '' : 'text-red-700'}>
                  {r.ok ? '✓' : '✗'} {r.secuencia} · paso {r.paso}: {r.nombre}
                  {r.provisorio ? ' (provisorio)' : ''}
                  {r.error ? ` — ${r.error}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3">{error}</div>}

      {secuencias.map((s) => {
        const cambiosPendientes =
          s.pasos.some((p) => cambios[p.id]) || (topes[s.id] !== undefined && topes[s.id] !== s.tope_diario);
        const totalEnv = s.pasos.reduce((a, p) => a + p.stats.enviados, 0);
        return (
          <div key={s.id} className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 border-b border-[#eaf0f6]">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-[#2d544c]">{s.nombre}</h2>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      s.activa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {s.activa ? 'Encendida' : 'Apagada'}
                  </span>
                  {s.proyecto && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#e5f5f8] text-[#2d544c]">
                      {PROYECTO[s.proyecto]}
                    </span>
                  )}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#f5f8fa] text-[#516f90]">
                    {DISPARADOR[s.disparador] || s.disparador}
                  </span>
                </div>
                <p className="text-sm text-[#516f90] max-w-3xl">{s.descripcion}</p>
                <p className="text-xs text-[#516f90]">
                  Dentro ahora: <b>{s.estados.ACTIVA || 0}</b> · Terminaron: <b>{s.estados.TERMINADA || 0}</b> ·
                  Salieron: <b>{s.estados.SALIO || 0}</b> · Correos enviados: <b>{totalEnv}</b>
                  {vistaPrevia && (
                    <>
                      {' '}
                      · Entrarían ahora: <b className="text-[#2d544c]">{vistaPrevia[s.id] ?? 0}</b>
                    </>
                  )}
                </p>
                {s.motivos.length > 0 && (
                  <p className="text-xs text-[#516f90]">
                    Motivos de salida: {s.motivos.map((m) => `${m.motivo} (${m.n})`).join(' · ')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {s.disparador === 'REACTIVACION' && (
                  <label className="text-xs text-[#516f90] flex items-center gap-1">
                    Cupo diario
                    <input
                      type="number"
                      min={0}
                      value={topes[s.id] ?? s.tope_diario}
                      onChange={(e) => setTopes((t) => ({ ...t, [s.id]: Number(e.target.value) }))}
                      className="w-20 border border-[#cbd6e2] rounded px-2 py-1 text-sm"
                    />
                  </label>
                )}
                <button
                  onClick={() => enviarPrueba([s.id])}
                  disabled={!!ocupado}
                  title="Manda todos los pasos de esta secuencia al correo de prueba"
                  className="flex items-center gap-1 px-3 py-2 bg-white border border-[#cbd6e2] text-[#2d544c] rounded-lg text-sm font-bold disabled:opacity-60"
                >
                  <Send className="w-4 h-4" /> Probar
                </button>
                {cambiosPendientes && (
                  <button
                    onClick={() => guardar(s)}
                    disabled={ocupado === s.id}
                    className="flex items-center gap-1 px-3 py-2 bg-[#2bbaef] text-white rounded-lg text-sm font-bold disabled:opacity-60"
                  >
                    <Save className="w-4 h-4" /> Guardar
                  </button>
                )}
                <button
                  onClick={() => encender(s)}
                  disabled={ocupado === s.id || cambiosPendientes || (!s.activa && s.incompleta)}
                  title={
                    !s.activa && s.incompleta
                      ? 'Elige el correo de cada paso antes de encender'
                      : cambiosPendientes
                        ? 'Guarda los cambios primero'
                        : ''
                  }
                  className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold disabled:opacity-50 ${
                    s.activa ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-[#2d544c] text-white'
                  }`}
                >
                  <Power className="w-4 h-4" /> {s.activa ? 'Apagar' : 'Encender'}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#f5f8fa] text-[#516f90] text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-2">Paso</th>
                    <th className="text-left px-4 py-2">Cuándo</th>
                    <th className="text-left px-4 py-2">Correo</th>
                    <th className="text-right px-4 py-2">Enviados</th>
                    <th className="text-right px-4 py-2">Apertura</th>
                    <th className="text-right px-4 py-2">Clic</th>
                  </tr>
                </thead>
                <tbody>
                  {s.pasos.map((p, i) => {
                    const c = cambios[p.id] || {};
                    const campaignId = c.campaign_id !== undefined ? c.campaign_id : p.campaign_id;
                    const espera = c.espera_horas !== undefined ? c.espera_horas : p.espera_horas;
                    const elegida = campanas.find((x) => x.id === campaignId);
                    return (
                      <tr key={p.id} className="border-t border-[#eaf0f6] align-top">
                        <td className="px-4 py-3">
                          <div className="font-bold text-[#33475b]">
                            {p.posicion}. {p.nombre}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              value={espera}
                              onChange={(e) =>
                                setCambios((x) => ({ ...x, [p.id]: { ...x[p.id], espera_horas: Number(e.target.value) } }))
                              }
                              className="w-16 border border-[#cbd6e2] rounded px-2 py-1"
                            />
                            <span className="text-xs text-[#516f90]">h</span>
                          </div>
                          <div className="text-xs text-[#516f90] mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {esperaTexto(espera, i === 0)} · {VENTANA[p.ventana]}
                          </div>
                        </td>
                        <td className="px-4 py-3 min-w-[280px]">
                          <select
                            value={campaignId || ''}
                            onChange={(e) =>
                              setCambios((x) => ({ ...x, [p.id]: { ...x[p.id], campaign_id: e.target.value || null } }))
                            }
                            className={`w-full border rounded px-2 py-1 ${
                              campaignId ? 'border-[#cbd6e2]' : 'border-amber-400 bg-amber-50'
                            }`}
                          >
                            <option value="">— Elegir correo —</option>
                            {campanas.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.title}
                              </option>
                            ))}
                          </select>
                          {elegida && (
                            <div className="text-xs text-[#516f90] mt-1 flex items-center gap-1">
                              <Mail className="w-3 h-3" /> {elegida.subject}
                            </div>
                          )}
                          {elegida && !elegida.conEnlace && (
                            <div className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> La imagen no tiene link (web o WhatsApp): no se podrá encender.
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">{p.stats.enviados}</td>
                        <td className="px-4 py-3 text-right">{pct(p.stats.aperturas, p.stats.enviados)}</td>
                        <td className="px-4 py-3 text-right">{pct(p.stats.clics, p.stats.enviados)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {(datos?.recientes.length || 0) > 0 && (
        <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm overflow-hidden">
          <h2 className="px-5 py-3 font-bold text-[#2d544c] border-b border-[#eaf0f6]">Movimiento reciente</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#f5f8fa] text-[#516f90] text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Correo</th>
                  <th className="text-left px-4 py-2">Secuencia</th>
                  <th className="text-left px-4 py-2">Estado</th>
                  <th className="text-right px-4 py-2">Pasos enviados</th>
                  <th className="text-left px-4 py-2">Próximo envío</th>
                </tr>
              </thead>
              <tbody>
                {datos!.recientes.map((r) => (
                  <tr key={r.id} className="border-t border-[#eaf0f6]">
                    <td className="px-4 py-2">{r.email}</td>
                    <td className="px-4 py-2">{r.secuencia}</td>
                    <td className="px-4 py-2">
                      {r.estado === 'ACTIVA' ? 'Dentro' : r.estado === 'TERMINADA' ? 'Terminó' : 'Salió'}
                      {r.motivo_salida ? ` · ${r.motivo_salida}` : ''}
                    </td>
                    <td className="px-4 py-2 text-right">{r.pasos_enviados}</td>
                    <td className="px-4 py-2">{r.estado === 'ACTIVA' ? fecha(r.proximo_envio_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
