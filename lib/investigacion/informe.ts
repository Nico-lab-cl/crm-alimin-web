import Anthropic from '@anthropic-ai/sdk';
import { queryMarketing } from '@/lib/db';
import { registrarUso } from '@/lib/agentes_ia';
import { investigadorDescansa, investigadorDice, investigadorTrabaja } from '@/lib/oficina';
import { guardarInforme, type Investigador } from './tablas';

/**
 * El único paso con IA de los investigadores: los lunes, Haiku 5.5 lee los
 * informes diarios de la semana (solo los cambios, no las páginas) y escribe
 * un informe corto para el equipo. Cuesta menos de medio centavo por informe.
 *
 * Usa ANTHROPIC_API_KEY_INVESTIGACION si existe (para ver su gasto aparte en
 * la consola de Anthropic); si no, la del calificador.
 */

const MODELO = 'claude-haiku-5-5';
const MAX_CARACTERES = 40_000;

let cliente: Anthropic | null = null;
function anthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY_INVESTIGACION || process.env.ANTHROPIC_API_KEY_CALIFICADOR || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Falta ANTHROPIC_API_KEY_INVESTIGACION (o la del calificador)');
  if (!cliente) cliente = new Anthropic({ apiKey });
  return cliente;
}

const QUE_ES: Record<Investigador, string> = {
  competencia: 'los avisos de terrenos en venta de la competencia (Yapo y Portal Inmobiliario) en el litoral central',
  anuncios: 'los anuncios activos de la competencia en la Biblioteca de Anuncios de Meta',
  mercado: 'las noticias del sector: litoral central, tasas y crédito, normas de terrenos y estafas con terrenos',
};

const SISTEMA = `Eres investigador de mercado de Alimin, que vende terrenos urbanos en El Tabo (Lomas del Mar: 200 y 390 m²; Arena y Sol: 200 m²), al contado o con crédito directo.
Escribes el informe semanal para el equipo comercial y de marketing a partir de lo que se recolectó cada día.
Reglas:
- Usa solo los datos que recibes. No inventes precios, nombres, fechas ni datos de Alimin. Si algo no está en los datos, no lo digas.
- Entre 5 y 8 líneas, en español de Chile, sin adjetivos de relleno. Sin títulos, sin tablas, sin dos puntos al final de una frase.
- Primero lo que cambió en la semana, después qué significa para Alimin y al final una idea concreta para probar (en anuncios, en el copy o en la conversación de Ali).
- Si una noticia no tiene que ver con terrenos, el litoral o el crédito, ignórala.
- Di "terrenos" o "proyecto", nunca "loteo".`;

export async function informeSemanal(agente: Investigador) {
  const r = await queryMarketing(
    `SELECT created_at, texto, datos FROM inv_informes
      WHERE agente = $1 AND tipo = 'diario' AND created_at >= now() - interval '7 days'
      ORDER BY created_at`,
    [agente]
  );
  if (!r.rows.length) {
    await guardarInforme(agente, 'semanal', 'Esta semana no hubo informes diarios: no hay nada que resumir.', {});
    return { texto: '', costoUSD: 0 };
  }
  const material = r.rows
    .map((x) => {
      const dia = new Date(x.created_at).toLocaleDateString('es-CL', { timeZone: 'America/Santiago', weekday: 'long', day: 'numeric', month: 'numeric' });
      return `## ${dia}\n${x.texto}\nDetalle: ${JSON.stringify(x.datos)}`;
    })
    .join('\n\n')
    .slice(-MAX_CARACTERES);

  investigadorTrabaja(agente, 'Escribiendo el informe de la semana');
  try {
    const respuesta = await anthropic().messages.create({
      model: MODELO,
      max_tokens: 3000,
      output_config: { effort: 'low' },
      system: SISTEMA,
      messages: [{ role: 'user', content: `Esta semana se revisaron ${QUE_ES[agente]}.\n\n${material}` }],
    });
    const costoUSD = await registrarUso({
      agente: 'investigacion',
      canal: agente,
      modelo: respuesta.model || MODELO,
      input_tokens: respuesta.usage.input_tokens,
      output_tokens: respuesta.usage.output_tokens,
      cache_read_input_tokens: respuesta.usage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: respuesta.usage.cache_creation_input_tokens ?? 0,
    });
    if (respuesta.stop_reason === 'refusal') throw new Error('el modelo no quiso escribir el informe');
    const texto = respuesta.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (!texto) throw new Error('el informe salió vacío');
    await guardarInforme(agente, 'semanal', texto, { dias: r.rows.length }, costoUSD);
    investigadorDice(agente, 'Terminé el informe de la semana');
    return { texto, costoUSD };
  } finally {
    investigadorDescansa(agente);
  }
}
