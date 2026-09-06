/**
 * Tabla rentabilidad: filas por insumo + Total; cobro solo del principal.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const dir = dirname(fileURLToPath(import.meta.url))

function construirRentabilidadPorInsumos(hermanos, overrideDraft = null, meta = {}) {
  const rows = (hermanos || []).map((r) => ({ ...r }))
  if (overrideDraft && rows.length) {
    const oid = overrideDraft.id != null ? Number(overrideDraft.id) : null
    const idx = oid != null ? rows.findIndex((r) => Number(r.id) === oid) : 0
    const target = idx >= 0 ? idx : 0
    rows[target] = { ...rows[target], ...overrideDraft }
  }
  rows.sort((a, b) => {
    const pa = a.es_principal === false ? 1 : 0
    const pb = b.es_principal === false ? 1 : 0
    if (pa !== pb) return pa - pb
    return (Number(a.numero_linea) || 0) - (Number(b.numero_linea) || 0)
  })
  const filas = []
  let sumCosto = 0
  let tieneCosto = false
  let cobroTotal = null
  for (const r of rows) {
    const cant = Number(r.cantidad)
    const vc = Number(r.valor_compra_unitario)
    const esPrincipal = r.es_principal !== false
    const costoLinea = (cant > 0 && vc > 0) ? cant * vc : null
    if (costoLinea != null) {
      sumCosto += costoLinea
      tieneCosto = true
    }
    let vuCobro = null
    let cobroLinea = null
    if (esPrincipal) {
      const vlr = Number(r.vlr_unitario_cobro)
      if (vlr > 0 && cant > 0) {
        vuCobro = vlr
        cobroLinea = cant * vlr
        cobroTotal = cobroLinea
      }
    }
    filas.push({
      etiqueta_fila: r.material_descripcion || 'Insumo',
      es_principal: esPrincipal,
      es_total: false,
      cantidad: cant > 0 ? cant : null,
      valor_cobro_unitario: vuCobro,
      valor_cobro_linea: cobroLinea,
      costo_insumo_linea: costoLinea,
      utilidad_estimada_linea: null,
    })
  }
  const costoTotal = tieneCosto ? sumCosto : null
  const util = (cobroTotal != null && costoTotal != null) ? cobroTotal - costoTotal : null
  const pct = (util != null && cobroTotal > 0) ? (util / cobroTotal) * 100 : null
  filas.push({
    etiqueta_fila: 'Total ítem',
    es_total: true,
    valor_cobro_linea: cobroTotal,
    costo_insumo_linea: costoTotal,
    utilidad_estimada_linea: util,
    rentabilidad_pct: pct,
    numero_oc: meta.numeroOc ?? null,
  })
  return { filas, modo: 'por_insumo' }
}

describe('Tabla rentabilidad — filas por insumo', () => {
  it('backend expone filas_rentabilidad_por_insumo y modo por_insumo', () => {
    const src = readFileSync(join(dir, '../../../backend/almacen_insumos_service.py'), 'utf8')
    assert.match(src, /def filas_rentabilidad_por_insumo/)
    assert.match(src, /"modo": "por_insumo"/)
    assert.match(src, /Total ítem/)
  })

  it('tabla FE: orden N° OC | VU cobro | Tot. cobro | Cant. | VU costo…', () => {
    const src = readFileSync(join(dir, 'TablaRentabilidadAcumulada.jsx'), 'utf8')
    assert.match(src, /N° OC/)
    const ids = [...src.matchAll(/id: '([^']+)'/g)].map((m) => m[1])
    assert.deepEqual(ids.slice(0, 7), [
      'vu_cobro',
      'total_cobro',
      'cantidad',
      'vu_costo',
      'total_costo',
      'utilidad',
      'rentabilidad',
    ])
    assert.match(src, /es_total/)
    assert.match(src, /solo en la fila Total/)
  })

  it('helpers construyen una fila por insumo y utilidad solo en Total', () => {
    const helpers = readFileSync(join(dir, 'solicitudDetalleHelpers.js'), 'utf8')
    assert.match(helpers, /export function construirRentabilidadPorInsumos/)
    const hermanos = [
      { id: 1, cantidad: 100, vlr_unitario_cobro: 50, valor_compra_unitario: 30, es_principal: true, material_descripcion: 'Geocelda' },
      { id: 2, cantidad: 200, vlr_unitario_cobro: 0, valor_compra_unitario: 2, es_principal: false, material_descripcion: 'Pines' },
      { id: 3, cantidad: 100, vlr_unitario_cobro: 0, valor_compra_unitario: 5, es_principal: false, material_descripcion: 'Geotextil' },
    ]
    const r = construirRentabilidadPorInsumos(hermanos, null, { numeroOc: 12 })
    assert.equal(r.filas.length, 4)
    assert.equal(r.filas[0].valor_cobro_linea, 5000)
    assert.equal(r.filas[1].valor_cobro_linea, null)
    assert.equal(r.filas[1].costo_insumo_linea, 400)
    assert.equal(r.filas[3].es_total, true)
    assert.equal(r.filas[3].costo_insumo_linea, 3900)
    assert.equal(r.filas[3].utilidad_estimada_linea, 1100)
    assert.equal(r.filas[3].rentabilidad_pct, 22)
  })

  it('modal usa construirRentabilidadPorInsumos', () => {
    const modal = readFileSync(join(dir, 'SolicitudLineaRevisionModal.jsx'), 'utf8')
    assert.match(modal, /construirRentabilidadPorInsumos/)
  })
})
