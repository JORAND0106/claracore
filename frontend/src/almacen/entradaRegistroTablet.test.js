/**
 * Registro tablet Entradas + por revisar.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  formatPlacaInput,
  motivosPorRevisarPreview,
  placaValida,
} from './entradaRegistroTabletHelpers.js'

const dir = dirname(fileURLToPath(import.meta.url))

describe('helpers tablet', () => {
  it('formatea placa AAA-000', () => {
    assert.equal(formatPlacaInput('abc123'), 'ABC-123')
    assert.equal(placaValida('ABC-123'), true)
    assert.equal(placaValida('AB-12'), false)
  })

  it('motivos preview', () => {
    const m = motivosPorRevisarPreview({
      orden_compra_id: null,
      foto: null,
      proveedor_manual: true,
      supera_saldo: true,
    })
    assert.ok(m.some((x) => /orden/i.test(x)))
    assert.ok(m.some((x) => /foto/i.test(x)))
    assert.ok(m.some((x) => /proveedor|mano/i.test(x)))
    assert.ok(m.some((x) => /saldo/i.test(x)))
  })
})

describe('UI cableado', () => {
  it('panel abre tablet y muestra marca por revisar', () => {
    const panel = readFileSync(join(dir, 'EntradasPanel.jsx'), 'utf8')
    const api = readFileSync(join(dir, 'almacenApi.js'), 'utf8')
    const filtros = readFileSync(join(dir, 'entradasFiltros.js'), 'utf8')
    assert.match(panel, /EntradaRegistroTablet/)
    assert.match(panel, /entrada-registrar-tablet/)
    assert.match(panel, /por_revisar/)
    assert.match(api, /ocs-pendientes/)
    assert.match(api, /completar-revision/)
    assert.match(filtros, /por_revisar/)
  })

  it('wizard tiene recibo y disposición', () => {
    const wiz = readFileSync(join(dir, 'EntradaRegistroTablet.jsx'), 'utf8')
    assert.match(wiz, /entrada-tablet-recibo/)
    assert.match(wiz, /entrada-tablet-disposicion/)
    assert.match(wiz, /entrada-tablet-sin-oc/)
    assert.match(wiz, /entrada-tablet-guardar/)
  })
})
