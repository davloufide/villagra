-- ─────────────────────────────────────────────────────────────
-- Migración: agendar cita SIN registrarse (cliente invitado)
-- (2026-08-19). Correr UNA vez en el SQL Editor de Supabase.
-- ─────────────────────────────────────────────────────────────
-- Marca a los clientes que llegaron agendando una cita pública y
-- nunca crearon una cuenta. Siguen siendo clientes normales (tienen
-- vehículos, mantenimientos y facturas), pero:
--   * no pueden iniciar sesión (no tienen contraseña utilizable)
--   * en la lista de clientes se muestran con la etiqueta "Sin registro"
-- Si más adelante el invitado dejó correo y usa "¿Olvidaste tu
-- contraseña?", al fijar su clave el sistema lo pasa a es_invitado = false.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS es_invitado BOOLEAN DEFAULT false;
