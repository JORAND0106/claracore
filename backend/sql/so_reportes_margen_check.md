# Definición esperada de `so_reportes_margen_check`
#
# La violación 23514 al crear el reporte desde planilla de tubería ocurre porque
# el campo `costado` de la planilla (p. ej. "Derecho" / "Izquierdo" del maestro PK)
# se enviaba crudo a `so_reportes.margen`, cuyo CHECK solo admite el catálogo SICOE.
#
# Valores canónicos (alineados con SicoeLocalizacionFields / migraciones Bubble):

```sql
-- Restricción típica en public.so_reportes (consultar en BD con):
--   SELECT pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conname = 'so_reportes_margen_check';

ALTER TABLE public.so_reportes
  DROP CONSTRAINT IF EXISTS so_reportes_margen_check;

ALTER TABLE public.so_reportes
  ADD CONSTRAINT so_reportes_margen_check
  CHECK (
    margen IS NULL
    OR margen IN ('Izquierda', 'Central', 'Derecha', 'Única')
    OR margen LIKE 'Otro:%'
  );
```

-- Mapeo aplicado en backend al crear reporte desde planilla:
--   Derecho / Derecha → Derecha
--   Izquierdo / Izquierda → Izquierda
--   Central / Centro → Central
--   Unico / Única → Única
--   cualquier otro texto → Otro: {texto}
