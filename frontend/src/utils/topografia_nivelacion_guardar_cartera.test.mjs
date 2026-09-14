/**
 * Round-trip de persistencia cartera + confirmación estricta de guardado.
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
import {
  borradorPendienteDeAgregar,
  confirmarRespuestaGuardadoLecturas,
  fingerprintLecturasOrden,
  verificarDetalleTrasGuardado,
} from './topografia_nivelacion_guardar.js'
import { preferPendingNivelacionDetail } from '../components/topografia/offline/topoNivelacionLecturasPayload.js'

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

describe('Guardar cartera — confirmación estricta', () => {
  const payload = [
    { orden: 1, tipo_lectura: 'V+', nombre_punto: 'BM1', lectura: 1.5 },
    { orden: 2, tipo_lectura: 'V−', nombre_punto: 'TP1', lectura: 1.2 },
  ]

  it('rechaza respuesta vacía (no asume éxito por payload local)', () => {
    const r = confirmarRespuestaGuardadoLecturas(null, payload)
    assert.equal(r.ok, false)
    assert.equal(r.reason, 'empty_response')
  })

  it('rechaza respuesta sin count (no usa payload.length)', () => {
    const r = confirmarRespuestaGuardadoLecturas({}, payload)
    assert.equal(r.ok, false)
    assert.equal(r.reason, 'missing_count')
  })

  it('rechaza conteo distinto al enviado', () => {
    const r = confirmarRespuestaGuardadoLecturas({ count: 1, lecturas: [payload[0]] }, payload)
    assert.equal(r.ok, false)
    assert.equal(r.reason, 'count_mismatch')
  })

  it('acepta count + fingerprint coincidente', () => {
    const fp = fingerprintLecturasOrden(payload)
    const r = confirmarRespuestaGuardadoLecturas({
      count: 2,
      lecturas: payload,
      fingerprint_orden: fp,
      verified: true,
    }, payload)
    assert.equal(r.ok, true)
    assert.equal(r.count, 2)
  })

  it('acepta respuesta offline con _offline', () => {
    const r = confirmarRespuestaGuardadoLecturas({
      count: 2,
      lecturas: payload,
      _offline: true,
    }, payload)
    assert.equal(r.ok, true)
    assert.equal(r.offline, true)
  })

  it('verificarDetalleTrasGuardado detecta GET más pobre', () => {
    const v = verificarDetalleTrasGuardado({ lecturas: [payload[0]] }, 2)
    assert.equal(v.ok, false)
    assert.equal(v.reason, 'count_short')
  })

  it('verificarDetalleTrasGuardado OK con misma huella', () => {
    const fp = fingerprintLecturasOrden(payload)
    const v = verificarDetalleTrasGuardado({ lecturas: payload }, 2, fp)
    assert.equal(v.ok, true)
  })
})

describe('Guardar cartera — borrador pendiente y merge pending', () => {
  it('detecta lectura en panel de captura sin agregar', () => {
    const b = {
      ...nuevaFilaPunto(2, false),
      nombre_punto: 'X',
      vplus: { lectura: '1.2', hS: '', hM: '', hI: '' },
    }
    assert.equal(borradorPendienteDeAgregar(b, 'electronico'), true)
  })

  it('no marca pendiente un borrador vacío/BM solo nombre', () => {
    const b = prepararBorradorBmInicial('BM1')
    assert.equal(borradorPendienteDeAgregar(b, 'electronico'), false)
  })

  it('preferPendingNivelacionDetail conserva lecturas locales más ricas', () => {
    const server = {
      nivelacion: { id: 'n1', nombre: 'A' },
      lecturas: [],
    }
    const existing = {
      _pending_sync: true,
      lecturas: [
        { orden: 1, tipo_lectura: 'V+', nombre_punto: 'BM1' },
        { orden: 2, tipo_lectura: 'V−', nombre_punto: 'TP1' },
      ],
      nivelacion: { id: 'n1', tipo_nivel: 'electronico' },
    }
    const merged = preferPendingNivelacionDetail(server, existing)
    assert.equal(merged.lecturas.length, 2)
    assert.equal(merged._pending_sync, true)
  })

  it('preferPendingNivelacionDetail cede cuando el servidor ya alcanzó o superó', () => {
    const lecturas = [
      { orden: 1, tipo_lectura: 'V+', nombre_punto: 'BM1' },
      { orden: 2, tipo_lectura: 'V−', nombre_punto: 'TP1' },
    ]
    const server = { nivelacion: { id: 'n1' }, lecturas }
    const existing = { _pending_sync: true, lecturas: [lecturas[0]] }
    const merged = preferPendingNivelacionDetail(server, existing)
    assert.equal(merged.lecturas.length, 2)
    assert.equal(merged._pending_sync, undefined)
  })
})
