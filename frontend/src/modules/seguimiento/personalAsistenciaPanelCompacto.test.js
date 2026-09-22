/**
 * Contrato visual: resumen por cargo en chips compactos (~25% ancho).
 * Run: node --test src/modules/seguimiento/personalAsistenciaPanelCompacto.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'PersonalAsistenciaPanel.jsx'), 'utf8')

describe('PersonalAsistenciaPanel — resumen compacto', () => {
  it('usa chips densos (no grid de tarjetas amplias) y tope ~25% en desktop', () => {
    assert.match(src, /renderCargoChips/)
    assert.doesNotMatch(src, /renderCargoCards/)
    assert.match(src, /maxWidth:\s*viewportCompact\s*\?\s*'100%'\s*:\s*'25%'/)
    assert.match(src, /bitacora-resumen-cargos-compacto/)
    assert.match(src, /display:\s*'flex'/)
    assert.match(src, /flexWrap:\s*'wrap'/)
  })

  it('conserva abrir detalle por clic (consolidado y por empresa)', () => {
    assert.match(src, /onClick=\{\(\)\s*=>\s*onOpen\(row\)\}/)
    assert.match(src, /onOpen:\s*openCargoConsolidado/)
    assert.match(src, /onOpen:\s*\(row\)\s*=>\s*openCargoDetalle\(grupo,\s*row\)/)
    assert.match(src, /PersonalCargoDetalleModal/)
  })
})
