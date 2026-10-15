/**
 * Run: node --test src/modules/rrhh/EstadoDocumentalInformeModal.test.js
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ESTADO_DOCUMENTAL_CODIGO,
  FILTROS_ESTADO_DOCUMENTAL,
  FORMATOS_ESTADO_DOCUMENTAL,
} from './estadoDocumentalInformeOptions.js'

describe('estadoDocumentalInformeOptions', () => {
  it('expone los tres filtros institucionales', () => {
    const ids = FILTROS_ESTADO_DOCUMENTAL.map((f) => f.id)
    assert.deepEqual(ids, ['todos', 'aprobado', 'sin_aprobar'])
    assert.equal(
      FILTROS_ESTADO_DOCUMENTAL.find((f) => f.id === 'sin_aprobar')?.label,
      'Personal sin aprobar',
    )
  })

  it('permite Excel y PDF', () => {
    const ids = FORMATOS_ESTADO_DOCUMENTAL.map((f) => f.id)
    assert.deepEqual(ids, ['xlsx', 'pdf'])
  })

  it('código de calidad alineado con backend', () => {
    assert.equal(ESTADO_DOCUMENTAL_CODIGO, 'CC-RRHH-DOC-001')
  })
})
