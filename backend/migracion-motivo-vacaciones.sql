-- ─────────────────────────────────────────────────────────────
-- Migración: motivo del rechazo de vacaciones (2026-08-20)
-- Correr UNA vez en el SQL Editor de Supabase.
-- ─────────────────────────────────────────────────────────────
-- Cuando el admin rechaza una solicitud de vacaciones debe escribir por
-- qué, y el empleado ve ese motivo en su módulo "Mis vacaciones".
-- El código funciona con o sin esta columna (si falta, el rechazo se
-- guarda igual pero sin el motivo).
ALTER TABLE vacaciones
  ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;
