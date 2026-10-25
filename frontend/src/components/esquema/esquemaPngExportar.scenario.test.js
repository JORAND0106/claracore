/**
 * Caso C-OUT-13 · PNG siempre en el registro; Exportar PDF/DXF; nube.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ESQUEMA_INVOCATION_POINTS,
} from './esquemaInvocationPoints.js'
import {
  filterEsquemaRegistroAdjuntos,
  repairEsquemaRegistroList,
} from './esquemaRegistroAdjuntos.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcRoot = join(__dirname, '../..')

function readSrc(rel) {
  return readFileSync(join(srcRoot, rel), 'utf8')
}

describe('caso · PNG siempre + popup Exportar (C-OUT-13)', () => {
  it('modal no mete DXF/PDF en adjuntos del registro; sí en exports + popup', () => {
    const modal = readFileSync(join(__dirname, 'EsquemaEditorModal.jsx'), 'utf8')
    assert.match(modal, /filterEsquemaRegistroAdjuntos/)
    assert.match(modal, /exports:\s*\{\s*pdf:\s*exportPdf/)
    assert.match(modal, /presentEsquemaExportPopup/)
    assert.doesNotMatch(
      modal,
      /adjuntos\.push\(\s*\{[^}]*kind:\s*['"]esquema-dxf['"]/,
    )
  })

  it('applyEsquemaSaveBundle rechaza no-PNG y no comitea exports', () => {
    const src = readFileSync(join(__dirname, 'applyEsquemaSaveBundle.js'), 'utf8')
    assert.match(src, /isEsquemaPngPayload/)
    assert.match(src, /filterEsquemaRegistroAdjuntos/)
    assert.match(src, /El esquema del registro debe ser PNG/)
    assert.match(src, /extras\?\.exports/)
  })

  it('Bitácora repara lista y no muestra DXF', () => {
    const bit = readSrc('modules/seguimiento/BitacoraAdjuntos.jsx')
    assert.match(bit, /repairEsquemaRegistroList/)
    const repaired = repairEsquemaRegistroList([
      { origen: 'esquema', kind: 'esquema', url: 'u.dxf', mime: 'application/dxf', nombre: 'a.dxf' },
      { origen: 'esquema', kind: 'esquema', url: 'u.png', mime: 'image/png', nombre: 'a.png' },
    ])
    assert.equal(repaired.length, 1)
    assert.match(repaired[0].url, /\.png/)
  })

  it('cada punto de invocación usa EsquemaEditorModal (paridad PNG)', () => {
    assert.ok(ESQUEMA_INVOCATION_POINTS.length >= 12)
    for (const pt of ESQUEMA_INVOCATION_POINTS) {
      const src = readSrc(pt.file)
      assert.match(src, /EsquemaEditorModal/, pt.id)
    }
  })

  it('filter deja solo PNG de cálculo', () => {
    const out = filterEsquemaRegistroAdjuntos([
      { kind: 'esquema-dxf', mime: 'application/dxf', dataUri: 'data:application/dxf;base64,x' },
      { kind: 'memoria-calculo', mime: 'image/png', dataUri: 'data:image/png;base64,x' },
    ])
    assert.equal(out.length, 1)
  })

  it('contrato C-OUT-13 + Exportar', () => {
    const md = readFileSync(join(__dirname, 'CONTRATO_ESQUEMA.md'), 'utf8')
    assert.match(md, /C-OUT-13/)
    assert.match(md, /siempre como PNG|SIEMPRE.*PNG|siempre.*PNG/i)
    assert.match(md, /Exportar/)
    assert.match(md, /esquemaPngExportar|esquemaRegistroAdjuntos/)
  })
})
