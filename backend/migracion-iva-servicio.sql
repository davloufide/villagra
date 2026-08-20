-- ─────────────────────────────────────────────────────────────
-- Migración: IVA en el catálogo de servicios (2026-08-18)
-- Correr UNA vez en el SQL Editor de Supabase.
-- ─────────────────────────────────────────────────────────────
-- precio_base = precio del servicio SIN IVA.
-- iva = 13% de precio_base (se guarda para contabilidad / declaración a Hacienda).
ALTER TABLE tipos_servicio
  ADD COLUMN IF NOT EXISTS iva NUMERIC(12,2) DEFAULT 0;

-- Backfill (agregado 2026-08-19): los servicios que ya existían antes de
-- crear la columna quedaban en iva = 0. Les calcula el 13% de su precio_base.
UPDATE tipos_servicio
   SET iva = ROUND(COALESCE(precio_base, 0) * 0.13, 2)
 WHERE COALESCE(iva, 0) = 0
   AND COALESCE(precio_base, 0) > 0;
