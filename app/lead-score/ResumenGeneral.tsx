'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';

/**
 * Pestaña "Resumen general" del Lead Score: todos los leads con puntaje que
 * cumplen los filtros, de cualquier temperatura.
 */

export type FilaGrupo = {
  nombre: string;
  leads: number;
  promedio: number;
  calientes: number;
  tibios: number;
  frios: number;
  conInteraccion: number;
  atendidos: number;
};

export type General = FilaGrupo & {
  activos7: number;
  tramos: { desde: number; hasta: number; leads: number }[];
  porAsesor: FilaGrupo[];
  porOrigen: FilaGrupo[];
  senales: { senal: string; leads: number }[];
};

type Reglas = { caliente: number; tibio: number };

const MARCA = '#2d544c';
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');
const num = (n: number) => n.toLocaleString('es-CL');

/** Tarjeta de un número: la cifra manda, la explicación acompaña. */
function Cifra({ titulo, valor, detalle }: { titulo: string; valor: string | number; detalle?: string }) {
  return (
    <div className="border border-[#cbd6e2] rounded-xl p-4">
      <p className="text-[11px] font-bold text-[#516f90] uppercase tracking-wider">{titulo}</p>
      <p className="text-2xl font-extrabold text-[#33475b] tabular-nums mt-1">{valor}</p>
      {detalle && <p className="text-[11px] text-[#516f90] mt-0.5">{detalle}</p>}
    </div>
  );
}

/**
 * Cuántos leads hay en cada tramo de 10 puntos. Una sola serie en un solo
 * color; los cortes de tibio y caliente van como texto, no pintando barras,
 * para no confundir "tramo" con "temperatura".
 */
function Distribucion({ tramos, reglas }: { tramos: General['tramos']; reglas: Reglas }) {
  const [activo, setActivo] = useState<number | null>(null);
  const max = Math.max(1, ...tramos.map((t) => t.leads));
  const total = tramos.reduce((s, t) => s + t.leads, 0);
  const sel = activo === null ? null : tramos[activo];
  return (
    <div>
      <div className="h-5 text-xs text-[#33475b] font-semibold">
        {sel ? (
          <>
            {sel.desde}–{sel.hasta === 99 ? 100 : sel.hasta} puntos: <span className="tabular-nums">{num(sel.leads)}</span>{' '}
            leads ({pct(sel.leads, total)})
          </>
        ) : (
          <span className="text-[#516f90] font-normal">Pasa el mouse por una barra para ver el detalle.</span>
        )}
      </div>
      <div
        className="flex items-end gap-[2px] h-40 mt-2 border-b border-[#cbd6e2]"
        role="img"
        aria-label="Distribución de leads por puntaje"
      >
        {tramos.map((t, i) => (
          <div
            key={t.desde}
            className="flex-1 h-full flex items-end"
            onMouseEnter={() => setActivo(i)}
            onMouseLeave={() => setActivo(null)}
          >
            <div
              className={`w-full rounded-t-[4px] transition-opacity ${activo === null || activo === i ? 'opacity-100' : 'opacity-40'}`}
              style={{ height: t.leads ? `${Math.max(2, (t.leads / max) * 100)}%` : '0', background: MARCA }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-[2px] mt-1">
        {tramos.map((t) => (
          <div key={t.desde} className="flex-1 text-center">
            <p className="text-[10px] text-[#516f90] tabular-nums">{t.desde}</p>
            <p className="text-[10px] text-[#33475b] font-bold tabular-nums">{num(t.leads)}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-[#516f90] mt-2">
        Arriba, el puntaje donde empieza cada tramo; abajo, cuántos leads hay. Tibio desde {reglas.tibio} · Caliente desde{' '}
        {reglas.caliente}.
      </p>
    </div>
  );
}

function TablaGrupos({ titulo, filas, etiqueta }: { titulo: string; filas: FilaGrupo[]; etiqueta: (n: string) => string }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-[#33475b] mb-2">{titulo}</h3>
      <div className="overflow-x-auto border border-[#cbd6e2] rounded-xl">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-[#f5f8fa] text-[#516f90] text-[11px] font-bold uppercase tracking-wider border-b border-[#cbd6e2]">
              <th className="px-4 py-2.5"></th>
              <th className="px-4 py-2.5 text-right">Leads</th>
              <th className="px-4 py-2.5 text-right">Prom.</th>
              <th className="px-4 py-2.5 text-right">Calientes</th>
              <th className="px-4 py-2.5 text-right">Tibios</th>
              <th className="px-4 py-2.5 text-right">Fríos</th>
              <th className="px-4 py-2.5 text-right">Con interacción</th>
              <th className="px-4 py-2.5 text-right">Atendidos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#cbd6e2]">
            {filas.map((f) => (
              <tr key={f.nombre}>
                <td className="px-4 py-2.5 font-semibold text-[#33475b] whitespace-nowrap">{etiqueta(f.nombre)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{num(f.leads)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-bold">{f.promedio}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{num(f.calientes)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{num(f.tibios)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{num(f.frios)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{pct(f.conInteraccion, f.leads)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{pct(f.atendidos, f.leads)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ResumenGeneral({
  g,
  reglas,
  origenes,
}: {
  g: General;
  reglas: Reglas;
  origenes: Record<string, string>;
}) {
  if (!g.leads) {
    return <p className="px-6 py-10 text-center text-sm text-[#516f90]">No hay leads con estos filtros.</p>;
  }
  const maxSenal = Math.max(1, ...g.senales.map((s) => s.leads));
  return (
    <div className="p-4 sm:p-6 space-y-8">
      <p className="text-xs text-[#516f90] flex items-start gap-1">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        Todos los leads con puntaje que cumplen los filtros de arriba, de cualquier temperatura (salvo que elijas una).
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Cifra titulo="Leads" valor={num(g.leads)} />
        <Cifra titulo="Puntaje promedio" valor={g.promedio} detalle="de 100" />
        <Cifra titulo="Con interacción" valor={pct(g.conInteraccion, g.leads)} detalle={`${num(g.conInteraccion)} leads hicieron algo`} />
        <Cifra titulo="Activos esta semana" valor={num(g.activos7)} detalle="interactuaron en los últimos 7 días" />
        <Cifra titulo="Atendidos" valor={pct(g.atendidos, g.leads)} detalle={`${num(g.leads - g.atendidos)} pendientes`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h3 className="text-sm font-bold text-[#33475b] mb-1">Cómo se reparten los puntajes</h3>
          <Distribucion tramos={g.tramos} reglas={reglas} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-[#33475b] mb-1">Qué hicieron los leads</h3>
          <p className="text-[11px] text-[#516f90] mb-3">Cuántos leads tienen cada señal (un lead puede tener varias).</p>
          {g.senales.length === 0 ? (
            <p className="text-sm text-[#516f90]">Ningún lead tiene interacciones registradas.</p>
          ) : (
            <div className="space-y-2.5">
              {g.senales.map((s) => (
                <div key={s.senal} title={`${s.senal}: ${num(s.leads)} leads (${pct(s.leads, g.leads)})`}>
                  <div className="flex justify-between text-xs gap-3">
                    <span className="text-[#33475b] font-semibold">{s.senal}</span>
                    <span className="text-[#516f90] tabular-nums whitespace-nowrap">
                      {num(s.leads)} · {pct(s.leads, g.leads)}
                    </span>
                  </div>
                  <div className="h-2 mt-1 rounded-full bg-[#eaf0f6]">
                    <div className="h-2 rounded-full" style={{ width: `${(s.leads / maxSenal) * 100}%`, background: MARCA }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <TablaGrupos titulo="Por asesor" filas={g.porAsesor} etiqueta={(n) => n} />
        <TablaGrupos titulo="Por origen" filas={g.porOrigen} etiqueta={(n) => origenes[n] || n} />
      </div>
    </div>
  );
}
