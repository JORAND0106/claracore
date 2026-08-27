import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  analizarCantidadesPorItem,
  compararRegistrosPorAbsInicio,
  costoDirectoDesdeListado,
  filtrarFilasPorAlerta,
  gruposFranjaSoloAlertas,
  modaEspesor,
  ordenarRegistrosVistaGeneral,
  parseAbsNum,
  resolverModoCantidadesPorItem,
  vuEfectivoFila,
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
    assert.ok(costoDirectoDesdeListado(10.5, 12345.67) > 0)
  })

  it('vuEfectivoFila prefiere VU de la fila', () => {
    assert.equal(vuEfectivoFila({ vlr_unitario_listado: 5000 }, 1000), 5000)
    assert.equal(vuEfectivoFila({ vlr_unitario_listado: 0 }, 1000), 1000)
    assert.equal(vuEfectivoFila({}, 0), 0)
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
    assert.equal(grupos.find((g) => g.infraestructura === 'Calzada').segmentos.filter((s) => s.solapa).length, 2)
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

  it('modo vacio / general / analisis', () => {
    assert.equal(resolverModoCantidadesPorItem({ busquedaActiva: false, payload: null }), 'vacio')
    assert.equal(resolverModoCantidadesPorItem({ busquedaActiva: true, payload: { modo: 'vacio', total: 0, items_distintos: 0 } }), 'vacio')
    assert.equal(resolverModoCantidadesPorItem({ busquedaActiva: true, payload: { modo: 'analisis', items_distintos: 1, total: 3 } }), 'analisis')
    assert.equal(resolverModoCantidadesPorItem({ busquedaActiva: true, payload: { modo: 'general', items_distintos: 4, total: 20 } }), 'general')
  })

  it('filtro accionable de alertas', () => {
    const regs = [
      { id: 1, capitulo: 'I', item_numero: '1.1', tramo: 'T1', infraestructura: 'Calzada', abs_inicio: 0, abs_final: 100, espesor: 0.1 },
      { id: 2, capitulo: 'I', item_numero: '1.1', tramo: 'T1', infraestructura: 'Calzada', abs_inicio: 90, abs_final: 150, espesor: 0.1 },
      { id: 3, capitulo: 'I', item_numero: '1.1', tramo: 'T1', infraestructura: 'Calzada', abs_inicio: 200, abs_final: 250, espesor: 0.2 },
    ]
    const { filas } = analizarCantidadesPorItem(regs)
    assert.equal(filtrarFilasPorAlerta(filas, 'solapes').length, 2)
    assert.equal(filtrarFilasPorAlerta(filas, 'vacios').length, 1)
    assert.equal(filtrarFilasPorAlerta(filas, 'espesores').length, 1)
    assert.equal(filtrarFilasPorAlerta(filas, 'todos').length, 3)
  })

  it('vista general ordena Ítem→Tramo→Infra→Abs sin alertas', () => {
    const regs = [
      { id: 2, capitulo: 'I', item_numero: '2.0', tramo: 'T1', infraestructura: 'A', abs_inicio: 10, abs_final: 20 },
      { id: 1, capitulo: 'I', item_numero: '1.0', tramo: 'T2', infraestructura: 'B', abs_inicio: 0, abs_final: 5 },
      { id: 3, capitulo: 'I', item_numero: '1.0', tramo: 'T1', infraestructura: 'A', abs_inicio: 50, abs_final: 60 },
    ]
    const filas = ordenarRegistrosVistaGeneral(regs)
    assert.deepEqual(filas.map((f) => f.id), [3, 1, 2])
    assert.equal(filas.every((f) => !f._alertaSolape), true)
  })

  it('franja solo incluye registros con alerta; grilla/análisis conserva totales', () => {
    const regs = [
      { id: 1, capitulo: 'I', item_numero: '1.1', tramo: 'T1', infraestructura: 'Calzada', abs_inicio: 0, abs_final: 50, espesor: 0.1, numero_registro: 10 },
      { id: 2, capitulo: 'I', item_numero: '1.1', tramo: 'T1', infraestructura: 'Calzada', abs_inicio: 50, abs_final: 100, espesor: 0.1, numero_registro: 11 }, // OK contiguo
      { id: 3, capitulo: 'I', item_numero: '1.1', tramo: 'T1', infraestructura: 'Calzada', abs_inicio: 90, abs_final: 140, espesor: 0.1, numero_registro: 12 }, // solape con 2
      { id: 4, capitulo: 'I', item_numero: '1.1', tramo: 'T1', infraestructura: 'Calzada', abs_inicio: 200, abs_final: 250, espesor: 0.25, numero_registro: 13 }, // vacío + espesor
    ]
    const { filas, grupos, resumen } = analizarCantidadesPorItem(regs)
    assert.equal(resumen.total, 4) // grilla/contadores: todos
    const franja = gruposFranjaSoloAlertas(filas, grupos)
    assert.equal(franja.length, 1)
    const ids = franja[0].segmentos.map((s) => s.id).sort((a, b) => a - b)
    // id 1 sin alerta; 2 y 3 solape; 4 vacío+espesor
    assert.deepEqual(ids, [2, 3, 4])
    assert.equal(franja[0].vaciosIntervalos.length, 0) // sin huecos falsos
    assert.ok(franja[0].segmentos.every((s) => s.solapa || s.alertaVacio || s.alertaEspesor))
    // Eje Abs del tramo completo (no solo del subconjunto con alerta)
    assert.equal(franja[0].minAbs, grupos[0].minAbs)
    assert.equal(franja[0].maxAbs, grupos[0].maxAbs)
    assert.ok(franja[0].minAbs != null && franja[0].maxAbs != null && franja[0].maxAbs > franja[0].minAbs)
  })
})
