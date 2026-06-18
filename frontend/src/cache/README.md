# Cache de vistas (cliente)

Capa unificada en `vistaCache.js` para evitar refetch HTTP cuando la clave de vista es idéntica y el TTL es válido.

## Claves

| Módulo | Formato clave | Ejemplo |
|--------|---------------|---------|
| SICOE | `sicoe\|{contratoId}\|busqueda\|{hashBundle}` | Bundle = filtros + chips + capas + panel |
| Presupuesto grilla | Ref local `_pptoCachePorCap` + TTL navegación 8 min | `keyCacheFila(capitulo, item)` |
| Presupuesto panel | Ref `_pptoPanelCacheRef` | `panel\|{queryString}\|{nivel}\|{capDrill}` |
| Presupuesto capítulos | Ref `_pptoCapitulosListaCacheRef` | `cap_list\|{queryString}` |
| Dashboard resumen | `dashboard\|{contratoId}\|resumen\|{vista}` | `obra_ejecutada` / `presupuesto_obra` |
| Dashboard drill/tabla | `dashboard\|{contratoId}\|{vista}\|drill\|{cap}\|{item?}` | vía `getDashCachedPayload` |
| Dashboard pkid colores | `dashboard\|{contratoId}\|pkid_colores\|{filterKey}` | |
| Prog. obra mapa | `prog_obra\|{contratoId}\|mapa` | |
| Prog. obra versiones | `prog_obra\|{contratoId}\|versiones` | |
| Prog. obra tramos | `prog_obra\|{contratoId}\|tramos` | |
| Prog. obra estructura | `prog_obra\|{contratoId}\|estructura\|{pk}\|{versionPptoId}` | |
| Prog. obra actividades | `prog_obra\|{contratoId}\|actividades\|{versionId}\|{pk}\|{sessionId}` | |

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
| Limpiar filtros / búsqueda presupuesto | `invalidarCachePresupuestoContrato()` (grilla + panel + capítulos) |
| Cambiar vista dashboard | `invalidateDashboardVistaCache` |
| Guardar programación (mapa) | `invalidateProgObraVistaCache` en `refreshMapaImmediate` |

## SICOE — navegación Atrás

1. Tras `ejecutarBusquedaSicoeCompleta` exitosa → `sicoeSetVistaCache` + stack por contrato.
2. `volverPanelAnterior` → `sicoePopNavegacion`; si hay entrada anterior, restaura sin red.
3. Miss → intenta `sicoeGetVistaCache` con bundle calculado; si miss → fetch habitual.

## SICOE — Realtime (optimizado)

- **Canal grilla**: solo escucha `so_reportes` (no `so_registros`).
- **Refresco**: `refrescarSicoeGrillaRealtime` → solo `buscarReportes`; **sin** `/analisis`.
- **Detalle abierto**: canal 2 parchea filas de `so_registros` sin recargar carpeta.
- **Skip**: si hay carpeta de reporte abierta (`sicoeRealtimeReporteDetalleIdRef`), no relanza búsqueda completa.

## Presupuesto — panel y capítulos

- `cargarPanelValidacionServidor` sirve desde `_pptoPanelCacheRef` (TTL navegación).
- Stack Atrás incluye `panelFilasServidor` y `capitulosResumenPanel`.
- `volverPanelCapitulos` no refetch panel si el snap ya lo trae.
- `cargarCapitulos` cachea `capitulos-lista` en `_pptoCapitulosListaCacheRef`.

## Pruebas manuales (contrato grande ~45K)

1. **SICOE Atrás**: Filtrar → capítulo → ítem → **Atrás** → Network sin `/buscar` ni `/analisis`; UI &lt; 200 ms.
2. **SICOE reentrada**: Misma búsqueda → otro módulo → volver SICOE → sin refetch si TTL ok.
3. **SICOE Realtime**: Validar línea en otro usuario → grilla se actualiza sin tormenta de `/analisis`.
4. **Presupuesto**: Capítulo con muchos ítems → ítem → **Atrás** → grilla capítulo desde cache (8 min).
5. **Presupuesto panel**: Buscar → capítulo → **Atrás** → panel sin segundo GET validación.
6. **Dashboard**: Entrar → drill capítulo → salir → reentrar en 5 min → KPIs + drill desde cache.
7. **Programación**: Cargar mapa → SICOE → volver Programación → mapa/estructura/actividades sin refetch inicial.
8. **Mutación**: Validar una línea → siguiente búsqueda debe ir a red (cache invalidada).
9. **Offline**: Modo offline sigue usando IndexedDB; cache no interfiere.

## Tests unitarios

```bash
npm run test:cache
```

## SQL en Supabase (ya aplicado en prod)

- `backend/sql/fix_performance_so_registros_fase1.sql` — triggers MV + índices duplicados.
- `backend/sql/index_so_registros_niveles_n4_n6.sql` — índices N4–N6.
- **No re-ejecutar** `vm_sicoe_realtime.sql` en prod (recrearía triggers costosos).

## Deploy

- Cambios **frontend** (este directorio): `.\df` → push `main` → Azure Static Web Apps.
- Cambios **backend**: `.\db` solo si hay cambios en API Python.
- SQL Supabase: Editor SQL / migraciones; no requiere `df` ni `db`.

## Aviso al recargar (F5)

- Con sesión y contrato activo, `RefreshCacheGuard` intercepta **F5**, **Ctrl+R** y **Ctrl+F5** y muestra modal ClaraCore.
- El **botón de recarga del navegador** dispara el diálogo nativo del browser (`beforeunload`); el texto personalizado no es posible por política de seguridad.
- Recomienda usar **🔄 Actualizar** del módulo en lugar de recargar la página.


- Header `X-Data-Version` por contrato para invalidación cruzada sin TTL.
- `WEB_CONCURRENCY=2` en Azure App Settings del backend.
