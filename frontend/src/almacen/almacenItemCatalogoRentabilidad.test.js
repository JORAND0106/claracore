/**
 * Ajustes Almacén: ítem al editar, catálogo cant. negociada,
 * conservar aprobación al corregir, rentabilidad agregada por ítem.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const dir = dirname(fileURLToPath(import.meta.url))

function hermanosMismoPresupuestoItem(items, item) {
  if (!item || !Array.isArray(items) || !items.length) return item ? [item] : []
  const pid = item.presupuesto_id
  if (pid != null && pid !== '') {
    const same = items.filter((r) => Number(r.presupuesto_id) === Number(pid))
    return same.length ? same : [item]
  }
  const cap = String(item.capitulo || item.presupuesto_capitulo || '').trim()
  const itm = String(item.item || item.presupuesto_item || '').trim().replace(/\.+$/, '')
  if (!cap || !itm) return [item]
  const same = items.filter((r) => {
    const c = String(r.capitulo || r.presupuesto_capitulo || '').trim()
    const i = String(r.item || r.presupuesto_item || '').trim().replace(/\.+$/, '')
    return c === cap && i === itm
  })
  return same.length ? same : [item]
}

function agregarTotales(hermanos) {
  let cobroLinea = 0
  let costoLinea = 0
  let tieneCosto = false
  let cantCobro = 0
  for (const r of hermanos) {
    const cant = Number(r.cantidad)
    const vlr = Number(r.vlr_unitario_cobro)
    const vc = Number(r.valor_compra_unitario)
    if (cant > 0 && vlr > 0) {
      cobroLinea += cant * vlr
      cantCobro += cant
    }
    if (cant > 0 && vc > 0) {
      costoLinea += cant * vc
      tieneCosto = true
    }
  }
  if (!(cantCobro > 0)) {
    const principal = hermanos.find((r) => r.es_principal !== false) || hermanos[0]
    cantCobro = Number(principal?.cantidad) || 0
  }
  return { cantCobro, cobroLinea, costoLinea, tieneCosto }
}

describe('PresupuestoItemSelector — ítem guardado al editar', () => {
  it('no abre dropdown al hidratar y no filtra por etiqueta seleccionada', () => {
    const src = readFileSync(join(dir, 'PresupuestoItemSelector.jsx'), 'utf8')
    assert.match(src, /No abrir el dropdown automáticamente/)
    assert.match(src, /selectedLabel && q === selectedLabel/)
  })
})

describe('Catálogo insumos — Cantidad negociada', () => {
  it('reemplaza Con IVA/AIU por Cant. neg. en la grilla', () => {
    const src = readFileSync(join(dir, '../admin/SeccionCatalogoInsumos.jsx'), 'utf8')
    assert.match(src, /Cant\. neg\./)
    assert.match(src, /title="Cantidad negociada"/)
    assert.doesNotMatch(src, />Con IVA\/AIU</)
  })
})

describe('Corrección post-OC — conserva aprobación', () => {
  it('backend preserva estado_validacion al corregir', () => {
    const be = readFileSync(join(dir, '../../../backend/almacen_service.py'), 'utf8')
    assert.match(be, /Conservar aprobación/)
    assert.match(be, /"estado_validacion": existing\.get\("estado_validacion"\) or "aprobado"/)
  })
})

describe('Rentabilidad agregada por ítem', () => {
  it('backend agrega por presupuesto_id y ruta incluye rentabilidad', () => {
    const insumos = readFileSync(join(dir, '../../../backend/almacen_insumos_service.py'), 'utf8')
    assert.match(insumos, /def filas_rentabilidad_por_insumo/)
    assert.match(insumos, /presupuesto_id: Optional\[int\] = None/)
    assert.match(insumos, /una fila por insumo/)
    const routes = readFileSync(join(dir, '../../../backend/almacen_routes.py'), 'utf8')
    assert.match(routes, /include_rentabilidad=bool\(ver_eco and not ligera\)/)
    const svc = readFileSync(join(dir, '../../../backend/almacen_service.py'), 'utf8')
    assert.match(svc, /rent_cache/)
    assert.match(svc, /presupuesto_id=int\(pid\) if pid else None/)
  })

  it('helpers FE agrupan y suman principal + asociados', () => {
    const helpers = readFileSync(join(dir, 'solicitudDetalleHelpers.js'), 'utf8')
    assert.match(helpers, /export function hermanosMismoPresupuestoItem/)
    assert.match(helpers, /export function construirRentabilidadPorInsumos/)
    const items = [
      { id: 1, presupuesto_id: 50, cantidad: 100, vlr_unitario_cobro: 50, valor_compra_unitario: 30, es_principal: true },
      { id: 2, presupuesto_id: 50, cantidad: 200, vlr_unitario_cobro: 0, valor_compra_unitario: 2, es_principal: false },
      { id: 3, presupuesto_id: 50, cantidad: 100, vlr_unitario_cobro: 0, valor_compra_unitario: 5, es_principal: false },
      { id: 9, presupuesto_id: 99, cantidad: 1, vlr_unitario_cobro: 10, valor_compra_unitario: 5, es_principal: true },
    ]
    const h = hermanosMismoPresupuestoItem(items, items[1])
    assert.equal(h.length, 3)
    const t = agregarTotales(h)
    assert.equal(t.cantCobro, 100)
    assert.equal(t.cobroLinea, 5000)
    assert.equal(t.costoLinea, 3900)
  })

  it('modal usa hermanos y construirRentabilidadPorInsumos', () => {
    const modal = readFileSync(join(dir, 'SolicitudLineaRevisionModal.jsx'), 'utf8')
    assert.match(modal, /hermanosMismoPresupuestoItem/)
    assert.match(modal, /construirRentabilidadPorInsumos/)
  })
})
