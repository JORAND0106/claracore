/**
 * Mensajes de error al guardar solicitud (regresión: no ocultar esquema).
 * node --test frontend/src/almacen/solicitudFormHelpers.error.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'solicitudFormHelpers.js'), 'utf8')

describe('parseSolicitudApiError', () => {
  it('ya no mapea APIError/PGRST a mensaje genérico de error interno', () => {
    assert.doesNotMatch(
      src,
      /if \(\/APIError\|PGRST\|schema cache\|column\.\*could not find\/i\.test\(raw\)\) \{\s*return 'No se pudo guardar la solicitud por un error interno/,
    )
  })

  it('expone detalle de esquema y base de datos', () => {
    assert.match(src, /descripcion_solicitada\|migración\|NOTIFY pgrst/)
    assert.match(src, /Error de base de datos al guardar la solicitud/)
    assert.match(src, /"message"\\s\*:\\s\*"\(\[\^"\]\+\)"/)
  })
})
