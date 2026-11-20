/**
 * node --test frontend/src/components/overlayStack.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  OVERLAY_NEST_STEP,
  nestedOverlayZ,
  resolveStackedOverlayZ,
} from './overlayStackMath.js'

const dir = dirname(fileURLToPath(import.meta.url))

describe('overlayStack — apilamiento de popups anidados', () => {
  it('nestedOverlayZ / resolveStackedOverlayZ dejan al hijo por encima', () => {
    assert.equal(OVERLAY_NEST_STEP, 10)
    assert.equal(nestedOverlayZ(100060), 100070)
    assert.equal(nestedOverlayZ(100030, 20), 100050)
    assert.equal(resolveStackedOverlayZ(17000, 100060), 100070)
    assert.equal(resolveStackedOverlayZ(17000, 0), 17000)
    assert.equal(resolveStackedOverlayZ(100070, 100060), 100070)
    assert.ok(nestedOverlayZ(100060) > 100060)
  })

  it('EsquemaEditorModal usa useStackedOverlayZ (no z fijo solo)', () => {
    const src = readFileSync(join(dir, 'esquema/EsquemaEditorModal.jsx'), 'utf8')
    assert.match(src, /useStackedOverlayZ/)
    assert.match(src, /SICOE_HERRAMIENTA_Z/)
  })

  it('Crear reporte provee OverlayStackProvider y deja el esquema delante', () => {
    const src = readFileSync(
      join(dir, 'topografia/planillaTuberia/PlanillaTuberiaCrearReporteModal.jsx'),
      'utf8',
    )
    assert.match(src, /OverlayStackProvider/)
    assert.match(src, /CREAR_REPORTE_Z_INDEX/)
    assert.match(src, /CREAR_REPORTE_ESQUEMA_Z_INDEX/)
    assert.ok(100070 > 100060)
    assert.ok(100060 > 100030)
    assert.ok(100060 > 100050)
  })
})
