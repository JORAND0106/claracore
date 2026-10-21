/**
 * Recorrido del ticket: Cabezal descole → 31,01 / 9,46 / 47,31 kg.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getBuiltinShape, blankSegmentsForShape } from '../../components/esquema/esquemaDespieceShapes.js'
import { createEmptySchedule, computeScheduleTotalKg } from '../../components/esquema/esquemaDespiece.js'
import {
  sicoeRegistrosDesdeCuadro,
  sicoePlanSyncCuadroAceros,
  sicoeEsRegistroDeCuadroAceros,
  SICOE_AVISO_EDITAR_DESDE_CUADRO,
} from './sicoeCuadroAceros.js'
import { SICOE_VARILLA_PESOS_KG_M } from './sicoeVarilla.js'

function dobleGanchoPos({ name, pieces, segs }) {
  const shape = getBuiltinShape('doble_gancho')
  const segments = blankSegmentsForShape(shape).map((s, i) => {
    const conf = segs[i]
    if (conf.mode === 'variable') {
      return {
        ...s,
        mode: 'variable',
        units: 'm',
        minM: String(conf.minM),
        maxM: String(conf.maxM),
      }
    }
    return { ...s, mode: 'unica', units: 'm', lengthM: String(conf.m) }
  })
  return {
    id: `pos_${name}`,
    name,
    diameter: '1/2',
    pieces,
    shapeId: 'doble_gancho',
    segments,
    units: 'm',
    ubicacion: 'Longitudinal',
    parrilla: 'Sencilla',
  }
}

function scheduleCabezal() {
  const s = createEmptySchedule('Cabezal descole')
  s.id = 'cuadro_cabezal_test'
  s.positions = [
    dobleGanchoPos({ name: 'As1', pieces: 16, segs: [{ m: 0.2 }, { m: 1.55 }, { m: 0.2 }] }),
    dobleGanchoPos({
      name: 'As1a', pieces: 8,
      segs: [{ m: 0.2 }, { mode: 'variable', minM: 0.4, maxM: 1.18 }, { m: 0.2 }],
    }),
    dobleGanchoPos({
      name: 'As2', pieces: 20,
      segs: [{ m: 0.2 }, { mode: 'variable', minM: 1.6, maxM: 2.36 }, { m: 0.2 }],
    }),
  ]
  return s
}

describe('sicoeCuadroAceros · recorrido Cabezal descole', () => {
  it('crea 3 registros sin ítem con Cant Total 31,01 / 9,46 / 47,31 (total 87,78)', () => {
    assert.equal(SICOE_VARILLA_PESOS_KG_M['1/2'], 0.99, 'tabla SicoeObra intacta')
    const schedule = scheduleCabezal()
    assert.equal(computeScheduleTotalKg(schedule.positions), 87.78)
    const out = sicoeRegistrosDesdeCuadro(schedule, {
      fotoPayload: { foto_url: 'https://x/f.jpg', foto_numero: 1, _fotoOk: true },
      graficoPayload: {
        grafico_url: 'https://x/g.png',
        grafico_numero: 7,
        graficos_historial: [{ url: 'https://x/g.png', numero: 7, origen: 'esquema-calculo', kind: 'despiece-acero' }],
      },
    })
    assert.equal(out.ok, true, out.error)
    assert.equal(out.registros.length, 3)
    const totals = out.registros.map((r) => r.cantidad_total)
    assert.deepEqual(totals, [31.01, 9.46, 47.31])
    assert.equal(out.registros.reduce((a, r) => a + r.cantidad_total, 0), 87.78)
    for (const r of out.registros) {
      assert.equal(r.unidad, 'kg')
      assert.equal(r.es_varilla, true)
      assert.equal(r.peso_kg_m, 0.994)
      assert.equal(r.item_numero, null)
      assert.equal(r.cuadro_aceros_nombre, 'Cabezal descole')
      assert.equal(r.foto_url, 'https://x/f.jpg')
      assert.equal(r.grafico_url, 'https://x/g.png')
      assert.match(r.observacion, /Cabezal descole · As/)
    }
    assert.equal(out.registros[0].longitud, 1.95)
    assert.equal(out.registros[0].cantidad, 16)
  })

  it('sync: actualiza As1 conservando ítem, crea As3, elimina As1a', () => {
    const base = scheduleCabezal()
    const created = sicoeRegistrosDesdeCuadro(base)
    const existentes = created.registros.map((r, i) => ({
      ...r,
      id: 100 + i,
      item_numero: i === 0 ? '3.1.' : null,
      item_descripcion: i === 0 ? 'Acero' : null,
    }))
    const edited = createEmptySchedule('Cabezal descole')
    edited.id = base.id
    edited.positions = [
      { ...base.positions[0], pieces: 18 }, // As1
      dobleGanchoPos({ name: 'As2', pieces: 20, segs: [{ m: 0.2 }, { mode: 'variable', minM: 1.6, maxM: 2.36 }, { m: 0.2 }] }),
      dobleGanchoPos({ name: 'As3', pieces: 4, segs: [{ m: 0.2 }, { m: 1.0 }, { m: 0.2 }] }),
    ]
    const plan = sicoePlanSyncCuadroAceros({ schedule: edited, registrosExistentes: existentes })
    assert.equal(plan.ok, true, plan.error)
    assert.equal(plan.actualizar.length, 2) // As1 + As2
    const as1 = plan.actualizar.find((x) => x.patch.cuadro_aceros_posicion === 'As1')
    assert.ok(as1)
    assert.equal(as1.patch.cantidad_total, 34.89)
    assert.equal(as1.patch.item_numero, '3.1.')
    assert.equal(plan.crear.length, 1)
    assert.equal(plan.crear[0].cuadro_aceros_posicion, 'As3')
    assert.equal(plan.crear[0].item_numero, null)
    assert.deepEqual(plan.eliminarIds, [101]) // As1a id 101
  })

  it('aviso y detección de registro de cuadro', () => {
    assert.equal(sicoeEsRegistroDeCuadroAceros({ cuadro_aceros_id: 'x' }), true)
    assert.equal(sicoeEsRegistroDeCuadroAceros({}), false)
    assert.equal(SICOE_AVISO_EDITAR_DESDE_CUADRO, 'Edítelo desde el cuadro de aceros')
  })
})
