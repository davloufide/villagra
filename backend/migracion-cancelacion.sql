-- OPE-012: cancelar un mantenimiento con justificación.
-- El estado 'cancelado' usa la columna `estado` existente (VARCHAR(20)).
-- Esta columna guarda la justificación. Sin ella el sistema funciona igual,
-- pero la justificación se anota al final de observaciones_cliente.
ALTER TABLE mantenimientos ADD COLUMN IF NOT EXISTS motivo_cancelacion TEXT;
