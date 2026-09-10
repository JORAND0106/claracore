-- ClaraCore — Recursos Humanos: parentesco neutro + notas de cascada CTO-LAB
-- Idempotente.

-- Desactivar variantes de género en parentesco (se reemplazan por abreviatura @)
UPDATE public.rrhh_catalogo_opciones
SET activo = false
WHERE categoria = 'parentesco'
  AND lower(trim(valor)) IN (
    'hijo', 'hija', 'hermano', 'hermana',
    'abuelo', 'abuela', 'tío', 'tio', 'tía', 'tia',
    'primo', 'prima', 'suegro', 'suegra', 'amigo', 'amiga'
  );

-- Insertar opciones neutras faltantes por cada contrato que ya tenga catálogo parentesco
INSERT INTO public.rrhh_catalogo_opciones (contrato_id, categoria, valor, valor_norm, activo)
SELECT c.contrato_id, 'parentesco', v.valor, lower(trim(v.valor)), true
FROM (
  SELECT DISTINCT contrato_id
  FROM public.rrhh_catalogo_opciones
  WHERE categoria = 'parentesco'
) c
CROSS JOIN (
  VALUES
    ('Padre'),
    ('Madre'),
    ('Cónyuge'),
    ('Compañero(a) permanente'),
    ('Hij@'),
    ('Herman@'),
    ('Abuel@'),
    ('Ti@'),
    ('Prim@'),
    ('Suegr@'),
    ('Amig@'),
    ('Otro')
) AS v(valor)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.rrhh_catalogo_opciones o
  WHERE o.contrato_id = c.contrato_id
    AND o.categoria = 'parentesco'
    AND o.valor_norm = lower(trim(v.valor))
    AND o.activo = true
);

-- Reactivar si existían desactivadas con el mismo valor_norm
UPDATE public.rrhh_catalogo_opciones o
SET activo = true,
    valor = CASE lower(trim(o.valor_norm))
      WHEN 'padre' THEN 'Padre'
      WHEN 'madre' THEN 'Madre'
      WHEN 'cónyuge' THEN 'Cónyuge'
      WHEN 'conyuge' THEN 'Cónyuge'
      WHEN 'compañero(a) permanente' THEN 'Compañero(a) permanente'
      WHEN 'companero(a) permanente' THEN 'Compañero(a) permanente'
      WHEN 'hij@' THEN 'Hij@'
      WHEN 'herman@' THEN 'Herman@'
      WHEN 'abuel@' THEN 'Abuel@'
      WHEN 'ti@' THEN 'Ti@'
      WHEN 'prim@' THEN 'Prim@'
      WHEN 'suegr@' THEN 'Suegr@'
      WHEN 'amig@' THEN 'Amig@'
      WHEN 'otro' THEN 'Otro'
      ELSE o.valor
    END
WHERE o.categoria = 'parentesco'
  AND o.valor_norm IN (
    'padre', 'madre', 'cónyuge', 'conyuge',
    'compañero(a) permanente', 'companero(a) permanente',
    'hij@', 'herman@', 'abuel@', 'ti@', 'prim@', 'suegr@', 'amig@', 'otro'
  );

NOTIFY pgrst, 'reload schema';
