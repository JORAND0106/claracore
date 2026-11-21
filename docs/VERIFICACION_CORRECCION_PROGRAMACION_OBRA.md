# Verificación — Corrección integral Programación de Obra

Fecha: 2026-11-21 (America/Bogota). Rama: `cursor/correccion-programacion-obra`.

## Evidencia de pruebas unitarias (CI local)

```
PYTHONPATH=. python3 -m pytest tests/test_prog_obra_*.py -q
→ 154 passed
```

Incluye: CPM SNET (fecha manual = no empezar antes de, idempotencia, desplazamiento), costos listado VU, ejecutado con ítem (excl. rechazados), bridge de validación, Curva S selector, clasificaciones CPM 4-tuple, calendario CO, exportes.

## Checklist de comportamiento (lo visto / esperado en pantalla)

### 1. CPM — fecha manual «no empezar antes de»
- **Unitario:** `test_prog_obra_cpm_snet.py` — sin deps conserva fecha; con FS corre el inicio y marca `desplazada_por_dependencia`; recalcular dos veces = mismo resultado.
- **UI:** icono ↗ + tooltip «Dependencia: el CPM corrió el inicio…» en fila de agrupador / Gantt cuando aplica.
- **Servidor:** `_cpm_liberar_agrupadores_para_calculo` es NO-OP; writeback guarda `desplazada_por_dependencia` sin borrar `override_manual`.

### 2. Segregación de agrupadores
- Migración `backend/sql/migration_prog_obra_snet_partes.sql` (`prog_partes`, `prog_parte_items`, `parte_id`).
- API: `GET …/segregar/preview`, `POST/DELETE …/segregar`.
- UI: al enfocar fecha de agrupador multi-línea → **Completo | Segregar** (tooltip); ✂ abre `ProgObraSegregarModal` (tabla Excel, Shift+clic, Pendiente).
- Consolidado por tramo **omite** PK+agrupador ya segregados (no sobrescribe).
- Clonado de partes al crear reprogramación.

### 3. Regla única de costo directo
- Todo valor = `ROUND0(ROUND(cant,2) × VU_listado)` vía `sicoe_valor_canonico`.
- Curva S, WBS, auto-schedule, brecha, ejecutado y exportes usan listado; no suman `costo_directo` guardado.

### 4. Selector de presupuesto
- `version_ppto_id` alimenta Curva S, comparación, WBS y exportes; por defecto vigente del Versionador.
- Cambiar selector no mueve fechas.
- PDF/Excel encabezado muestra **Programación** y **Presupuesto**.

### 5. Enviar a validación
- Criterio único: versión vigente del Versionador con todos los ítems aprobados por interventoría.
- Mensaje corto compartido: `MENSAJE_VALIDACION_PPTO_INCOMPLETO` (pantalla = servidor).
- Al sellar se registra `version_ppto_sellada_id`.

### 6. Ejecución real por PK (= SicoeObra)
- Cuenta registros con ítem de cobro; excluye rechazados; mes = fecha de reporte.
- Criterio expuesto: `item_asignado_no_rechazado`.
- Mapa enriquecido con % ejecutado; tooltip con valores.
- Detalle por PK/ítem con presupuesto / programado / ejecutado / diferencia.

### 7–12. Tramos, permisos, UI, dispositivos, PDF, no regresiones
- Tramos siguen siendo los del presupuesto (sin Vías).
- Seis acciones separadas: ver/crear/editar/eliminar/validar/exportar (`progObraPermisos.js` + App.jsx).
- Botones con `data-cc-tooltip` (sin `title` nativo en ribbon/modales tocados); z-index 210000.
- PDF carta horizontal (`@page { size: letter landscape }`).
- Fechas de cache mapa en `America/Bogota`.

## Limitaciones de evidencia en este entorno

No hubo sesión interactiva contra un contrato productivo en browser (tablet/temas). La verificación visual completa (temas Claro/Oscuro/Automático/Descanso, tablet, PK con diferencia programado vs ejecutado en mapa) queda para QA en staging con un contrato real de varias versiones de presupuesto, aplicando la migración SQL antes.

## Migración requerida

Ejecutar en Supabase SQL Editor:

`backend/sql/migration_prog_obra_snet_partes.sql`
