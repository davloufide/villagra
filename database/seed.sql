-- ============================================================
--  Seed data — Lubricentro Villagra
-- ============================================================

-- ── Roles ─────────────────────────────────────────────────
INSERT INTO roles (nombre) VALUES
  ('administrador'),
  ('mecanico'),
  ('cliente');

-- ── Marcas de vehículos (catálogo completo) ───────────────
INSERT INTO marcas (nombre_marca) VALUES
  ('Acura'), ('Alfa Romeo'), ('Aston Martin'), ('Audi'), ('BAIC'),
  ('Bentley'), ('BMW'), ('BYD'), ('Cadillac'), ('Chery'),
  ('Chevrolet'), ('Chrysler'), ('Citroën'), ('Dacia'), ('Daihatsu'),
  ('Dodge'), ('Ferrari'), ('Fiat'), ('Ford'), ('GAC'),
  ('Genesis'), ('Geely'), ('GMC'), ('Great Wall'), ('Haval'),
  ('Honda'), ('Hyundai'), ('Infiniti'), ('Isuzu'), ('Jaguar'),
  ('Jeep'), ('Kia'), ('Lamborghini'), ('Land Rover'), ('Lexus'),
  ('Lincoln'), ('Lucid'), ('Mahindra'), ('Maserati'), ('Mazda'),
  ('McLaren'), ('Mercedes-Benz'), ('MG'), ('Mini'), ('Mitsubishi'),
  ('Nissan'), ('Opel'), ('Peugeot'), ('Porsche'), ('RAM'),
  ('Renault'), ('Rivian'), ('Rolls-Royce'), ('Seat'), ('Skoda'),
  ('Ssangyong'), ('Subaru'), ('Suzuki'), ('Tata'), ('Tesla'),
  ('Toyota'), ('Volkswagen'), ('Volvo');

-- ── Categorías de inventario ──────────────────────────────
INSERT INTO categorias (nombre) VALUES
  ('Lubricantes'),
  ('Filtros'),
  ('Frenos'),
  ('Eléctrico'),
  ('Refrigeración'),
  ('Llantas y aros');

-- ── Tipos de servicio ─────────────────────────────────────
INSERT INTO tipos_servicio (nombre, precio_base) VALUES
  ('Cambio de aceite',           15000),
  ('Revisión de frenos',         20000),
  ('Mantenimiento preventivo',   35000),
  ('Alineación y balanceo',      18000),
  ('Cambio de filtros',          12000),
  ('Revisión sistema eléctrico', 25000),
  ('Cambio de refrigerante',     10000);

-- ── Usuarios demo ─────────────────────────────────────────
-- Contraseñas: 'Admin1234!' / 'Mecanico1!' / 'Cliente1!'
-- Hashes generados con bcrypt (rounds=10) — reemplazar en producción
INSERT INTO usuarios (nombre, correo, password_hash, id_rol) VALUES
  ('José Ramírez',  'admin@villagra.cr',
   '$2b$10$eDummyHashAdminXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', 1),
  ('Kevin Mora',    'kevin@villagra.cr',
   '$2b$10$eDummyHashMecanicoXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', 2),
  ('Luis Pérez',    'luis@villagra.cr',
   '$2b$10$eDummyHashMecanico2XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', 2),
  ('María Castro',  'maria@cliente.cr',
   '$2b$10$eDummyHashClienteXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', 3);

-- ── Empleados demo ────────────────────────────────────────
INSERT INTO empleados (id_usuario, telefono, tipo_empleo, fecha_ingreso, dias_vacaciones, especialidad)
VALUES
  (1, '8888-0001', 'tiempo_completo', '2022-01-15', 8, 'Motor y lubricación'),
  (2, '8888-0002', 'tiempo_completo', '2022-03-10', 4, 'Frenos y suspensión'),
  (3, '8888-0003', 'tiempo_completo', '2023-06-01', 6, 'Sistema eléctrico');

-- ── Clientes demo ─────────────────────────────────────────
INSERT INTO clientes (id_usuario, telefono) VALUES
  (4, '8888-0010');

-- ── Vehículos demo ────────────────────────────────────────
-- Toyota = id 61, Ford = id 19
INSERT INTO vehiculos (id_cliente, placa, id_marca) VALUES
  (1, 'ABC-123', 61),
  (1, 'PQR-987', 19);

-- ── Productos demo ────────────────────────────────────────
INSERT INTO productos (nombre, codigo, marca, id_categoria, cantidad_stock, stock_minimo, costo_unitario, precio_venta)
VALUES
  ('Filtro de aceite',   'FA-001', 'Castrol',  2, 3,  5,  3500,  5000),
  ('Líquido de frenos',  'LF-003', 'Bosch',    3, 12, 5,  5200,  7500),
  ('Aceite 5W-30',       'AO-007', 'Mobil',    1, 2,  5,  8000, 12000),
  ('Pastillas de freno', 'PF-012', 'Brembo',   3, 4,  5, 12000, 18000),
  ('Filtro de aire',     'FA-015', 'Mann',     2, 18, 5,  4200,  6000),
  ('Refrigerante',       'RF-005', 'Prestone', 5, 2,  5,  6500,  9000);
