/**
 * Regresión: onAbrirReporteSicoe debe llegar a TopografiaLayout (evita pantalla en blanco).
 * node --test frontend/src/components/topografia/topografiaMainOnAbrirReporte.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'TopografiaMain.jsx'), 'utf8')

describe('TopografiaMain onAbrirReporteSicoe', () => {
  it('TopografiaLayout declara y recibe onAbrirReporteSicoe', () => {
    assert.match(
      src,
      /function TopografiaLayout\(\{[^}]*onAbrirReporteSicoe[^}]*\}\)/,
    )
    assert.match(
      src,
      /<TopografiaLayout[\s\S]*onAbrirReporteSicoe=\{onAbrirReporteSicoe\}/,
    )
    assert.match(
      src,
      /const props = \{[^}]*onAbrirReporteSicoe[^}]*\}/,
    )
  })
})
