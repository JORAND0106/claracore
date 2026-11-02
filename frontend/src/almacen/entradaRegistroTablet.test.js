/**
 * Registro tablet Entradas: apariencia, buscador, sin OC, solo materiales solicitados.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
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

  it('motivos preview incluye sin insumo', () => {
    const m = motivosPorRevisarPreview({
      orden_compra_id: null,
      foto: null,
      proveedor_manual: true,
      supera_saldo: true,
      sin_insumo: true,
    })
    assert.ok(m.some((x) => /orden/i.test(x)))
    assert.ok(m.some((x) => /foto/i.test(x)))
    assert.ok(m.some((x) => /proveedor|mano/i.test(x)))
    assert.ok(m.some((x) => /saldo/i.test(x)))
    assert.ok(m.some((x) => /insumo/i.test(x)))
  })

  it('buscador ignora tildes y exige todas las palabras', () => {
    const blob = ocCardSearchBlob({
      numero_oc: 12,
      proveedor_nombre: 'Acerías Paz del Río',
      material_descripcion: 'Cemento gris',
      solicitud_consecutivo: 5,
    })
    assert.equal(matchesAllTerms(blob, 'cemento aceria'), true)
    assert.equal(matchesAllTerms(blob, 'cemento hierro'), false)
    assert.equal(matchesAllTerms(blob, 'OC 12'), true)
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
    assert.match(api, /materiales-solicitados/)
    assert.match(api, /proveedores-solicitados/)
    assert.match(api, /completar-revision/)
    assert.match(filtros, /por_revisar/)
  })

  it('wizard: botones en línea, buscador, grilla y sin catálogo completo', () => {
    const wiz = readFileSync(join(dir, 'EntradaRegistroTablet.jsx'), 'utf8')
    assert.match(wiz, /entrada-tablet-recibo/)
    assert.match(wiz, /entrada-tablet-disposicion/)
    assert.match(wiz, /Salió material/)
    assert.match(wiz, /gridTemplateColumns: '1fr 1fr'/)
    assert.match(wiz, /entrada-tablet-oc-search/)
    assert.match(wiz, /entrada-tablet-oc-grid/)
    assert.match(wiz, /entrada-tablet-oc-count/)
    assert.match(wiz, /entrada-tablet-sin-oc/)
    assert.match(wiz, /mostrarSinOc/)
    assert.match(wiz, /searchMaterialesSolicitados/)
    assert.match(wiz, /searchProveedoresSolicitados/)
    assert.match(wiz, /entrada-tablet-mat-manual/)
    assert.match(wiz, /cc-app-header/)
    assert.doesNotMatch(wiz, /searchInsumosCatalog/)
    assert.match(wiz, /entrada-tablet-guardar/)
    assert.match(wiz, /ocsLoaded/)
    assert.match(wiz, /silent:\s*true/)
  })
})
