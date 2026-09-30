import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseTimestampUtc,
  formatFechaHoraColombia,
  formatFechaLogBogota,
  pareceTimestampIso,
  TZ_COLOMBIA,
} from './fechaColombia.js'

describe('fechaColombia', () => {
  it('exporta zona America/Bogota', () => {
    assert.equal(TZ_COLOMBIA, 'America/Bogota')
  })

  it('parsea +00:00 con microsegundos sin append de Z (bug del modal)', () => {
    const raw = '2026-09-16T16:27:27.68935+00:00'
    const d = parseTimestampUtc(raw)
    assert.ok(d instanceof Date)
    assert.ok(!Number.isNaN(d.getTime()))
    // 16:27 UTC → 11:27 Colombia
    assert.equal(d.toISOString().startsWith('2026-09-16T16:27:27'), true)
  })

  it('asume UTC cuando el string no trae huso', () => {
    const d = parseTimestampUtc('2026-09-16T16:27:27.68935')
    assert.ok(d)
    assert.equal(d.toISOString().startsWith('2026-09-16T16:27:27'), true)
  })

  it('formatea legible en Colombia sin fracciones de segundo', () => {
    const txt = formatFechaHoraColombia('2026-09-16T16:27:27.68935+00:00')
    assert.ok(!txt.includes('.689'))
    assert.ok(!/[+-]\d{2}:\d{2}/.test(txt), 'no debe mostrar offset crudo')
    assert.ok(!txt.includes('T'), 'no debe ser ISO')
    // 11:27 a.m. Colombia (UTC−5)
    assert.match(txt, /11:27/)
    assert.match(txt, /2026/)
    assert.match(txt, /sep/i)
  })

  it('formatFechaLogBogota es alias y convierte UTC→Colombia', () => {
    const a = formatFechaHoraColombia('2026-01-15T20:00:00Z')
    const b = formatFechaLogBogota('2026-01-15T20:00:00Z')
    assert.equal(a, b)
    // 20:00 UTC → 15:00 Bogotá → 3:00 p. m. con hour12
    assert.match(a, /3:00/)
    assert.match(a, /p\.?\s*m/i)
  })

  it('pareceTimestampIso detecta ISO y rechaza texto libre', () => {
    assert.equal(pareceTimestampIso('2026-09-16T16:27:27.68935+00:00'), true)
    assert.equal(pareceTimestampIso('2026-09-16'), true)
    assert.equal(pareceTimestampIso('hola'), false)
    assert.equal(pareceTimestampIso(12.5), false)
  })

  it('vacío → guión', () => {
    assert.equal(formatFechaHoraColombia(null), '—')
    assert.equal(formatFechaHoraColombia(''), '—')
  })
})
