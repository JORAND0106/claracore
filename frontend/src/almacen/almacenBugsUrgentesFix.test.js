/**
 * Smoke tests — bugs urgentes Almacén (cotización, justificación, VU cobro, OC).
 * node --test frontend/src/almacen/almacenBugsUrgentesFix.test.js
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const adminDir = join(dir, '../admin')

describe('orden paneles Costos Insumo / No Previsto', () => {
  it('Impuesto → Nº cot → Fecha → Vigencia en ambos paneles', () => {
    const src = readFileSync(join(adminDir, 'SeccionCatalogoInsumos.jsx'), 'utf8')
    const insumoBlock = src.slice(src.indexOf('Costos — Insumo'), src.indexOf('Costos — No Previsto'))
    const npStart = src.indexOf('Costos — No Previsto')
    const npEnd = src.indexOf('consumoNegociado', npStart)
    const npBlock = src.slice(npStart, npEnd > 0 ? npEnd : npStart + 8000)
    for (const block of [insumoBlock, npBlock]) {
      const iImp = block.indexOf('>Impuesto<')
      const iNum = block.indexOf('Nº cot')
      const iFec = block.indexOf('>Fecha<')
      const iVig = block.indexOf('>Vigencia<')
      assert.ok(iImp > 0 && iNum > iImp && iFec > iNum && iVig > iFec, 'orden de campos incorrecto')
    }
  })
})

describe('justificación supera presupuesto', () => {
  it('form y grilla usan justificación obligatoria', () => {
    const helpers = readFileSync(join(dir, 'solicitudFormHelpers.js'), 'utf8')
    const form = readFileSync(join(dir, 'SolicitudForm.jsx'), 'utf8')
    const excel = readFileSync(join(dir, 'SolicitudFormExcelTable.jsx'), 'utf8')
    const backend = readFileSync(join(dir, '../../../backend/almacen_service.py'), 'utf8')
    assert.match(helpers, /MIN_JUSTIFICACION_SUPERA_PPTO/)
    assert.match(helpers, /lineasSinJustificacionSobrepresupuesto/)
    assert.match(form, /lineasSinJustificacionSobrepresupuesto/)
    assert.match(form, /Justificación obligatoria/)
    assert.match(excel, /abbr: 'Justificación'/)
    assert.match(excel, /MIN_JUSTIFICACION_SUPERA_PPTO/)
    assert.match(backend, /_require_justificacion_sobrepresupuesto/)
  })
})

describe('VU cobro al mapear', () => {
  it('no envía cobro 0 que bloquee listado', () => {
    const src = readFileSync(join(dir, 'SolicitudLineaRevisionModal.jsx'), 'utf8')
    const service = readFileSync(join(dir, '../../../backend/almacen_service.py'), 'utf8')
    assert.match(src, /cobroNum > 0/)
    assert.match(src, /Number\(item\.vlr_unitario_cobro\) > 0/)
    assert.match(service, /override_cobro is not None and override_cobro > 0/)
    assert.match(service, /presupuesto_vlr_unitario|vlr_unitario/)
  })
})

describe('OC proveedor_id resiliente', () => {
  it('insert/update toleran columna ausente', () => {
    const src = readFileSync(join(dir, '../../../backend/almacen_service.py'), 'utf8')
    assert.match(src, /def _insert_orden_compra_row/)
    assert.match(src, /def _update_orden_compra_proveedor/)
    assert.match(src, /_insert_orden_compra_row\(sb, oc_row\)/)
  })
})
