import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';
import { recalcularSinSolapar, tablaExiste, UMBRAL_CALIENTE, UMBRAL_TIBIO, VIDA_MEDIA_DIAS } from '@/lib/lead_score';

export const dynamic = 'force-dynamic';

const BANDAS = ['CALIENTE', 'TIBIO', 'FRIO'];
const ORIGENES = ['WEB', 'LANDING_META', 'FORM_META', 'MANUAL', 'ANTIGUA'];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const OPERADORES: Record<string, string> = { gte: '>=', gt: '>', eq: '=', lte: '<=', lt: '<' };

/**
 * Los motivos traen fechas y cantidades ("Abrió 12 correos", "Clic en WhatsApp
 * hace 2 días"); para contarlos en el resumen se reducen a la señal.
 */
function senalDe(motivo: string): string | null {
  if (/^(Llegó|Formulario de Meta|Cargado a mano|Base antigua)/.test(motivo)) return null;
  if (motivo.startsWith('Clic en WhatsApp')) return 'Clic en WhatsApp';
  if (motivo.startsWith('Escribió por') || motivo.startsWith('Comentó')) return 'Escribió por chat, Messenger o Instagram';
  if (/min en la web$/.test(motivo)) return 'Pasó tiempo en la web';
  if (motivo.startsWith('Volvió a la web')) return 'Volvió a la web otro día';
  if (motivo.startsWith('Clic en un correo') || /^Clic en \d+ correos/.test(motivo)) return 'Hizo clic en un correo';
  if (motivo.startsWith('Abrió')) return 'Abrió correos';
  if (motivo.startsWith('Clic en "')) return 'Clic en cotizar, plano o lotes';
  if (motivo === 'Tiene pie') return 'Tiene pie';
  if (motivo === 'La cuota le calza') return 'La cuota le calza';
  return motivo;
}

/**
 * Panel del lead score. Solo lee public.lead_score; el cálculo lo hace el
 * temporizador de instrumentation.ts (o el POST de abajo).
 *
 * Filtros (todos opcionales, se aplican igual a las tarjetas, al listado y a
 * la calidad por campaña):
 *   desde / hasta  fecha de creación del lead (YYYY-MM-DD, día de Chile)
 *   banda          CALIENTE / TIBIO / FRIO; sin banda el listado muestra
 *                  calientes y tibios, que son los que hay que llamar
 *   origen         WEB / LANDING_META / FORM_META / MANUAL / ANTIGUA
 *   asesor         id del asesor
 *   op + puntaje   comparación del puntaje: gte (≥), gt (>), eq (=), lte (≤),
 *                  lt (<). Con puntaje y sin banda, el listado no se limita a
 *                  calientes y tibios: "≥ 8" tiene que traer también fríos.
 */
export async function GET(request: Request) {
  try {
    if (!(await tablaExiste())) {
      return NextResponse.json({ success: true, listo: false });
    }

    const sp = new URL(request.url).searchParams;
    const desde = sp.get('desde') || '';
    const hasta = sp.get('hasta') || '';
    const banda = (sp.get('banda') || '').toUpperCase();
    const origen = (sp.get('origen') || '').toUpperCase();
    const asesor = sp.get('asesor') || '';
    const op = OPERADORES[sp.get('op') || ''] || null;
    const puntajeTexto = sp.get('puntaje') || '';
    const puntaje = /^\d{1,3}$/.test(puntajeTexto) ? Math.min(Number(puntajeTexto), 100) : null;
    const conPuntaje = op !== null && puntaje !== null;

    // Filtros comunes (sin la banda, que las tarjetas cuentan por separado).
    const params: unknown[] = [];
    const where: string[] = ['1=1'];
    // createdAt es timestamp sin zona en UTC: se compara por día de Chile.
    const diaChile = `(l."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Santiago')::date`;
    if (FECHA.test(desde)) {
      params.push(desde);
      where.push(`${diaChile} >= $${params.length}::date`);
    }
    if (FECHA.test(hasta)) {
      params.push(hasta);
      where.push(`${diaChile} <= $${params.length}::date`);
    }
    if (ORIGENES.includes(origen)) {
      params.push(origen);
      where.push(`s.origen = $${params.length}`);
    }
    if (asesor) {
      params.push(asesor);
      where.push(`l."assignedToId" = $${params.length}`);
    }
    if (conPuntaje) {
      // El operador sale de una lista cerrada; el número va como parámetro.
      params.push(puntaje);
      where.push(`s.score ${op} $${params.length}`);
    }
    const base = where.join(' AND ');

    // La banda se aplica al listado y al resumen general, no a las tarjetas
    // (que cuentan cada banda). Sin banda: el listado muestra calientes y
    // tibios, salvo que se pida "TODAS" o se filtre por puntaje.
    const paramsBanda = [...params];
    let filtroBandaExplicita = 'TRUE';
    if (BANDAS.includes(banda)) {
      paramsBanda.push(banda);
      filtroBandaExplicita = `s.banda = $${paramsBanda.length}`;
    }
    const filtroBandaLista =
      filtroBandaExplicita !== 'TRUE' || banda === 'TODAS' || conPuntaje
        ? filtroBandaExplicita
        : `s.banda IN ('CALIENTE', 'TIBIO')`;

    const [estado, bandas, leads, campanas, asesores, general] = await Promise.all([
      queryMain(`SELECT max(calculado_en) AS calculado_en FROM public.lead_score`),
      queryMain(
        `SELECT s.banda, count(*)::int AS n
           FROM public.lead_score s JOIN "Lead" l ON l.id = s.lead_id
          WHERE ${base}
          GROUP BY 1`,
        params
      ),
      queryMain(
        `SELECT s.lead_id, s.score, s.banda, s.origen, s.motivos, s.ultima_interaccion, s.caliente_desde,
                l."firstName", l."lastName", l.status, COALESCE(l.contacted, false) AS contacted,
                l."createdAt" AT TIME ZONE 'UTC' AS creado,
                u.name AS "advisorName"
           FROM public.lead_score s
           JOIN "Lead" l ON l.id = s.lead_id
           LEFT JOIN "User" u ON u.id = l."assignedToId"
          WHERE ${base} AND ${filtroBandaLista}
          ORDER BY s.score DESC, s.ultima_interaccion DESC NULLS LAST
          LIMIT 300`,
        paramsBanda
      ),
      // Calidad por campaña: agrupada por anuncio de Meta, campaña utm o, en
      // la web, el formulario/proyecto. La base antigua no tiene campaña.
      queryMain(
        `SELECT s.origen,
                COALESCE(NULLIF(l."adName", ''), NULLIF(l."utmCampaign", ''), NULLIF(l.interests, ''), '(sin campaña)') AS campana,
                count(*)::int AS leads,
                round(avg(s.score))::int AS promedio,
                count(*) FILTER (WHERE s.banda = 'CALIENTE')::int AS calientes,
                count(*) FILTER (WHERE s.banda = 'TIBIO')::int AS tibios,
                count(*) FILTER (WHERE s.banda = 'FRIO')::int AS frios,
                count(*) FILTER (WHERE s.puntos_interaccion > 0)::int AS con_interaccion,
                count(*) FILTER (WHERE COALESCE(l.contacted, false))::int AS contactados,
                count(*) FILTER (WHERE COALESCE(l.visited, false) OR upper(COALESCE(l.status, '')) IN ('VISITA', 'RESERVADO'))::int AS avanzaron
           FROM public.lead_score s
           JOIN "Lead" l ON l.id = s.lead_id
          WHERE ${base} AND s.origen <> 'ANTIGUA'
          GROUP BY 1, 2
          ORDER BY leads DESC
          LIMIT 200`,
        params
      ),
      queryMain(
        `SELECT DISTINCT u.id, u.name
           FROM public.lead_score s
           JOIN "Lead" l ON l.id = s.lead_id
           JOIN "User" u ON u.id = l."assignedToId"
          ORDER BY u.name`
      ),
      // Resumen general: una fila por lead con lo justo para agregarlo acá.
      queryMain(
        `SELECT s.score, s.banda, s.origen, s.motivos, s.puntos_interaccion,
                s.ultima_interaccion, COALESCE(l.contacted, false) AS contacted,
                u.name AS asesor
           FROM public.lead_score s
           JOIN "Lead" l ON l.id = s.lead_id
           LEFT JOIN "User" u ON u.id = l."assignedToId"
          WHERE ${base} AND ${filtroBandaExplicita}`,
        paramsBanda
      ),
    ]);

    const resumen = { CALIENTE: 0, TIBIO: 0, FRIO: 0 };
    for (const r of bandas.rows) resumen[r.banda as keyof typeof resumen] = r.n;

    // Resumen general
    type Grupo = { leads: number; suma: number; calientes: number; tibios: number; frios: number; conInteraccion: number; atendidos: number };
    const nuevoGrupo = (): Grupo => ({ leads: 0, suma: 0, calientes: 0, tibios: 0, frios: 0, conInteraccion: 0, atendidos: 0 });
    const sumarA = (g: Grupo, r: (typeof general.rows)[number]) => {
      g.leads++;
      g.suma += r.score;
      if (r.banda === 'CALIENTE') g.calientes++;
      if (r.banda === 'TIBIO') g.tibios++;
      if (r.banda === 'FRIO') g.frios++;
      if (r.puntos_interaccion > 0) g.conInteraccion++;
      if (r.contacted) g.atendidos++;
    };
    const total = nuevoGrupo();
    const porAsesor = new Map<string, Grupo>();
    const porOrigen = new Map<string, Grupo>();
    const tramos = Array.from({ length: 10 }, (_, i) => ({ desde: i * 10, hasta: i * 10 + 9, leads: 0 }));
    const senales = new Map<string, number>();
    let activos7 = 0;
    const hace7 = Date.now() - 7 * 86_400_000;

    for (const r of general.rows) {
      sumarA(total, r);
      const a = r.asesor || 'Sin asesor';
      if (!porAsesor.has(a)) porAsesor.set(a, nuevoGrupo());
      sumarA(porAsesor.get(a)!, r);
      if (!porOrigen.has(r.origen)) porOrigen.set(r.origen, nuevoGrupo());
      sumarA(porOrigen.get(r.origen)!, r);
      tramos[Math.min(9, Math.floor(r.score / 10))].leads++;
      if (r.ultima_interaccion && new Date(r.ultima_interaccion).getTime() >= hace7) activos7++;
      const vistas = new Set<string>();
      for (const m of Array.isArray(r.motivos) ? r.motivos : []) {
        const s = typeof m === 'string' ? senalDe(m) : null;
        if (s && !vistas.has(s)) {
          vistas.add(s);
          senales.set(s, (senales.get(s) || 0) + 1);
        }
      }
    }
    const fila = (nombre: string, g: Grupo) => ({
      nombre,
      leads: g.leads,
      promedio: g.leads ? Math.round(g.suma / g.leads) : 0,
      calientes: g.calientes,
      tibios: g.tibios,
      frios: g.frios,
      conInteraccion: g.conInteraccion,
      atendidos: g.atendidos,
    });
    const resumenGeneral = {
      ...fila('Total', total),
      activos7,
      tramos,
      porAsesor: Array.from(porAsesor, ([n, g]) => fila(n, g)).sort((x, y) => y.leads - x.leads),
      porOrigen: Array.from(porOrigen, ([n, g]) => fila(n, g)).sort((x, y) => y.leads - x.leads),
      senales: Array.from(senales, ([senal, leads]) => ({ senal, leads })).sort((x, y) => y.leads - x.leads),
    };

    return NextResponse.json({
      success: true,
      listo: true,
      calculadoEn: estado.rows[0]?.calculado_en ?? null,
      reglas: { caliente: UMBRAL_CALIENTE, tibio: UMBRAL_TIBIO, vidaMediaDias: VIDA_MEDIA_DIAS },
      resumen,
      leads: leads.rows,
      campanas: campanas.rows,
      asesores: asesores.rows,
      general: resumenGeneral,
    });
  } catch (error) {
    console.error('Error in GET /api/lead-score:', error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}

/** Recalcula ahora, sin esperar al temporizador. */
export async function POST() {
  try {
    const resultado = await recalcularSinSolapar();
    return NextResponse.json({ success: true, ...resultado });
  } catch (error) {
    console.error('Error in POST /api/lead-score:', error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}
