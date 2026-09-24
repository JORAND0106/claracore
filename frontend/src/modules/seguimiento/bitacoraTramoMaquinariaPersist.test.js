/**
 * Regresión: tras guardar, no rehidratar maquinaria vacía si se enviaron usos
 * (el DELETE+insert silencioso del backend dejaba la UI en blanco).
 * Timeout PDF diario vuelve a 45s (120s ocultaba la lentitud).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const editorSrc = readFileSync(join(dir, 'BitacoraEntradaEditor.jsx'), 'utf8')
const apiSrc = readFileSync(join(dir, 'seguimientoApi.js'), 'utf8')

describe('bitacora guardado + PDF timeout', () => {
  it('no limpia usos locales si el servidor devuelve equipos_uso vacío tras enviar datos', () => {
    assert.match(editorSrc, /usosPayload\.length > 0 && rowClean\.equipos_uso\.length === 0/)
    assert.match(editorSrc, /La maquinaria no se persistió/)
    assert.match(editorSrc, /materialesPayload\.length > 0 && rowClean\.materiales\.length === 0/)
  })

  it('export PDF diario usa timeout 45s (no 120s que ocultaba la lentitud)', () => {
    const idx = apiSrc.indexOf('exportBitacoraPdfBlob')
    assert.ok(idx >= 0)
    const chunk = apiSrc.slice(idx, idx + 900)
    assert.match(chunk, /apiFetchSignal\(45000\)/)
    assert.doesNotMatch(chunk, /apiFetchSignal\(120000\)/)
  })
})
