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
      longitud: 1, ancho: 1, espesor: 0.2, cantidad_total: 0.2, item: 'I-440',
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

  it('editar: sellados también reciben la versión nueva; body sin cantidades', () => {
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
    assert.ok(byId[440], 'sellado sí se actualiza')
    assert.ok(byId[442])
    assert.ok(byId[443])
    const h440 = byId[440].body.graficos_historial.find((g) => g.esquema_id === 'esq-placa')
    assert.equal(h440.url, 'https://cdn/placa-v2.png')
    assert.equal(h440.numero, 161)
    // Solo campos de gráfico — no cantidades/medidas/ítem
    assert.equal(byId[440].body.cantidad_total, undefined)
    assert.equal(byId[440].body.longitud, undefined)
    assert.equal(byId[440].body.item, undefined)
    assert.ok(byId[440].body.graficos_historial)
  })

  it('cambiar asignación: quitar/agregar sellados y no sellados', () => {
    const isSellado = (r) => [440, 442, 624].includes(Number(r.numero_registro))
    const conNuevo = [
      ...regs,
      { id: 9, numero_registro: 900, reporte_id: 57, graficos_historial: [] },
    ]
    const entrada = buildEsquemaHistorialEntrada({
      url: 'https://cdn/placa-v1.png', numero: 161, nombre: 'Placa base', esquemaId: 'esq-placa',
    })
    // Caso c): desmarcar 440, marcar 442 (ya) y 624 + 900
    const { patches, skippedSellados } = planificarAsignacionEsquema({
      registros: conNuevo,
      entrada,
      idsDeseados: [2, 4, 9], // 442, 624, 900 — quita 440 y 443
      isSellado,
    })
    assert.equal(skippedSellados.length, 0)
    const byNum = Object.fromEntries(patches.map((p) => [p.registro.numero_registro, p]))
    assert.ok(byNum[440], 'quita esquema del sellado 440')
    assert.ok(!byNum[440].body.graficos_historial.some((g) => g.esquema_id === 'esq-placa'))
    assert.ok(byNum[624], 'agrega al sellado 624')
    assert.ok(byNum[624].body.graficos_historial.some((g) => g.esquema_id === 'esq-placa'))
    assert.ok(byNum[900])
    assert.ok(byNum[443], 'quita 443')
  })

  it('nuevo: asignar solo a sellados 440 y 443', () => {
    const isSellado = (r) => [440, 443].includes(Number(r.numero_registro))
    const entrada = buildEsquemaHistorialEntrada({
      url: 'https://cdn/nuevo.png', numero: 174, nombre: 'Nuevo', esquemaId: 'esq-nuevo',
    })
    const { patches } = planificarAsignacionEsquema({
      registros: regs,
      entrada,
      idsDeseados: [1, 3],
      isSellado,
    })
    assert.equal(patches.length, 2)
    assert.deepEqual(
      patches.map((p) => p.registro.numero_registro).sort((a, b) => a - b),
      [440, 443],
    )
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
