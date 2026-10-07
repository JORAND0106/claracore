import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  aplicarPasteGridTopo,
  esPasteMasivoTopo,
  esValorValidoCampoTopo,
  normalizarValorPasteTopo,
  parseClipboardGridTopo,
  puntoTopoVacio,
  valorPegadoParaCampo,
} from './sicoePortadaTopoPaste.js'

describe('sicoePortadaTopoPaste', () => {
  it('normaliza coma y miles es-CO', () => {
    assert.equal(normalizarValorPasteTopo('10,5'), '10.5')
    assert.equal(normalizarValorPasteTopo('1.234,56'), '1234.56')
    assert.equal(normalizarValorPasteTopo('980000.2'), '980000.2')
  })

  it('parsea bloque TSV y CSV', () => {
    const tsv = parseClipboardGridTopo('P1\t1100,5\t980\nP2\t1101\t981')
    assert.deepEqual(tsv, [
      ['P1', '1100,5', '980'],
      ['P2', '1101', '981'],
    ])
    const csv = parseClipboardGridTopo('A,1,2\nB,3,4')
    assert.equal(csv.length, 2)
    assert.equal(csv[0][0], 'A')
  })

  it('esPasteMasivoTopo distingue bloque vs celda única', () => {
    assert.equal(esPasteMasivoTopo('12.5'), false)
    assert.equal(esPasteMasivoTopo('a\tb\nc\td'), true)
    assert.equal(esPasteMasivoTopo('1\n2\n3'), true)
  })

  it('pega bloque completo 5×N desde Punto y crea filas', () => {
    const base = [puntoTopoVacio()]
    const grid = [
      ['P1', '1,5', '2', '10', 'Ini'],
      ['P2', '3', '4', '11', 'Fin'],
    ]
    const { filas, invalidas, mensaje } = aplicarPasteGridTopo(base, 0, 'punto', grid)
    assert.equal(filas.length, 2)
    assert.equal(filas[0].punto, 'P1')
    assert.equal(filas[0].norte, '1.5')
    assert.equal(filas[0].este, '2')
    assert.equal(filas[0].cota, '10')
    assert.equal(filas[0].descripcion, 'Ini')
    assert.equal(filas[1].punto, 'P2')
    assert.equal(invalidas.length, 0)
    assert.equal(mensaje, '')
  })

  it('pega solo una columna desde la celda activa sin tocar las demás', () => {
    const base = [
      { punto: 'A', norte: '100', este: '200', cota: '1', descripcion: 'x' },
      { punto: 'B', norte: '101', este: '201', cota: '2', descripcion: 'y' },
    ]
    const { filas } = aplicarPasteGridTopo(base, 0, 'norte', [['999'], ['888']])
    assert.equal(filas[0].norte, '999')
    assert.equal(filas[1].norte, '888')
    assert.equal(filas[0].este, '200')
    assert.equal(filas[0].punto, 'A')
    assert.equal(filas[1].descripcion, 'y')
  })

  it('reemplaza celdas existentes y extiende filas', () => {
    const base = [{ punto: 'Old', norte: '1', este: '2', cota: '', descripcion: '' }]
    const { filas } = aplicarPasteGridTopo(base, 0, 'punto', [
      ['N1', '10', '20'],
      ['N2', '11', '21'],
      ['N3', '12', '22'],
    ])
    assert.equal(filas.length, 3)
    assert.equal(filas[0].punto, 'N1')
    assert.equal(filas[0].norte, '10')
    assert.equal(filas[2].este, '22')
  })

  it('marca inválidos numéricos y conserva el resto', () => {
    const { filas, invalidas, mensaje } = aplicarPasteGridTopo(
      [puntoTopoVacio()],
      0,
      'norte',
      [['abc'], ['12,5']],
    )
    assert.equal(filas[0].norte, 'abc')
    assert.equal(filas[1].norte, '12.5')
    assert.equal(invalidas.length, 1)
    assert.equal(invalidas[0].campo, 'norte')
    assert.match(mensaje, /números válidos/i)
    assert.equal(esValorValidoCampoTopo('norte', 'abc'), false)
    assert.equal(esValorValidoCampoTopo('norte', '12,5'), true)
    assert.equal(valorPegadoParaCampo('descripcion', '  hola  '), 'hola')
  })
})
