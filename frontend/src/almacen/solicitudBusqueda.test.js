import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  partesResaltadas,
  textoConteoBusqueda,
  tokensBusqueda,
} from './solicitudBusqueda.js'

const dir = dirname(fileURLToPath(import.meta.url))

describe('tokens de la búsqueda', () => {
  it('ignora mayúsculas, tildes y el orden no importa en el conjunto', () => {
    assert.deepEqual(tokensBusqueda('  Tubería   PVC '), ['tuberia', 'pvc'])
    assert.deepEqual(tokensBusqueda(''), [])
  })
})

describe('resaltado visible', () => {
  it('tuberia marca TUBERÍA y deja el resto intacto', () => {
    const parts = partesResaltadas('TUBERÍA PVC 6"', ['tuberia'])
    const hits = parts.filter((p) => p.hit).map((p) => p.text)
    assert.deepEqual(hits, ['TUBERÍA'])
    assert.equal(parts.map((p) => p.text).join(''), 'TUBERÍA PVC 6"')
  })

  it('varias palabras se marcan todas', () => {
    const parts = partesResaltadas('Solicitud #17 - Aceros', ['17', 'aceros'])
    assert.deepEqual(parts.filter((p) => p.hit).map((p) => p.text), ['17', 'Aceros'])
  })
})

describe('contador', () => {
  it('distingue una solicitud del plural', () => {
    assert.equal(textoConteoBusqueda(1), '1 solicitud')
    assert.equal(textoConteoBusqueda(0), '0 solicitudes')
    assert.equal(textoConteoBusqueda(4), '4 solicitudes')
  })
})

describe('grilla de solicitudes', () => {
  it('el cuadro busca solo, espera entre pulsaciones y dice dónde coincidió', () => {
    const panel = readFileSync(join(dir, 'SolicitudesPanel.jsx'), 'utf8')
    const api = readFileSync(join(dir, 'almacenApi.js'), 'utf8')
    assert.match(panel, /data-testid="solicitud-busqueda"/)
    assert.match(panel, /setTimeout\(\(\) => setQ\(qInput\.trim\(\)\), 300\)/)
    assert.match(panel, /solicitud-busqueda-limpiar/)
    assert.match(panel, /solicitud-busqueda-conteo/)
    assert.match(panel, /Ninguna solicitud coincide con la búsqueda/)
    assert.match(panel, /solicitud-busqueda-donde/)
    assert.match(panel, /busqueda_donde/)
    assert.match(api, /params\.set\('q', texto\)/)
  })
})
