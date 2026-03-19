-- Script para corregir la tabla campaigns si ya existía sin las columnas necesarias
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS subject VARCHAR(255);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS html_content TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS mjml_content TEXT;

-- Asegurarse de que las columnas tengan NOT NULL si es posible (opcional, puede fallar si hay datos previos)
-- ALTER TABLE campaigns ALTER COLUMN title SET NOT NULL;
-- ALTER TABLE campaigns ALTER COLUMN subject SET NOT NULL;
-- ALTER TABLE campaigns ALTER COLUMN html_content SET NOT NULL;
