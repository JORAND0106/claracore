/**
 * Cambiar proveedor (un insumo), Deshacer icono, revocar aprobación, 2dp, TRAZ.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  seleccionUnSoloInsumo,
  puedeCambiarProveedorBloque,
  puedeRevocarAprobacion,
  seleccionRevocableAprobacion,
} from './solicitudDetalleHelpers.js'

const dir = dirname(fileURLToPath(import.meta.url))

function fmtCantPresentacion(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return v.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

describe('seleccionUnSoloInsumo', () => {
  it('exige exactamente un insumo', () => {
    const items = [
      { id: 1, insumo_id: 10 },
      { id: 2, insumo_id: 10 },
      { id: 3, insumo_id: 20 },
    ]
    assert.equal(seleccionUnSoloInsumo(items, new Set([1, 2])).ok, true)
    assert.equal(seleccionUnSoloInsumo(items, new Set([1, 3])).ok, false)
    assert.match(seleccionUnSoloInsumo(items, new Set([1, 3])).motivo, /sola fila|un solo insumo/i)
    assert.equal(seleccionUnSoloInsumo(items, new Set()).ok, false)
  })

  it('permite editar/deshacer a quien tiene Editar o roles de proveedor', () => {
    assert.equal(puedeCambiarProveedorBloque({ editar: true }), true)
    assert.equal(puedeCambiarProveedorBloque({ esContratistaGerencial: true }), true)
    assert.equal(puedeCambiarProveedorBloque({ crear: true }), false)
  })
})

describe('revocar aprobación', () => {
  it('permiso Validar o desarrollador', () => {
    assert.equal(puedeRevocarAprobacion({ validar: true }), true)
    assert.equal(puedeRevocarAprobacion({ esDesarrollador: true }), true)
    assert.equal(puedeRevocarAprobacion({ editar: true }), false)
  })

  it('bloquea líneas en OC y no aprobadas (todo o nada)', () => {
    const sol = { estado: 'enviada' }
    const items = [
      { id: 1, estado_validacion: 'aprobado', numero_linea: 1 },
      { id: 2, estado_validacion: 'aprobado', en_orden_compra: true, numero_linea: 2 },
      { id: 3, estado_validacion: 'pendiente', numero_linea: 3 },
    ]
    assert.equal(seleccionRevocableAprobacion(items, new Set([1]), sol).ok, true)
    const oc = seleccionRevocableAprobacion(items, new Set([1, 2]), sol)
    assert.equal(oc.ok, false)
    assert.match(oc.motivo, /orden de compra/i)
    const mix = seleccionRevocableAprobacion(items, new Set([1, 3]), sol)
    assert.equal(mix.ok, false)
    assert.match(mix.motivo, /aprobad/i)
  })
})

describe('fmtCant presentación', () => {
  it('muestra 2 decimales (solo presentación)', () => {
    const shared = readFileSync(join(dir, 'almacenShared.jsx'), 'utf8')
    assert.match(shared, /minimumFractionDigits: 2/)
    assert.match(shared, /maximumFractionDigits: 2/)
    assert.equal(fmtCantPresentacion(8.1041), '8,10')
    assert.equal(fmtCantPresentacion(150.0001), '150,00')
  })
})

describe('UI cableado', () => {
  it('popup solicitud: Cambiar proveedor, Deshacer icono y revocar', () => {
    const detalle = readFileSync(join(dir, 'SolicitudDetalleModal.jsx'), 'utf8')
    const tabla = readFileSync(join(dir, 'SolicitudMaterialesExcelTable.jsx'), 'utf8')
    const api = readFileSync(join(dir, 'almacenApi.js'), 'utf8')
    assert.match(detalle, /CambiarProveedorBloqueModal/)
    assert.match(detalle, /cambiar-proveedor-seleccion/)
    assert.match(detalle, /deshacer-proveedor-seleccion/)
    assert.match(detalle, /revocar-aprobacion-seleccion/)
    assert.match(detalle, /cambiarProveedorBloque/)
    assert.match(detalle, /revocarAprobacionLineas/)
    assert.match(detalle, /↶/)
    assert.match(api, /proveedor-bloque/)
    assert.match(api, /revocar-aprobacion/)
    assert.match(tabla, /itemIds=\{ids\}/)
    assert.doesNotMatch(tabla, /fila\.items\.map\(\(row\) => \(\s*<LineaTrazabilidadButton/)
  })

  it('revisión: 2 decimales, cuadro resaltado, selección masiva y bug cotización corregido', () => {
    const revision = readFileSync(join(dir, 'SolicitudLineaRevisionModal.jsx'), 'utf8')
    const field = readFileSync(join(dir, 'ProveedorOfertaField.jsx'), 'utf8')
    assert.match(revision, /Editar registros seleccionados/)
    assert.match(revision, /revision-editar-seleccion/)
    assert.match(revision, /revision-sectores-sel-todas/)
    assert.match(revision, /requerir_mismo_insumo/)
    assert.match(field, /loading/)
    assert.match(field, /listaLista/)
    assert.match(field, /Causa del bug/)
    assert.doesNotMatch(field, /ofertas\.length <= 1/)
  })

  it('trazabilidad multi-línea con filtro', () => {
    const traz = readFileSync(join(dir, 'LineaTrazabilidadModal.jsx'), 'utf8')
    assert.match(traz, /itemIds/)
    assert.match(traz, /linea-trazabilidad-filtro/)
    assert.match(traz, /linea-trazabilidad-tab/)
  })
})
