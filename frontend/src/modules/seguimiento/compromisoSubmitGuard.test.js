/**
 * Documenta el candado anti-doble-envío usado en CompromisoFormModal.
 * El patrón real es un useRef síncrono; aquí se valida la semántica.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

function createSubmitGuard() {
  let locked = false
  return {
    tryBegin() {
      if (locked) return false
      locked = true
      return true
    },
    release() {
      locked = false
    },
    get locked() {
      return locked
    },
  }
}

describe('compromiso submit guard', () => {
  it('solo permite un inicio de envío hasta liberar', () => {
    const g = createSubmitGuard()
    assert.equal(g.tryBegin(), true)
    assert.equal(g.tryBegin(), false)
    assert.equal(g.tryBegin(), false)
    g.release()
    assert.equal(g.tryBegin(), true)
  })

  it('tras éxito permanece bloqueado (el modal se cierra)', () => {
    const g = createSubmitGuard()
    assert.equal(g.tryBegin(), true)
    // no release on success
    assert.equal(g.tryBegin(), false)
    assert.equal(g.locked, true)
  })
})
