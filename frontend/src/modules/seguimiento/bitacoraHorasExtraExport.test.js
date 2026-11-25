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
  it('ícono general en barra de Seguimiento solo con permiso exportar', () => {
    assert.match(moduloSrc, /BitacoraHorasExtraExportModal/)
    assert.match(moduloSrc, /<Clock\b/)
    assert.match(moduloSrc, /bitacora-horas-extra-btn/)
    assert.match(moduloSrc, /permisosBitacora\?\.exportar/)
    assert.doesNotMatch(moduloSrc, /permisosBitacora\?\.exportar \|\| permisosBitacora\?\.ver/)
    assert.doesNotMatch(editorSrc, /bitacora-horas-extra-btn/)
    assert.doesNotMatch(editorSrc, /BitacoraHorasExtraExportModal/)
    assert.doesNotMatch(barSrc, /BitacoraHorasExtraExportModal/)
    assert.doesNotMatch(barSrc, /bitacora-horas-extra-btn/)
  })

  it('modal: grilla con subtotales, fuente compacta, descarga solo con detalle', () => {
    assert.match(modalSrc, /bitacora-horas-extra-grid/)
    assert.match(modalSrc, /bitacora-horas-extra-download/)
    assert.match(modalSrc, /No hay horas extras para la empresa/)
    assert.match(modalSrc, /Subtotal ·/)
    assert.match(modalSrc, /Total general/)
    assert.match(modalSrc, /tieneDetalle/)
    assert.match(modalSrc, /calc\(var\(--cc-sm, 12px\) - 2px\)/)
    assert.match(modalSrc, /option value="pdf"/)
    assert.match(modalSrc, /option value="docx"/)
    assert.match(modalSrc, /exportBitacoraHorasExtraBlob/)
  })

  it('API opciones acepta empresa para preview de filas', () => {
    assert.match(apiSrc, /opcionesBitacoraHorasExtra/)
    assert.match(apiSrc, /exportBitacoraHorasExtraBlob/)
    assert.match(apiSrc, /bitacora\/export\/horas-extra/)
    assert.match(apiSrc, /if \(emp\) q\.set\('empresa', emp\)/)
  })
})
