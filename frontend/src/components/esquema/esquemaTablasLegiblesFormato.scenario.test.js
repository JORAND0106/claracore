/**
 * Caso 30 · Tablas PNG legibles al insertarse en formatos/documentos.
 * Memoria de volúmenes, cuadro de despiece y coordenadas ≈ tipografía ×2.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ESQUEMA_DOC_CONTAINER_H,
  ESQUEMA_DOC_CONTAINER_W,
  ESQUEMA_DOC_MIN_SCREEN_PX,
  ESQUEMA_DOC_TYPE_SCALE,
} from './esquemaDocLegibility.js'
import {
  EXPORT_TABLE_MIN_SCREEN_PX,
  computeEsquemaExportSize,
  exportCoordTableMetrics,
} from './esquemaExport.js'
import { blankSegmentsForShape, getBuiltinShape } from './esquemaDespieceShapes.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('caso 30 · tipografía ×2 y legible en formato', () => {
  it('factor DOC_TYPE_SCALE = 2 y mínimo en contenedor ≥ cuerpo', () => {
    assert.equal(ESQUEMA_DOC_TYPE_SCALE, 2)
    assert.equal(ESQUEMA_DOC_MIN_SCREEN_PX, 11)
    assert.equal(EXPORT_TABLE_MIN_SCREEN_PX, ESQUEMA_DOC_MIN_SCREEN_PX)
  })

  it('caso a · memoria: tipografía ×2 y tabla a ancho completo', () => {
    const src = readFileSync(join(__dirname, 'esquema3dCalcExport.js'), 'utf8')
    assert.match(src, /ESQUEMA_DOC_TYPE_SCALE/)
    assert.match(src, /contentW \* 1\.0/)
    assert.match(src, /docTypeScale:\s*ESQUEMA_DOC_TYPE_SCALE/)
    assert.doesNotMatch(src, /contentW \* 0\.52/)
  })

  it('caso b · despiece: ancho ×2 y tipografía proporcional', () => {
    const src = readFileSync(join(__dirname, 'esquemaDespieceExport.js'), 'utf8')
    assert.match(src, /2200 \* ESQUEMA_DOC_TYPE_SCALE/)
    assert.match(src, /fontScale:\s*ESQUEMA_DOC_TYPE_SCALE/)
    // Tipografía sigue width/1600 (duplica al duplicar ancho).
    assert.match(src, /textScale = width \/ 1600/)
  })

  it('caso c · coordenadas ≥10 puntos: texto ≥11 px en contenedor de formato', () => {
    const nodes = Array.from({ length: 10 }, (_, i) => ({
      nodeNum: i + 1,
      norte: 1000000 + i * 10.5,
      este: 900000 + i * 8.25,
      cota: 2500 + i * 0.1,
      desc: `Punto ${i + 1}`,
    }))
    const size = computeEsquemaExportSize({
      objects: [
        { type: 'linea', x1: 0, y1: 0, x2: 400, y2: 200 },
        ...nodes.map((n, i) => ({
          type: 'nodo', x: i * 20, y: i * 10, nodeNum: n.nodeNum,
          norte: n.norte, este: n.este, cota: n.cota,
        })),
      ],
      nodes,
    })
    const m = size.tableMetrics
    assert.ok(m.bodyFontPx >= 30, `bodyFont=${m.bodyFontPx}`)
    const fit = Math.min(ESQUEMA_DOC_CONTAINER_W / size.w, ESQUEMA_DOC_CONTAINER_H / size.h)
    const screenPx = m.bodyFontPx * fit
    assert.ok(
      screenPx + 0.35 >= ESQUEMA_DOC_MIN_SCREEN_PX,
      `texto en página ≈ ${screenPx.toFixed(2)} px < ${ESQUEMA_DOC_MIN_SCREEN_PX} (fit=${fit.toFixed(3)} body=${m.bodyFontPx})`,
    )
    // Tipografía base ≈×2 sin boost aún
    const base = exportCoordTableMetrics(1100)
    assert.ok(base.scale >= 2.7)
  })

  it('caso d · sin cortes: columnas/valores y contrato actualizados', () => {
    const md = readFileSync(join(__dirname, 'CONTRATO_ESQUEMA.md'), 'utf8')
    assert.match(md, /C-OUT-06/)
    assert.match(md, /todo el ancho útil/i)
    assert.match(md, /30\.\s*\*\*Tablas PNG legibles/)
    assert.match(md, /esquemaTablasLegiblesFormato/)
    assert.match(md, /C-DES-06[\s\S]*Tipografía de tablas ≈×2/)

    // Formas del despiece siguen disponibles (sin pérdida de columnas).
    const shape = getBuiltinShape('doble_gancho_180')
    assert.ok(shape)
    const segs = blankSegmentsForShape(shape)
    assert.ok(segs.length >= 3)
  })

  it('caso e · cableado en test:esquema y PDF Bitácora a ancho útil', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8'))
    assert.match(pkg.scripts['test:esquema'], /esquemaTablasLegiblesFormato\.scenario\.test\.js/)
    const bit = readFileSync(join(__dirname, '../../../../backend/bitacora_pdf.py'), 'utf8')
    assert.match(bit, /_TABLA_BOX_W\s*=\s*700/)
    assert.match(bit, /_is_esquema_tabla_img|_tabla_esquema_block/)
    assert.match(bit, /memoria-calculo|despiece-acero/)
  })
})
