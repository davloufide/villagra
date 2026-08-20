-- ─────────────────────────────────────────────────────────────
-- Migración: FLUJO DE CAJA (2026-08-19)
-- Correr UNA vez en el SQL Editor de Supabase.
-- OJO: a diferencia de otras migraciones, esta es OBLIGATORIA.
-- Son tablas nuevas: sin ellas el submódulo "Flujo de caja" avisa
-- que falta correrla (el resto del sistema sigue funcionando igual).
-- ─────────────────────────────────────────────────────────────

-- 1) Fecha REAL de cobro de la factura ------------------------------
-- El flujo de caja cuenta la plata el día que entró, no el día que se
-- emitió la factura. Se llena sola al darle "Cobrar" en Facturación.
ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS fecha_pago DATE;

-- Las facturas que YA estaban cobradas toman su fecha de emisión
-- (es el único dato disponible para ellas).
UPDATE facturas
   SET fecha_pago = fecha_emision::date
 WHERE estado = 'pagada' AND fecha_pago IS NULL;

-- 2) Categorías de movimientos de caja ------------------------------
-- tipo: 'gasto' | 'ingreso' | 'ambos' (para qué tipo de movimiento se ofrece)
CREATE TABLE IF NOT EXISTS categorias_caja (
  id_categoria_caja SERIAL PRIMARY KEY,
  nombre            VARCHAR(80) UNIQUE NOT NULL,
  tipo              VARCHAR(10) NOT NULL DEFAULT 'gasto',
  creado_en         TIMESTAMPTZ DEFAULT NOW()
);

-- Categorías típicas de un taller. El admin puede agregar y borrar las suyas.
INSERT INTO categorias_caja (nombre, tipo) VALUES
  ('Salarios',              'gasto'),
  ('Alquiler',              'gasto'),
  ('Repuestos y suministros','gasto'),
  ('Servicios públicos',    'gasto'),
  ('Herramientas y equipo', 'gasto'),
  ('Impuestos',             'gasto'),
  ('Publicidad',            'gasto'),
  ('Mantenimiento del local','gasto'),
  ('Otros gastos',          'gasto'),
  ('Venta de productos',    'ingreso'),
  ('Servicios sin factura', 'ingreso'),
  ('Otros ingresos',        'ingreso')
ON CONFLICT (nombre) DO NOTHING;

-- 3) Movimientos de caja registrados a mano -------------------------
-- Los ingresos automáticos NO viven aquí: se leen de las facturas
-- cobradas. Esta tabla es solo para lo que el admin ingresa a mano.
CREATE TABLE IF NOT EXISTS movimientos_caja (
  id_movimiento_caja SERIAL PRIMARY KEY,
  fecha              DATE NOT NULL,
  tipo               VARCHAR(10) NOT NULL,      -- 'ingreso' | 'gasto'
  concepto           VARCHAR(200) NOT NULL,
  monto              NUMERIC(12,2) NOT NULL,
  id_categoria_caja  INTEGER REFERENCES categorias_caja(id_categoria_caja),
  metodo_pago        VARCHAR(30),
  id_usuario         INTEGER REFERENCES usuarios(id_usuario),
  creado_en          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movimientos_caja_fecha ON movimientos_caja (fecha);
