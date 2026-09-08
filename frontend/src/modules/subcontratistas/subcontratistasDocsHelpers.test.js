import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DOC_TIPO_LABEL,
  docTipoOrder,
  emptyDocDraft,
  emptyPolizaDraft,
  fmtMoneda,
  nivelPolizaBadge,
  polizaTipoLabel,
  polizaTipoOptions,
} from './subcontratistasDocsHelpers.js'

describe('subcontratistasDocsHelpers', () => {
  it('fmtMoneda formatea es-CO', () => {
    assert.equal(fmtMoneda(null), '—')
    assert.equal(fmtMoneda(''), '—')
    assert.match(fmtMoneda(1500000), /\$1\.500\.000/)
  })

  it('polizaTipoOptions incluye garantia, RC y otro', () => {
    const vals = polizaTipoOptions.map((o) => o.value)
    assert.deepEqual(vals, ['garantia', 'responsabilidad_civil', 'otro'])
    assert.equal(polizaTipoLabel('otro', 'Todo riesgo'), 'Todo riesgo')
    assert.equal(polizaTipoLabel('garantia'), 'Garantía')
  })

  it('docTipoOrder es jerárquico: contrato → SS → propuesta', () => {
    assert.deepEqual(docTipoOrder.map((d) => d.tipo), [
      'contrato_firmado',
      'seguridad_social',
      'propuesta_economica',
    ])
    assert.equal(DOC_TIPO_LABEL.contrato_firmado, 'Contrato Firmado')
    assert.equal(DOC_TIPO_LABEL.seguridad_social, 'Pago Seguridad Social')
  })

  it('nivelPolizaBadge refleja vencida / por_vencer / ok', () => {
    const v = nivelPolizaBadge({ nivel: 'vencida', label: 'Póliza vencida' })
    assert.equal(v.show, true)
    assert.equal(v.color, '#ef4444')
    const p = nivelPolizaBadge({ nivel: 'por_vencer' })
    assert.equal(p.show, true)
    assert.equal(p.color, '#f59e0b')
    const ok = nivelPolizaBadge({ nivel: 'ok', label: 'Pólizas al día' })
    assert.equal(ok.show, true)
    assert.equal(ok.color, '#22c55e')
    const none = nivelPolizaBadge(null)
    assert.equal(none.show, false)
  })

  it('drafts locales tienen _localId', () => {
    assert.ok(emptyPolizaDraft()._localId)
    assert.equal(emptyDocDraft('seguridad_social').tipo, 'seguridad_social')
  })
})
