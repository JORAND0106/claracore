/**
 * Round-trip de persistencia cartera (filas → lecturas → filas).
 * node --test frontend/src/utils/topografia_nivelacion_guardar_cartera.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  filasToLecturas,
  lecturasToFilas,
  nuevaFilaCierre,
  nuevaFilaPunto,
  prepararBorradorBmInicial,
} from './topografia_nivelacion.js'

describe('Guardar cartera — round-trip de persistencia', () => {
  it('no pierde V+/Vi/V− ni fila de cierre al serializar', () => {
    const filas = [
      {
        ...prepararBorradorBmInicial('BM-INI'),
        abscisa: '0',
        vplus: { lectura: '1.500', hS: '', hM: '', hI: '' },
        dist_vplus_m: 35,
      },
      {
        ...nuevaFilaPunto(2, false),
        nombre_punto: 'Aux-1',
        tipo_punto: 'auxiliar',
        vi: { lectura: '1.200', hS: '', hM: '', hI: '' },
      },
      {
        ...nuevaFilaPunto(3, false),
        nombre_punto: 'TP-1',
        tipo_punto: 'cambio',
        vminus: { lectura: '1.050', hS: '', hM: '', hI: '' },
        dist_vminus_m: 32,
        vplus: { lectura: '1.310', hS: '', hM: '', hI: '' },
        dist_vplus_m: 29,
      },
      {
        ...nuevaFilaCierre({ id: 'bm', nombre: 'BM-INI', cota: 100 }, 4, '90'),
        vminus: { lectura: '1.400', hS: '', hM: '', hI: '' },
        dist_vminus_m: 30,
      },
    ]

    const lecturas = filasToLecturas(filas, 'electronico')
    assert.ok(lecturas.length >= 5, 'debe emitir varias lecturas API')
    assert.ok(lecturas.every((l) => l.nombre_punto && l.tipo_lectura))

    const back = lecturasToFilas(lecturas, 'electronico')
    assert.equal(back.length, filas.length)
    assert.equal(back[0].nombre_punto, 'BM-INI')
    assert.equal(Number(back[0].vplus.lectura), 1.5)
    assert.equal(Number(back[1].vi.lectura), 1.2)
    assert.equal(Number(back[2].vminus.lectura), 1.05)
    assert.equal(Number(back[2].vplus.lectura), 1.31)
    assert.equal(back[3].es_fila_cierre, true)
    assert.equal(Number(back[3].vminus.lectura), 1.4)

    // Segundo round-trip (reabrir y guardar de nuevo) estable
    const lecturas2 = filasToLecturas(back, 'electronico')
    assert.equal(lecturas2.length, lecturas.length)
    assert.deepEqual(
      lecturas2.map((l) => [l.orden, l.tipo_lectura, Number(l.lectura)]),
      lecturas.map((l) => [l.orden, l.tipo_lectura, Number(l.lectura)]),
    )
  })

  it('persiste fila de cierre sin V− aún (metadatos)', () => {
    const filas = [
      {
        ...prepararBorradorBmInicial('BM1'),
        vplus: { lectura: '1.1', hS: '', hM: '', hI: '' },
        dist_vplus_m: 20,
      },
      {
        ...nuevaFilaCierre({ id: 'x', nombre: 'BM1' }, 2, '0'),
      },
    ]
    const lecturas = filasToLecturas(filas, 'electronico')
    assert.ok(lecturas.some((l) => l.nombre_punto === 'BM1' && l.tipo_lectura === 'Vi' && l.lectura == null))
    const back = lecturasToFilas(lecturas, 'electronico')
    assert.equal(back.length, 2)
    assert.equal(back[1].es_fila_cierre, true)
  })
})
