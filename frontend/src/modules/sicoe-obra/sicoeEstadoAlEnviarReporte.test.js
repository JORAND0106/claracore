import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sicoeEstadoAlEnviarReporte } from './sicoeEstadoAlEnviarReporte.js'

describe('sicoeEstadoAlEnviarReporte', () => {
  it('reporte nuevo → Sin Asignar Ítem', () => {
    assert.equal(sicoeEstadoAlEnviarReporte(null, { esEdicion: false }), 'Sin Asignar Ítem')
  })

  it('REPRO: editar Borrador no debe quedarse en Borrador', () => {
    // Antes: modoEdicion ? reporteInicial.estado : 'Sin Asignar Ítem' → 'Borrador'
    assert.equal(
      sicoeEstadoAlEnviarReporte('Borrador', { esEdicion: true }),
      'Sin Asignar Ítem',
    )
  })

  it('edición de reporte ya enviado conserva estado', () => {
    assert.equal(
      sicoeEstadoAlEnviarReporte('Sin Asignar Ítem', { esEdicion: true }),
      'Sin Asignar Ítem',
    )
    assert.equal(
      sicoeEstadoAlEnviarReporte('No Revisados', { esEdicion: true }),
      'No Revisados',
    )
  })
})
