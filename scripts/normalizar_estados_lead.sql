-- Normalización del estado del lead + verificación de la marca de contacto.
--
-- CORRER ESTO ANTES DE DESPLEGAR EL CÓDIGO NUEVO DEL CRM WEB.
--
-- Contexto: la columna "Lead"."status" quedó con dos capitalizaciones vivas.
-- El CRM móvil siempre escribió en mayúsculas ('NUEVO', 'CONTACTADO', ...) y
-- filtra con Prisma usando igualdad exacta. El CRM web escribía capitalizado
-- ('Nuevo', 'Contactado', ...) y lee con ILIKE, así que del lado web no se
-- notaba nada, pero cada lead que la web tocaba desaparecía de los filtros por
-- estado del móvil y se pintaba con el color por defecto (frío).
--
-- Este script deja una sola forma canónica en la base: MAYÚSCULAS.
--
-- Es idempotente: correrlo de nuevo no cambia nada, porque UPPER() de un valor
-- ya en mayúsculas es el mismo valor. No borra ni inserta filas.
--
-- BASE DE DATOS: "crm" (la que comparten el CRM móvil y el CRM web).
--
-- Ejecutar desde el VPS, entrando al contenedor de Postgres:
--   docker exec -i n8n_db-crm psql -U <usuario> -d crm -v ON_ERROR_STOP=1 \
--     -f - < scripts/normalizar_estados_lead.sql
--
-- O desde el contenedor del CRM web, que ya tiene MAIN_DB_URL cargada:
--   psql "$MAIN_DB_URL" -v ON_ERROR_STOP=1 -f scripts/normalizar_estados_lead.sql

\set ON_ERROR_STOP on


-- ---------------------------------------------------------------------------
-- 0. Antes: qué hay en la base
-- ---------------------------------------------------------------------------
-- Dejar constancia del reparto previo. Si algo sale raro después, esta salida
-- es con lo que se compara.

SELECT 'ANTES' AS momento, status, COUNT(*) AS leads
FROM "Lead"
GROUP BY status
ORDER BY 3 DESC;


BEGIN;

-- ---------------------------------------------------------------------------
-- 1. FRENO: el trigger que anula las asignaciones de Bárbara
-- ---------------------------------------------------------------------------
-- tmp/block_barbara_db_trigger.sql del repo del CRM móvil instaló en esta base
-- un trigger BEFORE INSERT OR UPDATE sobre "Lead" que pone "assignedToId" en
-- NULL cuando el lead queda asignado a Bárbara. Se revirtió en código el 25 de
-- julio de 2026, pero un trigger de base de datos no se revierte solo y el DROP
-- manual quedó pendiente.
--
-- Mientras siga instalado, CUALQUIER UPDATE masivo sobre "Lead" -- incluido el
-- de más abajo, que solo quiere cambiar mayúsculas -- le borra a Bárbara la
-- propiedad de todos los leads que toque. El trigger no distingue qué columna
-- se está actualizando: se dispara por fila, no por columna.
--
-- Así que este script se niega a correr mientras el trigger exista. Primero:
--
--   DROP TRIGGER IF EXISTS trg_block_barbara_assignment ON "Lead";
--   DROP FUNCTION IF EXISTS block_barbara_assignment();
--
-- y recién entonces volver a correr este archivo.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_block_barbara_assignment'
          AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION
            'ABORTADO: el trigger trg_block_barbara_assignment sigue instalado. '
            'Un UPDATE masivo sobre "Lead" con ese trigger activo le borra a '
            'Barbara la asignacion de todos los leads que toque. Hacer el DROP '
            'primero (ver el comentario de la seccion 1) y volver a correr esto.';
    END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 2. Normalizar a mayúsculas
-- ---------------------------------------------------------------------------
-- Se toca solo lo que realmente cambia, para no reescribir filas que ya están
-- bien. Importa más de lo que parece: el listado del CRM móvil ordena por
-- "updatedAt", así que un UPDATE indiscriminado sobre toda la tabla reordenaría
-- la bandeja de todos los asesores de golpe.
--
-- Prisma calcula "updatedAt" en el cliente y no hay trigger en la base que la
-- toque, así que este UPDATE en SQL crudo no mueve esa columna. Aun así, cuanto
-- menos filas se toquen, mejor.

UPDATE "Lead"
SET status = UPPER(TRIM(status))
WHERE status IS NOT NULL
  AND status <> UPPER(TRIM(status));


-- ---------------------------------------------------------------------------
-- 3. Estados vacíos
-- ---------------------------------------------------------------------------
-- Un lead sin estado no aparece en ningún filtro de ninguno de los dos CRM:
-- queda fuera de 'NUEVO' y fuera de todos los demás. En la práctica es un lead
-- perdido. Se manda a 'NUEVO', que es donde debería haber entrado.

UPDATE "Lead"
SET status = 'NUEVO'
WHERE status IS NULL OR TRIM(status) = '';

COMMIT;


-- ---------------------------------------------------------------------------
-- 4. Verificación de la marca de contacto
-- ---------------------------------------------------------------------------
-- El CRM web nuevo escribe estas cuatro columnas al mover el pipeline. Si no
-- existen, las crea scripts/chat_media_y_contacto.sql del repo del CRM móvil
-- (crm-aliminv2), que es donde vive esa migración.
--
-- Esta consulta debe devolver cuatro filas. Si devuelve menos, NO desplegar el
-- CRM web: correr primero esa migración.

SELECT 'columna presente' AS que, column_name AS nombre
FROM information_schema.columns
WHERE table_name = 'Lead'
  AND column_name IN ('contacted', 'contactedAt', 'contactedById', 'followupStage')
ORDER BY 2;


-- ---------------------------------------------------------------------------
-- 5. Después: cómo quedó
-- ---------------------------------------------------------------------------
-- Se espera solo NUEVO / CONTACTADO / VISITA / RESERVADO. Cualquier otro valor
-- que aparezca acá es un estado que algún import viejo dejó suelto y que
-- ninguna de las dos interfaces sabe pintar: revisarlo a mano.

SELECT 'DESPUES' AS momento, status, COUNT(*) AS leads
FROM "Lead"
GROUP BY status
ORDER BY 3 DESC;

-- Cruce entre la etapa del pipeline y la marca de atención. Después del deploy
-- el código las mueve juntas, pero los leads históricos pueden estar cruzados:
-- CONTACTADO con contacted=false es un lead que alguien avanzó desde la web
-- antes de este cambio y al que el cron le siguió mandando recordatorios.

SELECT status, "contacted", COUNT(*) AS leads
FROM "Lead"
GROUP BY 1, 2
ORDER BY 3 DESC;
