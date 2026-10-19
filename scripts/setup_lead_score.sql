-- Lead score (base crm). Lo escribe el CRM web cada 15 minutos; el CRM móvil
-- lo lee para mandar los avisos. El CRM web crea la tabla solo si no existe
-- (lib/lead_score.ts → asegurarTabla); este archivo deja el SQL versionado.

CREATE TABLE IF NOT EXISTS public.lead_score (
  lead_id            text PRIMARY KEY,           -- "Lead".id
  score              integer NOT NULL,           -- 0 a 100
  banda              text NOT NULL,              -- CALIENTE / TIBIO / TEMPLADO / FRIO
  origen             text NOT NULL,              -- WEB / LANDING_META / FORM_META / MANUAL / ANTIGUA
  puntos_origen      integer NOT NULL DEFAULT 0,
  puntos_perfil      integer NOT NULL DEFAULT 0,
  puntos_interaccion integer NOT NULL DEFAULT 0,
  motivos            jsonb NOT NULL DEFAULT '[]'::jsonb, -- el porqué, en palabras del equipo
  ultima_interaccion timestamptz,
  caliente_desde     timestamptz,                -- desde cuándo está caliente (null si no lo está)
  calculado_en       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_score_banda ON public.lead_score (banda, score DESC);

-- Registro de avisos del lead score (lo crea y lo escribe el CRM móvil,
-- src/lib/avisosLeadScore.ts). La clave única impide mandar dos veces lo mismo.
CREATE TABLE IF NOT EXISTS public.lead_score_avisos (
  id            bigserial PRIMARY KEY,
  clave         text NOT NULL UNIQUE,
  evento        text NOT NULL,                   -- CALIENTE / SIN_ATENDER / RESUMEN / CUBIERTO
  lead_id       text,
  asesor_id     text,
  texto         text NOT NULL DEFAULT '',
  estado        text NOT NULL DEFAULT 'PENDIENTE', -- PENDIENTE / ENVIADO / ERROR
  intentos      integer NOT NULL DEFAULT 1,
  error         text,
  wa_message_id text,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  enviado_en    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_lead_score_avisos_lead ON public.lead_score_avisos (lead_id, evento, creado_en DESC);
