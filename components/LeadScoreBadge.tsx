'use client';

/**
 * Lead score en pantalla: el número, la banda y el porqué.
 *
 * El porqué no es decorativo: si el asesor no ve de dónde sale el número, no
 * le cree y vuelve a llamar por orden de llegada.
 */

export type BandaScore = 'CALIENTE' | 'TIBIO' | 'TEMPLADO' | 'FRIO';

const ESTILO: Record<BandaScore, { chip: string; etiqueta: string }> = {
  CALIENTE: { chip: 'bg-orange-50 text-orange-700 border-orange-200', etiqueta: '🔥 Caliente' },
  TIBIO: { chip: 'bg-amber-50 text-amber-700 border-amber-200', etiqueta: 'Tibio' },
  TEMPLADO: { chip: 'bg-sky-50 text-sky-700 border-sky-200', etiqueta: 'Templado' },
  FRIO: { chip: 'bg-slate-50 text-slate-500 border-slate-200', etiqueta: 'Frío' },
};

const esBanda = (b: unknown): b is BandaScore => typeof b === 'string' && b in ESTILO;

export function motivosDe(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.filter((m): m is string => typeof m === 'string');
  if (typeof valor === 'string') {
    try {
      return motivosDe(JSON.parse(valor));
    } catch {
      return [];
    }
  }
  return [];
}

/** Celda compacta del listado: número, banda y las dos razones que más pesan. */
export function LeadScoreCell({ score, banda, motivos }: { score: unknown; banda: unknown; motivos: unknown }) {
  if (typeof score !== 'number' || !esBanda(banda)) {
    return <span className="text-xs text-slate-300">—</span>;
  }
  const lista = motivosDe(motivos);
  const estilo = ESTILO[banda];
  return (
    <div className="flex flex-col items-start gap-1 max-w-[260px]" title={`Puntaje ${score} de 100\n${lista.join('\n')}`}>
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-extrabold ${estilo.chip}`}>
        <span className="tabular-nums">{score}<span className="font-semibold opacity-60">/100</span></span>
        <span className="font-bold">{estilo.etiqueta}</span>
      </span>
      {lista.slice(1, 3).map((m) => (
        <span key={m} className="text-[10px] leading-tight text-[#516f90] truncate max-w-full">
          {m}
        </span>
      ))}
    </div>
  );
}

/** Bloque de la ficha del lead: todo el porqué. */
export function LeadScoreDetail({ score, banda, motivos }: { score: unknown; banda: unknown; motivos: unknown }) {
  if (typeof score !== 'number' || !esBanda(banda)) {
    return (
      <p className="text-xs text-[#516f90]">
        Sin puntaje todavía: se calcula cada 15 minutos para los leads desde abril y los antiguos que vuelven a interactuar.
      </p>
    );
  }
  const estilo = ESTILO[banda];
  return (
    <div className="space-y-2">
      <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-sm font-extrabold ${estilo.chip}`}>
        <span className="tabular-nums">{score}/100</span>
        <span className="font-bold">{estilo.etiqueta}</span>
      </span>
      <ul className="space-y-1">
        {motivosDe(motivos).map((m) => (
          <li key={m} className="text-xs text-[#33475b] flex gap-1.5">
            <span className="text-[#2d544c]">•</span>
            {m}
          </li>
        ))}
      </ul>
    </div>
  );
}
