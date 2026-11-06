/**
 * Capítulos del wizard Nuevo Reporte: deben cargarse desde el catálogo SICOE
 * (`/sicoe-obra/.../capitulos`), no desde `/listado-precios` (403 si
 * Empresa=subcontratista o sin permiso de precios).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const appSrc = readFileSync(join(here, '../../App.jsx'), 'utf8')
const catalogSrc = readFileSync(join(here, 'sicoeCatalogoCache.js'), 'utf8')
const downloaderSrc = readFileSync(join(here, '../../offline/downloader.js'), 'utf8')

function modalNuevoReporteSrc() {
  const start = appSrc.search(/\nfunction ModalNuevoReporte\b/)
  assert.ok(start >= 0, 'ModalNuevoReporte existe')
  const rest = appSrc.slice(start + 1)
  const next = rest.search(/\nfunction [A-Za-z_]/)
  return next >= 0 ? rest.slice(0, next) : rest
}

describe('ModalNuevoReporte · capítulos para reportantes', () => {
  it('carga capítulos con fetchSicoeCapitulosCached (no listado-precios)', () => {
    const body = modalNuevoReporteSrc()
    assert.match(body, /fetchSicoeCapitulosCached\(/)
    assert.doesNotMatch(
      body,
      /fetch\(`\$\{API_URL\}\/listado-precios\/\$\{contrato_id\}`/,
    )
    assert.match(body, /Empresa=subcontratista|listado-precios/)
  })

  it('offline fusiona getCapitulosOffline + precios locales', () => {
    const body = modalNuevoReporteSrc()
    assert.match(body, /getCapitulosOffline\(/)
    assert.match(body, /getPreciosOffline\(/)
  })

  it('el catálogo SICOE apunta a /sicoe-obra/.../capitulos', () => {
    assert.match(catalogSrc, /sicoe-obra\/\$\{contratoId\}\/capitulos/)
    assert.match(catalogSrc, /fetchSicoeCapitulosCached/)
  })

  it('el downloader offline completa capítulos sin depender solo de listado-precios', () => {
    assert.match(downloaderSrc, /_mergePreciosConCapitulosCatalogo/)
    assert.match(downloaderSrc, /sicoe-obra\/\$\{contratoId\}\/capitulos/)
    assert.match(downloaderSrc, /_capitulo_stub/)
  })
})
