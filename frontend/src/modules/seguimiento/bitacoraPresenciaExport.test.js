/**
 * Contrato UI — informes asistencia / maquinaria en barra Seguimiento.
 * node --test src/modules/seguimiento/bitacoraPresenciaExport.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const moduloSrc = readFileSync(join(dir, 'ModuloSeguimiento.jsx'), 'utf8')
const modalSrc = readFileSync(join(dir, 'BitacoraPresenciaExportModal.jsx'), 'utf8')
const apiSrc = readFileSync(join(dir, 'seguimientoApi.js'), 'utf8')

describe('bitacoraPresenciaExport', () => {
  it('íconos junto a horas extras solo con permiso exportar', () => {
    assert.match(moduloSrc, /BitacoraPresenciaExportModal/)
    assert.match(moduloSrc, /bitacora-asistencia-btn/)
    assert.match(moduloSrc, /bitacora-maquinaria-presencia-btn/)
    assert.match(moduloSrc, /UserCheck/)
    assert.match(moduloSrc, /HardHat/)
    assert.match(moduloSrc, /canExportPresencia/)
    assert.match(moduloSrc, /permisosBitacora\?\.exportar/)
  })

  it('modal: empresa, fechas, grilla, descarga', () => {
    assert.match(modalSrc, /bitacora-presencia-grid/)
    assert.match(modalSrc, /bitacora-presencia-download/)
    assert.match(modalSrc, /bitacora-presencia-vacio/)
    assert.match(modalSrc, /Asistencia de personal|asistencia de personal/i)
    assert.match(modalSrc, /presencia de maquinaria/i)
    assert.match(modalSrc, /option value="pdf"/)
    assert.match(modalSrc, /option value="docx"/)
    assert.match(modalSrc, /exportBitacoraPresenciaBlob/)
  })

  it('API presencia opciones y blob', () => {
    assert.match(apiSrc, /opcionesBitacoraPresencia/)
    assert.match(apiSrc, /exportBitacoraPresenciaBlob/)
    assert.match(apiSrc, /bitacora\/export\/presencia/)
  })
})
