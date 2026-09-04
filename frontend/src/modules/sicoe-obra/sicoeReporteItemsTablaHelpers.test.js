import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  sortItemKeysSicoe,
  agruparRegistrosPorItem,
  estadoNivelUsuarioRegistro,
  pastelDeEstadoValidacion,
  etiquetaCortaRolNivel,
  conteoEstadosPorNivel,
  idsRegistrosEnEstado,
  sumatoriaCostoDirectoFilasItem,
  sumatoriaCantidadFilasItem,
  normalizarEstadoParaConteo,
  puedeValidacionMasivaPorRol,
  normalizarItemNumSicoe,
  sicoeItemFilaAbierta,
  sicoeItemsOuterColCount,
  sicoeItemsSubColCount,
  sicoeSimularSyncTrasClic,
  sicoeRegistroFilaExpandida,
} from './sicoeReporteItemsTablaHelpers.js'

describe('sortItemKeysSicoe', () => {
  it('ordena ítems con orden natural numérico', () => {
    assert.deepEqual(sortItemKeysSicoe(['10.1', '2.1', '2.10', '2.2']), ['2.1', '2.2', '2.10', '10.1'])
  })
})

describe('normalizarItemNumSicoe / sicoeItemFilaAbierta', () => {
  it('descarta zoom como causa: solo igualdad de claves (espacios / número)', () => {
    // Simula viewport 100%: el fallo era === estricto, no layout/zoom.
    assert.equal(normalizarItemNumSicoe(' 1.01 '), '1.01')
    assert.equal(normalizarItemNumSicoe(1.01), '1.01')
    assert.equal(sicoeItemFilaAbierta(' 1.01 ', '1.01'), true)
    assert.equal(sicoeItemFilaAbierta(1.01, '1.01'), true)
    assert.equal(sicoeItemFilaAbierta('1.01', '1.02'), false)
    // Caso Interventoría: _autoRegistro escribe crudo; tabla agrupa trim → sin normalizar fallaba.
    const filas = agruparRegistrosPorItem([
      { id: 9, item_numero: ' 2.1 ', numero_registro: 1, cantidad_total: 1, costo_directo: 0 },
    ])
    assert.equal(filas[0].itemNum, '2.1')
    assert.equal(sicoeItemFilaAbierta(' 2.1 ', filas[0].itemNum), true)
    assert.equal((' 2.1 ' === filas[0].itemNum), false)
  })
})

describe('agruparRegistrosPorItem', () => {
  it('agrupa, suma cantidad/costo e ignora sin ítem', () => {
    const regs = [
      { id: 1, item_numero: '2.1', item_descripcion: 'Excavación', unidad: 'm3', numero_registro: 2, cantidad_total: 10, costo_directo: 100 },
      { id: 2, item_numero: '2.1', item_descripcion: 'Excavación', unidad: 'm3', numero_registro: 1, cantidad_total: 5, costo_directo: 50 },
      { id: 3, item_numero: '', cantidad_total: 99, costo_directo: 999 },
      { id: 4, item_numero: '10.1', item_descripcion: 'Relleno', unidad: 'm3', numero_registro: 1, cantidad_total: 1, costo_directo: 20 },
    ]
    const filas = agruparRegistrosPorItem(regs)
    assert.deepEqual(filas.map((f) => f.itemNum), ['2.1', '10.1'])
    assert.equal(filas[0].sumCant, 15)
    assert.equal(filas[0].sumCd, 150)
    assert.deepEqual(filas[0].regs.map((r) => r.numero_registro), [1, 2])
    assert.equal(filas[0].descripcion, 'Excavación')
    assert.equal(filas[0].unidad, 'm3')
  })
})

describe('estadoNivelUsuarioRegistro', () => {
  it('usa solo el campo del nivel del usuario', () => {
    const reg = {
      nivel1_estado: 'Aprobado',
      nivel2_estado: 'Pendiente',
      nivel3_estado: 'Rechazado',
      sub_estado: 'No Revisado',
    }
    assert.equal(estadoNivelUsuarioRegistro(reg, 2), 'Pendiente')
    assert.equal(estadoNivelUsuarioRegistro(reg, 1), 'Aprobado')
    assert.equal(estadoNivelUsuarioRegistro(reg, 0), 'No Revisado')
  })
})

describe('pastelDeEstadoValidacion', () => {
  it('devuelve verdes/amarillos/rojos pastel con color de texto legible', () => {
    assert.equal(pastelDeEstadoValidacion('Aprobado').bg, '#dcfce7')
    assert.equal(pastelDeEstadoValidacion('Aprobado').color, '#166534')
    assert.equal(pastelDeEstadoValidacion('Pendiente').bg, '#fef3c7')
    assert.equal(pastelDeEstadoValidacion('Pendiente').color, '#92400e')
    assert.equal(pastelDeEstadoValidacion('Rechazado').bg, '#fee2e2')
    assert.equal(pastelDeEstadoValidacion('Rechazado').color, '#991b1b')
  })
})

describe('etiquetaCortaRolNivel', () => {
  it('extrae el rol del encabezado', () => {
    assert.equal(etiquetaCortaRolNivel('Nivel 2 · Contratista', 2), 'Contratista')
    assert.equal(etiquetaCortaRolNivel('Director de obra (N3)', 3), 'Director de obra')
    assert.equal(etiquetaCortaRolNivel('', 1), 'N1')
  })
})

describe('conteoEstadosPorNivel e idsRegistrosEnEstado', () => {
  it('cuenta e identifica por estado del nivel', () => {
    const regs = [
      { id: 1, nivel2_estado: 'Pendiente' },
      { id: 2, nivel2_estado: 'Pendiente' },
      { id: 3, nivel2_estado: 'Aprobado' },
      { id: 4, nivel2_estado: 'No Revisado' },
      { id: 5, nivel2_estado: 'No Objeto de Cobro' },
    ]
    const estadoFn = (r) => estadoNivelUsuarioRegistro(r, 2)
    const c = conteoEstadosPorNivel(regs, estadoFn)
    assert.equal(c.Pendiente, 2)
    assert.equal(c.Aprobado, 1)
    assert.equal(c['No Revisado'], 1)
    assert.equal(c.Rechazado, 1)
    assert.deepEqual(idsRegistrosEnEstado(regs, estadoFn, 'Pendiente'), [1, 2])
    assert.equal(normalizarEstadoParaConteo('No Objeto de Cobro'), 'Rechazado')
  })
})

describe('sumatorias de filas ítem', () => {
  it('suma cantidad y costo', () => {
    const filas = [{ sumCant: 10, sumCd: 100 }, { sumCant: 5.5, sumCd: 50 }]
    assert.equal(sumatoriaCantidadFilasItem(filas), 15.5)
    assert.equal(sumatoriaCostoDirectoFilasItem(filas), 150)
  })
})

describe('puedeValidacionMasivaPorRol', () => {
  it('bloquea operativos aunque puedan validar', () => {
    assert.equal(puedeValidacionMasivaPorRol({ puedeValidar: true, esOperativoContratista: true, esOperativoInterventoria: false }), false)
    assert.equal(puedeValidacionMasivaPorRol({ puedeValidar: true, esOperativoContratista: false, esOperativoInterventoria: true }), false)
    assert.equal(puedeValidacionMasivaPorRol({ puedeValidar: true, esOperativoContratista: false, esOperativoInterventoria: false }), true)
    assert.equal(puedeValidacionMasivaPorRol({ puedeValidar: false, esOperativoContratista: false, esOperativoInterventoria: false }), false)
  })
})

describe('sicoeItemsOuterColCount / sicoeItemsSubColCount', () => {
  it('al ocultar CD reduce columnas sin romper colspan', () => {
    assert.equal(sicoeItemsOuterColCount(true), 6)
    assert.equal(sicoeItemsOuterColCount(false), 5)
    assert.equal(sicoeItemsSubColCount(true), 12)
    assert.equal(sicoeItemsSubColCount(false), 11)
  })
})

describe('overwrite sync Interventoría (_autoRegistro / registroExpandido)', () => {
  it('sin normalizar el sync deja el ítem cerrado; con normalizar queda abierto', () => {
    const r = sicoeSimularSyncTrasClic({
      itemNumFila: '1.01',
      itemNumeroCrudoTrasSync: ' 1.01 ',
    })
    assert.equal(r.abiertoSinNormalizar, false)
    assert.equal(r.abiertoConNormalizar, true)
  })

  it('detalle se abre por id o por numero_registro (deep-link)', () => {
    const reg = { id: 100, numero_registro: 7 }
    assert.equal(sicoeRegistroFilaExpandida(100, reg), true)
    assert.equal(sicoeRegistroFilaExpandida('7', reg), true)
    assert.equal(sicoeRegistroFilaExpandida(999, reg), false)
  })
})
