/**
 * Resumen Excel de línea + reapertura de OC.
 * node --test frontend/src/almacen/almacenResumenExcelReabrirOc.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

function solicitudTieneOrdenCompra(sol) {
  return Boolean(sol?.tiene_orden_compra || sol?.orden_compra?.id)
}

function solicitudTieneLineasPendientesPostOc(sol) {
  if (!solicitudTieneOrdenCompra(sol)) return false
  const items = sol?.items || []
  if (!items.length) return false
  return items.some((it) => {
    if (it?.en_orden_compra) return false
    const ev = it?.estado_validacion || 'pendiente'
    return ev !== 'rechazado'
  })
}

function solicitudPuedeValidar(sol, permisos) {
  const esGerencial = Boolean(permisos?.esContratistaGerencial || permisos?.esDesarrollador)
  if (!permisos?.validar || !esGerencial) return false
  if (sol?.estado === 'enviada' && !solicitudTieneOrdenCompra(sol)) return true
  if (
    sol?.estado === 'aprobada'
    && solicitudTieneOrdenCompra(sol)
    && solicitudTieneLineasPendientesPostOc(sol)
  ) {
    return true
  }
  return false
}

function solicitudPuedeRechazarCompleta(sol, permisos) {
  return Boolean(
    solicitudPuedeValidar(sol, permisos)
    && sol?.estado === 'enviada'
    && !solicitudTieneOrdenCompra(sol),
  )
}

function solicitudPuedeReabrirOc(sol, permisos) {
  return Boolean(
    permisos?.editar
    && sol?.estado === 'aprobada'
    && solicitudTieneOrdenCompra(sol),
  )
}

function estadoValidacionItem(item, sol) {
  if (item?.en_orden_compra) return 'aprobado'
  if (item?.estado_validacion) return item.estado_validacion
  if (solicitudTieneOrdenCompra(sol) && !item?.en_orden_compra) return 'pendiente'
  if (sol?.estado === 'aprobada') return 'aprobado'
  if (sol?.estado === 'enviada') return 'pendiente'
  return null
}

describe('LineaResumenExcelTable', () => {
  it('define tabla Concepto/Cant/VU/Total e integra insumo asociado', () => {
    const src = readFileSync(join(dir, 'LineaResumenExcelTable.jsx'), 'utf8')
    assert.match(src, /Concepto/)
    assert.match(src, /Cant\./)
    assert.match(src, /\bVU\b/)
    assert.match(src, /Total/)
    assert.match(src, /Insumo asociado — no descuenta presupuesto del ítem/)
    assert.match(src, /Cobro, costo y utilidad/)
    assert.doesNotMatch(src, /× \$/)
    assert.doesNotMatch(src, /Cobro: .* ×/)
  })

  it('formulario y detalle usan la tabla Excel', () => {
    const form = readFileSync(join(dir, 'SolicitudForm.jsx'), 'utf8')
    const card = readFileSync(join(dir, 'SolicitudItemDetalleCard.jsx'), 'utf8')
    assert.match(form, /LineaResumenExcelTable/)
    assert.match(card, /LineaResumenExcelTable/)
  })
})

describe('Reabrir OC — helpers', () => {
  const gerencial = { validar: true, editar: true, esContratistaGerencial: true }

  it('permite reabrir solo con OC + editar', () => {
    assert.equal(
      solicitudPuedeReabrirOc({ estado: 'aprobada', tiene_orden_compra: true, orden_compra: { id: 1 } }, gerencial),
      true,
    )
    assert.equal(
      solicitudPuedeReabrirOc({ estado: 'enviada', tiene_orden_compra: false }, gerencial),
      false,
    )
    assert.equal(
      solicitudPuedeReabrirOc({ estado: 'aprobada', tiene_orden_compra: true, orden_compra: { id: 1 } }, { editar: false }),
      false,
    )
  })

  it('líneas nuevas post-OC no se fuerzan a aprobado', () => {
    const sol = { estado: 'aprobada', tiene_orden_compra: true, orden_compra: { id: 9 } }
    assert.equal(estadoValidacionItem({ id: 1, en_orden_compra: true }, sol), 'aprobado')
    assert.equal(estadoValidacionItem({ id: 2, en_orden_compra: false, estado_validacion: 'pendiente' }, sol), 'pendiente')
    assert.equal(estadoValidacionItem({ id: 3, en_orden_compra: false }, sol), 'pendiente')
  })

  it('gerencial puede validar líneas nuevas sobre solicitud con OC', () => {
    const sol = {
      estado: 'aprobada',
      tiene_orden_compra: true,
      orden_compra: { id: 9 },
      items: [
        { id: 1, en_orden_compra: true, estado_validacion: 'aprobado' },
        { id: 2, en_orden_compra: false, estado_validacion: 'pendiente' },
      ],
    }
    assert.equal(solicitudTieneLineasPendientesPostOc(sol), true)
    assert.equal(solicitudPuedeValidar(sol, gerencial), true)
    assert.equal(solicitudPuedeRechazarCompleta(sol, gerencial), false)
  })

  it('también permite agregar a OC cuando la línea nueva ya está aprobada', () => {
    const sol = {
      estado: 'aprobada',
      tiene_orden_compra: true,
      orden_compra: { id: 9 },
      items: [
        { id: 1, en_orden_compra: true, estado_validacion: 'aprobado' },
        { id: 2, en_orden_compra: false, estado_validacion: 'aprobado' },
      ],
    }
    assert.equal(solicitudPuedeValidar(sol, gerencial), true)
  })

  it('helpers fuente coinciden con la lógica de prueba', () => {
    const src = readFileSync(join(dir, 'solicitudDetalleHelpers.js'), 'utf8')
    assert.match(src, /solicitudPuedeReabrirOc/)
    assert.match(src, /solicitudPuedeRechazarCompleta/)
    assert.match(src, /solicitudTieneLineasPendientesPostOc/)
    assert.match(src, /en_orden_compra/)
    assert.match(src, /agregar insumos adicionales/i)
  })
})

describe('Reabrir OC — UI wiring', () => {
  it('panel y detalle exponen botón Reabrir OC', () => {
    const panel = readFileSync(join(dir, 'SolicitudesPanel.jsx'), 'utf8')
    const detalle = readFileSync(join(dir, 'SolicitudDetalleModal.jsx'), 'utf8')
    const form = readFileSync(join(dir, 'SolicitudForm.jsx'), 'utf8')
    const modal = readFileSync(join(dir, 'SolicitudFormModal.jsx'), 'utf8')
    const api = readFileSync(join(dir, 'almacenApi.js'), 'utf8')
    assert.match(panel, /Reabrir OC/)
    assert.match(panel, /modoReabrirOc/)
    assert.match(detalle, /Reabrir OC/)
    assert.match(form, /modoReabrirOc/)
    assert.match(form, /agregarLineasPostOc/)
    assert.match(modal, /modoReabrirOc/)
    assert.match(api, /agregar-lineas-post-oc/)
  })

  it('grilla Excel bloquea filas con isRowLocked', () => {
    const src = readFileSync(join(dir, 'SolicitudFormExcelTable.jsx'), 'utf8')
    assert.match(src, /isRowLocked/)
    assert.match(src, /rowDisabled/)
  })
})
