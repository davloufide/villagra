-- ─────────────────────────────────────────────────────────────
-- Migración: IVA en el catálogo de servicios (2026-08-18)
-- Correr UNA vez en el SQL Editor de Supabase.
-- ─────────────────────────────────────────────────────────────
-- precio_base = precio del servicio SIN IVA.
-- iva = 13% de precio_base (se guarda para contabilidad / declaración a Hacienda).
ALTER TABLE tipos_servicio
  ADD COLUMN IF NOT EXISTS iva NUMERIC(12,2) DEFAULT 0;
