/**
 * Conocimiento con el que parte el módulo, sacado del "Mapa de objeciones
 * Alimin" (11-11-2026): 10.356 mensajes del CRM (Facebook, Instagram y web) y
 * 20.891 del WhatsApp de Orlando. Todo nace "por_revisar": las respuestas son
 * propuestas o lo que Orlando contesta hoy, no respuestas oficiales.
 *
 * Se inserta una sola vez por tema (ON CONFLICT DO NOTHING): lo que edite el
 * equipo no se pisa en el siguiente arranque.
 */

export interface FilaInicial {
  tipo: 'objecion' | 'dato' | 'regla';
  tema: string;
  como_lo_dice: string;
  respuesta: string;
  menciones: number | null;
  fuente: string;
  nota: string | null;
  agentes: string[];
  orden: number;
}

const ATRACCION = ['atraccion'];
const TODOS = ['atraccion', 'cierre'];

export const CONOCIMIENTO_INICIAL: FilaInicial[] = [
  {
    tipo: 'objecion',
    tema: 'Valor real o total',
    como_lo_dice: '¿Cuál es el valor real? Si no es transparente con un precio real no me parece confiable.',
    respuesta: 'Dar siempre el precio total por escrito en el primer mensaje: contado y con crédito (pie + cuotas + total), sin mandar a un link.',
    menciones: 986,
    fuente: 'CRM (FB, IG, web)',
    nota: 'Falta decidir si la respuesta pública al comentario puede llevar el total.',
    agentes: TODOS,
    orden: 10,
  },
  {
    tipo: 'objecion',
    tema: 'No publican el precio',
    como_lo_dice: '¿Por qué la inmobiliaria entrega los precios en privado?',
    respuesta: '',
    menciones: 144,
    fuente: 'CRM (FB, IG, web)',
    nota: 'Depende de la decisión de marketing sobre el precio en anuncios y respuestas públicas.',
    agentes: ATRACCION,
    orden: 11,
  },
  {
    tipo: 'objecion',
    tema: 'Rol propio y mito de los 5.000 m²',
    como_lo_dice: 'Imposible que tengan rol individual con 200 m². Bajo 5.000 m² es ilegal.',
    respuesta:
      'El mínimo de 5.000 m² es para predios rurales. Estos son terrenos urbanos, con subdivisión aprobada por la DOM y recepción municipal; cada uno tiene rol propio inscrito en el Conservador.',
    menciones: 344,
    fuente: 'CRM (FB, IG, web)',
    nota: 'Falta decidir qué documento se puede mostrar antes de la visita.',
    agentes: TODOS,
    orden: 20,
  },
  {
    tipo: 'objecion',
    tema: 'Estafa y desconfianza',
    como_lo_dice: 'Es muy maravilloso todo, llega a dar desconfianza.',
    respuesta: '',
    menciones: 142,
    fuente: 'CRM (FB, IG, web)',
    nota: 'Falta definir qué pruebas se ofrecen (testimonios, Libertad y Alegría, documentos) y cómo se responde en público.',
    agentes: TODOS,
    orden: 30,
  },
  {
    tipo: 'objecion',
    tema: 'Caro o 200 m² es poco',
    como_lo_dice: 'Con 39 millones me compro una casa. 200 m² es un patio.',
    respuesta: 'Venta directa sin comisión de corretaje. A quien encuentra chico el de 200 m², ofrecer el de 390 m² en Lomas del Mar.',
    menciones: 135,
    fuente: 'CRM (FB, IG, web)',
    nota: null,
    agentes: TODOS,
    orden: 40,
  },
  {
    tipo: 'objecion',
    tema: 'Agua',
    como_lo_dice: '¿El agua es de Esval o de pozo? ¿Quién paga las bombas?',
    respuesta: 'Agua de pozo; cada terreno queda con su arranque. Luz incluida.',
    menciones: 309,
    fuente: 'CRM 131 + WhatsApp Orlando 178',
    nota: 'Respuesta de Orlando por WhatsApp, sin confirmar. Falta: mantención, verano y el corte en Libertad y Alegría.',
    agentes: TODOS,
    orden: 50,
  },
  {
    tipo: 'objecion',
    tema: 'Alcantarillado y fosa',
    como_lo_dice: 'Si no tiene alcantarillado no es urbanizado.',
    respuesta: 'No hay alcantarillado: cada dueño hace su fosa séptica cuando construye.',
    menciones: 116,
    fuente: 'CRM 70 + WhatsApp Orlando 46',
    nota: 'Falta el costo aproximado de la fosa.',
    agentes: TODOS,
    orden: 60,
  },
  {
    tipo: 'objecion',
    tema: 'Plazo de entrega',
    como_lo_dice: '¿Para cuándo está listo? Me urge, es para vivir.',
    respuesta: 'Primera etapa a fines de 2027, aproximadamente.',
    menciones: 465,
    fuente: 'CRM 71 + WhatsApp Orlando 394',
    nota: 'Respuesta de Orlando por WhatsApp, sin confirmar. Un asesor dijo en público "de 2 a 4 años".',
    agentes: TODOS,
    orden: 70,
  },
  {
    tipo: 'objecion',
    tema: 'Construir antes de pagar todo',
    como_lo_dice: 'No se puede construir hasta pagar la última cuota. Llevo 12 años arrendando, así no me sirve.',
    respuesta: 'Para edificar debe estar pagado el 100% del terreno; antes se puede hacer el cierre perimetral y la fosa séptica.',
    menciones: null,
    fuente: 'WhatsApp Orlando',
    nota: 'Respuesta de Orlando, sin confirmar. Es la objeción que más ventas cierra en WhatsApp: falta un argumento que no termine la conversación.',
    agentes: TODOS,
    orden: 75,
  },
  {
    tipo: 'objecion',
    tema: 'Escritura y papeles con crédito directo',
    como_lo_dice: '¿La escritura se hace al pagar el pie? ¿Queda a mi nombre?',
    respuesta: 'Al pagar el pie se firma una promesa de compraventa ante notario. Con el 100% pagado y la recepción final se firma la escritura definitiva.',
    menciones: 421,
    fuente: 'WhatsApp Orlando',
    nota: 'Respuesta de Orlando, sin confirmar.',
    agentes: TODOS,
    orden: 80,
  },
  {
    tipo: 'objecion',
    tema: 'Lejos, sin auto',
    como_lo_dice: 'Ando sin vehículo, creí que era más cerca. ¿Pasa micro?',
    respuesta: 'El Tabo, frente a la carretera que une Santiago con Algarrobo; 8 min a la playa (Arena y Sol) y 10 min (Lomas del Mar).',
    menciones: 34,
    fuente: 'CRM (FB, IG, web)',
    nota: 'Falta cómo llegar en bus.',
    agentes: ATRACCION,
    orden: 90,
  },
  {
    tipo: 'objecion',
    tema: 'Pie bajo, DICOM, subsidio o crédito hipotecario',
    como_lo_dice: 'Tengo $1.500.000 de pie. ¿Se puede con subsidio o con hipotecario?',
    respuesta: 'Crédito directo con Alimin, sin banco ni aval; sirve con DICOM. No se reciben créditos hipotecarios.',
    menciones: 44,
    fuente: 'CRM + WhatsApp Orlando',
    nota: 'Lo de hipotecario es de Orlando, sin confirmar. Falta qué pasa con el subsidio y qué se responde por la promo Mini Pie.',
    agentes: TODOS,
    orden: 100,
  },
  {
    tipo: 'regla',
    tema: 'Descuento por pago al contado',
    como_lo_dice: '¿Y si pago todo al contado? ¿Algún descuento?',
    respuesta: 'La IA no habla de descuentos: deriva al asesor.',
    menciones: 13,
    fuente: 'Decisión de Nico (26-10-2026)',
    nota: null,
    agentes: TODOS,
    orden: 110,
  },
  {
    tipo: 'regla',
    tema: 'Protocolo de comentarios difíciles',
    como_lo_dice: '"Estafadores", "es mentira lo del rol", insultos, reclamos públicos.',
    respuesta: '',
    menciones: 142,
    fuente: 'Pendiente (Nico, 11-11-2026)',
    nota:
      'Por ahora Ali no responde estos comentarios ni en público ni por privado: deja una nota para que lo vea una persona. Falta definir: ¿se responde en público?, ¿con qué texto?, ¿se oculta?, ¿quién lo revisa?',
    agentes: ATRACCION,
    orden: 115,
  },
  {
    tipo: 'dato',
    tema: 'Gastos comunes',
    como_lo_dice: '¿Se pagan gastos comunes?',
    respuesta: 'Los ve la administración del condominio; la inmobiliaria no los cobra.',
    menciones: null,
    fuente: 'WhatsApp Orlando',
    nota: 'Sin confirmar: cuánto y desde cuándo.',
    agentes: TODOS,
    orden: 120,
  },
];
