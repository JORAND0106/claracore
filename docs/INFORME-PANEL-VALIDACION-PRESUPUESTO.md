# Panel dinámico de validación — Presupuesto de Obra

## Objetivo

Reemplazar el botón/modal **«Resumen de validación»** por un **panel dinámico** (barra oscura, mismo lenguaje visual que SICOE Obra), que permita ver y filtrar por **estado Interventoría** a nivel de **capítulo** e **ítem**, con **registros** y **costo directo** por celda.

## Qué se implementó

| Elemento | Descripción |
|----------|-------------|
| `pptoPanelValidacionAgg.js` | Agregación por capítulo/ítem y columnas No revisados · Aprobados · Pendientes · Rechazados |
| `PptoPanelValidacion.jsx` | UI: cabecera `#1E293B`, tabla `#0F172A`, checkboxes, «Aplicar filtros», drill capítulo → ítem |
| `ModuloPresupuesto.jsx` | Integración bajo la barra de filtros; eliminado modal y botón antiguos |

## Comportamiento (alineado con SICOE Obra)

1. **Sincronización con filtros**: los números salen de `registrosFiltrados` (misma base que la grilla tras Buscar / modal Filtros).
2. **Vista capítulos**: filas ordenadas según `capitulosResumen` (orden de presupuesto).
3. **Clic en capítulo**: baja a vista **ítems** de ese capítulo (misma tabla, columnas de estado).
4. **Clic en celda de estado**: aplica filtro `revisado` + capítulo/ítem y ejecuta búsqueda en servidor.
5. **Checkboxes + «Aplicar filtros»**: filtra la grilla por capítulos o ítems seleccionados (cascada como panel SICOE).
6. **Toggle Presupuesto / Obra ejecutada**: al cambiar, se recargan capítulos y datos; el panel se actualiza cuando hay resultados.

## Uso recomendado

1. Elija **Presupuesto de Obra** u **Obra Ejecutada** (si aparece aviso de carga grande, confirme).
2. Abra **Filtros** → defina criterios → **Buscar**.
3. Use el **panel oscuro** debajo de la barra de filtros:
   - Revise estados por capítulo.
   - Entre al capítulo para ver ítems.
   - Clic en una celda (p. ej. Pendientes) para acotar la grilla.
   - Marque filas y **Aplicar filtros** para filtro masivo por capítulo/ítem.

## Pendiente / mejoras futuras

- Segunda pestaña o filas para **depuración (pre-Interventoría)** — el modal antiguo la mostraba; el panel actual solo usa **revisado** (semáforo Interventoría).
- Endpoint de análisis en servidor (como `dashboard-matriz` en SICOE) si el contrato tiene decenas de miles de filas y el cliente no debe traer todo.
- Persistir nivel drill capítulo/ítem en sesión de filtros (`pptoFiltroSesion`).

## Archivos tocados

- `frontend/src/modules/presupuesto/pptoPanelValidacionAgg.js` (nuevo)
- `frontend/src/modules/presupuesto/PptoPanelValidacion.jsx` (nuevo)
- `frontend/src/modules/presupuesto/ModuloPresupuesto.jsx`
- `docs/INFORME-PANEL-VALIDACION-PRESUPUESTO.md` (este documento)
