/**
 * PDF cartera: filas compactas (~40% menos altura) sin perder legibilidad.
 * node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaPdfCarteraCompacta.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const routesSrc = readFileSync(
  join(dir, '../../../../../backend/topografia_planilla_tuberia_routes.py'),
  'utf8',
)

describe('PDF cartera compacta', () => {
  it('cartera usa padding/fuente/line-height reducidos (~40%)', () => {
    assert.match(
      routesSrc,
      /table\.sheet\.cartera th,table\.sheet\.cartera td\{\{padding:1px 3px;font-size:5\.5pt;line-height:1\.0\}\}/,
    )
    assert.match(
      routesSrc,
      /table\.sheet\.cartera th\{\{font-size:5pt;background:#B0B0B0/,
    )
    // Resumen no tocado (sigue más holgado que cartera)
    assert.match(
      routesSrc,
      /table\.sheet\.resumen th,table\.sheet\.resumen td\{\{padding:2px 3px;font-size:6\.5pt/,
    )
  })
})
