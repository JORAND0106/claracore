/**
 * C-OUT-22 · Vista previa muestra imagen completa (encabezado + iso + cuadro).
 * Nunca recorta el cuadro de resumen de la memoria.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
/* readFileSync also used for package.json */
import {
  ESQUEMA_MEMORIA_TABLE_COLUMNS,
  esquemaSnapshotTieneMemoria,
  planEsquemaExportSalida,
} from './esquemaExport.js'
import {
  ESQUEMA_SALIDAS_REFERENCIAS,
  fixtureMemoriaPocetaSnapshot,
  verifySalidaAgainstReference,
} from './esquemaSalidasReferencia.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcRoot = join(__dirname, '../..')

function read(rel) {
  return readFileSync(join(srcRoot, rel), 'utf8')
}

describe('caso · vista previa imagen completa con cuadro (C-OUT-22)', () => {
  it('lightbox no recorta: overflow auto + img width 100% height auto', () => {
    const css = read('index.css')
    assert.match(css, /\.cc-sicoe-lightbox-stage\s*\{[^}]*overflow:\s*auto/s)
    assert.match(css, /\.cc-sicoe-lightbox-stage img\s*\{[^}]*width:\s*100%/s)
    assert.match(css, /\.cc-sicoe-lightbox-stage img\s*\{[^}]*height:\s*auto/s)
    assert.doesNotMatch(
      css,
      /\.cc-sicoe-lightbox-stage\s*\{[^}]*overflow:\s*hidden/s,
    )
    const lb = read('modules/sicoe-obra/SicoeMediaLightbox.jsx')
    assert.match(lb, /sicoe-media-lightbox-stage/)
    assert.match(lb, /sicoe-media-lightbox-img/)
  })

  it('EsquemaCalcAdjuntoPreview: stage con scroll; img sin maxHeight que recorte', () => {
    const prev = read('components/esquema/EsquemaCalcAdjuntoPreview.jsx')
    assert.match(prev, /esquema-calc-adjunto-preview-stage/)
    assert.match(prev, /esquema-calc-adjunto-preview-img/)
    assert.match(prev, /overflow:\s*'auto'/)
    assert.match(prev, /width:\s*'100%'/)
    assert.match(prev, /height:\s*'auto'/)
    assert.doesNotMatch(prev, /maxHeight:\s*'min\(70vh/)
  })

  it('PNG con cálculo incluye hasMemoriaTable (cuadro bajo el isométrico)', () => {
    const snap = fixtureMemoriaPocetaSnapshot()
    assert.equal(esquemaSnapshotTieneMemoria(snap), true)
    const solid = {
      type: 'solid3d',
      id: 'muro',
      cells: [{ z0: 0, z1: 1, ring: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }],
    }
    const plan = planEsquemaExportSalida({
      title: 'Cabezal 9A',
      calcSnapshots: [snap],
      solids3d: [solid],
    })
    assert.equal(plan.hasMemoriaTable, true)
    assert.ok(plan.memoria?.length >= 1)
    for (const col of ESQUEMA_MEMORIA_TABLE_COLUMNS) {
      assert.ok(plan.columnsRequired.includes(col), col)
    }
    const v = verifySalidaAgainstReference({
      ...plan,
      hasHeader: true,
      hasIso: true,
      hasMemoriaTable: true,
      columns: plan.columnsRequired,
      headersIntact: plan.headersIntact,
      noWordBreak: true,
      previewShowsFullImage: true,
      cellFontPx: (plan.header?.width || 1600) / 55,
      width: plan.header?.width || 1600,
    }, 'esquema-preview-completa')
    assert.equal(v.ok, true, v.errors.join('; '))
  })

  it('referencia aprobada esquema-preview-completa en catálogo', () => {
    const ids = ESQUEMA_SALIDAS_REFERENCIAS.map((r) => r.id)
    assert.ok(ids.includes('esquema-preview-completa'))
  })

  it('contrato C-OUT-22 + cableado test:esquema', () => {
    const md = read('components/esquema/CONTRATO_ESQUEMA.md')
    assert.match(md, /C-OUT-22/)
    assert.match(md, /vista previa/i)
    assert.match(md, /cuadro de resumen|hasMemoriaTable/i)
    assert.match(md, /sin recortar|nunca la recorta|nunca recort/i)
    const pkg = JSON.parse(readFileSync(join(srcRoot, '../package.json'), 'utf8'))
    assert.match(pkg.scripts['test:esquema'], /esquemaPreviewMemoriaCompleta\.scenario\.test\.js/)
  })
})
