# Verificación — Ejecutado completo + UI en producción

Fecha: 2026-11-21. Rama: `cursor/prog-obra-ejecutado-completo-ui`.

## Causa raíz de lo visto en iPad

1. **UI antigua en el dispositivo** — El Service Worker (`claracore-shell-v11`) sirve shell en *cache-first*. El merge #1167 sí desplegó a Azure SWA, pero el iPad seguía el HTML/JS cacheado (textos «Ejecución SICOE (N1)», banner largo, `/mapa … ms`, botones con texto).
2. **«Sin datos de ejecución»** — `refresh_prog_pk_ejecutado` upsertaba columnas inexistentes (`presupuesto_costo` / `ejecutado_costo` / `porcentaje_ejecutado`) frente al esquema real (`presupuesto_directo` / `ejecutado` / `ejecutado_pct`), provocando 500 en refresh; sumado a fallos posibles del join `pk_ids` y a no actualizar estado en el front, el recuadro quedaba vacío.

## Correcciones

- Total ejecutado = `sum_valor_canonico` (misma regla que SicoeObra reportado): ítem asignado, excl. rechazados.
- Upsert con columnas reales; fetch de `so_registros` con fallback si falla el join.
- Panel siempre muestra Presupuesto / Ejecutado / % (etiqueta **Ejecutado**).
- SW → `claracore-shell-v12` para invalidar caché del iPad.
- UI del #1167 reconfirmada (ribbon en panel, no en header).

## Tests

```
pytest tests/test_prog_obra_ejecutado*.py → 8 passed
node --test progObraRibbonLayout.scenario.test.js → 5 passed
```

## Evidencia en producción (post-deploy)

Tras merge a `main` y deploy automático:

1. `GET https://claracore-backend.azurewebsites.net/healthz` → `git_sha` del commit de este PR.
2. En iPad: cerrar PWA / «Actualizar» del banner de nueva versión (o borrar sitio) para tomar shell v12.
3. Contrato Consorcio Silvania (44 PK):
   - Anotar **Ejecutado** del recuadro de Programación.
   - Anotar total reportado en SicoeObra (mismo contrato, ítem asignado, sin rechazados).
   - Deben coincidir.
4. Confirmar visual: iconos en panel (no bajo Manual/Bloc/asistente); banner `Borrador nºN`; sin `/mapa ms` (salvo Desarrollador); Plano/Sincronizar/Programación|Ejecutado solo icono; leyenda sin párrafos.
