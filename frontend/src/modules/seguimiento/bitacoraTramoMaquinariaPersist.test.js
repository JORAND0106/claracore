/**
 * UI: tras guardar Diario se rehidratan equipos_uso (tramo) desde la respuesta.
 * node --test src/modules/seguimiento/bitacoraTramoMaquinariaPersist.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const editorSrc = readFileSync(join(dir, 'BitacoraEntradaEditor.jsx'), 'utf8')
const helpersSrc = readFileSync(
  join(dir, '../../../..', 'backend/bitacora_service.py'),
  'utf8',
)

describe('Tramo Maquinaria — persistencia', () => {
  it('frontend rehidrata usos (y materiales) desde respuesta de guardado', () => {
    assert.match(editorSrc, /rowClean\.equipos_uso/)
    assert.match(editorSrc, /setUsos\(/)
    assert.match(editorSrc, /equipos_uso\.map\(usoFromApi\)/)
    assert.match(editorSrc, /tramo:\s*normalizeTramoValue\(u\.tramo\)/)
    assert.match(editorSrc, /buildUsosPayload[\s\S]*tramo:\s*normalizeTramoValue\(u\.tramo\)/)
  })

  it('backend _sync_usos no descarta tramo en el primer retry', () => {
    // El anti-patrón: pop(tramo) junto con preoperacionales en el mismo except
    assert.doesNotMatch(
      helpersSrc,
      /payload\.pop\("preoperacionales"[\s\S]{0,80}payload\.pop\("tramo"/,
    )
    assert.match(helpersSrc, /NUNCA descartar `tramo`/)
    assert.match(helpersSrc, /Reintentos progresivos/)
  })
})
