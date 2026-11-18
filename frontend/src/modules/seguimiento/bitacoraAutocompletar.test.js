/**
 * Contrato: Autocompletar usa el último diario diligenciado anterior a la fecha.
 * node --test src/modules/seguimiento/bitacoraAutocompletar.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const editorSrc = readFileSync(join(dir, 'BitacoraEntradaEditor.jsx'), 'utf8')
const apiSrc = readFileSync(join(dir, 'seguimientoApi.js'), 'utf8')

describe('bitacoraAutocompletar — último diario diligenciado', () => {
  it('API envía antes_de y acepta opts { antesDe }', () => {
    assert.match(apiSrc, /antes_de/)
    assert.match(apiSrc, /antesDe/)
    assert.match(apiSrc, /plantilla-autocompletar/)
  })

  it('editor pasa fecha del reporte y muestra popup si no hay fuente', () => {
    assert.match(editorSrc, /plantillaAutocompletarDiario\(\{\s*antesDe:\s*fecha\s*\}\)/)
    assert.match(editorSrc, /setAutoAviso/)
    assert.match(editorSrc, /Sin reporte anterior/)
    assert.match(editorSrc, /último Reporte Diario diligenciado/)
    assert.match(editorSrc, /CcConfirmModal/)
    // Sustituye asistencia (no concatena → no duplica)
    assert.match(editorSrc, /setAsistencia\(prevAsist\)/)
    assert.doesNotMatch(editorSrc, /setAsistencia\(\(prev\)\s*=>\s*\[\.\.\.prev/)
  })
})
