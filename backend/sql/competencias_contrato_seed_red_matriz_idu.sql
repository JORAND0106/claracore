-- Ejecutar en Supabase SQL Editor (idempotente).
-- Semilla «Red Matriz IDU» en competencias_contrato para todos los contratos.
-- El catálogo base también vive en COMPETENCIAS_BASE (backend/main.py); este INSERT
-- deja la fila en la tabla por contrato, igual que la semilla de ICCU.

INSERT INTO competencias_contrato (contrato_id, nombre)
SELECT c.id, 'Red Matriz IDU'
FROM contratos c
ON CONFLICT (contrato_id, nombre) DO NOTHING;
