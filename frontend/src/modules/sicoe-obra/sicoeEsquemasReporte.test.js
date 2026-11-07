import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEsquemaHistorialEntrada,
  esEntradaEsquema,
  etiquetaGaleriaGrafico,
  filtrarGaleriaGraficos,
  listarEsquemasDelReporte,
  ordenarGaleriaPorNumero,
  planificarActualizacionVersionEsquema,
  planificarAsignacionEsquema,
} from './sicoeEsquemasReporte.js'

describe('sicoeEsquemasReporte', () => {
  const regs = [
    {
      id: 1, numero_registro: 440, reporte_id: 57,
      graficos_historial: [
        buildEsquemaHistorialEntrada({
          url: 'https://cdn/placa-v1.png', numero: 161, nombre: 'Placa base', esquemaId: 'esq-placa',
        }),
      ],
    },
    {
      id: 2, numero_registro: 442, reporte_id: 57,
      graficos_historial: [
        buildEsquemaHistorialEntrada({
          url: 'https://cdn/placa-v1.png', numero: 161, nombre: 'Placa base', esquemaId: 'esq-placa',
        }),
      ],
    },
    {
      id: 3, numero_registro: 443, reporte_id: 57,
      graficos_historial: [
        buildEsquemaHistorialEntrada({
          url: 'https://cdn/placa-v1.png', numero: 161, nombre: 'Placa base', esquemaId: 'esq-placa',
        }),
        buildEsquemaHistorialEntrada({
          url: 'https://cdn/muro.png', numero: 162, nombre: 'Muro lateral', esquemaId: 'esq-muro',
        }),
      ],
    },
    {
      id: 4, numero_registro: 624, reporte_id: 57,
      graficos_historial: [
        buildEsquemaHistorialEntrada({
          url: 'https://cdn/muro.png', numero: 162, nombre: 'Muro lateral', esquemaId: 'esq-muro',
        }),
      ],
    },
  ]

  it('lista esquemas del reporte con registros asignados (caso #57)', () => {
    const list = listarEsquemasDelReporte(regs)
    assert.equal(list.length, 2)
    assert.equal(list[0].nombre, 'Placa base')
    assert.equal(list[0].numero, 161)
    assert.deepEqual(
      list[0].registros.map((r) => r.numero_registro).sort((a, b) => a - b),
      [440, 442, 443],
    )
    assert.equal(list[1].nombre, 'Muro lateral')
    assert.deepEqual(
      list[1].registros.map((r) => r.numero_registro).sort((a, b) => a - b),
      [443, 624],
    )
  })

  it('asignación: sellado conserva versión y no se quita', () => {
    const isSellado = (r) => Number(r.numero_registro) === 440
    const nueva = buildEsquemaHistorialEntrada({
      url: 'https://cdn/placa-v2.png', numero: 161, nombre: 'Placa base', esquemaId: 'esq-placa',
    })
    const { patches } = planificarActualizacionVersionEsquema({
      registros: regs,
      entradaNueva: nueva,
      isSellado,
    })
    const byId = Object.fromEntries(patches.map((p) => [p.registro.numero_registro, p]))
    assert.ok(!byId[440], 'sellado no se parchea')
    assert.ok(byId[442])
    assert.ok(byId[443])
    const h442 = byId[442].body.graficos_historial.find((g) => g.esquema_id === 'esq-placa')
    assert.equal(h442.url, 'https://cdn/placa-v2.png')
    assert.equal(h442.numero, 161)
  })

  it('cambiar asignación no toca sellados; agrega registro nuevo', () => {
    const isSellado = (r) => Number(r.numero_registro) === 440
    const conNuevo = [
      ...regs,
      { id: 9, numero_registro: 900, reporte_id: 57, graficos_historial: [] },
    ]
    const entrada = buildEsquemaHistorialEntrada({
      url: 'https://cdn/placa-v1.png', numero: 161, nombre: 'Placa base', esquemaId: 'esq-placa',
    })
    const { patches, skippedSellados } = planificarAsignacionEsquema({
      registros: conNuevo,
      entrada,
      // Intenta quitar 440 (sellado) y agregar 900
      idsDeseados: [2, 3, 9],
      isSellado,
    })
    assert.ok(skippedSellados.includes(440))
    const ids = patches.map((p) => p.registro.numero_registro).sort((a, b) => a - b)
    assert.ok(ids.includes(900))
    assert.ok(!ids.includes(440))
  })

  it('etiqueta y filtro de galería', () => {
    const label = etiquetaGaleriaGrafico({
      numero: 161,
      reporteNumero: 57,
      registrosNums: [354, 356, 357],
    })
    assert.match(label, /Gráfico 161/)
    assert.match(label, /Rep\. #57/)
    assert.match(label, /354, 356, 357/)
    const items = ordenarGaleriaPorNumero([
      { numero: 20, reporte_numero: 2 },
      { numero: 5, reporte_numero: 1 },
    ])
    assert.equal(items[0].numero, 5)
    const filtered = filtrarGaleriaGraficos([
      { numero: 161, reporte_numero: 57, label },
      { numero: 10, reporte_numero: 2 },
    ], '57')
    assert.equal(filtered.length, 1)
    assert.equal(filtered[0].numero, 161)
  })

  it('esEntradaEsquema distingue PNG esquema de PDF/DXF', () => {
    assert.equal(esEntradaEsquema({ url: 'x', origen: 'esquema', kind: 'esquema' }), true)
    assert.equal(esEntradaEsquema({ url: 'x', origen: 'esquema', kind: 'esquema-dxf' }), false)
    assert.equal(esEntradaEsquema({ url: 'x', origen: 'manual' }), false)
  })
})
