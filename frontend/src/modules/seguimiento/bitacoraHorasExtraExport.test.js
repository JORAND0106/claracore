/**
 * Contrato UI — informe horas extras desde barra Seguimiento + grilla previa.
 * node --test src/modules/seguimiento/bitacoraHorasExtraExport.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const barSrc = readFileSync(join(dir, 'BitacoraExportRangoBar.jsx'), 'utf8')
const editorSrc = readFileSync(join(dir, 'BitacoraEntradaEditor.jsx'), 'utf8')
const moduloSrc = readFileSync(join(dir, 'ModuloSeguimiento.jsx'), 'utf8')
const modalSrc = readFileSync(join(dir, 'BitacoraHorasExtraExportModal.jsx'), 'utf8')
const apiSrc = readFileSync(join(dir, 'seguimientoApi.js'), 'utf8')

describe('bitacoraHorasExtraExport', () => {
  it('ícono general en barra de Seguimiento (no en cada día ni en export rango)', () => {
    assert.match(moduloSrc, /BitacoraHorasExtraExportModal/)
    assert.match(moduloSrc, /<Clock\b/)
    assert.match(moduloSrc, /bitacora-horas-extra-btn/)
    assert.match(moduloSrc, /Informe de horas extras/)
    assert.doesNotMatch(editorSrc, /bitacora-horas-extra-btn/)
    assert.doesNotMatch(editorSrc, /BitacoraHorasExtraExportModal/)
    assert.doesNotMatch(barSrc, /BitacoraHorasExtraExportModal/)
    assert.doesNotMatch(barSrc, /bitacora-horas-extra-btn/)
  })

  it('modal: empresa/fechas, grilla, descarga solo con filas, PDF/Word', () => {
    assert.match(modalSrc, /bitacora-horas-extra-grid/)
    assert.match(modalSrc, /bitacora-horas-extra-download/)
    assert.match(modalSrc, /No hay horas extras para la empresa/)
    assert.match(modalSrc, /puedeDescargar/)
    assert.match(modalSrc, /option value="pdf"/)
    assert.match(modalSrc, /option value="docx"/)
    assert.match(modalSrc, /Responsable de obra/)
    assert.match(modalSrc, /Elaborador/)
    assert.match(modalSrc, /Aprobador/)
    assert.match(modalSrc, /exportBitacoraHorasExtraBlob/)
  })

  it('API opciones acepta empresa para preview de filas', () => {
    assert.match(apiSrc, /opcionesBitacoraHorasExtra/)
    assert.match(apiSrc, /exportBitacoraHorasExtraBlob/)
    assert.match(apiSrc, /bitacora\/export\/horas-extra/)
    assert.match(apiSrc, /if \(emp\) q\.set\('empresa', emp\)/)
  })
})
