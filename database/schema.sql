-- ============================================================
--  Lubricentro Villagra — Schema PostgreSQL / Supabase
-- ============================================================

-- ── Roles ─────────────────────────────────────────────────
CREATE TABLE roles (
  id_rol   SERIAL PRIMARY KEY,
  nombre   VARCHAR(30) UNIQUE NOT NULL  -- 'administrador' | 'mecanico' | 'cliente'
);

-- ── Usuarios ──────────────────────────────────────────────
CREATE TABLE usuarios (
  id_usuario    SERIAL PRIMARY KEY,
  nombre        VARCHAR(100) NOT NULL,
  correo        VARCHAR(120) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  id_rol        INTEGER NOT NULL REFERENCES roles(id_rol),
  activo        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Empleados (admin + mecánicos) ─────────────────────────
CREATE TABLE empleados (
  id_empleado     SERIAL PRIMARY KEY,
  id_usuario      INTEGER UNIQUE NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  telefono        VARCHAR(20),
  tipo_empleo     VARCHAR(30) DEFAULT 'tiempo_completo',
  fecha_ingreso   DATE,
  dias_vacaciones INTEGER DEFAULT 0,
  especialidad    VARCHAR(60)
);

-- ── Marcas de vehículos ───────────────────────────────────
CREATE TABLE marcas (
  id_marca     SERIAL PRIMARY KEY,
  nombre_marca VARCHAR(60) UNIQUE NOT NULL
);

-- ── Clientes ──────────────────────────────────────────────
CREATE TABLE clientes (
  id_cliente  SERIAL PRIMARY KEY,
  id_usuario  INTEGER UNIQUE NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  telefono    VARCHAR(20)
);

-- ── Vehículos ─────────────────────────────────────────────
CREATE TABLE vehiculos (
  id_vehiculo SERIAL PRIMARY KEY,
  id_cliente  INTEGER NOT NULL REFERENCES clientes(id_cliente),
  placa       VARCHAR(20) UNIQUE NOT NULL,
  id_marca    INTEGER NOT NULL REFERENCES marcas(id_marca),
  observaciones TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Categorías de inventario ──────────────────────────────
CREATE TABLE categorias (
  id_categoria  SERIAL PRIMARY KEY,
  nombre        VARCHAR(60) UNIQUE NOT NULL
);

-- ── Productos / Inventario ────────────────────────────────
CREATE TABLE productos (
  id_producto    SERIAL PRIMARY KEY,
  nombre         VARCHAR(100) NOT NULL,
  codigo         VARCHAR(30) UNIQUE NOT NULL,
  marca          VARCHAR(60),
  id_categoria   INTEGER REFERENCES categorias(id_categoria),
  cantidad_stock INTEGER NOT NULL DEFAULT 0,
  stock_minimo   INTEGER NOT NULL DEFAULT 5,
  costo_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
  precio_venta   NUMERIC(12,2) NOT NULL DEFAULT 0,
  activo         BOOLEAN DEFAULT TRUE
);

-- ── Tipos de servicio ─────────────────────────────────────
CREATE TABLE tipos_servicio (
  id_tipo_servicio SERIAL PRIMARY KEY,
  nombre           VARCHAR(100) NOT NULL,
  descripcion      TEXT,
  precio_base      NUMERIC(12,2) DEFAULT 0
);

-- ── Mantenimientos ────────────────────────────────────────
CREATE TABLE mantenimientos (
  id_mantenimiento       SERIAL PRIMARY KEY,
  id_vehiculo            INTEGER NOT NULL REFERENCES vehiculos(id_vehiculo),
  fecha_ingreso          TIMESTAMPTZ DEFAULT NOW(),
  fecha_estimada_entrega DATE,
  estado                 VARCHAR(20) DEFAULT 'recibido',
  -- estado: 'recibido' | 'en_progreso' | 'terminado'
  observaciones_cliente  TEXT,
  porcentaje_avance      INTEGER DEFAULT 0,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ── Tareas dentro de un mantenimiento ────────────────────
CREATE TABLE tareas (
  id_tarea          SERIAL PRIMARY KEY,
  id_mantenimiento  INTEGER NOT NULL REFERENCES mantenimientos(id_mantenimiento) ON DELETE CASCADE,
  id_empleado       INTEGER REFERENCES empleados(id_empleado),
  id_tipo_servicio  INTEGER REFERENCES tipos_servicio(id_tipo_servicio),
  descripcion       VARCHAR(200),
  estado            VARCHAR(20) DEFAULT 'pendiente',
  -- estado: 'pendiente' | 'en_proceso' | 'completada'
  tiempo_invertido  VARCHAR(30),
  resultado         VARCHAR(60),
  observaciones_tecnicas TEXT,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Facturas ──────────────────────────────────────────────
CREATE TABLE facturas (
  id_factura       SERIAL PRIMARY KEY,
  id_mantenimiento INTEGER UNIQUE NOT NULL REFERENCES mantenimientos(id_mantenimiento),
  numero_orden     VARCHAR(30) UNIQUE NOT NULL,
  subtotal         NUMERIC(12,2) DEFAULT 0,
  iva              NUMERIC(12,2) DEFAULT 0,
  total            NUMERIC(12,2) DEFAULT 0,
  metodo_pago      VARCHAR(30) DEFAULT 'efectivo',
  estado           VARCHAR(20) DEFAULT 'pendiente',
  -- estado: 'pendiente' | 'pagada'
  fecha_emision    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Líneas de factura ─────────────────────────────────────
CREATE TABLE lineas_factura (
  id_linea         SERIAL PRIMARY KEY,
  id_factura       INTEGER NOT NULL REFERENCES facturas(id_factura) ON DELETE CASCADE,
  descripcion      VARCHAR(200) NOT NULL,
  cantidad         INTEGER NOT NULL DEFAULT 1,
  precio_unitario  NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal_linea   NUMERIC(12,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED
);

-- ── Movimientos de inventario ─────────────────────────────
CREATE TABLE movimientos_inventario (
  id_movimiento    SERIAL PRIMARY KEY,
  id_producto      INTEGER NOT NULL REFERENCES productos(id_producto),
  id_mantenimiento INTEGER REFERENCES mantenimientos(id_mantenimiento),
  tipo             VARCHAR(10) NOT NULL, -- 'entrada' | 'salida'
  cantidad         INTEGER NOT NULL,
  fecha            TIMESTAMPTZ DEFAULT NOW()
);

-- ── Solicitudes de vacaciones ─────────────────────────────
CREATE TABLE vacaciones (
  id_vacacion   SERIAL PRIMARY KEY,
  id_empleado   INTEGER NOT NULL REFERENCES empleados(id_empleado),
  fecha_inicio  DATE NOT NULL,
  fecha_fin     DATE NOT NULL,
  dias_habiles  INTEGER NOT NULL DEFAULT 1,
  estado        VARCHAR(20) DEFAULT 'pendiente',
  -- estado: 'pendiente' | 'aprobada' | 'rechazada'
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Índices de rendimiento ────────────────────────────────
CREATE INDEX ON vehiculos(id_cliente);
CREATE INDEX ON mantenimientos(id_vehiculo);
CREATE INDEX ON mantenimientos(estado);
CREATE INDEX ON tareas(id_mantenimiento);
CREATE INDEX ON tareas(id_empleado);
CREATE INDEX ON facturas(estado);
CREATE INDEX ON productos(cantidad_stock);

-- ── Trigger: auto-actualizar estado de mantenimiento ─────
CREATE OR REPLACE FUNCTION actualizar_estado_mantenimiento()
RETURNS TRIGGER AS $$
DECLARE
  total_tareas    INTEGER;
  tareas_completadas INTEGER;
  pct INTEGER;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE estado = 'completada')
  INTO total_tareas, tareas_completadas
  FROM tareas WHERE id_mantenimiento = NEW.id_mantenimiento;

  IF total_tareas = 0 THEN
    pct := 0;
  ELSE
    pct := (tareas_completadas * 100 / total_tareas);
  END IF;

  UPDATE mantenimientos SET
    porcentaje_avance = pct,
    estado = CASE
      WHEN tareas_completadas = 0 THEN 'recibido'
      WHEN tareas_completadas < total_tareas THEN 'en_progreso'
      ELSE 'terminado'
    END
  WHERE id_mantenimiento = NEW.id_mantenimiento;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_estado_mantenimiento
AFTER INSERT OR UPDATE ON tareas
FOR EACH ROW EXECUTE FUNCTION actualizar_estado_mantenimiento();

-- ── Trigger: auto-descontar inventario al usar producto ──
CREATE OR REPLACE FUNCTION descontar_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo = 'salida' THEN
    UPDATE productos SET cantidad_stock = cantidad_stock - NEW.cantidad
    WHERE id_producto = NEW.id_producto;
  ELSIF NEW.tipo = 'entrada' THEN
    UPDATE productos SET cantidad_stock = cantidad_stock + NEW.cantidad
    WHERE id_producto = NEW.id_producto;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock
AFTER INSERT ON movimientos_inventario
FOR EACH ROW EXECUTE FUNCTION descontar_stock();

-- ── Trigger: acumulación de vacaciones (1 día/mes) ───────
CREATE OR REPLACE FUNCTION acumular_vacaciones()
RETURNS void AS $$
BEGIN
  UPDATE empleados
  SET dias_vacaciones = dias_vacaciones + 1
  WHERE tipo_empleo IN ('tiempo_completo', 'medio_tiempo')
    AND fecha_ingreso IS NOT NULL;
END;
$$ LANGUAGE plpgsql;
-- Programar con pg_cron o Supabase scheduled functions: SELECT acumular_vacaciones();
