/**
 * Contrato UI — informe horas extras Bitácora.
 * node --test src/modules/seguimiento/bitacoraHorasExtraExport.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const barSrc = readFileSync(join(dir, 'BitacoraExportRangoBar.jsx'), 'utf8')
const modalSrc = readFileSync(join(dir, 'BitacoraHorasExtraExportModal.jsx'), 'utf8')
const apiSrc = readFileSync(join(dir, 'seguimientoApi.js'), 'utf8')

describe('bitacoraHorasExtraExport', () => {
  it('barra de exportación expone ícono con tooltip y abre modal', () => {
    assert.match(barSrc, /BitacoraHorasExtraExportModal/)
    assert.match(barSrc, /<Clock\b/)
    assert.match(barSrc, /Informe de horas extras del personal/)
    assert.match(barSrc, /bitacora-horas-extra-btn/)
  })

  it('modal pide rango, empresa, responsable, elaborador, aprobador y formato PDF/Word', () => {
    assert.match(modalSrc, /Empresa \(tiempo extra\)/)
    assert.match(modalSrc, /Responsable de obra/)
    assert.match(modalSrc, /Elaborador/)
    assert.match(modalSrc, /Aprobador/)
    assert.match(modalSrc, /option value="pdf"/)
    assert.match(modalSrc, /option value="docx"/)
    assert.match(modalSrc, /CcConfirmModal/)
    assert.match(modalSrc, /exportBitacoraHorasExtraBlob/)
  })

  it('API cablea opciones y export blob', () => {
    assert.match(apiSrc, /opcionesBitacoraHorasExtra/)
    assert.match(apiSrc, /exportBitacoraHorasExtraBlob/)
    assert.match(apiSrc, /bitacora\/export\/horas-extra/)
  })
})
