import { NextResponse } from 'next/server';
import { queryMarketing } from '@/lib/db';
import { leerSecuencias, pasosSinCorreo, tieneEnlaceWeb } from '@/lib/email_sequences';

export const dynamic = 'force-dynamic';

interface CambioPaso {
  id: string;
  campaign_id?: string | null;
  espera_horas?: number;
  asunto?: string | null;
  preheader?: string | null;
}

/**
 * Cambia una secuencia: encenderla o apagarla, el tope diario y, por paso, el
 * correo y la espera. No deja encender una secuencia con pasos sin correo.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json()) as {
      activa?: boolean;
      tope_diario?: number;
      pasos?: CambioPaso[];
    };
    const secuencia = (await leerSecuencias()).find((s) => s.id === params.id);
    if (!secuencia) {
      return NextResponse.json({ success: false, message: 'Secuencia no encontrada' }, { status: 404 });
    }

    for (const p of body.pasos || []) {
      if (!secuencia.pasos.some((x) => x.id === p.id)) continue;
      if (p.campaign_id !== undefined) {
        await queryMarketing(`UPDATE email_sequence_steps SET campaign_id = $2 WHERE id = $1`, [
          p.id,
          p.campaign_id || null,
        ]);
      }
      for (const campo of ['asunto', 'preheader'] as const) {
        if (p[campo] === undefined) continue;
        const valor = (p[campo] || '').trim().slice(0, 200) || null;
        await queryMarketing(`UPDATE email_sequence_steps SET ${campo} = $2 WHERE id = $1`, [p.id, valor]);
      }
      if (p.espera_horas !== undefined) {
        const horas = Math.round(Number(p.espera_horas));
        if (!Number.isFinite(horas) || horas < 0 || horas > 24 * 60) {
          return NextResponse.json({ success: false, message: 'Espera inválida (0 a 1440 horas)' }, { status: 400 });
        }
        await queryMarketing(`UPDATE email_sequence_steps SET espera_horas = $2 WHERE id = $1`, [p.id, horas]);
      }
    }

    if (body.tope_diario !== undefined) {
      const tope = Math.max(0, Math.round(Number(body.tope_diario) || 0));
      await queryMarketing(`UPDATE email_sequences SET tope_diario = $2, updated_at = now() WHERE id = $1`, [
        params.id,
        tope,
      ]);
    }

    if (body.activa !== undefined) {
      if (body.activa) {
        const actual = (await leerSecuencias()).find((s) => s.id === params.id)!;
        const faltan = pasosSinCorreo(actual);
        if (faltan.length > 0) {
          return NextResponse.json(
            {
              success: false,
              message: `Falta elegir el correo de: ${faltan.map((p) => `paso ${p.posicion}`).join(', ')}.`,
            },
            { status: 400 }
          );
        }
        const correos = await queryMarketing(`SELECT id, title, html_content FROM campaigns WHERE id = ANY($1::uuid[])`, [
          actual.pasos.map((p) => p.campaign_id),
        ]);
        const sinEnlace = actual.pasos.filter((p) => {
          const c = correos.rows.find((x) => x.id === p.campaign_id);
          return !c || !tieneEnlaceWeb(c.html_content);
        });
        if (sinEnlace.length > 0) {
          return NextResponse.json(
            {
              success: false,
              message: `El correo de ${sinEnlace.map((p) => `paso ${p.posicion}`).join(', ')} no tiene link (a aliminspa.cl o a WhatsApp). Ponle link a la imagen en el editor (Acción → Abrir sitio web).`,
            },
            { status: 400 }
          );
        }
      }
      await queryMarketing(
        `UPDATE email_sequences
            SET activa = $2,
                activada_at = CASE WHEN $2 AND NOT activa THEN now() ELSE activada_at END,
                updated_at = now()
          WHERE id = $1`,
        [params.id, body.activa]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error actualizando secuencia:', error);
    return NextResponse.json({ success: false, message: (error as Error).message }, { status: 500 });
  }
}
