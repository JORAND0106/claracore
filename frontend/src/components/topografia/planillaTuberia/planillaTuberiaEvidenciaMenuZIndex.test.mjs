/**
 * Menú de fuentes de foto (cámara/archivo/galería): portal + z-index alto.
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaEvidenciaMenuZIndex.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const btnSrc = readFileSync(join(dir, 'PlanillaTuberiaEvidenciaBtn.jsx'), 'utf8')
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')

describe('Planilla tubería — menú evidencia z-index', () => {
  it('exporta z-index por encima del editor (100030) y bajo la galería', () => {
    assert.match(btnSrc, /EVIDENCIA_MENU_Z_INDEX\s*=\s*100075/)
    assert.match(btnSrc, /EVIDENCIA_GALERIA_Z_INDEX\s*=\s*100080/)
    assert.match(formSrc, /zIndex:\s*100030/)
  })

  it('renderiza el menú con createPortal a document.body y position fixed', () => {
    assert.match(btnSrc, /createPortal/)
    assert.match(btnSrc, /document\.body/)
    assert.match(btnSrc, /position:\s*'fixed'/)
    assert.match(btnSrc, /zIndex:\s*EVIDENCIA_MENU_Z_INDEX/)
    assert.match(btnSrc, /data-evidencia-menu/)
  })

  it('incluye opciones cámara, archivo y galería', () => {
    assert.match(btnSrc, /Cámara/)
    assert.match(btnSrc, /Archivo/)
    assert.match(btnSrc, /Galería/)
  })
})
