/**
 * node --test frontend/src/components/topografia/offline/topoNivelacionGuardarOffline.test.mjs
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { filasToLecturas, nuevaFilaPunto } from '../../../utils/topografia_nivelacion.js'
import {
  preferPendingNivelacionDetail,
  resolverPayloadLecturasNivelacionOffline,
} from './topoNivelacionLecturasPayload.js'

describe('resolverPayloadLecturasNivelacionOffline', () => {
  it('acepta el body online { lecturas, tipo_nivel } sin tratarlo como filas UI', () => {
    const filas = [
      {
        ...nuevaFilaPunto(1, true),
        nombre_punto: 'BM1',
        vplus: { lectura: '1.250', hS: '', hM: '', hI: '' },
        dist_vplus_m: 30,
      },
      {
        ...nuevaFilaPunto(2, false),
        nombre_punto: 'TP1',
        vminus: { lectura: '1.100', hS: '', hM: '', hI: '' },
        dist_vminus_m: 28,
      },
    ]
    const lecturas = filasToLecturas(filas, 'electronico')
    const resolved = resolverPayloadLecturasNivelacionOffline({
      lecturas,
      tipo_nivel: 'electronico',
    })
    assert.equal(resolved.lecturas.length, lecturas.length)
    assert.ok(resolved.filas.length >= 2)
    assert.equal(resolved.filas[0].nombre_punto, 'BM1')
    assert.equal(String(resolved.filas[0].vplus?.lectura), '1.25')
  })

  it('sigue aceptando { filas } legacy', () => {
    const filas = [
      {
        ...nuevaFilaPunto(1, true),
        nombre_punto: 'BM-X',
        vplus: { lectura: '1.01', hS: '', hM: '', hI: '' },
        dist_vplus_m: 20,
      },
    ]
    const resolved = resolverPayloadLecturasNivelacionOffline({
      filas,
      tipo_nivel: 'electronico',
    })
    assert.equal(resolved.filas[0].nombre_punto, 'BM-X')
    assert.ok(resolved.lecturas.length >= 1)
    assert.equal(resolved.lecturas[0].tipo_lectura, 'V+')
  })
})

describe('preferPendingNivelacionDetail (anti-overwrite)', () => {
  it('no deja que un GET vacío pise cartera pendiente de sync', () => {
    const server = { nivelacion: { id: 'n1', nombre: 'Circuito A' }, lecturas: [] }
    const pending = {
      _pending_sync: true,
      lecturas: [
        { orden: 1, tipo_lectura: 'V+', nombre_punto: 'BM1', lectura: 1.5 },
        { orden: 11, tipo_lectura: 'V−', nombre_punto: 'TP1', lectura: 1.1 },
      ],
      nivelacion: { id: 'n1', tipo_nivel: 'electronico' },
    }
    const out = preferPendingNivelacionDetail(server, pending)
    assert.equal(out.lecturas.length, 2)
    assert.equal(out._pending_sync, true)
    assert.equal(Number(out.lecturas[0].lectura), 1.5)
  })
})
