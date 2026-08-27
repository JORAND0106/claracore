import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  analizarCantidadesPorItem,
  compararRegistrosPorAbsInicio,
  costoDirectoDesdeListado,
  modaEspesor,
  parseAbsNum,
} from './sicoeCantidadesPorItemHelpers.js'

describe('sicoeCantidadesPorItemHelpers', () => {
  it('parseAbsNum y modaEspesor', () => {
    assert.equal(parseAbsNum('12.5'), 12.5)
    assert.equal(parseAbsNum(''), null)
    assert.equal(modaEspesor([0.1, 0.1, 0.2, 0.1, 0.3]), 0.1)
    assert.equal(modaEspesor([null, '', undefined]), null)
  })

  it('costoDirectoDesdeListado usa VU listado (no stored)', () => {
    assert.equal(costoDirectoDesdeListado(10.555, 1000), 10560) // round(10.56*1000)
    assert.equal(costoDirectoDesdeListado(2, 1500.4), 3001)
    assert.equal(costoDirectoDesdeListado(5, 0), 0)
  })

  it('detecta solape dentro del mismo tramo+infra', () => {
    const regs = [
      { id: 1, capitulo: 'I', item_numero: '1.1', tramo: 'T1', infraestructura: 'Calzada', abs_inicio: 0, abs_final: 100, espesor: 0.1 },
      { id: 2, capitulo: 'I', item_numero: '1.1', tramo: 'T1', infraestructura: 'Calzada', abs_inicio: 80, abs_final: 150, espesor: 0.1 },
      { id: 3, capitulo: 'I', item_numero: '1.1', tramo: 'T1', infraestructura: 'Anden', abs_inicio: 80, abs_final: 150, espesor: 0.1 },
    ]
    const { filas, resumen, grupos } = analizarCantidadesPorItem(regs)
    assert.equal(resumen.solapes, 2) // ambas filas del grupo Calzada
    assert.equal(filas.find((f) => f.id === 1)._alertaSolape, true)
    assert.equal(filas.find((f) => f.id === 2)._alertaSolape, true)
    assert.equal(filas.find((f) => f.id === 3)._alertaSolape, false) // otro infra
    assert.equal(grupos.length, 2)
  })

  it('detecta vacío entre registros consecutivos', () => {
    const regs = [
      { id: 1, capitulo: 'I', item_numero: '2.1', tramo: 'T1', infraestructura: 'Calzada', abs_inicio: 0, abs_final: 50, espesor: 0.15 },
      { id: 2, capitulo: 'I', item_numero: '2.1', tramo: 'T1', infraestructura: 'Calzada', abs_inicio: 70, abs_final: 100, espesor: 0.15 },
    ]
    const { filas, resumen } = analizarCantidadesPorItem(regs)
    assert.equal(resumen.vacios, 1)
    const f2 = filas.find((f) => f.id === 2)
    assert.ok(f2._alertaVacioAntes)
    assert.equal(f2._alertaVacioAntes.desde, 50)
    assert.equal(f2._alertaVacioAntes.hasta, 70)
    assert.equal(f2._alertaVacioAntes.brecha, 20)
  })

  it('detecta espesor atípico por moda del grupo', () => {
    const regs = [
      { id: 1, capitulo: 'II', item_numero: '3.1', tramo: 'A', infraestructura: 'X', abs_inicio: 0, abs_final: 10, espesor: 0.2 },
      { id: 2, capitulo: 'II', item_numero: '3.1', tramo: 'A', infraestructura: 'X', abs_inicio: 10, abs_final: 20, espesor: 0.2 },
      { id: 3, capitulo: 'II', item_numero: '3.1', tramo: 'A', infraestructura: 'X', abs_inicio: 20, abs_final: 30, espesor: 0.2 },
      { id: 4, capitulo: 'II', item_numero: '3.1', tramo: 'A', infraestructura: 'X', abs_inicio: 30, abs_final: 40, espesor: 0.35 },
    ]
    const { filas, resumen } = analizarCantidadesPorItem(regs)
    assert.equal(resumen.espesoresAtipicos, 1)
    assert.equal(filas.find((f) => f.id === 4)._alertaEspesorAtipico, true)
    assert.equal(filas.find((f) => f.id === 1)._alertaEspesorAtipico, false)
    assert.equal(filas.find((f) => f.id === 4)._espesorModaGrupo, 0.2)
  })

  it('ordena por abs_inicio ascendente dentro del grupo', () => {
    const a = { id: 2, abs_inicio: 100 }
    const b = { id: 1, abs_inicio: 50 }
    assert.ok(compararRegistrosPorAbsInicio(b, a) < 0)
  })

  it('no mezcla tramos distintos al detectar solape', () => {
    const regs = [
      { id: 1, capitulo: 'I', item_numero: '1.1', tramo: 'T1', infraestructura: 'Calzada', abs_inicio: 0, abs_final: 100, espesor: 0.1 },
      { id: 2, capitulo: 'I', item_numero: '1.1', tramo: 'T2', infraestructura: 'Calzada', abs_inicio: 50, abs_final: 120, espesor: 0.1 },
    ]
    const { resumen } = analizarCantidadesPorItem(regs)
    assert.equal(resumen.solapes, 0)
    assert.equal(resumen.vacios, 0)
  })
})
