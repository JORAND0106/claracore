/**
 * Color estándar por ítem + cantidad con dimensiones + tooltips auditoría.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  colorDibujoPorItems,
  colorEstandarItem,
  leyendaColoresItems,
  SICOE_ITEM_COLOR_NEUTRO,
} from './sicoeItemColores.js'
import { fmtCantidadConDimensiones } from './sicoeCantidadDimensiones.js'
import {
  ayudaMedidaPorTipo,
  fmtRegistrosHallazgo,
  tooltipTipoHallazgo,
  unidadMedidaHallazgo,
} from './sicoeAuditoriaTooltips.js'
import { esTraslapoMismoReporte, mismoReporte } from './sicoeAuditoriaTraslapos.js'
import { mensajeErrorCarga } from './sicoeAuditoriaMensajes.js'

describe('sicoeItemColores', () => {
  it('mismo ítem → mismo color estable', () => {
    const a = colorEstandarItem('5.1')
    const b = colorEstandarItem('5.1')
    assert.equal(a, b)
    assert.ok(a.startsWith('#'))
    assert.notEqual(colorEstandarItem('5.1'), colorEstandarItem('5.2'))
  })

  it('varios ítems → neutro', () => {
    assert.equal(colorDibujoPorItems(['1', '2']), SICOE_ITEM_COLOR_NEUTRO)
    assert.equal(colorDibujoPorItems(['1']), colorEstandarItem('1'))
  })

  it('leyenda ordena ítems', () => {
    const L = leyendaColoresItems(['10', '2', '2', ''])
    assert.deepEqual(L.map((x) => x.item_numero), ['2', '10'])
  })
})

describe('fmtCantidadConDimensiones', () => {
  it('muestra A × B × C = total', () => {
    const s = fmtCantidadConDimensiones({
      longitud: 2,
      ancho: 3,
      espesor: 0.5,
      cantidad_total: 3,
    })
    assert.match(s, /2/)
    assert.match(s, /3/)
    assert.match(s, /0[,.]5/)
    assert.match(s, /=/)
  })

  it('incluye cantidad (D) cuando existe', () => {
    const s = fmtCantidadConDimensiones({
      longitud: 1,
      ancho: 1,
      espesor: 1,
      cantidad: 4,
      cantidad_total: 4,
    })
    assert.match(s, /4/)
    assert.ok(s.includes('×'))
  })

  it('varilla usa Ø y kg/m', () => {
    const s = fmtCantidadConDimensiones({
      es_varilla: true,
      longitud: 12,
      diametro_varilla: '1/2',
      peso_kg_m: 0.99,
      cantidad: 10,
      cantidad_total: 118.8,
    })
    assert.match(s, /Ø/)
    assert.match(s, /kg\/m/)
  })
})

describe('tooltips auditoría', () => {
  it('medida traslapo en m y cantidad_mayor en m²', () => {
    assert.equal(unidadMedidaHallazgo('traslapo'), 'm')
    assert.equal(unidadMedidaHallazgo('cantidad_mayor_area'), 'm²')
    assert.match(ayudaMedidaPorTipo('traslapo'), /pisa/i)
    assert.match(ayudaMedidaPorTipo('vacio'), /hueco/i)
  })

  it('tooltip de tipo incluye datos reales', () => {
    const tip = tooltipTipoHallazgo({
      tipo: 'ubicacion_inconsistente',
      medida_m: 12.5,
      ubicacion: 'K0+100 – K0+120',
      texto: 'Ubicación inconsistente · Δ 12.5 m',
      registros_involucrados: [{
        numero_registro: 10,
        numero_reporte: 3,
        abs_inicio: 100,
        abs_final: 120,
      }],
    })
    assert.match(tip, /12/)
    assert.match(tip, /digitada|Abscisa/i)
  })

  it('registros muestran reporte', () => {
    assert.equal(
      fmtRegistrosHallazgo({
        registros_involucrados: [
          { numero_registro: 306, numero_reporte: 12 },
          { numero_registro: 307, numero_reporte: 12 },
        ],
      }),
      'Reg. 306 · Rep. #12; Reg. 307 · Rep. #12',
    )
  })
})

describe('mismo reporte traslapo', () => {
  it('detecta por numero_reporte si falta reporte_id', () => {
    assert.equal(
      mismoReporte({ numero_reporte: 5 }, { numero_reporte: 5 }),
      true,
    )
    assert.equal(
      esTraslapoMismoReporte({
        tipo: 'traslapo',
        registros_involucrados: [
          { id: 1, numero_reporte: 9 },
          { id: 2, numero_reporte: 9 },
        ],
      }),
      true,
    )
  })
})

describe('mensajeErrorCarga', () => {
  it('traduce Load failed', () => {
    assert.match(
      mensajeErrorCarga({ message: 'Load failed' }, 'fb'),
      /conexión|sincronizar|cargar/i,
    )
  })
})
