/**
 * Registro tablet Entradas: popup, OC consolidada, captura única, 2 fotos.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  distributeCantidadOverLineas,
  formatPlacaInput,
  matchesAllTerms,
  motivosPorRevisarPreview,
  ocCardSearchBlob,
  placaValida,
} from './entradaRegistroTabletHelpers.js'

const dir = dirname(fileURLToPath(import.meta.url))

describe('helpers tablet', () => {
  it('formatea placa AAA-000', () => {
    assert.equal(formatPlacaInput('abc123'), 'ABC-123')
    assert.equal(placaValida('ABC-123'), true)
    assert.equal(placaValida('AB-12'), false)
  })

  it('motivos preview: recibo no marca sin foto (fotos bloquean)', () => {
    const m = motivosPorRevisarPreview({
      tipo: 'recibo',
      orden_compra_id: null,
      foto: null,
      proveedor_manual: true,
      supera_saldo: true,
      sin_insumo: true,
    })
    assert.ok(m.some((x) => /orden/i.test(x)))
    assert.ok(!m.some((x) => /foto/i.test(x)))
    assert.ok(m.some((x) => /proveedor|mano/i.test(x)))
    assert.ok(m.some((x) => /saldo/i.test(x)))
    assert.ok(m.some((x) => /insumo/i.test(x)))
  })

  it('buscador consolida insumos de la tarjeta OC', () => {
    const blob = ocCardSearchBlob({
      numero_oc: 10,
      proveedor_nombre: 'Acerías Paz del Río',
      insumos: [
        { material_descripcion: 'Cemento gris' },
        { material_descripcion: 'Arena' },
      ],
      solicitud_consecutivo: 5,
    })
    assert.equal(matchesAllTerms(blob, 'cemento aceria'), true)
    assert.equal(matchesAllTerms(blob, 'arena 10'), true)
    assert.equal(matchesAllTerms(blob, 'hierro'), false)
  })

  it('reparte cantidad entre líneas FIFO', () => {
    const items = distributeCantidadOverLineas([
      { orden_compra_item_id: 2, saldo_cantidad: 3 },
      { orden_compra_item_id: 1, saldo_cantidad: 5 },
    ], 7)
    assert.deepEqual(items, [
      { orden_compra_item_id: 1, cantidad_recibida: 5 },
      { orden_compra_item_id: 2, cantidad_recibida: 2 },
    ])
    const over = distributeCantidadOverLineas([
      { orden_compra_item_id: 1, saldo_cantidad: 2 },
    ], 5)
    assert.equal(over.length, 1)
    assert.equal(over[0].cantidad_recibida, 5)
  })
})

describe('UI cableado', () => {
  it('panel abre tablet', () => {
    const panel = readFileSync(join(dir, 'EntradasPanel.jsx'), 'utf8')
    const api = readFileSync(join(dir, 'almacenApi.js'), 'utf8')
    assert.match(panel, /EntradaRegistroTablet/)
    assert.match(api, /ocs-pendientes/)
    assert.match(api, /material-foto\/download/)
    assert.match(api, /materiales-solicitados/)
  })

  it('wizard: popup, consolidación, captura única y 2 fotos', () => {
    const wiz = readFileSync(join(dir, 'EntradaRegistroTablet.jsx'), 'utf8')
    assert.match(wiz, /entrada-tablet-popup/)
    assert.match(wiz, /overflow = 'hidden'/)
    assert.match(wiz, /entrada-tablet-recibo/)
    assert.match(wiz, /Salió material/)
    assert.match(wiz, /gridTemplateColumns: '1fr 1fr'/)
    assert.match(wiz, /entrada-tablet-oc-search/)
    assert.match(wiz, /entrada-tablet-oc-grid/)
    assert.match(wiz, /entrada-tablet-oc-insumo/)
    assert.match(wiz, /entrada-tablet-captura/)
    assert.match(wiz, /entrada-tablet-foto-remision/)
    assert.match(wiz, /entrada-tablet-foto-material/)
    assert.match(wiz, /fotosCompletas/)
    assert.match(wiz, /distributeCantidadOverLineas/)
    assert.match(wiz, /material_foto/)
    assert.match(wiz, /entrada-tablet-guardar/)
    assert.match(wiz, /entrada-tablet-corregir/)
    assert.doesNotMatch(wiz, /searchInsumosCatalog/)
    assert.match(wiz, /ocsLoaded/)
  })
})
