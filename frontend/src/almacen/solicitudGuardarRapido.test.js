/**
 * Guardar solicitud: un solo envío y reintento de lo que quedó en segundo plano.
 * node --test src/almacen/solicitudGuardarRapido.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const form = readFileSync(join(dir, 'SolicitudForm.jsx'), 'utf8')
const api = readFileSync(join(dir, 'almacenApi.js'), 'utf8')

describe('guardar solicitud', () => {
  it('muestra que trabaja y no deja disparar dos veces', () => {
    assert.match(form, /guardandoRef/)
    assert.match(form, /if \(guardandoRef\.current\) return/)
    assert.match(form, /data-testid="solicitud-guardar"/)
    assert.match(form, /disabled=\{busy\}/)
    assert.match(form, /Guardando…/)
  })

  it('un fallo en segundo plano se ve y se puede reintentar', () => {
    assert.match(form, /data-testid="solicitud-reintentar-tareas"/)
    assert.match(form, /solicitud-tareas-fondo-error/)
    assert.match(api, /solicitudes\/\$\{id\}\/tareas-fondo/)
  })
})
