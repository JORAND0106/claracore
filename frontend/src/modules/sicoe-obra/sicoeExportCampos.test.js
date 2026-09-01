import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  SICOE_CAMPOS_VIRTUALES_EXPORT,
  SICOE_EXPORT_CAMPOS_DEFAULT,
  SICOE_LABELS_EXPORT,
  sicoePrettyCampoExport,
} from './sicoeExportCampos.js'

describe('sicoeExportCampos', () => {
  it('incluye Número de Corte como campo virtual y en defaults', () => {
    assert.ok(SICOE_CAMPOS_VIRTUALES_EXPORT.includes('corte_numero'))
    assert.ok(SICOE_EXPORT_CAMPOS_DEFAULT.includes('corte_numero'))
    const idxSem = SICOE_EXPORT_CAMPOS_DEFAULT.indexOf('semana_numero')
    const idxCorte = SICOE_EXPORT_CAMPOS_DEFAULT.indexOf('corte_numero')
    assert.ok(idxCorte > idxSem)
    assert.equal(SICOE_LABELS_EXPORT.corte_numero, 'Numero de Corte')
    assert.equal(sicoePrettyCampoExport('corte_numero'), 'Numero de Corte')
  })
})
