import { NextResponse } from 'next/server';
import { queryMain } from '@/lib/db';

/**
 * Bandeja de WhatsApp de Ali en el CRM web (Nicolás, 22-11-2026).
 *
 * Solo el número +56 9 8257 9808 (id 1365363313337302, el de los anuncios).
 * Las conversaciones se leen directo de la base principal, igual que Chat web;
 * todo lo que se escribe (mensajes, archivos, pausa de Ali) pasa por el CRM
 * móvil (/api/public/whatsapp/*), que es el que habla con WhatsApp y el único
 * que escribe en las conversaciones.
 *
 * Variables: CRM_ASESORES_URL y WEB_CHAT_API_KEY (las mismas de Chat web) y,
 * opcional, WHATSAPP_ALI_NUMERO_ID para cambiar de número.
 */

export const NUMERO_ALI_ID = (process.env.WHATSAPP_ALI_NUMERO_ID || '1365363313337302').trim();

/** Los chats de los números que no son el principal tienen psid "wa:<cliente>@<id del número>". */
export const PSID_DEL_NUMERO = `wa:%@${NUMERO_ALI_ID}`;

export const VENTANA_MS = 24 * 60 * 60 * 1000;

const CRM_ASESORES_URL = (process.env.CRM_ASESORES_URL || 'https://crm.aliminlomasdelmar.com').replace(/\/$/, '');

/** Planos y brochures con botón (los mismos ids que acepta el CRM móvil). */
export const DOCUMENTOS = [
  { id: 'plano_lomas_del_mar', nombre: 'Plano Lomas del Mar' },
  { id: 'plano_arena_y_sol', nombre: 'Plano Arena y Sol' },
  { id: 'brochure_lomas_del_mar', nombre: 'Brochure Lomas del Mar' },
  { id: 'brochure_arena_y_sol', nombre: 'Brochure Arena y Sol' },
];

let pausasExisten: boolean | null = null;

/**
 * ¿Existe la tabla de pausas? La crea el CRM móvil la primera vez que la usa
 * (lib/pausaAli.ts); antes de eso, Ali está activa en todos los chats.
 */
export async function hayTablaDePausas() {
  if (pausasExisten) return true;
  const r = await queryMain(`SELECT to_regclass('public.ali_pausas') IS NOT NULL AS existe`);
  pausasExisten = Boolean(r.rows[0]?.existe);
  return pausasExisten;
}

/** Reenvía al CRM móvil con la API key, que nunca sale de este servidor. */
export async function alCrmMovil(ruta: string, cuerpo: BodyInit, json = true) {
  const apiKey = process.env.WEB_CHAT_API_KEY;
  if (!apiKey) {
    console.error('[whatsapp-ali] Falta la variable de entorno WEB_CHAT_API_KEY.');
    return NextResponse.json({ error: 'WhatsApp no está configurado en este servidor' }, { status: 503 });
  }
  try {
    const res = await fetch(`${CRM_ASESORES_URL}/api/public/whatsapp/${ruta}`, {
      method: 'POST',
      headers: { 'x-crm-api-key': apiKey, ...(json ? { 'Content-Type': 'application/json' } : {}) },
      body: cuerpo,
      // Subir un PDF a WhatsApp puede tardar.
      signal: AbortSignal.timeout(ruta === 'archivo' ? 90000 : 20000),
      cache: 'no-store',
    });
    const datos = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[whatsapp-ali] El CRM móvil rechazó ${ruta}:`, res.status, datos);
      return NextResponse.json(
        { error: datos.motivo || datos.error || 'No se pudo enviar' },
        { status: res.status >= 500 && res.status !== 502 ? 502 : res.status }
      );
    }
    return NextResponse.json(datos);
  } catch (error) {
    console.error(`[whatsapp-ali] No se pudo contactar al CRM móvil (${ruta}):`, error);
    return NextResponse.json({ error: 'El CRM de asesores no respondió. Intenta de nuevo.' }, { status: 503 });
  }
}
