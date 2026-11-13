/**
 * C-OUT-23 · cableado UI: popup, captura, asignación, Editar → dibujo, App props.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcRoot = join(__dirname, '../..')

function read(rel) {
  return readFileSync(join(srcRoot, rel), 'utf8')
}

describe('caso · dibujo del reporte como gráfico (C-OUT-23)', () => {
  it('SicoeDibujoReporteEditor: oferta Sí|No, asignación y update sin preguntar', () => {
    const ed = read('modules/sicoe-obra/SicoeDibujoReporteEditor.jsx')
    assert.match(ed, /sicoe-dibujo-offer-grafico/)
    assert.match(ed, /¿Guardar también como gráfico\?/)
    assert.match(ed, /sicoe-dibujo-offer-si/)
    assert.match(ed, /sicoe-dibujo-offer-no/)
    assert.match(ed, /planPuenteDibujoGrafico/)
    assert.match(ed, /modo === 'update'/)
    assert.match(ed, /SicoeEsquemaAsignarPopup/)
    assert.match(ed, /planificarAsignacionEsquema/)
    assert.match(ed, /planificarActualizacionVersionEsquema/)
    assert.match(ed, /presentEsquemaExportPopup/)
    assert.match(ed, /composeEsquemaDxf/)
    assert.match(ed, /captureVistaPng/)
    assert.match(ed, /dibujoReporte:\s*true/)
    // Dibujo ya guardado aunque falle el gráfico.
    assert.match(ed, /Dibujo guardado\. No se pudo/)
  })

  it('EsquemaEditorModal pasa captureVistaPng en huellaMode', () => {
    const modal = read('components/esquema/EsquemaEditorModal.jsx')
    assert.match(modal, /captureVistaPng:/)
    assert.match(modal, /composeVistaConEncabezado/)
    assert.match(modal, /compositeMapaYDibujoToDataUrl|captureHuellaVistaRaw/)
  })

  it('Esquemas · Editar de fila dibujo abre Editar dibujo', () => {
    const modal = read('modules/sicoe-obra/SicoeEsquemasReporteModal.jsx')
    assert.match(modal, /esFilaEsquemaDibujoReporte/)
    assert.match(modal, /onEditarDibujo/)
    const app = read('App.jsx')
    assert.match(app, /onEditarDibujo=\{/)
    assert.match(app, /setEditorDibujoReporte\(true\)/)
    assert.match(app, /SicoeDibujoReporteEditor[\s\S]*registros=\{registros\}/)
  })

  it('contrato C-OUT-23 + cableado test:esquema', () => {
    const md = read('components/esquema/CONTRATO_ESQUEMA.md')
    assert.match(md, /C-OUT-23/)
    assert.match(md, /¿Guardar también como gráfico\?/)
    assert.match(md, /caso 53|53\./)
    const pkg = JSON.parse(readFileSync(join(srcRoot, '../package.json'), 'utf8'))
    assert.match(pkg.scripts['test:esquema'], /sicoeDibujoComoGrafico\.test\.js/)
    assert.match(pkg.scripts['test:esquema'], /sicoeDibujoComoGrafico\.scenario\.test\.js/)
  })
})
