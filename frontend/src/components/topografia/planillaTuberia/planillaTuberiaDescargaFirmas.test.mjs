/**
 * Ejecutar: node --test frontend/src/components/topografia/planillaTuberia/planillaTuberiaDescargaFirmas.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { filenameFromContentDisposition } from '../contentDispositionFilename.js'
import { nombreArchivoPlanillaTuberia } from './planillaTuberiaUtils.js'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')
const sharedSrc = readFileSync(join(dir, '../topografiaShared.jsx'), 'utf8')

describe('nombre de descarga de la planilla', () => {
  it('termina con el número vigente y no con el código interno', () => {
    const links = [
      { reporte_id: 9, numero_reporte: 128 },
      { reporte_id: 9, numero_reporte: 128 },
      { reporte_id: 3, numero_reporte: 15 },
    ]
    assert.equal(nombreArchivoPlanillaTuberia(links, { extension: 'xlsx' }), 'planilla_tuberia_128_15.xlsx')
    assert.equal(nombreArchivoPlanillaTuberia(links, { extension: 'pdf' }), 'planilla_tuberia_128_15.pdf')
    assert.equal(
      nombreArchivoPlanillaTuberia([{ numero_reporte: 7 }], { extension: 'pdf' }),
      'planilla_tuberia_7.pdf',
    )
    assert.equal(nombreArchivoPlanillaTuberia([], { extension: 'xlsx' }), 'planilla_tuberia.xlsx')
    assert.equal(nombreArchivoPlanillaTuberia([], { extension: 'pdf' }), 'planilla_tuberia.pdf')
    assert.equal(
      nombreArchivoPlanillaTuberia([{ numero_reporte: 128 }], { extension: 'xlsx', plantilla: true }),
      'planilla_tuberia_plantilla_128.xlsx',
    )
    assert.equal(
      nombreArchivoPlanillaTuberia([], { extension: 'pdf', plantilla: true }),
      'planilla_tuberia_plantilla.pdf',
    )
  })

  it('el formulario pide el nombre del servidor y no recorta el id', () => {
    assert.match(formSrc, /nombreArchivoPlanillaTuberia\(/)
    assert.match(formSrc, /preferServerFilename:\s*true/)
    assert.doesNotMatch(formSrc, /planilla_tuberia_\$\{String\(planilla\.id\)\.slice\(0,\s*8\)/)
  })

  it('la descarga usa Content-Disposition cuando el llamador lo pide', () => {
    assert.match(sharedSrc, /filenameFromContentDisposition/)
    assert.match(sharedSrc, /preferServerFilename/)
    assert.match(sharedSrc, /__downloadName/)
    assert.equal(
      filenameFromContentDisposition('attachment; filename="planilla_tuberia_128.xlsx"'),
      'planilla_tuberia_128.xlsx',
    )
    assert.equal(
      filenameFromContentDisposition("attachment; filename*=UTF-8''planilla_tuberia_7.pdf"),
      'planilla_tuberia_7.pdf',
    )
    assert.equal(filenameFromContentDisposition(''), '')
  })
})
