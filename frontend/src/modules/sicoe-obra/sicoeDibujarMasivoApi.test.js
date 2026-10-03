import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  mergeResumenDibujo,
  progresoDibujoPct,
  resumenDibujoVacio,
} from './sicoeDibujarMasivoApi.js'

describe('sicoeDibujarMasivoApi', () => {
  it('merge y progreso', () => {
    const a = { ...resumenDibujoVacio(), precisos: 2, procesados: 2 }
    const b = { ...resumenDibujoVacio(), aproximados: 1, procesados: 1, con_inconsistencia: 1 }
    const m = mergeResumenDibujo(a, b)
    assert.equal(m.precisos, 2)
    assert.equal(m.aproximados, 1)
    assert.equal(m.procesados, 3)
    assert.equal(m.con_inconsistencia, 1)
    assert.equal(progresoDibujoPct({ procesados: 25, total: 100 }), 25)
    assert.equal(progresoDibujoPct({ procesados: 0, total: 0 }), 0)
  })
})
