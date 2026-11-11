export type AgenteId = 'atraccion' | 'calificador' | 'cierre';
export type Estado = 'por_revisar' | 'aprobada' | 'corregir' | 'archivada';
export type Tipo = 'objecion' | 'dato' | 'regla';

export interface Herramienta {
  nombre: string;
  descripcion: string;
  fija?: boolean;
  activa: boolean;
}

export interface Agente {
  id: AgenteId;
  nombre: string;
  rol: string;
  enConstruccion: boolean;
  modelo: string;
  activo: boolean;
  instrucciones: string;
  herramientas: Herramienta[];
  version: number;
  updated_at: string;
}

export interface Version {
  id: number;
  version: number;
  modelo: string;
  activo: boolean;
  instrucciones: string;
  herramientas: Record<string, boolean>;
  nota: string | null;
  created_at: string;
}

export interface Conocimiento {
  id: string;
  tipo: Tipo;
  tema: string;
  como_lo_dice: string | null;
  respuesta: string;
  estado: Estado;
  menciones: number | null;
  fuente: string | null;
  nota: string | null;
  agentes: AgenteId[];
  orden: number;
  updated_at: string;
}

export interface Precio {
  modelo: string;
  entrada: number;
  salida: number;
  cache_lectura: number;
  cache_escritura: number;
}

export interface Gasto {
  hoy: number;
  mes: number;
  proyeccionMes: number | null;
  llamadasMes: number;
  conversacionesMes: number;
  costoPorConversacion: number | null;
  visitasMes: number | null;
  costoPorVisita: number | null;
  porAgente: { agente: string; modelo: string; costo: number; llamadas: number; entrada: number; salida: number }[];
  porCanal: { canal: string; costo: number; conversaciones: number }[];
  porDia: { dia: string; agente: string; costo: number }[];
  precios: Precio[];
  preciosFecha: string;
}

export interface Calificacion {
  conversacion_id: string;
  lead_id: string | null;
  canal: string | null;
  nombre: string | null;
  tiene_pie: boolean | null;
  pie_monto: number | null;
  forma_pago: string | null;
  plazo_compra: string | null;
  uso: string | null;
  proyecto: string | null;
  objeciones: string[] | null;
  quiere_visitar: boolean | null;
  categoria: string | null;
  puntaje: number | null;
  resumen: string | null;
  updated_at: string;
}

export const ESTADO_ETIQUETA: Record<Estado, string> = {
  por_revisar: 'Por revisar',
  aprobada: 'Aprobada',
  corregir: 'Corregir',
  archivada: 'Archivada',
};

export const ESTADO_COLOR: Record<Estado, string> = {
  por_revisar: 'bg-amber-50 text-amber-800 border-amber-200',
  aprobada: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  corregir: 'bg-rose-50 text-rose-800 border-rose-200',
  archivada: 'bg-slate-100 text-slate-600 border-slate-200',
};

export const TIPO_ETIQUETA: Record<Tipo, string> = { objecion: 'Objeción', dato: 'Dato', regla: 'Regla' };

export const AGENTE_CORTO: Record<AgenteId, string> = { atraccion: 'Ali', calificador: 'Calificador', cierre: 'Cierre' };

export const MODELOS = [
  { id: 'claude-haiku-5-5', nombre: 'Haiku 5.5 · rápido y barato' },
  { id: 'claude-sonnet-5-5', nombre: 'Sonnet 5.5 · más criterio' },
  { id: 'claude-opus-5-5', nombre: 'Opus 5.5 · el más capaz' },
];

export function modeloCorto(id: string) {
  if (id.includes('haiku')) return 'Haiku';
  if (id.includes('sonnet')) return 'Sonnet';
  if (id.includes('opus')) return 'Opus';
  return id;
}

/** US$ con los decimales que hacen falta para montos chicos. */
export function usd(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (n === 0) return 'US$0';
  if (n < 0.01) return `US$${n.toFixed(4)}`;
  if (n < 10) return `US$${n.toFixed(2)}`;
  return `US$${n.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`;
}

export async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json?.error || `Error ${r.status}`);
  return json as T;
}
