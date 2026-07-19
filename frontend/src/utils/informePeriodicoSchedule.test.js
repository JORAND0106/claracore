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
  it('lunes 8:00 activa ventana 0800', () => {
    const dt = d(2026, 7, 20, 8, 0) // lunes
    assert.equal(getActiveInformePeriodicoSlotId(dt), '2026-07-20_0800')
  })

  it('lunes 10:29 sigue en ventana 0800', () => {
    assert.equal(getActiveInformePeriodicoSlotId(d(2026, 7, 20, 10, 29)), '2026-07-20_0800')
  })

  it('lunes 10:30 activa ventana 1030', () => {
    assert.equal(getActiveInformePeriodicoSlotId(d(2026, 7, 20, 10, 30)), '2026-07-20_1030')
  })

  it('lunes 7:59 fuera de horario', () => {
    assert.equal(getActiveInformePeriodicoSlotId(d(2026, 7, 20, 7, 59)), null)
  })

  it('sábado fuera de horario (prod: sin slot dev en tests node)', () => {
    assert.equal(isInformePeriodicoWeekday(d(2026, 7, 18, 10, 0)), false)
    assert.equal(getActiveInformePeriodicoSlotId(d(2026, 7, 18, 10, 0)), null)
  })

  it('horarios de producción intactos (4 franjas)', () => {
    assert.equal(INFORME_PERIODICO_SLOTS_PROD.length, 4)
    assert.deepEqual(
      INFORME_PERIODICO_SLOTS_PROD.map((s) => s.key),
      ['0800', '1030', '1300', '1530'],
    )
  })

  it('persistencia por ventana horaria', () => {
    const uid = 999001
    const cid = 2
    const slot = '2026-07-20_1300'
    const key = `cc_informe_periodico_v1_${uid}_${cid}_${slot}`
    localStorage.removeItem(key)
    assert.equal(isInformePeriodicoSlotCompleted(uid, cid, slot), false)
    assert.equal(shouldShowInformePeriodicoReminder(uid, cid, d(2026, 7, 20, 13, 15)), true)
    markInformePeriodicoSlotCompleted(uid, cid, slot)
    assert.equal(isInformePeriodicoSlotCompleted(uid, cid, slot), true)
    assert.equal(shouldShowInformePeriodicoReminder(uid, cid, d(2026, 7, 20, 13, 15)), false)
    localStorage.removeItem(key)
  })
})
