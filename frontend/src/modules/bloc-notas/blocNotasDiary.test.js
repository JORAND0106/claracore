import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  colombiaDateKey,
  formatColombiaLongDate,
  formatColombiaLongDateFromKey,
  ensureDiaryDayInHtml,
  extractDayKeysFromHtml,
  initialDiaryHtml,
  ensureHandDayMark,
  buildSemanarioTableHtml,
  mondayOfWeek,
  weekDayHeaders,
} from './blocNotasDiary.js'

describe('bloc · bitácora por día y semanario', () => {
  it('fecha larga Colombia y clave YYYY-MM-DD', () => {
    const d = new Date('2026-11-07T15:00:00.000Z')
    assert.equal(colombiaDateKey(d), '2026-11-07')
    assert.match(formatColombiaLongDate(d), /noviembre de 2026/)
    assert.equal(formatColombiaLongDateFromKey('2026-11-07'), '07 de noviembre de 2026')
  })

  it('nota nueva arranca con fecha del día', () => {
    const html = initialDiaryHtml(new Date('2026-11-07T15:00:00.000Z'))
    assert.match(html, /data-bloc-day="2026-11-07"/)
    assert.match(html, /07 de noviembre de 2026/)
  })

  it('nuevo día agrega marcador; mismo día no duplica', () => {
    const day1 = initialDiaryHtml(new Date('2026-11-07T15:00:00.000Z'))
    const withText = `${day1}<p>obra</p>`
    const same = ensureDiaryDayInHtml(withText, {
      now: new Date('2026-11-07T20:00:00.000Z'),
      knownDays: extractDayKeysFromHtml(withText),
    })
    assert.equal(extractDayKeysFromHtml(same).filter((k) => k === '2026-11-07').length, 1)

    const next = ensureDiaryDayInHtml(withText, {
      now: new Date('2026-11-08T15:00:00.000Z'),
      knownDays: extractDayKeysFromHtml(withText),
    })
    const keys = extractDayKeysFromHtml(next)
    assert.ok(keys.includes('2026-11-07'))
    assert.ok(keys.includes('2026-11-08'))
    assert.match(next, /08 de noviembre de 2026/)
  })

  it('restaura marcador si el usuario lo borró', () => {
    const restored = ensureDiaryDayInHtml('<p>solo texto</p>', {
      now: new Date('2026-11-07T15:00:00.000Z'),
      knownDays: ['2026-11-07'],
    })
    assert.match(restored, /data-bloc-day="2026-11-07"/)
  })

  it('marca de día en escritura a mano', () => {
    const m1 = ensureHandDayMark([], [], new Date('2026-11-07T15:00:00.000Z'))
    assert.equal(m1.length, 1)
    assert.equal(m1[0].dateKey, '2026-11-07')
    const m2 = ensureHandDayMark(m1, [], new Date('2026-11-07T18:00:00.000Z'))
    assert.equal(m2.length, 1)
    const m3 = ensureHandDayMark(m1, [{ points: [{ x: 1, y: 200 }] }], new Date('2026-11-08T15:00:00.000Z'))
    assert.equal(m3.length, 2)
    assert.ok(m3[1].y > 200)
  })

  it('semanario: 7 columnas lun–dom', () => {
    const mon = mondayOfWeek(new Date('2026-11-07T15:00:00.000Z')) // sábado
    const headers = weekDayHeaders(mon)
    assert.equal(headers.length, 7)
    assert.match(headers[0], /^Lunes /)
    assert.match(headers[6], /^Domingo /)
    const html = buildSemanarioTableHtml(mon)
    assert.match(html, /<table/)
    assert.equal((html.match(/<th/g) || []).length, 7)
  })
})
