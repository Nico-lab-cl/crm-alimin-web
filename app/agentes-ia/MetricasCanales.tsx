'use client';

import { useEffect, useState } from 'react';
import { Loader2, BarChart3 } from 'lucide-react';
import { pedir } from './tipos';

interface Fila {
  canal: 'web' | 'instagram' | 'facebook';
  conversaciones: number;
  conTelefono: number;
  leads: number;
  visitas: number;
}

const NOMBRE: Record<Fila['canal'], string> = { web: 'Chat web', instagram: 'Instagram', facebook: 'Facebook' };

/** Ali por canal: conversaciones, % con teléfono, leads y visitas (7 o 30 días). */
export default function MetricasCanales() {
  const [dias, setDias] = useState(7);
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFilas(null);
    pedir<{ canales: Fila[] }>(`/api/agentes-ia/metricas?dias=${dias}`)
      .then((r) => {
        setFilas(r.canales);
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
  }, [dias]);

  return (
    <div className="rounded-xl border border-[#cbd6e2] bg-white p-5">
      <div className="flex items-center gap-2">
        <p className="font-bold text-[#33475b] flex items-center gap-2 flex-1">
          <BarChart3 className="w-4 h-4" /> Ali por canal
        </p>
        {[7, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDias(d)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border ${dias === d ? 'bg-[#2d544c] text-white border-[#2d544c]' : 'bg-white text-[#516f90] border-[#cbd6e2]'}`}
          >
            {d} días
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-rose-700 mt-3">{error}</p>}
      {!filas && !error ? (
        <div className="flex items-center gap-2 text-sm text-[#516f90] mt-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
        </div>
      ) : filas ? (
        <table className="w-full text-sm mt-3">
          <thead>
            <tr className="text-left text-xs text-[#516f90]">
              <th className="py-1">Canal</th>
              <th className="py-1 text-right">Conversaciones</th>
              <th className="py-1 text-right">Con teléfono</th>
              <th className="py-1 text-right">Leads creados</th>
              <th className="py-1 text-right">Con visita</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#cbd6e2]">
            {filas.map((f) => (
              <tr key={f.canal}>
                <td className="py-1.5 text-[#33475b]">{NOMBRE[f.canal]}</td>
                <td className="py-1.5 text-right tabular-nums">{f.conversaciones}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {f.conversaciones ? `${Math.round((f.conTelefono / f.conversaciones) * 100)}%` : '—'}
                </td>
                <td className="py-1.5 text-right tabular-nums">{f.leads}</td>
                <td className="py-1.5 text-right tabular-nums">{f.visitas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <p className="text-[11px] text-[#516f90] mt-2">
        En el chat web todos dejan teléfono al entrar. Los leads del chat web son todos los que abrieron el chat, no solo los que atendió Ali.
      </p>
    </div>
  );
}
