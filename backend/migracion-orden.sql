-- OPE-008: columna para reordenar tareas de un mantenimiento.
-- Cómo aplicarla:
--   1. Entra a https://supabase.com  -> tu proyecto
--   2. Menú izquierdo: "SQL Editor" -> "New query"
--   3. Pega esta línea y dale "Run":

ALTER TABLE tareas ADD COLUMN IF NOT EXISTS orden integer DEFAULT 0;

-- Listo. A partir de ahí el botón de reordenar (flechas ↑ ↓) guarda el orden.
-- (Editar y eliminar tareas, y el catálogo de servicios, ya funcionan sin esto.)
