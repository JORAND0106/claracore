-- Índices sugeridos para public.so_registros (ClaraCore / SICOE).
-- Alineados con filtros de main.py: contrato_id, reporte_id, pk_id_id, tramo, capitulo,
-- subcontratista_id, niveles de validación, número de registro.
--
-- NOTA: Ya existe idx_so_registros_matriz_contrato_acta (contrato_id, acta_rpo_id) con WHERE item_numero.
--        No se duplica aquí.
--
-- Supabase SQL Editor envuelve en transacción: NO uses CREATE INDEX CONCURRENTLY aquí (error 25001).
-- Versión normal (breve bloqueo de escritura en la tabla al crear; con ~tens de miles de filas suele ser segundos).
-- Ejecuta UNO a la vez en horario de poca carga la primera vez.

-- 1) Más crítico: casi toda query lleva contrato; muchas anclan a un reporte
CREATE INDEX IF NOT EXISTS idx_so_registros_contrato_reporte
  ON public.so_registros (contrato_id, reporte_id);

-- 2) Filtro por plano / PK
CREATE INDEX IF NOT EXISTS idx_so_registros_contrato_pk
  ON public.so_registros (contrato_id, pk_id_id);

-- 3) Búsqueda / validación por capas (PostgREST .eq en nivel1/2/3)
CREATE INDEX IF NOT EXISTS idx_so_registros_contrato_niveles
  ON public.so_registros (contrato_id, nivel1_estado, nivel2_estado, nivel3_estado);

-- 4) Filtros operativos frecuentes
CREATE INDEX IF NOT EXISTS idx_so_registros_contrato_cap_tramo
  ON public.so_registros (contrato_id, capitulo, tramo);

CREATE INDEX IF NOT EXISTS idx_so_registros_contrato_subc
  ON public.so_registros (contrato_id, subcontratista_id);

-- 5) Lookup por número de registro dentro de contrato
CREATE INDEX IF NOT EXISTS idx_so_registros_contrato_numreg
  ON public.so_registros (contrato_id, numero_registro);

-- 6) Semana (agrupaciones e informes)
CREATE INDEX IF NOT EXISTS idx_so_registros_contrato_semana
  ON public.so_registros (contrato_id, semana_id);
