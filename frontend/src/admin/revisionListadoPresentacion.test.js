import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import {
  CASO_NO_RECALC,
  CASO_PRECIO,
  CASO_REDONDEO,
  CASO_SIN_ITEM,
  SIN_VALORIZAR,
  presentarRevisionListado,
} from './revisionListadoPresentacion.js'

/** Registro 116 de ICCU-CTO-1614-2025: dos tipos, una sola diferencia. */
const REGISTRO_116 = [
  {
    registro_id: 60883,
    numero_registro: 116,
    reporte_id: 36978,
    numero_reporte: 24,
    item_numero: 'NP-08.',
    tipo: 'vu_guardado_distinto_listado',
    cantidad_total: 19.8,
    vu_guardado: 506305,
    vu_listado: 222133,
    cd_guardado: 10024839,
    cd_esperado: 4398233,
    impacto_plata: 5626606,
  },
  {
    registro_id: 60883,
    numero_registro: 116,
    reporte_id: 36978,
    numero_reporte: 24,
    item_numero: 'NP-08.',
    tipo: 'cd_guardado_distinto_cant_x_vu',
    cantidad_total: 19.8,
    vu_guardado: 506305,
    vu_listado: 222133,
    cd_guardado: 10024839,
    cd_esperado: 4398233,
    impacto_plata: 5626606,
  },
]

describe('presentarRevisionListado', () => {
  it('el registro 116 aparece una vez como precio distinto, diferencia 5626606', () => {
    const { filas, tarjetas } = presentarRevisionListado(REGISTRO_116, 19972056783)
    assert.equal(filas.length, 1)
    const fila = filas[0]
    assert.equal(fila.caso, CASO_PRECIO)
    assert.equal(fila.caso_label, 'Precio distinto al listado')
    assert.equal(fila.diferencia, 5626606)
    assert.equal(fila.valor_guardado, 10024839)
    assert.equal(fila.valor_listado, 4398233)
    assert.equal(fila.numero_reporte, 24)
    assert.equal(fila.registro_id, 60883)
    assert.equal(tarjetas.precio_distinto.n, 1)
    assert.equal(tarjetas.precio_distinto.impacto, 5626606)
    assert.equal(tarjetas.valor_no_recalculado.n, 0)
    assert.equal(tarjetas.valor_no_recalculado.impacto, 0)
    assert.equal(tarjetas.valor_canonico, 19972056783)
  })

  it('no suma el impacto de un registro en dos casos', () => {
    const extra = {
      registro_id: 2,
      numero_registro: 2,
      item_numero: '1.1',
      tipo: 'cd_guardado_distinto_cant_x_vu',
      cantidad_total: 4,
      cd_guardado: 5000,
      cd_esperado: 1000,
      impacto_plata: 4000,
    }
    const { tarjetas } = presentarRevisionListado([...REGISTRO_116, extra], 0)
    assert.equal(tarjetas.precio_distinto.impacto, 5626606)
    assert.equal(tarjetas.valor_no_recalculado.impacto, 4000)
    const total = tarjetas.precio_distinto.impacto + tarjetas.valor_no_recalculado.impacto + tarjetas.redondeo.impacto
    assert.equal(total, 5626606 + 4000)
  })

  it('sin ítem no entra en ningún impacto y queda sin valorizar', () => {
    const { filas, tarjetas } = presentarRevisionListado([
      {
        registro_id: 9,
        numero_registro: 122,
        item_numero: '',
        tipo: 'sin_item',
        cantidad_total: 50,
        cd_guardado: null,
        impacto_plata: 0,
      },
      {
        registro_id: 10,
        numero_registro: 28,
        item_numero: '2.3',
        tipo: 'cap_item_ausente_en_listado',
        cantidad_total: 1,
        cd_guardado: 90000,
        impacto_plata: 90000,
      },
    ], 10)
    assert.equal(filas.length, 2)
    assert.equal(tarjetas.sin_item.n, 2)
    assert.equal(tarjetas.sin_item.impacto, 0)
    assert.equal(filas.every((f) => f.sin_valorizar && f.diferencia == null), true)
    assert.equal(filas[0].caso_label, 'Sin ítem asignado')
    assert.equal(SIN_VALORIZAR, 'Sin valorizar')
  })

  it('separa redondeo menor a 1000 de valor no recalculado', () => {
    const { filas, tarjetas } = presentarRevisionListado([
      {
        registro_id: 3,
        numero_registro: 30,
        item_numero: '1.2',
        tipo: 'cd_guardado_distinto_cant_x_vu',
        cantidad_total: 2,
        cd_guardado: 1001,
        cd_esperado: 1000,
        impacto_plata: 1,
      },
      {
        registro_id: 4,
        numero_registro: 31,
        item_numero: '1.3',
        tipo: 'cd_guardado_distinto_cant_x_vu',
        cantidad_total: 2,
        cd_guardado: 6000,
        cd_esperado: 1000,
        impacto_plata: 5000,
      },
    ], 0)
    assert.deepEqual(filas.map((f) => f.caso), [CASO_NO_RECALC, CASO_REDONDEO])
    assert.equal(tarjetas.redondeo.n, 1)
    assert.equal(tarjetas.redondeo.impacto, 1)
    assert.equal(tarjetas.valor_no_recalculado.n, 1)
    assert.equal(tarjetas.valor_no_recalculado.impacto, 5000)
    assert.equal(filas[0].caso_label, 'Valor no recalculado')
    assert.equal(filas[1].caso_label, 'Redondeo')
  })

  it('ordena sin ítem, precio, no recalculado y redondeo; dentro, mayor diferencia primero', () => {
    const { filas } = presentarRevisionListado([
      {
        registro_id: 1, numero_registro: 1, tipo: 'cd_guardado_distinto_cant_x_vu',
        item_numero: 'A', cantidad_total: 1, cd_guardado: 10, cd_esperado: 8, impacto_plata: 2,
      },
      {
        registro_id: 2, numero_registro: 2, tipo: 'cd_guardado_distinto_cant_x_vu',
        item_numero: 'B', cantidad_total: 1, cd_guardado: 2000, cd_esperado: 0, impacto_plata: 2000,
      },
      {
        registro_id: 3, numero_registro: 3, tipo: 'vu_guardado_distinto_listado',
        item_numero: 'C', cantidad_total: 1, cd_guardado: 100, cd_esperado: 40, impacto_plata: 60,
      },
      {
        registro_id: 4, numero_registro: 4, tipo: 'sin_item',
        item_numero: '', cantidad_total: 1, impacto_plata: 0,
      },
      {
        registro_id: 5, numero_registro: 5, tipo: 'vu_guardado_distinto_listado',
        item_numero: 'D', cantidad_total: 1, cd_guardado: 500, cd_esperado: 100, impacto_plata: 400,
      },
    ], 1)
    assert.deepEqual(filas.map((f) => f.numero_registro), [4, 5, 3, 2, 1])
    assert.deepEqual(filas.map((f) => f.caso), [
      CASO_SIN_ITEM, CASO_PRECIO, CASO_PRECIO, CASO_NO_RECALC, CASO_REDONDEO,
    ])
  })

  it('un precio distinto chico no se esconde como redondeo', () => {
    const { filas } = presentarRevisionListado([
      {
        registro_id: 8,
        numero_registro: 8,
        tipo: 'vu_guardado_distinto_listado',
        item_numero: 'Z',
        cantidad_total: 1,
        cd_guardado: 1500,
        cd_esperado: 1400,
        impacto_plata: 100,
      },
      {
        registro_id: 8,
        numero_registro: 8,
        tipo: 'cd_guardado_distinto_cant_x_vu',
        item_numero: 'Z',
        cantidad_total: 1,
        cd_guardado: 1500,
        cd_esperado: 1400,
        impacto_plata: 100,
      },
    ], 0)
    assert.equal(filas.length, 1)
    assert.equal(filas[0].caso, CASO_PRECIO)
    assert.equal(filas[0].diferencia, 100)
  })
})

describe('textos de la vista', () => {
  it('el encabezado es una sola línea y la tabla no muestra códigos técnicos', () => {
    const seccion = readFileSync(new URL('./SeccionIntegridadListado.jsx', import.meta.url), 'utf8')
    const panel = readFileSync(new URL('../AdminPanel.jsx', import.meta.url), 'utf8')
    const presentacion = readFileSync(new URL('./revisionListadoPresentacion.js', import.meta.url), 'utf8')
    assert.match(panel, /Registros que no coinciden con el listado de precios\. Solo consulta\./)
    assert.equal(panel.includes('valores guardados desactualizados'), false)
    assert.equal(seccion.includes('cd_guardado_distinto'), false)
    assert.equal(seccion.includes('vu_guardado_distinto'), false)
    assert.equal(seccion.includes('Valor canónico'), false)
    assert.match(presentacion, /Sin valorizar/)
    assert.equal((seccion.match(/SIN_VALORIZAR/g) || []).length >= 4, true)
    for (const col of ['Registro', 'Reporte', 'Ítem', 'Caso', 'Cantidad', 'Valor guardado', 'Valor con listado', 'Diferencia']) {
      assert.match(seccion, new RegExp(col))
    }
  })
})
