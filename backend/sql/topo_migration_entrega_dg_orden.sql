-- Orden manual de pestañas en Entrega DG Obra

ALTER TABLE topo_entrega_dg
    ADD COLUMN IF NOT EXISTS orden INTEGER;

WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY contrato_id
               ORDER BY created_at ASC, id ASC
           ) AS rn
    FROM topo_entrega_dg
    WHERE orden IS NULL
)
UPDATE topo_entrega_dg e
SET orden = ranked.rn
FROM ranked
WHERE e.id = ranked.id;

CREATE INDEX IF NOT EXISTS idx_topo_entrega_dg_contrato_orden
    ON topo_entrega_dg(contrato_id, orden);
