-- Script para corregir la restricción NOT NULL en la columna 'name' de la tabla 'campaigns'
-- y asegurar que sea compatible con el nuevo sistema de títulos.

-- 1. Quitar la restricción NOT NULL de la columna 'name' si existe
DO $$ 
BEGIN 
    ALTER TABLE campaigns ALTER COLUMN name DROP NOT NULL;
EXCEPTION 
    WHEN undefined_column THEN 
        RAISE NOTICE 'La columna name no existe, no es necesario hacer nada.';
END $$;

-- 2. Asegurarse de que las columnas title y subject existan (ya deberían por scripts anteriores)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS subject VARCHAR(255);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'DRAFT';

-- 3. Sincronizar datos existentes si es necesario
UPDATE campaigns SET name = title WHERE name IS NULL AND title IS NOT NULL;
UPDATE campaigns SET title = name WHERE title IS NULL AND name IS NOT NULL;
