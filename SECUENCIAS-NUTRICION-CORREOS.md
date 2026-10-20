# Secuencias de nutrición: guion de cada correo

Este documento es para quien diseña los correos en el editor del CRM. Cada correo es **una sola imagen** con un enlace. El CRM le agrega solo los UTM (`utm_source=email`, `utm_medium=secuencia`, `utm_campaign=<secuencia>`, `utm_content=paso-N`) y el `lead_id`, así que **en el editor va la URL limpia**, tal como aparece aquí.

Reglas de siempre: el asunto lleva **un solo emoji**, al final, y **no pasa de 45 caracteres** (en el celular se corta ahí); el proyecto o el dato fuerte va primero; el preheader va en el panel "Body" del editor (Preheader text); se puede nombrar DICOM; la visita se agenda **cualquier día** (no prometer "este sábado").

**Nombre de cada campaña:** úsalo tal cual (por ejemplo `SEC · Lomas · 1 Bienvenida`) para encontrarla rápido en el selector de la página **Secuencias de Nutrición**.

---

## Cuántos diseños hacen falta: 19

Cada proyecto necesita 8 diseños, y la reactivación 3 más. Varias secuencias reutilizan los mismos correos:

| Secuencia | Paso 1 | Paso 2 | Paso 3 | Paso 4 | Paso 5 |
|---|---|---|---|---|---|
| Bienvenida formulario Meta (5 correos en 14 días) | 1 Bienvenida | 2 Ubicación | 3 Urbanización | 4 Financiamiento | 5 Invitación a visitar |
| Bienvenida web orgánica (4 en 6 días) | 1 Bienvenida | 5 Invitación a visitar | 4 Financiamiento | 2 Ubicación | — |
| Abandono de agenda (3 en 3 días) | 6 ¿Te quedó pendiente? | 5 Invitación a visitar | 7 Último recordatorio | — | — |
| Volvió a interesarse (3 en 7 días) | 8 Lo que estuviste mirando | 3 Urbanización | 5 Invitación a visitar | — | — |
| Reactivación (3 en 11 días, los dos proyectos) | R1 | R2 | R3 | — | — |

Los números son los de las fichas de abajo (`SEC · Lomas · 1 …`, `SEC · Arena · 1 …`).

---

## Lomas del Mar

Datos (brochure y web aliminspa.cl, revisados el 20-10-2026): terrenos urbanizados de **200 m²: $37.990.000 financiado o $35.000.000 al contado, pie $5.500.000 y 60 cuotas de $550.000**, y **390 m²: $45.990.000 financiado o $43.000.000 al contado, pie $7.500.000 y 70 cuotas de $550.000**. 0% interés, crédito directo, sin banco, **sin importar tu DICOM**. Están a 10 minutos del centro y de la playa de El Tabo y vienen con rol propio, agua certificada por la Seremi, medidor de luz por terreno, portón automático, calles de maicillo, luminarias solares y áreas verdes, dentro de un condominio cerrado.

- Página del proyecto: `https://aliminspa.cl/proyectos/lomas-del-mar`
- Agenda (mapa 3D): `https://aliminspa.cl/agendar-visita`

### SEC · Lomas · 1 Bienvenida
- **Asunto:** Lomas del Mar: pie desde $5.500.000 🌲
- **Preheader:** 200 o 390 m² en El Tabo, cuotas de $550.000 y sin banco.
- **Imagen:** vista aérea con el mar al fondo. Titular: "Gracias por tu interés en Lomas del Mar". Dos tarjetas: 200 m² con pie de $5.500.000 y 390 m² con pie de $7.500.000. Debajo: "Cuotas de $550.000 · 0% interés · Sin banco · Desde $35.000.000 al contado".
- **Botón:** Ver el proyecto → página del proyecto

### SEC · Lomas · 2 Ubicación
- **Asunto:** A 10 minutos de la playa de El Tabo 🌊
- **Preheader:** Playas, Quebrada de Córdova, supermercado y Cesfam a minutos.
- **Imagen:** el mapa del brochure (pin de Lomas del Mar y El Tabo) y el collage de playas: Canelillo, El Canelo, Roca de los Pingüinos. Titular: "Despierta cerca del mar, vive en paz".
- **Botón:** Ver la ubicación → página del proyecto

### SEC · Lomas · 3 Urbanización
- **Asunto:** Lomas del Mar: rol propio, agua y luz ✅
- **Preheader:** Agua certificada, portón automático y calles listas.
- **Imagen:** la lámina "Más valores para tu inversión" con los íconos (rol propio, agua certificada por la Seremi sin gastos comunes, luz, portón automático, luminarias solares, recinto cerrado, áreas verdes). Titular: "Alimin desarrolla todo".
- **Botón:** Ver el plano del proyecto → agenda (mapa 3D)

### SEC · Lomas · 4 Financiamiento
- **Asunto:** Sin banco y sin importar tu DICOM 🤝
- **Preheader:** Crédito directo con Alimin, 0% interés y cuotas de $550.000.
- **Imagen:** la lámina "Sin importar tu DICOM" con los tres sellos (0% de interés, crédito directo, sin banco). Ejemplo: "Pie desde $5.500.000 + cuotas de $550.000".
- **Botón:** Quiero cotizar → página del proyecto

### SEC · Lomas · 5 Invitación a visitar
- **Asunto:** Elige tu lote en Lomas del Mar 📍
- **Preheader:** Recorre Lomas del Mar con un asesor el día que te acomode.
- **Imagen:** foto aérea con el plano del loteo. Titular: "Tu nuevo terreno te está esperando". Texto: "Mira los lotes disponibles en el mapa y agenda la visita".
- **Botón:** Agendar mi visita → agenda

### SEC · Lomas · 6 ¿Te quedó pendiente?
- **Asunto:** ¿Te faltó agendar tu visita? 📅
- **Preheader:** Tu lote en Lomas del Mar te espera: agendar toma un minuto.
- **Imagen:** captura del mapa 3D con un lote marcado. Titular: "¿Te quedó pendiente agendar?". Texto: "Elige día y hora; un asesor te recorre el loteo".
- **Botón:** Terminar de agendar → agenda

### SEC · Lomas · 7 Último recordatorio
- **Asunto:** Todavía puedes elegir tu lote 🏡
- **Preheader:** Visita Lomas del Mar el día que te acomode.
- **Imagen:** foto del entorno (bosque y mar). Titular: "Ver el terreno en persona lo cambia todo". Dos datos: "A 10 min de la playa" y "Pie desde $5.500.000".
- **Botón:** Agendar ahora → agenda

### SEC · Lomas · 8 Lo que estuviste mirando
- **Asunto:** Lomas del Mar: precios, pie y cuotas 📋
- **Preheader:** 200 m² desde $35.000.000 al contado; 390 m² desde $43.000.000.
- **Imagen:** tabla de precios: 200 m² ($37.990.000 financiado / $35.000.000 contado, pie $5.500.000, 60 cuotas) y 390 m² ($45.990.000 / $43.000.000, pie $7.500.000, 70 cuotas), cuota de $550.000, con la lámina de urbanización. Titular: "Todo lo que necesitas para decidir".
- **Botón:** Ver lotes disponibles → agenda

---

## Arena y Sol

Datos (brochure y web aliminspa.cl, revisados el 20-10-2026): terrenos urbanizados de **200 m²**, **pie de $20.000.000**, valor total **$42.000.000**, **cuota referencial de $500.000** y precio de contado **$39.000.000**. La web lo marca como **Últimos terrenos**. Hay crédito directo, sin importar tu DICOM. El proyecto queda en El Tabo, **a 8 minutos de la playa** (el brochure dice 10; vale la web), con acceso por la ruta G-948. Viene con rol propio, terrenos planos y limpios, agua por pozo, luz por posteo aéreo, acceso privado con portón, área verde, veredas y luminarias solares. **Ya hay clientes haciendo el cierre perimetral de sus terrenos** (entrega inmediata).

- Página del proyecto: `https://aliminspa.cl/proyectos/arena-y-sol`
- Agenda (mapa): `https://aliminspa.cl/agendar-visita-arenas`

### SEC · Arena · 1 Bienvenida
- **Asunto:** Arena y Sol: entrega inmediata en El Tabo ☀️
- **Preheader:** 200 m² urbanizados, pie de $20.000.000 y cuotas de $500.000.
- **Imagen:** vista aérea del loteo cerrado. Titular: "Gracias por tu interés en Arena y Sol". Datos: "200 m² · Pie $20.000.000 · Cuota referencial $500.000 · $39.000.000 al contado". Sello: "Últimos terrenos".
- **Botón:** Ver el proyecto → página del proyecto

### SEC · Arena · 2 Ubicación
- **Asunto:** A 8 minutos de la playa de El Tabo 🌊
- **Preheader:** Arena y Sol: tranquilo para vivir, buscado para arrendar.
- **Imagen:** el mapa (ruta G-948) y la lámina "Inversión en la Región de Valparaíso". Titular: "Un lugar para vivir, arrendar o invertir".
- **Botón:** Ver la ubicación → página del proyecto

### SEC · Arena · 3 Urbanización y avance
- **Asunto:** Arena y Sol: vecinos ya cierran sus lotes 🧱
- **Preheader:** Mira cómo avanza el proyecto y lo que se entrega.
- **Imagen:** foto real del cierre perimetral (lámina "Ya hay clientes avanzando") y los íconos: rol propio, terrenos planos, agua por pozo, luz, portón, área verde y luminarias solares.
- **Botón:** Ver los lotes → agenda (mapa)

### SEC · Arena · 4 Financiamiento
- **Asunto:** Crédito directo, sin importar tu DICOM 🤝
- **Preheader:** Pie de $20.000.000 y cuotas referenciales de $500.000.
- **Imagen:** la lámina "Inversión" (pie $20.000.000, valor total $42.000.000, cuota $500.000, contado $39.000.000). Titular: "Aprovecha nuestro crédito directo".
- **Botón:** Quiero cotizar → página del proyecto

### SEC · Arena · 5 Invitación a visitar
- **Asunto:** Recorre Arena y Sol con un asesor 📍
- **Preheader:** Elige tu lote en el mapa y agenda el día que te acomode.
- **Imagen:** foto del portón y los cierres. Titular: "Estás a un paso de tu terreno en la playa". Texto: "Ver disponibilidad y agendar".
- **Botón:** Agendar mi visita → agenda

### SEC · Arena · 6 ¿Te quedó pendiente?
- **Asunto:** ¿Te faltó agendar tu visita? 📅
- **Preheader:** Tu lote en Arena y Sol te espera: agendar toma un minuto.
- **Imagen:** captura del mapa del loteo con un lote marcado. Titular: "¿Te quedó pendiente agendar?".
- **Botón:** Terminar de agendar → agenda

### SEC · Arena · 7 Último recordatorio
- **Asunto:** Últimos terrenos en Arena y Sol 🏡
- **Preheader:** Entrega inmediata: puedes empezar a construir tu proyecto.
- **Imagen:** foto aérea del loteo. Titular: "Ver el terreno en persona lo cambia todo". Dato: "Entrega inmediata en El Tabo".
- **Botón:** Agendar ahora → agenda

### SEC · Arena · 8 Lo que estuviste mirando
- **Asunto:** Arena y Sol: precios, pie y cuotas 📋
- **Preheader:** $42.000.000 financiado o $39.000.000 al contado.
- **Imagen:** la lámina "Inversión" con los cuatro valores y una foto del cierre perimetral. Titular: "Todo lo que necesitas para decidir".
- **Botón:** Ver lotes disponibles → agenda

---

## Reactivación (los dos proyectos)

Va a quien recibió 4 o más correos en 120 días sin abrir ninguno. Si tampoco abre estos 3, deja de recibir los masivos. Vuelve solo si visita la web.

- Página para elegir proyecto: `https://aliminspa.cl/reunion`

### SEC · Reactivación · R1
- **Asunto:** ¿Sigues buscando terreno cerca del mar? 🌊
- **Preheader:** Dos proyectos en El Tabo, con crédito directo y sin banco.
- **Imagen:** foto de playa de El Tabo. Titular: "¿Sigues buscando tu terreno?". Dos tarjetas: Lomas del Mar (pie desde $5.500.000) y Arena y Sol (entrega inmediata, últimos terrenos).
- **Botón:** Ver los proyectos → página para elegir proyecto

### SEC · Reactivación · R2
- **Asunto:** ¿Lomas del Mar o Arena y Sol? 🤔
- **Preheader:** Compara tamaño, pie y cuota en un minuto.
- **Imagen:** comparación lado a lado: Lomas (200/390 m², pie desde $5,5 millones, cuota $550.000) y Arena (200 m², pie $20 millones, cuota $500.000, entrega inmediata).
- **Botón:** Comparar y agendar → página para elegir proyecto

### SEC · Reactivación · R3
- **Asunto:** ¿Te seguimos escribiendo? ✉️
- **Preheader:** Si ya no te interesa, dejamos de enviarte correos.
- **Imagen:** mensaje corto y honesto: "No queremos llenar tu bandeja. Si todavía te interesa un terreno en El Tabo, toca el botón y seguimos en contacto".
- **Botón:** Sí, sigo interesado → página para elegir proyecto

---

## Antes de la prueba: revisar cada correo

1. **La imagen tiene link.** En el editor: clic en la imagen → Acción → "Abrir sitio web" → la URL de la ficha. Sin link, el clic no lleva a nada y no se mide; **el CRM no deja encender** una secuencia con un correo así y lo marca en amarillo en la página. Ojo: hoy hay campañas sin ningún link (Portal, Arena Whats App, Lomas Whatsapp Oct, Lomas Agendamoento oct, Lamas directo whatsapp).
2. **Precios iguales a la web.** Los de este guion se revisaron contra aliminspa.cl el 20-10-2026. Si cambian los precios, hay que rehacer las imágenes: el CRM no puede leer el texto de una imagen.
3. **Asunto de 45 caracteres o menos**, con un solo emoji y el preheader puesto en el panel "Body".
4. **Prueba enviada a un correo propio** con "Enviar prueba": abrir en el celular, tocar la imagen y confirmar que llega a la página correcta.

## Cómo encenderlas

1. Diseña los correos con los nombres de arriba y prueba cada uno con "Enviar prueba".
2. Entra a **Email Marketing → Secuencias de Nutrición** y elige el correo de cada paso. Guarda.
3. Aprieta **"¿Quién entraría ahora?"** para ver cuántos leads entrarían a cada secuencia.
4. Enciende una secuencia a la vez. Conviene partir por las dos de **abandono de agenda**, que son pocas y las más urgentes; después las bienvenidas, luego "volvió a interesarse" y al final la reactivación, con su cupo de 3.000 por día.
