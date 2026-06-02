-- Índices de rendimiento para filtros de VALIDACIÓN por nivel en public.so_registros.
--
-- Motivo: index_so_registros_claracore.sql solo cubre nivel1/2/3 dentro de un índice
-- compuesto (contrato_id, nivel1_estado, nivel2_estado, nivel3_estado). Por la regla de
-- "columna líder", ese índice NO acelera filtros sobre niveles sueltos (p. ej. solo N2, o
-- solo N4) ni cubre los niveles N4/N5/N6 que se agregaron después
-- (contrato_niveles_validacion_y_so_registros_n4_n6.sql).
--
-- Síntoma: buscar por Validación (capas) — sobre todo N4/N5/N6 — hace seq scan de toda la
-- tabla so_registros del contrato y la búsqueda "se demora una eternidad".
--
-- Estos índices NO cambian ninguna lógica de filtrado: solo permiten que el motor resuelva
-- las mismas consultas por índice en vez de escaneo completo. Son idempotentes.
--
-- Supabase SQL Editor envuelve en transacción: NO uses CREATE INDEX CONCURRENTLY aquí (error 25001).
-- Ejecuta UNO a la vez, en horario de poca carga (cada CREATE bloquea escrituras unos segundos).

-- Un índice por nivel anclado a contrato: sirve para filtrar cualquier nivel por separado
-- y, combinado, el planner intersecta por bitmap cuando hay varias capas (N2 + N4, etc.).
CREATE INDEX IF NOT EXISTS idx_so_registros_contrato_nivel2
  ON public.so_registros (contrato_id, nivel2_estado);

CREATE INDEX IF NOT EXISTS idx_so_registros_contrato_nivel3
  ON public.so_registros (contrato_id, nivel3_estado);

CREATE INDEX IF NOT EXISTS idx_so_registros_contrato_nivel4
  ON public.so_registros (contrato_id, nivel4_estado);

CREATE INDEX IF NOT EXISTS idx_so_registros_contrato_nivel5
  ON public.so_registros (contrato_id, nivel5_estado);

CREATE INDEX IF NOT EXISTS idx_so_registros_contrato_nivel6
  ON public.so_registros (contrato_id, nivel6_estado);

-- Capítulo es uno de los acotadores más usados (drill del panel / barra de filtros).
-- (contrato_id, capitulo) deja el capítulo como prefijo utilizable por sí solo,
-- a diferencia de (contrato_id, capitulo, tramo) que ya existe pero igual sirve.
CREATE INDEX IF NOT EXISTS idx_so_registros_contrato_capitulo
  ON public.so_registros (contrato_id, capitulo);

-- Tras VACUUM/poblado, refrescar estadísticas para que el planner elija estos índices.
ANALYZE public.so_registros;
