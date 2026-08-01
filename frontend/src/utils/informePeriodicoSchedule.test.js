import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  getActiveInformePeriodicoSlotId,
  INFORME_PERIODICO_SLOTS_PROD,
  isInformePeriodicoWeekday,
  isInformePeriodicoSlotCompleted,
  markInformePeriodicoSlotCompleted,
  shouldShowInformePeriodicoReminder,
} from './informePeriodicoSchedule.js'

function ensureLocalStorage() {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => {
      store.delete(k)
    },
  }
}

function d(y, m, day, h, min) {
  return new Date(y, m - 1, day, h, min, 0, 0)
}

describe('informePeriodicoSchedule', () => {
  beforeEach(() => ensureLocalStorage())

  it('lunes 9:00 activa ventana 0900', () => {
    const dt = d(2026, 8, 3, 9, 0) // lunes
    assert.equal(getActiveInformePeriodicoSlotId(dt), '2026-08-03_0900')
  })

  it('lunes 8:59 fuera de horario', () => {
    assert.equal(getActiveInformePeriodicoSlotId(d(2026, 8, 3, 8, 59)), null)
  })

  it('lunes 15:30 sigue en la única ventana 0900 del día', () => {
    assert.equal(getActiveInformePeriodicoSlotId(d(2026, 8, 3, 15, 30)), '2026-08-03_0900')
  })

  it('sábado fuera de horario', () => {
    assert.equal(isInformePeriodicoWeekday(d(2026, 8, 1, 10, 0)), false)
    assert.equal(getActiveInformePeriodicoSlotId(d(2026, 8, 1, 10, 0)), null)
  })

  it('horario de producción: una sola franja a las 9:00', () => {
    assert.equal(INFORME_PERIODICO_SLOTS_PROD.length, 1)
    assert.deepEqual(
      INFORME_PERIODICO_SLOTS_PROD.map((s) => s.key),
      ['0900'],
    )
  })

  it('persistencia por ventana horaria diaria', () => {
    const uid = 999001
    const cid = 2
    const slot = '2026-08-03_0900'
    const key = `cc_informe_periodico_v1_${uid}_${cid}_${slot}`
    localStorage.removeItem(key)
    assert.equal(isInformePeriodicoSlotCompleted(uid, cid, slot), false)
    assert.equal(shouldShowInformePeriodicoReminder(uid, cid, d(2026, 8, 3, 9, 15)), true)
    markInformePeriodicoSlotCompleted(uid, cid, slot)
    assert.equal(isInformePeriodicoSlotCompleted(uid, cid, slot), true)
    assert.equal(shouldShowInformePeriodicoReminder(uid, cid, d(2026, 8, 3, 9, 15)), false)
    localStorage.removeItem(key)
  })
})
