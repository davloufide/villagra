-- FACT-005: aplicar descuentos a una factura
-- Correr una vez en el SQL Editor de Supabase.
-- Guarda el MONTO del descuento (en ₡) aplicado a la factura.
-- El código funciona con o sin esta columna, pero al agregarla el
-- descuento queda almacenado de forma explícita (no solo derivable).

ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS descuento NUMERIC(12,2) DEFAULT 0;
