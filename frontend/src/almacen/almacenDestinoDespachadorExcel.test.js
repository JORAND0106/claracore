/**
 * Destino interactivo + Despachador Excel.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('Popup destino — mapa interactivo y Excel', () => {
  it('AlmacenItemMapaPreview permite gestos y satélite', () => {
    const src = readFileSync(join(__dirname, 'AlmacenItemMapaPreview.jsx'), 'utf8')
    assert.match(src, /interactive/)
    assert.match(src, /showBasemapToggle/)
    assert.match(src, /initialBasemap/)
    assert.match(src, /pointerEvents: interactive \? 'auto' : 'none'/)
  })

  it('OcSolicitudUbicacionModal es más ancho, Excel y mapa táctil', () => {
    const src = readFileSync(join(__dirname, 'OcSolicitudUbicacionModal.jsx'), 'utf8')
    assert.match(src, /min\(1080px/)
    assert.match(src, /cc-almacen-destino-excel/)
    assert.match(src, /interactive/)
    assert.match(src, /initialBasemap="satelite"/)
    assert.match(src, /showBasemapToggle/)
  })

  it('SolicitudLineaMapaModal interactivo con satélite', () => {
    const src = readFileSync(join(__dirname, 'SolicitudLineaMapaModal.jsx'), 'utf8')
    assert.match(src, /min\(1000px/)
    assert.match(src, /cc-almacen-destino-excel/)
    assert.match(src, /interactive/)
    assert.match(src, /initialBasemap="satelite"/)
  })
})

describe('Despachador Excel responsivo', () => {
  it('modal más ancho en desktop y grillas Excel', () => {
    const src = readFileSync(join(__dirname, 'DespachadorModal.jsx'), 'utf8')
    assert.match(src, /maxWidth: compact \? '100%' : 1180/)
    assert.match(src, /cc-almacen-despachador-excel/)
    assert.match(src, /variant="excel"/)
    assert.match(src, /initialBasemap="satelite"/)
    assert.match(src, /showBasemapToggle/)
  })

  it('conserva funcionalidades clave', () => {
    const src = readFileSync(join(__dirname, 'DespachadorModal.jsx'), 'utf8')
    for (const needle of [
      'disposicion',
      'recibo',
      'ProveedorSelector',
      'InsumoPorProveedorSelect',
      'PlacaTransportadorFields',
      'ocrRemisionEntrada',
      'printDisposicionPdf',
      'createEntrada',
      'buscarOrdenesCompraPorPk',
    ]) {
      assert.match(src, new RegExp(needle))
    }
  })

  it('AlmacenPkMapaSelector expone toggle de basemap', () => {
    const src = readFileSync(join(__dirname, 'AlmacenPkMapaSelector.jsx'), 'utf8')
    assert.match(src, /showBasemapToggle/)
    assert.match(src, /min\(720px/)
  })
})
