import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  coordRowsFromSeedTramo,
  seedTramoFromCoordRows,
  planillaParamsPatchFromSeed,
} from './esquemaTopoCoordsSync.js'

describe('esquemaTopoCoordsSync', () => {
  it('coordRowsFromSeedTramo: Inicio/Fin desde Magna GK', () => {
    const rows = coordRowsFromSeedTramo({
      norteIni: 1000001.5,
      esteIni: 900000.25,
      norteFin: 1000010,
      esteFin: 900020,
    })
    assert.equal(rows.length, 2)
    assert.equal(rows[0].num, 'Inicio')
    assert.equal(rows[1].num, 'Fin')
    assert.equal(rows[0].norte, 1000001.5)
    assert.equal(rows[1].este, 900020)
  })

  it('coordRowsFromSeedTramo: vacío si faltan datos', () => {
    assert.deepEqual(coordRowsFromSeedTramo(null), [])
    assert.deepEqual(coordRowsFromSeedTramo({ norteIni: 1 }), [])
  })

  it('seedTramoFromCoordRows: reconoce Inicio/Fin y round-trip', () => {
    const seed = {
      norteIni: 1.1, esteIni: 2.2, norteFin: 3.3, esteFin: 4.4,
    }
    const rows = coordRowsFromSeedTramo(seed)
    const back = seedTramoFromCoordRows(rows)
    assert.deepEqual(back, seed)
  })

  it('seedTramoFromCoordRows: usa primera/última si no hay etiquetas', () => {
    const back = seedTramoFromCoordRows([
      { num: 'A', norte: 10, este: 20 },
      { num: 'B', norte: 11, este: 21 },
      { num: 'C', norte: 12, este: 22 },
    ])
    assert.deepEqual(back, {
      norteIni: 10, esteIni: 20, norteFin: 12, esteFin: 22,
    })
  })

  it('planillaParamsPatchFromSeed: strings para inputs de planilla', () => {
    const patch = planillaParamsPatchFromSeed({
      norteIni: 100, esteIni: 200, norteFin: 300, esteFin: 400,
    })
    assert.deepEqual(patch, {
      norte_abs_inicial: '100',
      este_abs_inicial: '200',
      norte_abs_final: '300',
      este_abs_final: '400',
    })
  })
})
