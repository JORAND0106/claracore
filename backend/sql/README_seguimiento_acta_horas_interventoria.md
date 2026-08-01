# Migración: horas de acta + contrato de interventoría

Archivo SQL canónico:

- `backend/migrations/20260730120000_seguimiento_acta_horas_interventoria.sql`
- Espejo: `backend/sql/seguimiento_acta_horas_interventoria.sql`

## Ejecución manual (Supabase SQL Editor)

```sql
ALTER TABLE public.seguimiento_acta
  ADD COLUMN IF NOT EXISTS hora_inicio text,
  ADD COLUMN IF NOT EXISTS hora_fin text;

COMMENT ON COLUMN public.seguimiento_acta.hora_inicio IS
  'Hora HH:MM (Bogotá) de inicio: primera acción de gestión sobre un compromiso del acta.';
COMMENT ON COLUMN public.seguimiento_acta.hora_fin IS
  'Hora HH:MM (Bogotá) de fin: última generación/actualización de idea central o apartado.';

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS numero_interventoria text;

COMMENT ON COLUMN public.contratos.numero_interventoria IS
  'Número del contrato de interventoría asociado al contrato de obra (encabezado de actas).';

NOTIFY pgrst, 'reload schema';
```

## Verificación post-migración

1. En Admin → Contrato, completar **Número de interventoría**.
2. Abrir un acta, editar una idea o generar un compromiso: debe grabarse `hora_inicio` / actualizarse `hora_fin`.
3. Vista previa PDF: campos Hora Inicio/Fin y Cto. Interventoría dejan de mostrar "—".
