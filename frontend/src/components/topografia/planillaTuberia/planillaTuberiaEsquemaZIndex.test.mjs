/**
 * Esquema del tramo (Crear reporte) debe quedar delante de la planilla.
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaEsquemaZIndex.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nestedOverlayZ, resolveStackedOverlayZ } from '../../overlayStackMath.js'
import { SICOE_HERRAMIENTA_Z } from '../../../modules/sicoe-obra/sicoeZIndex.js'

const dir = dirname(fileURLToPath(import.meta.url))
const modalSrc = readFileSync(join(dir, 'PlanillaTuberiaCrearReporteModal.jsx'), 'utf8')
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')
const evidenciaSrc = readFileSync(join(dir, 'PlanillaTuberiaEvidenciaBtn.jsx'), 'utf8')
const mapaSrc = readFileSync(join(dir, 'PlanillaTuberiaTramoMapaModal.jsx'), 'utf8')

function constNum(src, name) {
  const m = src.match(new RegExp(`export const ${name}\\s*=\\s*(\\d+)`))
  assert.ok(m, `falta ${name}`)
  return Number(m[1])
}

describe('Planilla tubería — Esquema delante de Crear reporte / planilla', () => {
  it('escala: planilla < PK < Crear reporte < Esquema < confirmación', () => {
    const crear = constNum(modalSrc, 'CREAR_REPORTE_Z_INDEX')
    const esquema = constNum(modalSrc, 'CREAR_REPORTE_ESQUEMA_Z_INDEX')
    const confirma = constNum(modalSrc, 'CREAR_REPORTE_CONFIRMA_Z_INDEX')
    assert.equal(crear, 100060)
    assert.equal(esquema, 100070)
    assert.equal(confirma, 100080)
    assert.ok(crear > 100030)
    assert.ok(crear > 100050)
    assert.ok(esquema > crear)
    assert.ok(confirma > esquema)
    // El default SICOE (17000) queda debajo de la planilla: por eso hace falta el stack.
    assert.ok(SICOE_HERRAMIENTA_Z < 100030)
    assert.equal(nestedOverlayZ(crear), 100070)
    assert.equal(resolveStackedOverlayZ(SICOE_HERRAMIENTA_Z, crear), 100070)
    assert.equal(resolveStackedOverlayZ(esquema, crear), 100070)
  })

  it('Crear reporte provee OverlayStackProvider y pasa zIndex al Esquema', () => {
    assert.match(modalSrc, /OverlayStackProvider/)
    assert.match(modalSrc, /zIndex=\{CREAR_REPORTE_Z_INDEX\}/)
    assert.match(modalSrc, /zIndex=\{CREAR_REPORTE_ESQUEMA_Z_INDEX\}/)
    assert.match(modalSrc, /EsquemaEditorModal/)
    // Ya no envuelve con un div z-index inútil (el editor porta a body).
    assert.doesNotMatch(
      modalSrc,
      /createPortal\(\s*<div[^>]*CREAR_REPORTE_ESQUEMA_Z_INDEX/,
    )
  })

  it('Form declara stack en el editor; PK/foto/Crear reporte siguen por encima', () => {
    assert.match(formSrc, /OverlayStackProvider/)
    assert.match(formSrc, /zIndex:\s*100030/)
    assert.match(formSrc, /zIndex=\{100050\}/)
    assert.match(evidenciaSrc, /EVIDENCIA_MENU_Z_INDEX\s*=\s*100075/)
    assert.match(mapaSrc, /100050|zIndex/)
  })
})
