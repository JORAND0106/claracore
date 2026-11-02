/**
 * Registro tablet Entradas: búsqueda por línea, captura compacta, mapa sector.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  buildItemsFromOcSeleccion,
  countSearchDisplay,
  distributeCantidadOverLineas,
  filterOcsForSearch,
  formatPlacaInput,
  highlightSegments,
  initOcLineasSeleccion,
  motivosPorRevisarPreview,
  placaValida,
  resumenLineasSeleccion,
} from './entradaRegistroTabletHelpers.js'

const dir = dirname(fileURLToPath(import.meta.url))

const sampleOcs = [
  {
    orden_compra_id: 5,
    numero_oc: 5,
    proveedor_nombre: 'DISTRIBUIDORA DOTACIONES EPP FENIX SAS',
    insumos: [
      { key: 'i:1', material_descripcion: 'CC-1614-068 — ROLLO DE CINTA PELIGRO X 500 METROS', saldo_cantidad: 5, unidad: 'UND' },
      { key: 'i:2', material_descripcion: 'CC-1614-069 — GAFAS DE SEGURIDAD OSCURA', saldo_cantidad: 24, unidad: 'UND' },
      { key: 'i:3', material_descripcion: 'CC-1614-070 — CAJA DE TAPABOCAS INDUSTRIAL X 100', saldo_cantidad: 1, unidad: 'UND' },
    ],
  },
  {
    orden_compra_id: 8,
    numero_oc: 8,
    proveedor_nombre: 'ACERIAS',
    insumos: [
      { key: 'i:9', material_descripcion: 'Varilla', saldo_cantidad: 10, unidad: 'kg' },
    ],
  },
]

describe('helpers tablet', () => {
  it('formatea placa AAA-000', () => {
    assert.equal(formatPlacaInput('abc123'), 'ABC-123')
    assert.equal(placaValida('ABC-123'), true)
  })

  it('filtra por línea «Cinta» sin mostrar otros insumos', () => {
    const filtered = filterOcsForSearch(sampleOcs, 'Cinta')
    assert.equal(filtered.length, 1)
    assert.equal(filtered[0].matchMode, 'line')
    assert.equal(filtered[0].insumos.length, 1)
    assert.match(filtered[0].insumos[0].material_descripcion, /CINTA/i)
    assert.equal(countSearchDisplay(filtered), 1)
  })

  it('si coincide proveedor muestra toda la OC', () => {
    const filtered = filterOcsForSearch(sampleOcs, 'Fenix')
    assert.equal(filtered.length, 1)
    assert.equal(filtered[0].matchMode, 'oc')
    assert.equal(filtered[0].insumos.length, 3)
    assert.equal(countSearchDisplay(filtered), 1)
  })

  it('sin búsqueda mantiene consolidadas', () => {
    const filtered = filterOcsForSearch(sampleOcs, '')
    assert.equal(filtered.length, 2)
    assert.equal(filtered[0].matchMode, 'all')
    assert.equal(countSearchDisplay(filtered), 2)
  })

  it('resalta coincidencia', () => {
    const segs = highlightSegments('ROLLO DE CINTA PELIGRO', 'cinta')
    assert.equal(segs.length, 1)
    assert.equal(segs[0].hit, true)
  })

  it('motivos incluye sin sector', () => {
    const m = motivosPorRevisarPreview({
      tipo: 'recibo',
      orden_compra_id: 1,
      sin_sector: true,
      foto: true,
    })
    assert.ok(m.some((x) => /sector/i.test(x)))
  })

  it('reparte cantidad FIFO', () => {
    const items = distributeCantidadOverLineas([
      { orden_compra_item_id: 2, saldo_cantidad: 3 },
      { orden_compra_item_id: 1, saldo_cantidad: 5 },
    ], 7)
    assert.deepEqual(items, [
      { orden_compra_item_id: 1, cantidad_recibida: 5 },
      { orden_compra_item_id: 2, cantidad_recibida: 2 },
    ])
  })

  it('selección OC: premarca línea y arma items multi', () => {
    const sel = initOcLineasSeleccion(sampleOcs[0].insumos, 'i:2')
    assert.equal(sel.length, 3)
    assert.equal(sel.find((r) => r.key === 'i:2').marked, true)
    assert.equal(sel.find((r) => r.key === 'i:1').marked, false)
    const withQty = sel.map((r) => (
      r.key === 'i:1' || r.key === 'i:2'
        ? {
          ...r,
          marked: true,
          cantidad: r.key === 'i:1' ? '2' : '4',
          insumo: {
            ...r.insumo,
            lineas: [{ orden_compra_item_id: r.key === 'i:1' ? 10 : 20, saldo_cantidad: 10 }],
          },
        }
        : r
    ))
    const items = buildItemsFromOcSeleccion(withQty)
    assert.equal(items.length, 2)
    assert.deepEqual(items, [
      { orden_compra_item_id: 10, cantidad_recibida: 2 },
      { orden_compra_item_id: 20, cantidad_recibida: 4 },
    ])
    const resumen = resumenLineasSeleccion(withQty)
    assert.equal(resumen.length, 2)
  })

  it('sin placa no agrega motivo de vehículo', () => {
    const m = motivosPorRevisarPreview({
      tipo: 'recibo',
      orden_compra_id: 1,
      foto: true,
      vehiculo_nuevo: false,
    })
    assert.ok(!m.some((x) => /vehículo|vehiculo/i.test(x)))
  })
})

describe('UI cableado', () => {
  it('wizard: OC completa, domicilio, captura multi y mapa', () => {
    const wiz = readFileSync(join(dir, 'EntradaRegistroTablet.jsx'), 'utf8')
    const panel = readFileSync(join(dir, 'EntradasPanel.jsx'), 'utf8')
    assert.match(wiz, /filterOcsForSearch/)
    assert.match(wiz, /HighlightText/)
    assert.match(wiz, /alignItems: 'center'/)
    assert.match(wiz, /entrada-tablet-captura-fila/)
    assert.match(wiz, /entrada-tablet-oc-completa/)
    assert.match(wiz, /entrada-tablet-oc-lineas/)
    assert.match(wiz, /entrada-tablet-domicilio/)
    assert.match(wiz, /llegada_domicilio/)
    assert.match(wiz, /buildItemsFromOcSeleccion/)
    assert.match(wiz, /AlmacenPkMapaSelector/)
    assert.match(wiz, /entrada-tablet-mapa/)
    assert.match(wiz, /Sin sector/)
    assert.match(panel, /contratoId=\{permisos\?\.contratoId\}/)
    assert.match(panel, /data-label="Sector"/)
  })
})
