/**
 * Smoke — mano de obra en rentabilidad (solicitud + inventario).
 * node --test frontend/src/almacen/almacenMoRentabilidad.test.js
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

/** Copia mínima de fusionarManoObraEnRentabilidad para smoke sin deps JSX. */
function fusionarManoObraEnRentabilidad(analisisLive, analisisBackend) {
  if (!analisisLive?.filas?.length) return analisisLive
  const mo = (analisisBackend?.filas || []).find((f) => f?.es_mo && Number(f.costo_insumo_linea) > 0)
  if (!mo) return analisisLive
  const filas = analisisLive.filas.filter((f) => !f.es_mo && !f.es_total)
  const totalPrev = analisisLive.filas.find((f) => f.es_total) || null
  const moFila = { ...mo, es_mo: true, es_total: false, es_principal: false }
  filas.push(moFila)
  let sumCosto = 0
  let tieneCosto = false
  for (const f of filas) {
    const c = Number(f.costo_insumo_linea)
    if (Number.isFinite(c) && c > 0) {
      sumCosto += c
      tieneCosto = true
    }
  }
  const cobroTotal = totalPrev?.valor_cobro_linea != null ? Number(totalPrev.valor_cobro_linea) : null
  const costoTotal = tieneCosto ? sumCosto : null
  const util = (cobroTotal != null && costoTotal != null) ? cobroTotal - costoTotal : null
  const pct = (util != null && cobroTotal > 0) ? (util / cobroTotal) * 100 : null
  filas.push({
    ...(totalPrev || {}),
    etiqueta_fila: 'Total ítem',
    es_total: true,
    es_mo: false,
    costo_insumo_linea: costoTotal,
    utilidad_estimada_linea: util,
    rentabilidad_pct: pct,
  })
  return { ...analisisLive, filas, modo: 'por_insumo' }
}

describe('fusionarManoObraEnRentabilidad', () => {
  it('inserta MO antes del Total y recalcula utilidad', () => {
    const live = {
      modo: 'por_insumo',
      filas: [
        {
          etiqueta_fila: 'Cemento',
          es_principal: true,
          es_total: false,
          valor_cobro_linea: 1000,
          costo_insumo_linea: 400,
        },
        {
          etiqueta_fila: 'Total ítem',
          es_total: true,
          valor_cobro_linea: 1000,
          costo_insumo_linea: 400,
          utilidad_estimada_linea: 600,
          rentabilidad_pct: 60,
        },
      ],
    }
    const backend = {
      filas: [
        { es_mo: true, etiqueta_fila: 'Mano de obra (subcontratistas)', costo_insumo_linea: 150 },
      ],
    }
    const out = fusionarManoObraEnRentabilidad(live, backend)
    assert.equal(out.filas.length, 3)
    assert.equal(out.filas[1].es_mo, true)
    assert.equal(out.filas[1].costo_insumo_linea, 150)
    assert.equal(out.filas[2].es_total, true)
    assert.equal(out.filas[2].costo_insumo_linea, 550)
    assert.equal(out.filas[2].utilidad_estimada_linea, 450)
  })

  it('helpers exportan fusionarManoObraEnRentabilidad', () => {
    const src = readFileSync(join(dir, 'solicitudDetalleHelpers.js'), 'utf8')
    assert.match(src, /export function fusionarManoObraEnRentabilidad/)
  })
})

describe('UI wiring MO', () => {
  it('TablaRentabilidadAcumulada trata es_mo sin VU', () => {
    const src = readFileSync(join(dir, 'TablaRentabilidadAcumulada.jsx'), 'utf8')
    assert.match(src, /es_mo/)
    assert.match(src, /Mano de obra/)
  })

  it('InventarioPanel muestra N/A en movimientos para MO', () => {
    const src = readFileSync(join(dir, 'InventarioPanel.jsx'), 'utf8')
    assert.match(src, /ins\.es_mo/)
    assert.match(src, /N\/A/)
    assert.match(src, /costo_contribucion/)
  })

  it('backend calcula costo MO N2', () => {
    const src = readFileSync(join(dir, '../../../backend/almacen_mo_costo.py'), 'utf8')
    assert.match(src, /def calcular_costo_mo/)
    assert.match(src, /nivel2_objeto_pago_sub/)
    assert.match(src, /subcontratista_precios/)
  })

  it('Inventario unifica VU Costo con MO amortizada', () => {
    const src = readFileSync(join(dir, '../../../backend/almacen_inventario_arbol.py'), 'utf8')
    assert.match(src, /def _mo_unit_costo/)
    assert.match(src, /def alinear_mo_by_item/)
    assert.match(src, /Unificar materiales \+ MO en VU Costo/)
    assert.match(src, /precios_pactados/)
    const mo = readFileSync(join(dir, '../../../backend/almacen_mo_costo.py'), 'utf8')
    assert.match(mo, /def costos_mo_desde_precios_pactados/)
    const tip = readFileSync(join(dir, 'InventarioPanel.jsx'), 'utf8')
    assert.match(tip, /mano de obra de subcontratistas \(amortizada\)/)
  })
})
