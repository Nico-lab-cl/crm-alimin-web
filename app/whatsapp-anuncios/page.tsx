'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, RefreshCcw, Info, ExternalLink } from 'lucide-react';

type Asesor = {
  asesor: string;
  chats: number;
  mensajes: number;
  respondidos: number;
  sinRespuesta: number;
  medianaMinutosRespuesta: number | null;
};

type Anuncio = {
  adId: string | null;
  titulo: string | null;
  url: string | null;
  chats: number;
  porAsesor: Record<string, number>;
};

type Datos = {
  desde: string;
  hasta: string;
  totales: { chats: number; mensajes: number; respondidos: number; sinRespuesta: number; medianaMinutosRespuesta: number | null };
  porAsesor: Asesor[];
  porAnuncio: Anuncio[];
  porDia: Record<string, string | number>[];
};

const COLORES = ['#2d544c', '#e8833a', '#3b82c4', '#9b59b6', '#d4a017', '#5f8f6b'];

const campo =
  'w-full bg-[#f5f8fa] border-[#cbd6e2] border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#2d544c]/20 outline-none text-[#33475b] focus:bg-white';

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');

/** YYYY-MM-DD en hora de Chile, N días atrás. */
function haceDias(dias: number) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(Date.now() - dias * 86_400_000));
}

const sumarDias = (fecha: string, n: number) =>
  new Date(new Date(`${fecha}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

/** Lunes de la semana actual (Chile), N semanas atrás. */
function lunes(semanasAtras: number) {
  const hoy = haceDias(0);
  const dow = (new Date(`${hoy}T12:00:00Z`).getUTCDay() + 6) % 7;
  return sumarDias(hoy, -(dow + 7 * semanasAtras));
}

const ATAJOS: { etiqueta: string; rango: () => [string, string] }[] = [
  { etiqueta: 'Esta semana', rango: () => [lunes(0), haceDias(0)] },
  { etiqueta: 'Semana pasada', rango: () => [lunes(1), sumarDias(lunes(1), 6)] },
  { etiqueta: 'Últimos 30 días', rango: () => [haceDias(29), haceDias(0)] },
];

function tiempo(min: number | null) {
  if (min === null) return '—';
  if (min < 60) return `${min} min`;
  const h = min / 60;
  if (h < 24) return `${h.toFixed(h < 10 ? 1 : 0)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

const diaCorto = (dia: string) =>
  new Date(`${dia}T12:00:00Z`).toLocaleDateString('es-CL', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short' });

export default function WhatsappAnunciosPage() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [[desde, hasta], setRango] = useState<[string, string]>(() => ATAJOS[1].rango());

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const params = new URLSearchParams();
      if (desde) params.set('desde', desde);
      if (hasta) params.set('hasta', hasta);
      const res = await fetch(`/api/whatsapp-anuncios?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || json.success === false) throw new Error(json.message || 'No se pudo leer el reporte');
      setDatos(json);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const t = datos?.totales;
  const asesores = datos?.porAsesor || [];
  const color = (nombre: string) => COLORES[Math.max(0, asesores.findIndex((a) => a.asesor === nombre)) % COLORES.length];
  const maxDia = Math.max(1, ...(datos?.porDia || []).map((d) => Number(d.total)));

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-[1600px] mx-auto">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#2d544c] flex items-center gap-2">
            <MessageCircle className="w-7 h-7 text-green-600" /> WhatsApp de anuncios
          </h1>
          <p className="text-[#516f90] mt-1">Cuántos chats de anuncios de Meta le llegaron a cada asesor y cuántos contestó.</p>
        </div>
        <button
          onClick={cargar}
          disabled={cargando}
          className="flex items-center gap-2 px-4 py-2 bg-[#2d544c] text-white rounded-lg font-bold hover:bg-[#1f3a35] transition-all shadow-sm disabled:opacity-60 self-start"
        >
          <RefreshCcw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
          {cargando ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>

      <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm px-5 py-4 text-sm text-[#33475b] flex gap-3">
        <Info className="w-5 h-5 text-[#516f90] shrink-0 mt-0.5" />
        <p>
          Cuenta los chats cuyo primer mensaje llegó desde un anuncio de Meta con botón de WhatsApp: WhatsApp marca ese
          mensaje con el anuncio de origen. Cada contacto cuenta una vez por número. El asesor es el dueño del número que
          recibió el chat. <b>Contestado</b> = el asesor escribió al menos una vez después (se mira hasta 3 días pasado el
          rango).
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-semibold">{error}</div>
      )}

      {/* Filtros */}
      <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Desde</label>
            <input type="date" value={desde} onChange={(e) => setRango([e.target.value, hasta])} className={campo} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#516f90] uppercase tracking-wider">Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setRango([desde, e.target.value])} className={campo} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ATAJOS.map((a) => {
            const [d, h] = a.rango();
            const activo = d === desde && h === hasta;
            return (
              <button
                key={a.etiqueta}
                onClick={() => setRango([d, h])}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                  activo
                    ? 'bg-[#2d544c] text-white border-[#2d544c]'
                    : 'bg-white text-[#516f90] border-[#cbd6e2] hover:border-[#2d544c] hover:text-[#2d544c]'
                }`}
              >
                {a.etiqueta}
              </button>
            );
          })}
        </div>
      </div>

      {/* Totales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { titulo: 'Chats de anuncios', valor: t ? String(t.chats) : '—', nota: t ? `${t.mensajes} mensajes de clientes` : '' },
          { titulo: 'Contestados', valor: t ? String(t.respondidos) : '—', nota: t ? pct(t.respondidos, t.chats) : '' },
          { titulo: 'Sin respuesta', valor: t ? String(t.sinRespuesta) : '—', nota: t ? pct(t.sinRespuesta, t.chats) : '' },
          { titulo: 'Tiempo de respuesta', valor: tiempo(t?.medianaMinutosRespuesta ?? null), nota: 'mediana' },
        ].map((k) => (
          <div key={k.titulo} className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm p-5">
            <p className="text-xs font-bold text-[#516f90] uppercase tracking-wider">{k.titulo}</p>
            <p className="text-3xl font-bold text-[#33475b] mt-2 tabular-nums">{k.valor}</p>
            <p className="text-xs text-[#516f90] mt-1">{k.nota}</p>
          </div>
        ))}
      </div>

      {/* Por asesor */}
      <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm overflow-hidden">
        <h2 className="px-5 py-4 font-bold text-[#33475b] border-b border-[#eaf0f6]">Por asesor</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#f5f8fa] text-[#516f90] text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-3">Asesor</th>
                <th className="text-right px-5 py-3">Chats</th>
                <th className="text-right px-5 py-3">Mensajes recibidos</th>
                <th className="text-right px-5 py-3">Contestados</th>
                <th className="text-right px-5 py-3">Sin respuesta</th>
                <th className="text-right px-5 py-3">Tiempo de respuesta</th>
              </tr>
            </thead>
            <tbody>
              {asesores.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-[#516f90]">
                    {cargando ? 'Cargando…' : 'No llegaron chats desde anuncios en estas fechas.'}
                  </td>
                </tr>
              )}
              {asesores.map((a) => (
                <tr key={a.asesor} className="border-t border-[#eaf0f6]">
                  <td className="px-5 py-3 font-semibold text-[#33475b]">
                    <span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ background: color(a.asesor) }} />
                    {a.asesor}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-bold">{a.chats}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{a.mensajes}</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {a.respondidos} <span className="text-[#516f90]">({pct(a.respondidos, a.chats)})</span>
                  </td>
                  <td className={`px-5 py-3 text-right tabular-nums ${a.sinRespuesta ? 'text-red-600 font-semibold' : ''}`}>
                    {a.sinRespuesta}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{tiempo(a.medianaMinutosRespuesta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Por día */}
      <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm p-5">
        <h2 className="font-bold text-[#33475b] mb-4">Chats por día</h2>
        <div className="space-y-2">
          {(datos?.porDia || []).map((d) => (
            <div key={String(d.dia)} className="flex items-center gap-3 text-xs">
              <span className="w-24 shrink-0 text-[#516f90] capitalize">{diaCorto(String(d.dia))}</span>
              <div className="flex-1 flex h-5 gap-px">
                {asesores
                  .filter((a) => Number(d[a.asesor] || 0) > 0)
                  .map((a) => (
                    <div
                      key={a.asesor}
                      title={`${a.asesor}: ${d[a.asesor]}`}
                      className="h-full first:rounded-l last:rounded-r"
                      style={{ width: `${(Number(d[a.asesor]) / maxDia) * 100}%`, background: color(a.asesor) }}
                    />
                  ))}
              </div>
              <span className="w-8 text-right font-bold text-[#33475b] tabular-nums">{d.total}</span>
            </div>
          ))}
        </div>
        {asesores.length > 0 && (
          <div className="flex flex-wrap gap-4 mt-4 text-xs text-[#516f90]">
            {asesores.map((a) => (
              <span key={a.asesor} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: color(a.asesor) }} />
                {a.asesor}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Por anuncio */}
      <div className="bg-white border border-[#cbd6e2] rounded-2xl shadow-sm overflow-hidden">
        <h2 className="px-5 py-4 font-bold text-[#33475b] border-b border-[#eaf0f6]">Por anuncio</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#f5f8fa] text-[#516f90] text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-3">Anuncio</th>
                <th className="text-right px-5 py-3">Chats</th>
                <th className="text-left px-5 py-3">Reparto por asesor</th>
              </tr>
            </thead>
            <tbody>
              {(datos?.porAnuncio || []).map((a) => (
                <tr key={a.adId || a.titulo || 'sin-id'} className="border-t border-[#eaf0f6] align-top">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-[#33475b]">{a.titulo || 'Anuncio sin título'}</p>
                    <p className="text-xs text-[#516f90] flex items-center gap-2">
                      {a.adId ? `ID ${a.adId}` : 'Sin ID de anuncio'}
                      {a.url && (
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-[#2d544c] hover:underline"
                        >
                          ver <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </p>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-bold">{a.chats}</td>
                  <td className="px-5 py-3 text-xs text-[#33475b]">
                    {Object.entries(a.porAsesor)
                      .sort((x, y) => y[1] - x[1])
                      .map(([nombre, n]) => `${nombre} ${n}`)
                      .join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
