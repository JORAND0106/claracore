# Cache de vistas (cliente)

Capa unificada en `vistaCache.js` para evitar refetch HTTP cuando la clave de vista es idéntica y el TTL es válido.

## Claves

| Módulo | Formato clave | Ejemplo |
|--------|---------------|---------|
| SICOE | `sicoe\|{contratoId}\|busqueda\|{hashBundle}` | Bundle = filtros + chips + capas + panel |
| Presupuesto | Ref local `_pptoCachePorCap` + TTL navegación 8 min | `keyCacheFila(capitulo, item)` |
| Dashboard resumen | `dashboard\|{contratoId}\|resumen\|{vista}` | `obra_ejecutada` / `presupuesto_obra` |
| Dashboard drill | `dashboard\|{contratoId}\|{vista}\|drill\|{cap}\|{item?}` | |
| Dashboard tabla | `dashboard\|{contratoId}\|{vista}\|tabla\|{cap}\|{item?}` | |
| Prog. obra mapa | `prog_obra\|{contratoId}\|mapa` | |
| Prog. obra versiones | `prog_obra\|{contratoId}\|versiones` | |
| Prog. obra tramos | `prog_obra\|{contratoId}\|tramos` | |

## TTL (ms)

- **sicoe**: 10 min (navegación drill / reentrada módulo)
- **presupuesto_nav**: 8 min (volver a capítulo/ítem visitado)
- **presupuesto_live**: 2 s (post-escritura / colaboración)
- **dashboard**: 5 min
- **prog_obra**: 10 min

## Invalidación

| Evento | Acción |
|--------|--------|
| Guardar/editar reporte SICOE | `invalidateSicoeVistaCache(contratoId)` + refetch |
| Validación masiva / reversión SICOE | `invalidateSicoeVistaCache` + refetch |
| Limpiar filtros SICOE | `sicoeClearNavegacion` + `invalidateSicoeVistaCache` |
| Guardar presupuesto (`_lastWriteAtRef`) | Borra `_pptoCachePorCap` del capítulo afectado; TTL live 2 s |
| Cambiar vista dashboard | `invalidateDashboardVistaCache` |
| Guardar programación (mapa) | `invalidateProgObraVistaCache` en `refreshMapaImmediate` |

## SICOE — navegación Atrás

1. Tras `ejecutarBusquedaSicoeCompleta` exitosa → `sicoeSetVistaCache` + stack por contrato.
2. `volverPanelAnterior` → `sicoePopNavegacion`; si hay entrada anterior, restaura sin red.
3. Miss → intenta `sicoeGetVistaCache` con bundle calculado; si miss → fetch habitual.

## Pruebas manuales (contrato grande ~45K)

1. **SICOE Atrás**: Filtrar → capítulo → ítem → **Atrás** → Network sin `/buscar` ni `/analisis`; UI &lt; 200 ms.
2. **SICOE reentrada**: Misma búsqueda → otro módulo → volver SICOE → sin refetch si TTL ok.
3. **SICOE ida/vuelta 3 niveles**: Contar requests duplicados en Network (debe bajar vs. antes).
4. **Presupuesto**: Capítulo con muchos ítems → ítem → **Atrás** → grilla capítulo desde cache (8 min).
5. **Dashboard**: Entrar → salir → reentrar en 5 min → KPIs desde cache.
6. **Programación**: Cargar mapa → SICOE → volver Programación → mapa/versiones sin refetch inicial.
7. **Mutación**: Validar una línea → siguiente búsqueda debe ir a red (cache invalidada).
8. **Offline**: Modo offline sigue usando IndexedDB; cache no interfiere.

## Tests unitarios

```bash
node --test frontend/src/cache/vistaCache.test.js
```

## Fase 2 (backend)

Opcional: header `X-Data-Version` por contrato para invalidación cruzada sin TTL.
