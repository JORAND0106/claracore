# Auditoría funcional — Módulo Programación de Obra

**Agente:** Módulo de Programación  
**Alcance:** solo lectura y diagnóstico (sin cambios de código ni datos)  
**Fecha del informe:** 2026-11-20  
**Evidencia:** código en repositorio `claracore` (frontend/backend/SQL/tests). No hubo acceso a base de datos de producción en este entorno (sin `.env` / Supabase), por lo que el comportamiento “en datos vivos” se infiere de rutas, scripts de diagnóstico y pruebas unitarias.

---

## 0. Flujo completo tal como funciona hoy

### 0.1 Entrada y alcance por contrato
1. El usuario abre el módulo desde el Dashboard (`moduloActivo === 'programacion'`).
2. Todo el API va bajo `/prog-obra/{contrato_id}/…` y cada ruta llama `_require_contract_access` (usuario vinculado al contrato o Desarrollador).
3. La UI se monta con `key={prog-${usuario.contrato_id}}`, así que al cambiar de contrato se remonta el módulo.

### 0.2 Agrupadores WBS desde Listado de Precios
1. La estructura WBS se arma cruzando ítems de presupuesto con `listado_precios` → `agrupador_id` → `listado_precios_agrupadores` (código WBS, nombre, orden).
2. Fuente de ítems para WBS/costos en pantalla: versión de presupuesto con `es_vigente=true` (`force_vigente=True` en `fetch_ppto_rows_programacion` / bridge de costos).
3. Si un ítem no tiene agrupador en Listado, aparece como “sin agrupador” y bloquea o advierte en mapa / programación automática.

### 0.3 Creación de versiones de programación
1. Tabla propia `prog_versiones` (tipos: `baseline` | `reprogramacion` | `suspension`; estados: `borrador` | `en_validacion` | `sellada` | `rechazada` | `archivada`).
2. Solo una versión “abierta” (borrador/en validación) a la vez.
3. Reprogramación / suspensión clonan datos de la versión origen y pueden calcular delta de presupuesto (`prog_presupuesto_snapshot` vs presupuesto vivo).
4. El historial vive en el panel lateral (`ProgHistorialVersiones`): consultar, continuar borrador, comparar.

### 0.4 Programación por PK (mapa) y consolidada por tramo
1. Mapa Mapbox con polígonos PK; colores desde `prog_pk_estado` (% programado) o modo ejecutado (SICOE nivel 1).
2. Clic en PK → modal de programación por PK (tabla tipo hoja + Gantt).
3. Selector de tramo en panel → botón “Programar {tramo} (N PKs)” → modal consolidado por tramo (`/estructura-tramo`, `/actividades-batch-tramo`).
4. Fechas se guardan en `prog_actividades` (y capítulos en `prog_actividades_capitulo`).

### 0.5 Dependencias y CPM
1. Dependencias por PK (`prog_dependencias`) y globales (`prog_dependencias_globales`).
2. Al calcular CPM (`ejecutar_cpm_version`): limpia resultados previos, **libera anclas** (`override_manual=false` en todos los agrupadores), reconstruye grafo, forward/backward pass, escribe `prog_cpm_resultados` y hace write-back de fechas tempranas a `prog_actividades`.

### 0.6 Envío a validación, sellado, reprogramación, suspensión
1. Enviar a validación: gate de presupuesto (frontend + backend) + pre-check de cobertura de fechas; crea filas en `prog_validaciones` (niveles ≥ 2 del contrato).
2. Validar por nivel → al aprobar todos se sella, archiva la vigente anterior y actualiza `contratos.prog_version_vigente_id`.
3. Reprogramación: nueva versión tipo `reprogramacion` con motivo obligatorio.
4. Suspensión contractual: wizard (`ProgObraSuspensionWizard`) → preview de impacto → aplica fechas no hábiles / nueva versión tipo `suspension`.

### 0.7 Historial y comparación global
1. Historial de versiones en panel.
2. Comparación global baseline vs target (`/comparar`, modal + Excel cliente).
3. Curva S: baseline / vigente / ejecutado; export PDF/Excel/XML.

---

## 1. CPM y la fecha de inicio escrita a mano

### Regla definida
La fecha manual debe ser restricción **“no empezar antes de” (SNET)**: el CPM solo mueve la actividad cuando una dependencia lo obliga; no debe arrastrar todo al inicio del proyecto.

### Comportamiento real (no cumple)

| Paso | Qué hace el código |
|------|--------------------|
| Guardado por PK (ítem/batch PK) | Envía `override_manual: true` con la fecha del usuario. |
| Guardado consolidado por tramo | Envía `override_manual: false` aunque haya fecha. |
| Al pulsar calcular CPM | `_cpm_liberar_agrupadores_para_calculo` pone **`override_manual = false` en todos los agrupadores** de la versión. |
| Construcción de nodos | Sin ancla → `fecha_inicio_base = fecha_inicio` de la versión. |
| Forward pass | Sin ancla → `ES = project_start_idx` (inicio de versión); solo dependencias empujan hacia adelante. Anclas fijas no se mueven, pero en producción se borran antes. |

**Conclusión:** la regla SNET **no se cumple**. Tras recalcular CPM, las fechas manuales se pierden como ancla y el motor **sí lleva las actividades al inicio del horizonte de la versión**, salvo que una dependencia las empuje después. Los tests unitarios del motor con `es_ancla=True` describen un comportamiento que el pipeline productivo desactiva al inicio de cada cálculo.

Evidencia: `prog_obra_service.py` (`_cpm_liberar_agrupadores_para_calculo`, `ejecutar_cpm_version`), `prog_obra_cpm.py` (inicialización `ES[key] = project_start_idx`), `ProgObraProgramacionModal.jsx` (batch tramo con `override_manual: false`).

---

## 2. Curva S

### De dónde sale cada línea
| Línea | Fuente |
|-------|--------|
| **Baseline** | Versión de programación baseline + costos de la **primera** versión de presupuesto (`numero_version` menor) o, en su defecto, la vigente. Modo de fechas `schedule_mode="programada"`. |
| **Vigente** | Versión de programación target (borrador activo o vigente sellada) + costos del presupuesto con **`es_vigente=true`** (`force_vigente`). Modo `schedule_mode="cpm"`. |
| **Ejecución real** | SICOE (`so_registros`) con aprobación **nivel 1**, agregado mensual por `nivel1_fecha`. |

### Costo y regla única
- Costos de curva: overlay desde ítems de `presupuesto_version_items` vía `_line_costo` (prefiere `costo_directo`; si es 0, `cant_total * vlr_unitario`).
- El Listado de Precios aporta **agrupación WBS y descripciones**, no es en sí la única fuente del valor monetario: el valor vive en el Versionador / presupuesto.
- Auto-schedule, aparte, calcula costos con `cant * vlr` sobre la tabla viva `presupuesto` (no Versionador).

### ¿Valores reales o en cero?
- La lógica puede producir totales > 0 si hay fechas + costos en nodos (hay tests `test_build_curva_s_nonzero_totals`).
- Queda en **cero** cuando: no hay versión de programación, nodos sin `fecha_inicio`/`fecha_fin`, costos 0, o ejecutado sin SICOE nivel 1.
- Existe script de diagnóstico `backend/scripts/diag_curva_s.py` precisamente para contratos con curva en cero. **Sin BD en este entorno no se pudo medir producción.**

---

## 3. Selector de presupuesto vs Versionador

| Aspecto | Hallazgo |
|---------|----------|
| Fuente de lista | Misma API del Versionador: `GET /presupuesto/{cid}/versiones`. |
| ¿Un solo sistema? | **Sí para el catálogo**; **no para el uso**. Programación tiene su propio versionado de cronograma (`prog_versiones`), distinto del de presupuesto (`presupuesto_versiones`). |
| WBS / costos en modal | Siempre fuerza `es_vigente` (`pptoVersionVigenteId`), no el valor elegido en el selector. |
| Selector “Presupuesto base” | Cambia `pptoVersionAnalisisId`. El texto UI dice que aplica a Curva S y exportaciones, pero Curva S / PDF / Excel / XML se llaman con `pptoVersionVigenteId`. El selector queda **casi desconectado** de esos exports; sirve sobre todo para el gate de validación en UI y para etiquetas/escenarios. |
| Enviar a validación | Frontend bloquea si la versión seleccionada no tiene `es_vigente_aprobada`. Backend exige ítems con `revisado=Aprobado` en presupuesto oficial/vivo (`presupuesto_aprobacion_estado`), no el flag `es_vigente_aprobada` del Versionador. Hay **dos criterios** que pueden divergir. |

---

## 4. Tramos: Programación vs Vías (mapa)

| Origen | Qué es |
|--------|--------|
| **Programación** | `fetch_tramos_contrato` lee `presupuesto.pk_id + tramo` (presupuesto poligonal vivo). |
| **Maestro plataforma** | `pk_ids.tramo`; al insertar presupuesto se puede sobrescribir el tramo desde ese maestro. |
| **Vías / Diseño geométrico** | “Tramo” = eje/libro de diseño (`DisenoTramoMapaPkModal`, abscisas, capas). No escribe en `prog_*` ni es la fuente directa del selector de Programación. |

**Conclusión:** no hay garantía de coincidencia 1:1 con los tramos creados desde el mapa en Vías. Programación usa la etiqueta `tramo` del presupuesto/maestro PK, no el catálogo geométrico de Vías.

---

## 5. Capa Empresa y exclusividad por contrato

- Rutas filtradas por `contrato_id` + `_require_contract_access`.
- Tablas `prog_*` llevan `contrato_id`.
- Remount UI al cambiar contrato.
- No hay lógica `empresa_tipo` / subcontratista dentro de `prog_obra_*` (a diferencia de SICOE/RRHH).

**Conclusión:** el aislamiento es **por contrato**, coherente con exclusividad contractual. La capa Empresa no mezcla datos entre contratos en este módulo; tampoco aplica filtros extra de subcontratista dentro de Programación.

---

## 6. Exportes

| Export | ¿Existe? | ¿Descarga? | Formato / ICONTEC |
|--------|----------|------------|------------------|
| **Excel Curva S** | Sí (`/curva-s/excel`) | Sí, vía modal de alcance + permiso `exportar` | Hojas Curva S, detalle PK, resumen ejecutivo, Gantt/CPM opcionales. No es plantilla ICONTEC de informe oficial. |
| **Excel comparación global** | Sí (cliente, `progObraExportExcel.js`) | Sí, desde modal de comparación | Tabla interna ClaraCore; sin membrete ICONTEC. |
| **PDF Curva S + cronograma** | Sí (`/curva-s/pdf`) | Sí | Multipágina: curva, detalle, **resumen ejecutivo**, cronograma por PK, CPM. HTML usa `@page { size: A4 landscape }`, pero `to_pdf_bytes` inyecta por defecto **letter landscape**. Mezcla A4/carta; otros módulos usan carta. **No alineado de forma limpia a norma ICONTEC (carta + márgenes institucionales)**. Fecha de generación sí usa `America/Bogota`. |
| **XML MS Project** | Sí (`/exportar-project-xml`) | Sí | MSPDI; no aplica ICONTEC. |

Permiso: backend exige `exportar` en PDF/Excel/XML; ribbon oculta export si no hay permiso.

---

## 7. Programación automática y botones de eliminación

### Tres estrategias (implementadas)
1. **Equitativa** — mismo tiempo por grupo/PK.  
2. **Por incidencia en costo** (`costo`) — más días a mayor costo.  
3. **Personalizada** — orden (y grupos paralelos) definidos por el usuario.  

Wizard en UI + endpoints `auto-schedule/prereqs|preview|aplicar`. Prerrequisitos: todos los PK con agrupador WBS y al menos una dependencia global.

**Falla asociada:** costos del auto-schedule salen de tabla `presupuesto` viva (`cant*vlr`), no del Versionador vigente ni del Listado como regla única.

### Eliminar programación
- Ribbon: “Eliminar toda la programación del borrador” → `DELETE …/programacion`.
- También: limpiar por PK, limpiar por tramo, clearSchedule fila a fila en el modal.
- Existen y están cableados para borrador editable + permiso editar.

### Eliminar agrupador
- **No existe** en Programación. Eliminar agrupador WBS está en Admin / Listado de Precios (`AdminPanel.jsx`), no en este módulo.

---

## 8. Permisos vs Gestión de Cargos

| Acción matriz | Backend PROGOB | Frontend `permisosProgramacionObra` |
|---------------|----------------|--------------------------------------|
| ver | Sí | Sí |
| crear | Sí | Sí |
| editar | Sí | Sí |
| eliminar | Sí (borra versiones/programación) | **No expuesto** en el paquete de flags ni en `App.jsx` |
| validar | Sí | Sí |
| exportar | Sí | Sí |

Otras diferencias:
- Enviar a validación acepta `editar` **o** `validar`.
- Desarrollador bypasea matriz.
- Función sembrada: código `PROGOB`, nombre «Programación de obra».

---

## 9. Convenciones visuales transversales

| Convención | Estado en Programación |
|------------|------------------------|
| Botones solo icono + tooltip institucional | Ribbon y varios iconos del panel cumplen parcialmente (`title=` nativo). Wizards y modales usan **botones con texto** (“Cancelar”, “Siguiente”, “Aplicar…”, “Exportar Excel”, “Programar {tramo}…”). |
| Tooltips institucionales (`CcTooltip` / tema) | **0 usos** de CcTooltip en archivos ProgObra/Modulo; ~68 `title=` nativos del navegador. |
| Paneles que no se montan unos sobre otros | Modales de programación/overlays a `z-index: 200000`; Curva S / export alcance / auto-schedule a ~10050–12000. Si coexisten, los de menor z-index quedan **debajo**. |
| Hora local Colombia | PDF/informes: `America/Bogota` vía `_fmt_informe_fecha_generacion`. Persistencia interna: muchos `datetime.now(timezone.utc)`. Fechas de actividad son tipo `date` (sin hora). |
| Temas Claro/Oscuro/Automático/Descanso | Consume tokens `t` del Dashboard; mapa claro/oscuro básico. **No** recibe `themeMode` explícito ni paleta “Descanso” dedicada como otros módulos con `ccTooltipTheme`. |
| Tablet / computador / celular | Layout fijo mapa + panel ~420px; modal de programación con anchos grandes (p. ej. minWidth 1050). **Sin breakpoints** `@media` / detección mobile en el módulo. En celular el mapa+panel y el modal resultan poco usables. |

Varios modales ya usan `CcModalBrandHeader` (parcialmente alineados a marca).

---

## 10. Funciones a medias o sin conectar

1. **Selector de presupuesto de análisis** — UI y copy dicen que alimenta Curva S/exports; el cableado real fuerza `es_vigente`.  
2. **Anclas manuales / SNET** — se guardan en UI/BD y luego el CPM las libera.  
3. **`prog_distribucion_periodos` / `tipo_distribucion: manual`** — esquema Fase 1; la UI siempre manda `lineal`. Sin editor de distribución manual.  
4. **Eliminar agrupador desde Programación** — no hay acción en el módulo.  
5. **Permiso `eliminar` en frontend** — existe en matriz/backend, no en flags de UI.  
6. **Auto-schedule vs Versionador** — costos desactualizados respecto a la regla de versiones.  
7. **Gate de validación dual** — `es_vigente_aprobada` (UI) vs ítems `revisado` (API).  
8. **Tramos Vías vs tramos Programación** — conceptos distintos sin puente explícito.  
9. **PDF A4 en HTML vs letter inyectado** — formato de página inconsistente.  
10. **Motor CPM con anclas** — testeado en unit tests, desactivado en pipeline real.

---

# Informe por bloques de estado

## A. Funciona correctamente

1. **Aislamiento por contrato** — API y UI no cruzan `contrato_id`; acceso denegado si el usuario no está vinculado.  
2. **Ciclo de versiones de programación** — crear baseline/reprogramación, historial, una sola abierta, clonar origen.  
3. **WBS desde Listado** — agrupadores y “sin agrupador” se resuelven desde `listado_precios` + presupuesto vigente.  
4. **Mapa + estado por PK** — `prog_pk_estado` pinta % programado; refresh tras guardar.  
5. **Programación por PK y por tramo (UI/API)** — endpoints de estructura, batch y clear existen y están cableados.  
6. **Dependencias PK y globales** — CRUD y uso en grafo CPM.  
7. **Pipeline CPM (grafo + dependencias + write-back)** — calcula, detecta ciclos, escribe resultados y fechas tempranas (con la semántica de “todo desde inicio de versión”, ver fallas).  
8. **Validación multinivel y sellado** — estados, notificaciones de rechazo, vigente en contrato.  
9. **Suspensión contractual (wizard)** — preview y aplicación presentes.  
10. **Comparación global** — API + modal + Excel cliente.  
11. **Export XML MS Project** — endpoint y descarga con permiso `exportar`.  
12. **Auto-schedule: tres estrategias en código y wizard** — equitativa, costo, personalizada, con prerrequisitos.  
13. **Eliminar programación del borrador** — ribbon + API.  
14. **Ejecutado SICOE nivel 1** — usado en mapa/KPI/Curva S cuando hay datos.  
15. **Calendario no hábil / días hábiles** — integrado al CPM y auto-schedule.  
16. **Función PROGOB en matriz** — sembrada; backend exige acciones por cargo.

---

## B. Funciona con fallas

1. **Curva S** — el motor y la UI existen; puede mostrar ceros si faltan fechas/costos/ejecutado. Baseline usa presupuesto V0 y modo “programada”; vigente fuerza CPM + ppto `es_vigente` (puede verse “rara” tras liberar anclas).  
2. **Export PDF** — descarga, incluye resumen ejecutivo y cronograma, pero tamaño de página A4 vs letter inyectado y sin plantilla ICONTEC completa.  
3. **Export Excel Curva S** — descarga y trae hojas útiles; no es informe ICONTEC.  
4. **Programación automática** — corre, pero costos desde `presupuesto` vivo (no Versionador) y exige dependencias globales.  
5. **Enviar a validación** — funciona, pero gates frontend/backend pueden contradecirse (versión no “aprobada” vs ítems aún pendientes o viceversa).  
6. **Temas visuales** — sigue el `t` global, pero sin soporte fino Descanso/tooltips institucionales.  
7. **Botones icono** — ribbon OK; el resto del flujo (wizards, confirmaciones, “Programar tramo”) mezcla texto visible.  
8. **Fechas/hora** — fechas de obra OK como `date`; timestamps de auditoría en UTC (aceptable internamente, confuso si se muestran crudos).

---

## C. Roto o desconectado

1. **Regla CPM “no empezar antes de”** — rota: al calcular se borran anclas y las fechas vuelven al inicio de la versión. En pantalla, tras CPM, la fecha tipada a mano no se respeta como SNET.  
2. **Selector “Presupuesto base” → Curva S / exports** — desconectado del valor elegido; siempre manda `es_vigente`.  
3. **Distribución manual por periodos** — tabla/columna en esquema, sin UI ni flujo.  
4. **Eliminar agrupador en Programación** — no existe en este módulo (solo en administración de Listado).  
5. **Permiso `eliminar` en frontend** — no forma parte de los flags que usa la UI.  
6. **Apilamiento de modales** — Curva S / export (z≈10k) bajo el modal de programación (z=200000): si se abren juntos, el de arriba tapa o el de abajo no se usa.  
7. **Responsive móvil/tablet** — sin adaptación; layout de escritorio rígido.

---

## D. Inconsistente con cambios posteriores de la plataforma

1. **Versionador de Presupuesto (versiones editables en paralelo)** — Programación ya lista `presupuesto_versiones`, pero WBS/costos/exports fuerzan solo `es_vigente`; el selector de análisis no refleja el modelo mental del Versionador.  
2. **Regla única de costo directo desde Listado** — Programación usa `costo_directo` (o cant×vlr) del **presupuesto/versionador**, y auto-schedule aún usa cant×vlr de tabla viva; no hay un único pipeline “solo Listado”.  
3. **Tramos definidos desde mapa en Vías** — Programación no consume ese catálogo; usa `presupuesto`/`pk_ids.tramo`.  
4. **Capa Empresa** — el módulo sigue siendo solo-contrato (correcto para exclusividad), sin los matices de aislamiento por empresa/subcontratista que sí tienen otros módulos.  
5. **Convención botones icono + tooltip institucional** — el módulo es anterior/parcial: `title=` nativo, botones con texto, casi sin `CcTooltip`.  
6. **PDF norma ICONTEC** — Seguimiento/otros usan letter + encabezados oficiales; Programación genera un PDF técnico A4/letter híbrido.  
7. **Gestión de Cargos (ver/crear/editar/eliminar/validar/exportar)** — backend alineado a 6 acciones; frontend omite `eliminar` y combina crear/editar como “escribir”.  
8. **Temas Claro/Oscuro/Automático/Descanso** — adopción incompleta frente al sistema de tooltips/modales temáticos actual.

---

## Resumen ejecutivo (una mirada)

El módulo **está montado de punta a punta**: mapa, WBS, versiones propias, dependencias, CPM, validación, sellado, reprogramación, suspensión, Curva S y exports. Lo crítico antes de retomar desarrollo es que **el CPM no respeta la fecha manual como “no empezar antes de”** (las anclas se borran al calcular), que el **selector de presupuesto está mal cableado** respecto al Versionador, que los **tramos no son los de Vías**, y que las **convenciones visuales/PDF/permisos** quedaron detrás del resto de la plataforma.

---

*Fin del informe de auditoría. Sin cambios aplicados en código ni base de datos.*
