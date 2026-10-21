/**
 * Caso 31 · Imágenes de esquema nítidas en PDF de módulos.
 * PNG sin pérdida al insertar; encabezado «Color» en una línea.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESQUEMA_DOC_TYPE_SCALE } from './esquemaDocLegibility.js'
import { wrapMemoriaText } from './esquema3dCalcExport.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('caso 31 · PNG nítido en PDF + encabezado Color', () => {
  it('caso a · Bitácora embebe tablas como PNG lossless (sin JPEG/thumbnail)', () => {
    const bit = readFileSync(join(__dirname, '../../../../backend/bitacora_pdf.py'), 'utf8')
    assert.match(bit, /lossless\s*=\s*bool\(es_tabla\)|lossless=lossless/)
    assert.match(bit, /format="PNG"/)
    assert.match(bit, /_TABLA_MAX_PX_W\s*=\s*4800/)
    assert.match(bit, /_TABLA_MAX_PX_H\s*=\s*6400/)
    assert.doesNotMatch(
      bit,
      /es_tabla[\s\S]{0,200}im\.save\(out, format="JPEG"/,
    )
  })

  it('caso a · Color cabe en una línea a tipografía × DOC_TYPE_SCALE', () => {
    const src = readFileSync(join(__dirname, 'esquema3dCalcExport.js'), 'utf8')
    assert.match(src, /key:\s*'color',\s*label:\s*'Color',\s*w:\s*56/)
    assert.match(src, /wrapMemoriaText\(ctx, col\.label, Math\.max\(8, col\.w - 8\), 1\)/)
    assert.match(src, /measureText\('Color'\)/)
    assert.equal(ESQUEMA_DOC_TYPE_SCALE, 2)

    // Sin DOM real: simular medida de encabezado partido vs. ancho.
    const fakeCtx = {
      widths: { Color: 52, Colo: 44, r: 8 },
      measureText(t) {
        const s = String(t)
        if (this.widths[s] != null) return { width: this.widths[s] }
        // Aprox. 10 px/carácter para el resto.
        return { width: s.length * 10 }
      },
    }
    // Con maxW insuficiente y maxLines=2 se partía «Colo/r».
    const broken = wrapMemoriaText(fakeCtx, 'Color', 45, 2)
    assert.ok(broken.length >= 1)
    // Con ancho ≥ medida + padding, una sola línea.
    const ok = wrapMemoriaText(fakeCtx, 'Color', 52 + 12, 1)
    assert.deepEqual(ok, ['Color'])
  })

  it('caso b · despiece: tipografía ×2 intacta (sin regresiones de letra)', () => {
    const src = readFileSync(join(__dirname, 'esquemaDespieceExport.js'), 'utf8')
    assert.match(src, /2200 \* ESQUEMA_DOC_TYPE_SCALE/)
    assert.match(src, /fontScale:\s*ESQUEMA_DOC_TYPE_SCALE/)
  })

  it('caso c · coordenadas ≥10 puntos: tipografía ×2 intacta', () => {
    const src = readFileSync(join(__dirname, 'esquemaExport.js'), 'utf8')
    assert.match(src, /ESQUEMA_DOC_TYPE_SCALE/)
    assert.match(src, /1\.35 \* ESQUEMA_DOC_TYPE_SCALE/)
  })

  it('caso d · FO-EO-04 / Actas: gráficos prefer_png + presupuesto alto', () => {
    const inf = readFileSync(join(__dirname, '../../../../backend/informes.py'), 'utf8')
    assert.match(inf, /FO_EO04_GRAFICO_IMG_MAX_PX[\s\S]*4800/)
    assert.match(inf, /FO_EO04_GRAFICO_IMG_MAX_BYTES[\s\S]*2500000/)
    assert.match(inf, /prefer_png/)
    assert.match(inf, /_FO_EO04_GRAFICO_LOSSLESS/)
  })

  it('contrato y cableado test:esquema', () => {
    const md = readFileSync(join(__dirname, 'CONTRATO_ESQUEMA.md'), 'utf8')
    assert.match(md, /C-OUT-07/)
    assert.match(md, /31\.\s*\*\*PNG nítido/)
    assert.match(md, /esquemaPngNitidoPdf/)
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8'))
    assert.match(pkg.scripts['test:esquema'], /esquemaPngNitidoPdf\.scenario\.test\.js/)
  })
})
