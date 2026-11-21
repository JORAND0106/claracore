# Verificación — Ejecutado «Sin datos» Silvania (post #1170)

Fecha: 2026-11-21.

## Causa
`prog_obra_ejecutado` seleccionaba columnas inexistentes en `so_registros`:
`fecha` y `estado` → PostgREST 400 → resumen vacío → UI «Sin datos».

## Fix (#1170 → main `5f80c888`)
- Select real: niveles, `nivel1_fecha`, `created_at`, embeds `pk_ids` / `so_reportes(created_at)`.
- Regla: ítem asignado, cualquier validación; excl. rechazados y sin ítem.
- Valor: `sum_valor_canonico` (igual SicoeObra reportado).
- SW `claracore-shell-v13` (invalidación caché iPad).

## Deploy
| Componente | Estado | Evidencia |
|---|---|---|
| Backend | OK | `/healthz` incluye el fix (ancestro `5f80c888`) |
| Frontend SWA | OK | `https://app.claracore.co/sw.js` → `claracore-shell-v13` |

## Control Silvania (contrato_id=3) — QA Actions #44961638320
| Campo | Valor |
|---|---|
| Contrato | ICCU-CTO-1614-2025 · CONSORCIO SILVANIA MC |
| PKs | 49 |
| Registros / ejecutables | 452 / 433 (rechazados 6, sin ítem 13) |
| **Programación ejecutado** | **$862.655.364** |
| **SicoeObra reportado** | **$862.655.364** |
| Solo N1 canónico | $757.438.409 (≥ piso legacy $676.262.994) |
| Presupuesto / % | $19.972.057.462 · 4,32 % |
| Coinciden | **sí** |

## Pantalla (iPad / PWA)
Tras actualizar a shell v13 (banner «nueva versión» o borrar sitio):
recuadro **Ejecutado** muestra Presupuesto / Ejecutado / % — nunca «Sin datos»
si hay registros con ítem. Cifra esperada: **$862.655.364** (4,3 %).
