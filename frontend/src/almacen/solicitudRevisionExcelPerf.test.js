/**
 * Revisión Excel + ancho +30% + bloqueo OC sin insumo.
 * node --test frontend/src/almacen/solicitudRevisionExcelPerf.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

describe('SolicitudDetalleModal — ancho + bloqueo OC', () => {
  it('popup de revisión completa ampliado ~30% (1622px)', () => {
    const src = readFileSync(join(dir, 'SolicitudDetalleModal.jsx'), 'utf8')
    assert.match(src, /min\(1622px, 100%\)/)
  })

  it('bloquea generar OC si faltan insumos del catálogo', () => {
    const src = readFileSync(join(dir, 'SolicitudDetalleModal.jsx'), 'utf8')
    assert.match(src, /itemsSinInsumo/)
    assert.match(src, /intentarAprobarOc/)
    assert.match(src, /faltan insumos del catálogo/)
    assert.match(src, /Asigne el insumo en la revisión/)
  })
})

describe('SolicitudLineaRevisionModal — Excel', () => {
  it('modal de línea mismo ancho que detalle (1622px) y fila tipo Excel editable', () => {
    const src = readFileSync(join(dir, 'SolicitudLineaRevisionModal.jsx'), 'utf8')
    assert.match(src, /LINEA_MODAL_WIDTH\s*=\s*'min\(1622px, 100%\)'/)
    assert.match(src, /DESC\. CONTRATISTA/)
    assert.match(src, /ExcelHeader/)
    assert.match(src, /InsumoSearchTable/)
    assert.match(src, /hideLabel/)
  })

  it('resumen de línea procesada en tabla Excel (máx. dos filas de datos)', () => {
    const src = readFileSync(join(dir, 'SolicitudLineaRevisionModal.jsx'), 'utf8')
    assert.match(src, /Esta línea ya no admite revisión/)
    assert.match(src, /abbr="INSUMO"/)
    assert.match(src, /abbr="CANT\."/)
    assert.match(src, /abbr="COSTO"/)
    assert.match(src, /abbr="COBRO"/)
    assert.doesNotMatch(src, /Insumo: <strong/)
  })
})

describe('Backend perf — validación sin full-scan listado', () => {
  it('validate items llama apply_saldo_flags con refresh_listado=False', () => {
    const src = readFileSync(join(dir, '../../../backend/almacen_service.py'), 'utf8')
    assert.match(
      src,
      /apply_saldo_flags_batch\(\s*contrato_id,\s*out,[\s\S]*?refresh_listado=False,/
    )
    assert.match(src, /faltan insumos del catálogo/)
  })
})
