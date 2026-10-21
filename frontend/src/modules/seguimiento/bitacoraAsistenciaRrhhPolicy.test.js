/**
 * Run: node --test src/modules/seguimiento/bitacoraAsistenciaRrhhPolicy.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  policySnapshotAsistenciaRrhh,
  trabajadorEsNuevoTrasApagado,
} from './bitacoraAsistenciaRrhhPolicy.js'

const dir = dirname(fileURLToPath(import.meta.url))

describe('bitacoraAsistenciaRrhhPolicy — personal nuevo', () => {
  it('detecta creado después de apagada_en', () => {
    assert.equal(
      trabajadorEsNuevoTrasApagado('2026-10-21T20:00:00-05:00', '2026-10-21T18:00:00-05:00'),
      true,
    )
    assert.equal(
      trabajadorEsNuevoTrasApagado('2026-10-21T17:00:00-05:00', '2026-10-21T18:00:00-05:00'),
      false,
    )
    assert.equal(trabajadorEsNuevoTrasApagado('2026-10-21T20:00:00-05:00', null), false)
  })

  it('snapshot incluye campos de auditoría del interruptor', () => {
    const s = policySnapshotAsistenciaRrhh({
      contratoId: 3,
      activaEnExento: false,
      apagadaEn: '2026-10-21T19:00:00-05:00',
    })
    assert.equal(s.apagada_en, '2026-10-21T19:00:00-05:00')
    assert.equal(s.activa_en_exento, false)
  })

  it('toggle UI es interruptor on/off', () => {
    const src = readFileSync(join(dir, 'BitacoraAsistenciaRrhhToggle.jsx'), 'utf8')
    assert.match(src, /aria-pressed/)
    assert.match(src, /Restricción activa|Sin restricción/)
    assert.match(src, /Interruptor/)
  })
})
