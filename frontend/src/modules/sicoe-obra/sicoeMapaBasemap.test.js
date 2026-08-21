/**
 * Vistas de basemap del mapa de localización SicoeObra (reporte de cantidades).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  SICOE_MAPA_VISTA_DEFAULT,
  SICOE_MAPA_STYLE_OUTDOORS,
  SICOE_MAPA_STYLE_SATELLITE,
  SICOE_MAPA_STYLE_STREETS,
  SICOE_MAPA_VISTAS_CALLE,
  normalizarVistaBasemap,
  sicoeBasemapStyleUrl,
  sicoeBasemapLabel,
  leerVistaBasemapGuardada,
  guardarVistaBasemap,
} from './sicoeMapaBasemap.js'

describe('sicoeMapaBasemap', () => {
  it('normaliza alias a las vistas canónicas', () => {
    assert.equal(normalizarVistaBasemap('Relieve'), 'relieve')
    assert.equal(normalizarVistaBasemap('SATÉLITE'), 'satelite')
    assert.equal(normalizarVistaBasemap('plano topográfico'), 'topografico')
    assert.equal(normalizarVistaBasemap('satellite'), 'satelite')
    assert.equal(normalizarVistaBasemap('Calle'), 'calle')
    assert.equal(normalizarVistaBasemap('street'), 'calle')
    assert.equal(normalizarVistaBasemap(''), SICOE_MAPA_VISTA_DEFAULT)
    assert.equal(normalizarVistaBasemap('xyz'), SICOE_MAPA_VISTA_DEFAULT)
  })

  it('mapea estilos Mapbox: calle → streets; topo/relieve → outdoors; satélite → satellite', () => {
    assert.equal(sicoeBasemapStyleUrl('calle'), SICOE_MAPA_STYLE_STREETS)
    assert.equal(sicoeBasemapStyleUrl('topografico'), SICOE_MAPA_STYLE_OUTDOORS)
    assert.equal(sicoeBasemapStyleUrl('relieve'), SICOE_MAPA_STYLE_OUTDOORS)
    assert.equal(sicoeBasemapStyleUrl('satelite'), SICOE_MAPA_STYLE_SATELLITE)
  })

  it('etiquetas en español', () => {
    assert.equal(sicoeBasemapLabel('relieve'), 'Relieve')
    assert.equal(sicoeBasemapLabel('satelite'), 'Satélite')
    assert.equal(sicoeBasemapLabel('topografico'), 'Topográfico')
    assert.equal(sicoeBasemapLabel('calle'), 'Calle')
  })

  it('vistas Bitácora: calle / relieve / satélite', () => {
    assert.deepEqual([...SICOE_MAPA_VISTAS_CALLE], ['calle', 'relieve', 'satelite'])
  })

  it('persiste la última vista en localStorage', () => {
    const mem = new Map()
    const original = globalThis.localStorage
    globalThis.localStorage = {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => { mem.set(k, String(v)) },
      removeItem: (k) => { mem.delete(k) },
    }
    try {
      guardarVistaBasemap('satelite')
      assert.equal(leerVistaBasemapGuardada(), 'satelite')
      guardarVistaBasemap('relieve')
      assert.equal(leerVistaBasemapGuardada(), 'relieve')
      guardarVistaBasemap('calle')
      assert.equal(leerVistaBasemapGuardada(), 'calle')
    } finally {
      globalThis.localStorage = original
    }
  })

  it('misma URL entre topográfico y relieve (solo cambia DEM) — coords no dependen del estilo', () => {
    assert.equal(sicoeBasemapStyleUrl('topografico'), sicoeBasemapStyleUrl('relieve'))
    assert.notEqual(sicoeBasemapStyleUrl('satelite'), sicoeBasemapStyleUrl('topografico'))
    assert.notEqual(sicoeBasemapStyleUrl('calle'), sicoeBasemapStyleUrl('relieve'))
  })
})
