/**
 * Node tests — grilla Por cantidades (tooltips / foto / validación consolidada).
 * Run: node --test src/modules/sicoe-obra/sicoeCantidadesGrillaHelpers.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  chipValidacionNivel,
  etiquetaValidacionConsolidada,
  nivelMaximoAprobado,
  registroTieneFoto,
  registroTieneGrafico,
  textoItemCompacto,
  textoItemDescripcion,
  textoTramoTooltip,
} from './sicoeCantidadesGrillaHelpers.js'

describe('sicoeCantidadesGrillaHelpers', () => {
  it('detecta foto y gráfico', () => {
    assert.equal(registroTieneFoto({}), false)
    assert.equal(registroTieneFoto({ foto_url: '  ' }), false)
    assert.equal(registroTieneFoto({ foto_url: 'https://x/f.jpg' }), true)
    assert.equal(registroTieneGrafico({}), false)
    assert.equal(registroTieneGrafico({ grafico_url: 'https://x/g.pdf' }), true)
    assert.equal(registroTieneGrafico({ graficos_historial: [{ id: 1 }] }), true)
  })

  it('consolida nivel máximo aprobado', () => {
    const reg = {
      nivel1_estado: 'Aprobado',
      nivel2_estado: 'Aprobado',
      nivel3_estado: 'Pendiente',
    }
    assert.equal(nivelMaximoAprobado(reg, [1, 2, 3]), 2)
    assert.equal(etiquetaValidacionConsolidada(reg, [1, 2, 3]), 'Aprobado hasta N2')
    assert.equal(etiquetaValidacionConsolidada({}, [1, 2, 3]), 'Sin aprobación')
    assert.equal(
      etiquetaValidacionConsolidada({ nivel1_estado: 'Aprobado' }, [1, 2, 3]),
      'Aprobado hasta N1',
    )
  })

  it('chipValidacionNivel: N3 verde (aprobado) o N4 amarillo (pendiente)', () => {
    const soloAprob = {
      nivel1_estado: 'Aprobado',
      nivel2_estado: 'Aprobado',
      nivel3_estado: 'Aprobado',
      nivel4_estado: 'No Revisado',
    }
    const chipApr = chipValidacionNivel(soloAprob, [1, 2, 3, 4])
    assert.equal(chipApr.label, 'N3')
    assert.equal(chipApr.estado, 'Aprobado')

    const conPend = {
      nivel1_estado: 'Aprobado',
      nivel2_estado: 'Aprobado',
      nivel3_estado: 'Aprobado',
      nivel4_estado: 'Pendiente',
    }
    const chipPend = chipValidacionNivel(conPend, [1, 2, 3, 4])
    assert.equal(chipPend.label, 'N4')
    assert.equal(chipPend.estado, 'Pendiente')

    const vacio = chipValidacionNivel({}, [1, 2, 3])
    assert.equal(vacio.label, '—')
    assert.equal(vacio.estado, 'No Revisado')

    const rech = chipValidacionNivel({
      nivel1_estado: 'Aprobado',
      nivel2_estado: 'Rechazado',
    }, [1, 2, 3])
    assert.equal(rech.label, 'N2')
    assert.equal(rech.estado, 'Rechazado')
  })

  it('arma textos de ítem y tramo', () => {
    assert.equal(
      textoItemDescripcion({ item_numero: '2.1', item_descripcion: 'Excavación' }),
      '2.1 — Excavación',
    )
    assert.equal(
      textoItemCompacto({ item_numero: '2.1', item_descripcion: 'Excavación' }),
      '2.1 · Excavación',
    )
    assert.equal(
      textoTramoTooltip({ tramo: 'T1', infraestructura: 'Calzada' }),
      'T1 · Calzada',
    )
  })
})
