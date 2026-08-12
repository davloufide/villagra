-- ─────────────────────────────────────────────────────────────
-- Migración: calendario de disponibilidad + confirmación de citas
-- (2026-08-11). Correr UNA vez en el SQL Editor de Supabase.
-- ─────────────────────────────────────────────────────────────

-- 1) Días bloqueados por el admin. Por defecto NO hay filas => todos los
--    días están disponibles. El admin agrega aquí los días no disponibles.
CREATE TABLE IF NOT EXISTS dias_bloqueados (
  id_dia    SERIAL PRIMARY KEY,
  fecha     DATE UNIQUE NOT NULL,
  motivo    VARCHAR(200),
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- 2) Estado de la CITA, independiente del estado de trabajo (recibido/
--    en_progreso/terminado) que maneja el trigger según las tareas.
--    'solicitada' = pendiente de confirmación (la crea el cliente)
--    'confirmada' = aceptada por un mecánico o por el admin
--    (el rechazo la devuelve a 'solicitada' y desasigna el mecánico)
ALTER TABLE mantenimientos
  ADD COLUMN IF NOT EXISTS estado_cita VARCHAR(20) DEFAULT 'confirmada';

-- Las citas ya existentes quedan como 'confirmada' (ya estaban en curso).
