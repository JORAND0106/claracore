import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  actaUsaEscrituraExpositor,
  puedeEditarTema,
  puedeGuardarAlgunTema,
} from './temaEscritura.js'

describe('temaEscritura', () => {
  it('activa con v>=2', () => {
    assert.equal(actaUsaEscrituraExpositor({ v: 1 }), false)
    assert.equal(actaUsaEscrituraExpositor({ v: 2 }), true)
    assert.equal(actaUsaEscrituraExpositor({ v: 1, temas_escritura_expositor: true }), true)
  })

  it('expositor y elaborador', () => {
    const idea = { expositor_usuario_id: 20 }
    assert.equal(puedeEditarTema({
      idea, usuarioId: 10, elaboradorId: 10, flujoTabs: { v: 2 },
    }), true)
    assert.equal(puedeEditarTema({
      idea, usuarioId: 20, elaboradorId: 10, flujoTabs: { v: 2 },
    }), true)
    assert.equal(puedeEditarTema({
      idea, usuarioId: 99, elaboradorId: 10, flujoTabs: { v: 2 },
    }), false)
  })

  it('legacy: solo quien puede editar el acta', () => {
    const idea = { expositor_usuario_id: 20 }
    assert.equal(puedeEditarTema({
      idea, usuarioId: 20, elaboradorId: 10, flujoTabs: { v: 1 }, puedeEditarActa: false,
    }), false)
    assert.equal(puedeEditarTema({
      idea, usuarioId: 10, elaboradorId: 10, flujoTabs: { v: 1 }, puedeEditarActa: true,
    }), true)
  })

  it('puedeGuardarAlgunTema', () => {
    assert.equal(puedeGuardarAlgunTema({
      ideas: [{ expositor_usuario_id: 20 }],
      usuarioId: 20,
      elaboradorId: 10,
      flujoTabs: { v: 2 },
    }), true)
    assert.equal(puedeGuardarAlgunTema({
      ideas: [{ expositor_usuario_id: 20 }],
      usuarioId: 99,
      elaboradorId: 10,
      flujoTabs: { v: 2 },
    }), false)
  })
})
