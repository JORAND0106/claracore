import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

/**
 * Contrato de etiquetas al hover: el selector debe cubrir title,
 * data-cc-tooltip y data-cc-title-held (tras adopción del tip nativo).
 */
describe('esquema toolbar hover tips — resolución de etiqueta', () => {
  function resolveLabel(attrs) {
    if (attrs['data-cc-tooltip'] != null && String(attrs['data-cc-tooltip']).trim()) {
      return String(attrs['data-cc-tooltip']).trim()
    }
    if (attrs['data-cc-title-held'] != null && String(attrs['data-cc-title-held']).trim()) {
      return String(attrs['data-cc-title-held']).trim()
    }
    if (attrs.title != null && String(attrs.title).trim()) {
      return String(attrs.title).trim()
    }
    if (attrs['aria-label'] != null && String(attrs['aria-label']).trim()) {
      return String(attrs['aria-label']).trim()
    }
    return ''
  }

  it('prioriza data-cc-tooltip sobre title', () => {
    assert.equal(resolveLabel({
      title: 'Viejo',
      'data-cc-tooltip': 'Extruir',
    }), 'Extruir')
  })

  it('usa data-cc-title-held cuando el title nativo ya se adoptó', () => {
    assert.equal(resolveLabel({
      'data-cc-title-held': 'Vista superior',
    }), 'Vista superior')
  })

  it('cae a aria-label si no hay tip', () => {
    assert.equal(resolveLabel({ 'aria-label': 'Deshacer' }), 'Deshacer')
  })
})
