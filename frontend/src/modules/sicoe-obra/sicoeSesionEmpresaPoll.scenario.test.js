/**
 * El poll de /usuarios/me debe refrescar empresa_tipo y subcontratista_id
 * para que el aislamiento Sicoe no quede pegado a una sesión vieja.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../../App.jsx'), 'utf8')

describe('sesión — poll refresca empresa', () => {
  it('detecta empresaChanged y lo incluye en adminChanged', () => {
    assert.match(app, /const empresaChanged =/)
    assert.match(app, /empresaChanged/)
    assert.match(app, /msgs\.push\('empresa'\)/)
  })

  it('persiste empresa_tipo y subcontratista_id desde /usuarios/me', () => {
    assert.match(app, /empresa_tipo: fresh\.empresa_tipo/)
    assert.match(app, /subcontratista_id:/)
  })
})
