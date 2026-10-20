import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';
import {
  candidatosPorSecuencia,
  leerSecuencias,
  pasadaSinSolapar,
  enviarPrueba,
  pasosSinCorreo,
  tieneEnlaceWeb,
} from '@/lib/email_sequences';

export const dynamic = 'force-dynamic';

/**
 * Panel de secuencias: definición, correo de cada paso, quiénes están dentro
 * y cómo le va a cada paso (enviados, aperturas, clics).
 */
export async function GET() {
  try {
    const secuencias = await leerSecuencias();

    const [estados, motivos, pasos, campanas, sunset, recientes] = await Promise.all([
      queryMarketing(
        `SELECT sequence_id, estado, count(*)::int AS n FROM email_sequence_enrollments GROUP BY 1, 2`
      ),
      queryMarketing(
        `SELECT sequence_id, motivo_salida, count(*)::int AS n
           FROM email_sequence_enrollments WHERE motivo_salida IS NOT NULL GROUP BY 1, 2`
      ),
      queryMarketing(
        `SELECT sequence_step_id,
                count(*) FILTER (WHERE status <> 'FAILED')::int AS enviados,
                count(*) FILTER (WHERE opened_at IS NOT NULL OR status IN ('OPENED', 'CLICKED'))::int AS aperturas,
                count(*) FILTER (WHERE clicks > 0 OR last_clicked_at IS NOT NULL)::int AS clics
           FROM campaign_logs
          WHERE sequence_step_id IS NOT NULL AND is_test = FALSE
          GROUP BY 1`
      ),
      queryMarketing(
        `SELECT id, title, subject, created_at, html_content FROM campaigns ORDER BY created_at DESC LIMIT 300`
      ),
      queryMarketing(`SELECT count(*)::int AS n FROM email_sunset`),
      queryMarketing(
        `SELECT e.id, q.nombre AS secuencia, e.email, e.proyecto, e.estado, e.motivo_salida,
                e.pasos_enviados, e.proximo_envio_at, e.inscrito_at
           FROM email_sequence_enrollments e
           JOIN email_sequences q ON q.id = e.sequence_id
          ORDER BY e.actualizado_at DESC
          LIMIT 40`
      ),
    ]);

    const statsPaso = new Map(pasos.rows.map((r) => [r.sequence_step_id, r]));

    return NextResponse.json({
      success: true,
      secuencias: secuencias.map((s) => ({
        ...s,
        incompleta: pasosSinCorreo(s).length > 0,
        estados: Object.fromEntries(estados.rows.filter((r) => r.sequence_id === s.id).map((r) => [r.estado, r.n])),
        motivos: motivos.rows
          .filter((r) => r.sequence_id === s.id)
          .map((r) => ({ motivo: r.motivo_salida, n: r.n }))
          .sort((a, b) => b.n - a.n),
        pasos: s.pasos.map((p) => ({
          ...p,
          stats: statsPaso.get(p.id) || { enviados: 0, aperturas: 0, clics: 0 },
        })),
      })),
      // El HTML no viaja al panel: solo si tiene enlace.
      campanas: campanas.rows.map(({ html_content, ...c }) => ({ ...c, conEnlace: tieneEnlaceWeb(html_content) })),
      fueraDeMasivos: sunset.rows[0]?.n || 0,
      recientes: recientes.rows,
    });
  } catch (error) {
    console.error('Error leyendo secuencias:', error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}

/**
 * accion=vista-previa  cuántos entrarían ahora a cada secuencia (no escribe).
 * accion=pasada        corre una pasada ya, sin esperar al temporizador.
 * accion=prueba        manda todos los pasos a un correo ({ email, secuencias? }).
 */
export async function POST(request: Request) {
  try {
    const accion = new URL(request.url).searchParams.get('accion');
    if (accion === 'pasada') {
      const r = await pasadaSinSolapar();
      return NextResponse.json({ success: true, resultado: r });
    }
    if (accion === 'prueba') {
      const body = await request.json().catch(() => ({}));
      const email = String(body.email || '').trim();
      const ids = Array.isArray(body.secuencias) && body.secuencias.length ? body.secuencias.map(String) : null;
      const resultados = await enviarPrueba(email, ids);
      return NextResponse.json({ success: true, resultados });
    }
    if (accion === 'vista-previa') {
      const secuencias = await leerSecuencias();
      const candidatos = await candidatosPorSecuencia(secuencias);
      return NextResponse.json({
        success: true,
        vistaPrevia: Object.fromEntries(
          secuencias.map((s) => [s.id, (candidatos.get(s.id) || []).length])
        ),
      });
    }
    return NextResponse.json({ success: false, message: 'Acción desconocida' }, { status: 400 });
  } catch (error) {
    console.error('Error en acción de secuencias:', error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}
