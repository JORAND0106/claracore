/**
 * Regresión: Seguimiento expone pestañas Calendario · Actas · Bitácora de Obra.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'ModuloSeguimiento.jsx'), 'utf8')

describe('ModuloSeguimiento — pestañas Bitácora', () => {
  it('declara las tres pestañas del ticket', () => {
    assert.match(src, /id:\s*'calendario'/)
    assert.match(src, /id:\s*'actas'/)
    assert.match(src, /id:\s*'bitacora'/)
    assert.match(src, /Bitácora de Obra/)
  })

  it('monta Calendario, ActasRepositorio y BitacoraPanel', () => {
    assert.match(src, /SeguimientoCalendarioPanel/)
    assert.match(src, /ActasRepositorio/)
    assert.match(src, /BitacoraPanel/)
  })

  it('oculta Bitácora sin permiso Ver', () => {
    assert.match(src, /permisosBitacora\.ver/)
  })
})
