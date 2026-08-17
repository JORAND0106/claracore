# Auditoría — Edición de cantidad por rol y modales de filtro (Almacén)

**Fecha:** 2026-08-17  
**Repo:** `JORAND0106/claracore`  
**Alcance:** solo estado verificable + corrección inmediata autorizada. Sin rediseño.

---

## Resumen

| Funcionalidad | ¿Existe trabajo? | ¿En `main`? | ¿Desplegado en Azure? | Acción |
|---|---|---|---|---|
| Editar cantidad de salida (CG / Desarrollador) | Sí — PR #222 | **Sí** | **Sí** (SWA + backend OK) | Ninguna en lista de roles: **Desarrollador ya está incluido** |
| Modal filtros Solicitudes | Sí — PR #223 | **Sí** | **Sí** (vía deploy posterior #226) | Ninguna |
| Modal filtros Entradas | Sí — PR #224 | **Sí** (vía #227) | Tras deploy SWA de #227 | Antes no: base incorrecta en #224 |
| Modal filtros Salidas | Sí — PR #225 | **Sí** (vía #227) | Tras deploy SWA de #227 | Antes no: base incorrecta en #225 |

---

## 1. Edición de cantidad de salida restringida por rol

### Evidencia de merge

| Campo | Valor |
|---|---|
| PR | [#222](https://github.com/JORAND0106/claracore/pull/222) |
| Título | `feat(almacen): editar cantidad de salida (Contratista Gerencial / Desarrollador)` |
| Estado | **MERGED** |
| Base | `main` |
| Rama | `cursor/salidas-editar-cantidad-cg-dev-168d` |
| Merged at | 2026-08-17T19:31:31Z |
| Commit merge | `a3e3217` |

También presente en `main` tras la resolución de conflictos de [#226](https://github.com/JORAND0106/claracore/pull/226) (`7af5fda`).

### Roles autorizados hoy en el código de `main`

Frontend (`frontend/src/almacen/almacenPermisos.js`):

```js
export function puedeEditarCantidadSalidaAlmacen(permisos) {
  return Boolean(permisos?.esContratistaGerencial || permisos?.esDesarrollador)
}
```

`App.jsx` inyecta en `AlmacenMain`:

- `esDesarrollador: esDeveloper`
- `esContratistaGerencial: esDeveloper || almacenAcceso.esContratistaGerencial`

Backend (`backend/almacen_permissions.py` → `require_editar_cantidad_salida_almacen`): exige permiso `editar` + `es_contratista_gerencial` (que incluye Desarrollador vía `_es_desarrollador`).

### ¿Hubo que agregar Desarrollador?

**No.** El rol Desarrollador ya está incluido de forma explícita en frontend y de forma efectiva en backend. No se modificó la lista de roles en este trabajo.

### ¿Por qué el usuario podría no ver el ✎?

1. Caché del Static Web App / hard refresh pendiente.
2. La sesión no resuelve `cargo_nombre` / `rol_nombre` a `desarrollador` (`esUsuarioDesarrollador`).
3. El botón solo aparece en la columna Cantidad de **Salidas** (no en Entradas/Solicitudes).

### Deploy (producción Azure)

| Workflow | Tras | Resultado |
|---|---|---|
| Azure Static Web Apps CI/CD | #222 | success — [run 32060829750](https://github.com/JORAND0106/claracore/actions/runs/32060829750) |
| Deploy backend on push | #222 | success — [run 32060829760](https://github.com/JORAND0106/claracore/actions/runs/32060829760) |
| Azure Static Web Apps CI/CD | #226 (incluye cantidad + Solicitudes filtros + trazabilidad) | success — [run 32061824875](https://github.com/JORAND0106/claracore/actions/runs/32061824875) |

Backend prod: `https://claracore-backend.azurewebsites.net`  
Frontend prod: Azure Static Web Apps (deploy automático en push a `main`).

---

## 2. Modales de filtro — Solicitudes, Entradas, Salidas

### Evidencia de PRs

| PR | Título | Base real | Estado GitHub | ¿Llegó a `main`? |
|---|---|---|---|---|
| [#223](https://github.com/JORAND0106/claracore/pull/223) | modal de filtros en Solicitudes | **`main`** | MERGED 19:31:50Z | **Sí** |
| [#224](https://github.com/JORAND0106/claracore/pull/224) | modal de filtros en Entradas | `cursor/almacen-filtros-solicitudes-168d` | MERGED 19:32:06Z | **No** |
| [#225](https://github.com/JORAND0106/claracore/pull/225) | modal de filtros en Salidas | `cursor/almacen-filtros-solicitudes-168d` | MERGED 19:32:48Z | **No** |

### Qué hay hoy en `main` (verificado en árbol)

Presente:

- `AlmacenFiltrosModal.jsx`
- `almacenFiltrosShared.js`
- `SolicitudesFiltrosModal.jsx` + `solicitudesFiltros.js` (+ test)
- Botón `🔎 Filtros` en `SolicitudesPanel.jsx`

**Ausente en `main` hasta el merge de #227:**

- `EntradasFiltrosModal.jsx` / `entradasFiltros.js`
- `SalidasFiltrosModal.jsx` / `salidasFiltros.js`
- Cableado en `EntradasPanel.jsx` / `SalidasPanel.jsx`

### Conclusión sin rodeos

No es “cero trabajo”: hubo tres PRs. El fallo operativo es que **#224 y #225 se fusionaron sobre la rama intermedia de Solicitudes, no sobre `main`**. GitHub los marca MERGED, pero **nunca entraron a la rama principal ni a producción** hasta la corrección.

El deploy SWA de #223 falló (“Deployment Canceled”); el de #226 sí publicó Solicitudes (y el resto de `main` en ese commit).

### Corrección inmediata (autorizada por el prompt de auditoría)

| Campo | Valor |
|---|---|
| PR | [#227](https://github.com/JORAND0106/claracore/pull/227) |
| Estado | **MERGED** a `main` (`bbd9396`) |
| Rama | `cursor/almacen-filtros-entradas-salidas-a-main-168d` |
| Contenido | Modales + helpers + botón `🔎 Filtros` en Entradas y Salidas (se preservan trazabilidad 📜 y edición de cantidad ✎) |
| Tests | `node --test` filtros + cantidad: 18 OK |

Tras SWA success del merge de **#227**, Entradas/Salidas quedan con filtros en Azure.

---

## 3. Entorno que ve el usuario

| Pregunta | Respuesta |
|---|---|
| ¿Producción Azure vs rama local? | **Producción Azure** (SWA frontend + App Service backend), disparada por **push a `main`** |
| ¿Explica “código existe pero no lo veo”? | **Parcialmente.** Cantidad: código + deploy OK → si no ve ✎, no es “falta merge”. Filtros Entradas/Salidas: existían en ramas con base incorrecta; llegaron a `main` con **#227** |

---

## Enlaces rápidos

- Cantidad: https://github.com/JORAND0106/claracore/pull/222  
- Filtros Solicitudes: https://github.com/JORAND0106/claracore/pull/223  
- Filtros Entradas (base incorrecta): https://github.com/JORAND0106/claracore/pull/224  
- Filtros Salidas (base incorrecta): https://github.com/JORAND0106/claracore/pull/225  
- Trazabilidad (deploy SWA OK): https://github.com/JORAND0106/claracore/pull/226  
- **Fix filtros a main:** https://github.com/JORAND0106/claracore/pull/227  
