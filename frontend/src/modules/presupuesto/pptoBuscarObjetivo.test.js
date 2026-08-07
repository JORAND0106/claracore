import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularBuscarObjetivo,
  cantParaCostoObjetivo,
  cantTotalExacta,
  cantTotalFromDims,
  costoDirectoFromCant,
  despejarDimension,
  labelAreaLongNodo,
  puedeDespejarDimension,
} from './pptoBuscarObjetivo.js'

describe('cantTotalFromDims / costoDirectoFromCant', () => {
  it('modo producto: área × ancho × espesor (2 dp, edición normal)', () => {
    assert.equal(cantTotalFromDims(10, 2, 0.5), 10)
    assert.equal(costoDirectoFromCant(10, 1500.4), 15004)
  })

  it('modo simple: solo área cuando ancho y espesor son 0', () => {
    assert.equal(cantTotalFromDims(7.555, 0, 0), 7.56)
    assert.equal(cantTotalFromDims(3, 0, 0), 3)
  })
})

describe('cantTotalExacta', () => {
  it('no redondea a 2 dp', () => {
    const c = cantTotalExacta(125.5, 2.4, 0.21387749004)
    assert.ok(Math.abs(c - 125.5 * 2.4 * 0.21387749004) < 1e-9)
    assert.notEqual(Math.round(c * 100) / 100, c)
  })
})

describe('labelAreaLongNodo', () => {
  it('etiqueta según tipo_entidad', () => {
    assert.equal(labelAreaLongNodo('Área'), 'Área')
    assert.equal(labelAreaLongNodo('Longitud/Tramo'), 'Longitud')
    assert.equal(labelAreaLongNodo('Nodo'), 'Nodo')
    assert.equal(labelAreaLongNodo(''), 'Área/Long/Nodo')
  })
})

describe('puedeDespejarDimension', () => {
  it('en modo simple solo permite área_long_nod', () => {
    assert.equal(puedeDespejarDimension('area_long_nod', 5, 0, 0).ok, true)
    assert.equal(puedeDespejarDimension('ancho', 5, 0, 0).ok, false)
    assert.equal(puedeDespejarDimension('espesor', 5, 0, 0).ok, false)
  })

  it('en modo producto exige denominador ≠ 0', () => {
    assert.equal(puedeDespejarDimension('ancho', 10, 2, 0.5).ok, true)
    assert.equal(puedeDespejarDimension('espesor', 10, 2, 0.5).ok, true)
    assert.equal(puedeDespejarDimension('area_long_nod', 10, 2, 0).ok, false)
  })
})

describe('despejarDimension', () => {
  it('despeja cada dimensión manteniendo las otras', () => {
    assert.equal(despejarDimension('area_long_nod', 20, 10, 2, 0.5), 20 / (2 * 0.5))
    assert.equal(despejarDimension('ancho', 20, 10, 2, 0.5), 20 / (10 * 0.5))
    assert.equal(despejarDimension('espesor', 20, 10, 2, 0.5), 20 / (10 * 2))
  })

  it('modo simple: área = cant', () => {
    assert.equal(despejarDimension('area_long_nod', 12.34, 1, 0, 0), 12.34)
  })
})

describe('calcularBuscarObjetivo', () => {
  it('ajusta espesor y cierra exactamente en el objetivo', () => {
    const r = calcularBuscarObjetivo({
      presupuestoActual: 1_000_000,
      presupuestoObjetivo: 1_005_000,
      costoDirectoRegistro: 10_000,
      vlrUnitario: 1000,
      area: 10,
      ancho: 2,
      espesor: 0.5,
      dimension: 'espesor',
    })
    assert.equal(r.ok, true)
    assert.equal(r.dimActual, 0.5)
    assert.equal(r.dimNueva, 0.75)
    assert.equal(r.cantNueva, 15)
    assert.equal(r.cdRegistroNuevo, 15_000)
    assert.equal(r.totalNuevo, 1_005_000)
  })

  it('cierra exacto aunque el VU no divida limpio a 2 dp', () => {
    // Con round(cant, 2) el CD no alcanzaría el objetivo; con precisión completa sí.
    const actual = 18_450_320_000
    const objetivo = 20_000_000_000
    const cdOld = 3_840_300
    const vlr = 85_123
    const r = calcularBuscarObjetivo({
      presupuestoActual: actual,
      presupuestoObjetivo: objetivo,
      costoDirectoRegistro: cdOld,
      vlrUnitario: vlr,
      area: 125.5,
      ancho: 2.4,
      espesor: 0.15,
      dimension: 'espesor',
    })
    assert.equal(r.ok, true)
    assert.equal(r.totalNuevo, objetivo)
    assert.equal(r.cdRegistroNuevo, cdOld + (objetivo - actual))
    // cant exacta = CD / vlr (no truncada a 2 dp)
    const cantEsperada = r.cdRegistroNuevo / vlr
    assert.ok(Math.abs(r.cantNueva - cantEsperada) < 1e-9)
    // Con 2 dp habría desfase en round(cant×vlr)
    const cant2 = Math.round(cantEsperada * 100) / 100
    assert.notEqual(Math.round(cant2 * vlr), r.cdRegistroNuevo)
  })

  it('ajusta área en modo nodo (ancho=espesor=0)', () => {
    const r = calcularBuscarObjetivo({
      presupuestoActual: 500_000,
      presupuestoObjetivo: 490_000,
      costoDirectoRegistro: 20_000,
      vlrUnitario: 10_000,
      area: 2,
      ancho: 0,
      espesor: 0,
      dimension: 'area_long_nod',
    })
    assert.equal(r.ok, true)
    assert.equal(r.dimNueva, 1)
    assert.equal(r.totalNuevo, 490_000)
  })

  it('rechaza si el CD del registro quedaría negativo', () => {
    const r = calcularBuscarObjetivo({
      presupuestoActual: 100_000,
      presupuestoObjetivo: 50_000,
      costoDirectoRegistro: 40_000,
      vlrUnitario: 1000,
      area: 40,
      ancho: 0,
      espesor: 0,
      dimension: 'area_long_nod',
    })
    assert.equal(r.ok, false)
    assert.match(r.error || '', /negativo/i)
  })
})

describe('cantParaCostoObjetivo', () => {
  it('devuelve CD/vlr sin truncar a 2 dp', () => {
    const cant = cantParaCostoObjetivo(10, 3)
    assert.equal(cant, 10 / 3)
  })
})
