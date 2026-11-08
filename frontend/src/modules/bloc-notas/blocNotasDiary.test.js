import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  colombiaDateKey,
  formatColombiaLongDate,
  formatColombiaLongDateFromKey,
  parseLongDateLabelToKey,
  ensureDiaryDayInHtml,
  dedupeDiaryDaysInHtml,
  dedupeHandDayMarks,
  extractDayKeysFromHtml,
  initialDiaryHtml,
  ensureHandDayMark,
  buildSemanarioTableHtml,
  mondayOfWeek,
  weekDayHeaders,
  dayMarkerHtml,
} from './blocNotasDiary.js'

describe('bloc · bitácora por día y semanario', () => {
  it('fecha larga Colombia y clave YYYY-MM-DD', () => {
    const d = new Date('2026-11-07T15:00:00.000Z')
    assert.equal(colombiaDateKey(d), '2026-11-07')
    assert.match(formatColombiaLongDate(d), /noviembre de 2026/)
    assert.equal(formatColombiaLongDateFromKey('2026-11-07'), '07 de noviembre de 2026')
    assert.equal(parseLongDateLabelToKey('07 de noviembre de 2026'), '2026-11-07')
  })

  it('nota nueva arranca con fecha del día', () => {
    const html = initialDiaryHtml(new Date('2026-11-07T15:00:00.000Z'))
    assert.match(html, /data-bloc-day="2026-11-07"/)
    assert.match(html, /07 de noviembre de 2026/)
    assert.equal(extractDayKeysFromHtml(html).filter((k) => k === '2026-11-07').length, 1)
  })

  it('varias escrituras el mismo día: una sola fecha', () => {
    let html = initialDiaryHtml(new Date('2026-11-07T15:00:00.000Z'))
    html = ensureDiaryDayInHtml(`${html}<p>primera</p>`, {
      now: new Date('2026-11-07T16:00:00.000Z'),
    })
    html = ensureDiaryDayInHtml(`${html}<p>segunda</p>`, {
      now: new Date('2026-11-07T18:00:00.000Z'),
    })
    html = ensureDiaryDayInHtml(`${html}<p>tercera</p>`, {
      now: new Date('2026-11-07T22:00:00.000Z'),
    })
    const keys = extractDayKeysFromHtml(html)
    assert.equal(keys.filter((k) => k === '2026-11-07').length, 1)
    assert.match(html, /primera/)
    assert.match(html, /segunda/)
    assert.match(html, /tercera/)
  })

  it('TipTap despoja data-bloc-day: reetiqueta y no duplica al seguir escribiendo', () => {
    // Simula getHTML() sin atributos (solo el texto de la fecha)
    const stripped = [
      '<p><strong>07 de noviembre de 2026</strong></p>',
      '<p>obra A</p>',
      '<p>obra B</p>',
    ].join('')
    const fixed = ensureDiaryDayInHtml(stripped, {
      now: new Date('2026-11-07T20:00:00.000Z'),
    })
    assert.equal(extractDayKeysFromHtml(fixed).filter((k) => k === '2026-11-07').length, 1)
    assert.match(fixed, /data-bloc-day="2026-11-07"/)
    assert.match(fixed, /obra A/)
    assert.match(fixed, /obra B/)
    // Segunda pasada (otra escritura el mismo día)
    const again = ensureDiaryDayInHtml(`${fixed}<p>obra C</p>`, {
      now: new Date('2026-11-07T21:00:00.000Z'),
    })
    assert.equal((again.match(/data-bloc-day="2026-11-07"/g) || []).length, 1)
    assert.equal((again.match(/07 de noviembre de 2026/g) || []).length, 1)
  })

  it('día nuevo inserta una sola fecha; escribir otra vez ese día no la repite', () => {
    const day1 = `${initialDiaryHtml(new Date('2026-11-07T15:00:00.000Z'))}<p>ayer</p>`
    const next = ensureDiaryDayInHtml(day1, {
      now: new Date('2026-11-08T15:00:00.000Z'),
    })
    const keys = extractDayKeysFromHtml(next)
    assert.deepEqual(keys, ['2026-11-07', '2026-11-08'])
    assert.match(next, /08 de noviembre de 2026/)

    const sameNewDay = ensureDiaryDayInHtml(`${next}<p>hoy otra vez</p>`, {
      now: new Date('2026-11-08T19:00:00.000Z'),
    })
    assert.equal(
      extractDayKeysFromHtml(sameNewDay).filter((k) => k === '2026-11-08').length,
      1,
    )
  })

  it('dedupe elimina fechas repetidas del mismo día y conserva contenido', () => {
    const dirty = [
      dayMarkerHtml('2026-11-07'),
      '<p>alpha</p>',
      dayMarkerHtml('2026-11-07'),
      '<p>beta</p>',
      '<p><strong>07 de noviembre de 2026</strong></p>',
      '<p>gamma</p>',
      dayMarkerHtml('2026-11-08'),
      '<p>delta</p>',
    ].join('')
    const clean = dedupeDiaryDaysInHtml(dirty)
    assert.equal((clean.match(/07 de noviembre de 2026/g) || []).length, 1)
    assert.equal((clean.match(/08 de noviembre de 2026/g) || []).length, 1)
    assert.match(clean, /alpha/)
    assert.match(clean, /beta/)
    assert.match(clean, /gamma/)
    assert.match(clean, /delta/)
    assert.deepEqual(extractDayKeysFromHtml(clean), ['2026-11-07', '2026-11-08'])
  })

  it('ensureDiaryDayInHtml con insertToday=false no agrega fecha (abrir sin escribir)', () => {
    const html = '<p>solo texto sin fecha</p>'
    const out = ensureDiaryDayInHtml(html, {
      now: new Date('2026-11-09T15:00:00.000Z'),
      insertToday: false,
    })
    assert.equal(extractDayKeysFromHtml(out).includes('2026-11-09'), false)
  })

  it('marca de día en escritura a mano: una por día', () => {
    const m1 = ensureHandDayMark([], [], new Date('2026-11-07T15:00:00.000Z'))
    assert.equal(m1.length, 1)
    assert.equal(m1[0].dateKey, '2026-11-07')
    const m2 = ensureHandDayMark(m1, [], new Date('2026-11-07T18:00:00.000Z'))
    assert.equal(m2.length, 1)
    const m3 = ensureHandDayMark(m1, [{ points: [{ x: 1, y: 200 }] }], new Date('2026-11-08T15:00:00.000Z'))
    assert.equal(m3.length, 2)
    assert.ok(m3[1].y > 200)
    const duped = dedupeHandDayMarks([
      ...m3,
      { dateKey: '2026-11-07', label: 'x', y: 999 },
    ])
    assert.equal(duped.length, 2)
    assert.equal(duped.filter((m) => m.dateKey === '2026-11-07').length, 1)
  })

  it('semanario: 7 columnas lun–dom', () => {
    const mon = mondayOfWeek(new Date('2026-11-07T15:00:00.000Z'))
    const headers = weekDayHeaders(mon)
    assert.equal(headers.length, 7)
    assert.match(headers[0], /^Lunes /)
    assert.match(headers[6], /^Domingo /)
    const html = buildSemanarioTableHtml(mon)
    assert.match(html, /<table/)
    assert.equal((html.match(/<th/g) || []).length, 7)
  })
})
