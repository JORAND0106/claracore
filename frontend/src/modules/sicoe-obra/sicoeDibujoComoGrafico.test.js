/**
 * C-OUT-23 · puente dibujo del reporte → gráfico asignable.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEsquemaHistorialEntrada,
  listarEsquemasDelReporte,
  planificarAsignacionEsquema,
  planificarActualizacionVersionEsquema,
  registroTieneEsquemaAsignado,
} from './sicoeEsquemasReporte.js'
import {
  conLinkDibujoGrafico,
  DIBUJO_GRAFICO_FUENTE,
  DIBUJO_GRAFICO_NOMBRE_DEFAULT,
  debeOfrecerGuardarComoGrafico,
  esEntradaDibujoReporte,
  esFilaEsquemaDibujoReporte,
  leerLinkDibujoGrafico,
  planPuenteDibujoGrafico,
} from './sicoeDibujoComoGrafico.js'
import { patchSoloCamposGrafico } from './sicoeEsquemasFlujo.js'

describe('sicoeDibujoComoGrafico · vínculo y plan', () => {
  it('primera vez ofrece; con link actualiza', () => {
    assert.equal(debeOfrecerGuardarComoGrafico(null), true)
    assert.equal(debeOfrecerGuardarComoGrafico({ objects: [] }), true)
    assert.deepEqual(planPuenteDibujoGrafico({}).modo, 'offer')

    const linked = conLinkDibujoGrafico({ objects: [{ id: 1 }], version: 3 }, {
      esquema_id: 'esq-dibujo-1',
      numero: 180,
      nombre: 'Dibujo reporte #57',
      url: 'https://cdn/g.png',
    })
    assert.equal(debeOfrecerGuardarComoGrafico(linked), false)
    const plan = planPuenteDibujoGrafico(linked)
    assert.equal(plan.modo, 'update')
    assert.equal(plan.link.esquema_id, 'esq-dibujo-1')
    assert.equal(plan.link.numero, 180)
    assert.equal(leerLinkDibujoGrafico(linked).url, 'https://cdn/g.png')
  })

  it('nombre por defecto del gráfico', () => {
    assert.match(DIBUJO_GRAFICO_NOMBRE_DEFAULT(57), /#57/)
  })

  it('entrada de historial marca fuente dibujo_reporte y aparece en lista', () => {
    const entrada = buildEsquemaHistorialEntrada({
      url: 'https://cdn/dibujo.png',
      numero: 181,
      nombre: 'Dibujo reporte #57',
      esquemaId: 'esq-dib',
      scene: { objects: [], origin_lnglat: { lng: -74.1, lat: 4.6 } },
      reporteId: 57,
      dibujoReporte: true,
    })
    assert.equal(entrada.fuente, DIBUJO_GRAFICO_FUENTE)
    assert.equal(entrada.dibujo_reporte, true)
    assert.equal(esEntradaDibujoReporte(entrada), true)

    const regs = [
      {
        id: 440, numero_registro: 440, reporte_id: 57,
        graficos_historial: [entrada],
        grafico_url: entrada.url,
        grafico_numero: 181,
        cantidad_total: 12.5,
      },
      {
        id: 443, numero_registro: 443, reporte_id: 57,
        graficos_historial: [entrada],
        grafico_url: entrada.url,
        grafico_numero: 181,
        cantidad_total: 3.1,
      },
    ]
    const lista = listarEsquemasDelReporte(regs, () => true)
    assert.equal(lista.length, 1)
    assert.equal(lista[0].numero, 181)
    assert.equal(lista[0].fuente, DIBUJO_GRAFICO_FUENTE)
    assert.equal(esFilaEsquemaDibujoReporte(lista[0]), true)
    assert.equal(lista[0].registros.length, 2)
  })

  it('asignar sellados solo toca campos de gráfico; update no cambia cantidades', () => {
    const sellados = new Set(['440', '443'])
    const isSellado = (r) => sellados.has(String(r.id))
    const regs = [
      {
        id: 440, numero_registro: 440, reporte_id: 57,
        graficos_historial: [], cantidad_total: 12.5, longitud: 1, ancho: 2, espesor: 3,
      },
      {
        id: 443, numero_registro: 443, reporte_id: 57,
        graficos_historial: [], cantidad_total: 3.1, longitud: 4, ancho: 5, espesor: 6,
      },
      {
        id: 442, numero_registro: 442, reporte_id: 57,
        graficos_historial: [], cantidad_total: 9,
      },
    ]
    const entrada = buildEsquemaHistorialEntrada({
      url: 'https://cdn/d.png',
      numero: 190,
      nombre: 'Dibujo reporte #57',
      esquemaId: 'esq-x',
      dibujoReporte: true,
    })
    const { patches } = planificarAsignacionEsquema({
      registros: regs,
      entrada,
      idsDeseados: [440, 443],
      isSellado,
    })
    assert.equal(patches.length, 2)
    for (const p of patches) {
      assert.equal(patchSoloCamposGrafico(p.body), true)
      assert.equal(Object.prototype.hasOwnProperty.call(p.body, 'cantidad_total'), false)
    }
    const after = regs.map((r) => {
      const hit = patches.find((p) => String(p.registro.id) === String(r.id))
      return hit ? { ...r, ...hit.body } : r
    })
    assert.equal(after.find((r) => r.id === 440).cantidad_total, 12.5)
    assert.equal(registroTieneEsquemaAsignado(after.find((r) => r.id === 440), {
      esquemaId: 'esq-x', numero: 190,
    }), true)

    const entrada2 = buildEsquemaHistorialEntrada({
      url: 'https://cdn/d2.png',
      numero: 190,
      nombre: 'Dibujo reporte #57',
      esquemaId: 'esq-x',
      dibujoReporte: true,
    })
    const { patches: up } = planificarActualizacionVersionEsquema({
      registros: after,
      entradaNueva: entrada2,
      isSellado,
    })
    assert.ok(up.length >= 2)
    for (const p of up) {
      assert.equal(patchSoloCamposGrafico(p.body), true)
      assert.match(String(p.body.grafico_url), /d2\.png/)
    }

    // Reasignar a #442: quita de sellados, agrega 442; cantidades intactas.
    const { patches: re } = planificarAsignacionEsquema({
      registros: after,
      entrada: entrada2,
      idsDeseados: [442],
      isSellado,
    })
    assert.ok(re.some((p) => String(p.registro.id) === '440'))
    assert.ok(re.some((p) => String(p.registro.id) === '442'))
    const r440 = re.find((p) => String(p.registro.id) === '440')
    assert.equal(
      (r440.body.graficos_historial || []).some((g) => g.esquema_id === 'esq-x'),
      false,
    )
  })
})
