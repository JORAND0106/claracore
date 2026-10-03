-- Biblioteca de bloques de nodo para dibujo de reportes (SicoeObra).
-- Formas con medidas reales (metros). Administrable sin reprogramar.

CREATE TABLE IF NOT EXISTS public.so_bloques_nodo (
  id bigserial PRIMARY KEY,
  contrato_id bigint REFERENCES public.contratos(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  forma text NOT NULL DEFAULT 'circulo',
  -- circulo | cuadrado | rectangulo | ovalo | personalizado
  ancho_m double precision NOT NULL DEFAULT 1.0,
  alto_m double precision NOT NULL DEFAULT 1.0,
  -- Vértices locales opcionales (metros, centro en 0,0) para forma=personalizado
  vertices jsonb,
  activo boolean NOT NULL DEFAULT true,
  creado_por bigint,
  modificado_por bigint,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT so_bloques_nodo_forma_chk CHECK (
    forma IN ('circulo', 'cuadrado', 'rectangulo', 'ovalo', 'personalizado')
  ),
  CONSTRAINT so_bloques_nodo_medidas_chk CHECK (ancho_m > 0 AND alto_m > 0)
);

COMMENT ON TABLE public.so_bloques_nodo IS
  'Biblioteca de bloques de nodo (forma + medidas reales) para el dibujo de reportes.';
COMMENT ON COLUMN public.so_bloques_nodo.contrato_id IS
  'NULL = bloque global del sistema; con valor = bloque del contrato.';
COMMENT ON COLUMN public.so_bloques_nodo.vertices IS
  'Polígono local [[x,y],...] en metros (origen centro) si forma=personalizado.';

CREATE INDEX IF NOT EXISTS idx_so_bloques_nodo_contrato_activo
  ON public.so_bloques_nodo (contrato_id, activo);

-- Semilla global (idempotente por nombre+contrato_id IS NULL)
INSERT INTO public.so_bloques_nodo (contrato_id, nombre, forma, ancho_m, alto_m, activo)
SELECT NULL, v.nombre, v.forma, v.ancho_m, v.alto_m, true
FROM (VALUES
  ('Pozo circular Ø1.20 m', 'circulo', 1.20, 1.20),
  ('Cámara 1.50 × 1.50 m', 'cuadrado', 1.50, 1.50),
  ('Caja 1.00 × 1.00 m', 'cuadrado', 1.00, 1.00),
  ('Sumidero 0.80 × 0.50 m', 'rectangulo', 0.80, 0.50),
  ('Ovalo 1.20 × 0.80 m', 'ovalo', 1.20, 0.80)
) AS v(nombre, forma, ancho_m, alto_m)
WHERE NOT EXISTS (
  SELECT 1 FROM public.so_bloques_nodo b
  WHERE b.contrato_id IS NULL AND b.nombre = v.nombre
);
