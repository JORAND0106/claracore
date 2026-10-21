/**
 * Caso 32 · Dibujo por coordenadas en todos los módulos (no solo SicoeObra).
 * Bitácora / Presupuesto / Actas: mismo panel que SicoeObra; lo propio de
 * SicoeObra (refs, sync portada, color ítem) permanece solo en huellaMode.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { accionDibujarNodosPorTipo } from './esquemaApplyCoordRows.js'
import { buildEsquemaDraftSnapshot } from './esquemaDraft.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const modal = readFileSync(join(__dirname, 'EsquemaEditorModal.jsx'), 'utf8')

describe('caso 33 · dibujo por coordenadas transversal', () => {
  it('caso a · panel coords + tipo Nodo/Línea/Polígono en módulos no-huella', () => {
    assert.match(modal, /localDibujoTipo/)
    assert.match(modal, /effectiveDibujoTipo/)
    assert.match(modal, /setEffectiveDibujoTipo/)
    assert.match(modal, /data-testid="esquema-coords-tool-block"/)
    assert.match(modal, /DibujoTipoCompactPanel/)
    // Ya no exige onHuellaDibujoTipoChange para mostrar el selector.
    assert.doesNotMatch(
      modal,
      /typeof onHuellaDibujoTipoChange === 'function' \? \(\s*<DibujoTipoCompactPanel/,
    )
    // Bitácora / Presupuesto invocan el modal sin huellaMode.
    const bit = readFileSync(join(__dirname, '../../modules/seguimiento/BitacoraAdjuntos.jsx'), 'utf8')
    assert.match(bit, /EsquemaEditorModal/)
    assert.doesNotMatch(bit, /huellaMode/)
    const ppto = readFileSync(join(__dirname, '../../modules/presupuesto/PptoGraficosModal.jsx'), 'utf8')
    assert.match(ppto, /EsquemaEditorModal/)
    assert.doesNotMatch(ppto, /huellaMode\s*=/)
  })

  it('caso b · dibujar línea (2 pts) y polígono (5 pts) usa tipo efectivo, no solo huella', () => {
    assert.deepEqual(accionDibujarNodosPorTipo('linea'), {
      unirEnOrden: true,
      abrirUnirPorNumero: false,
      preguntarSentidoEje: true,
    })
    assert.deepEqual(accionDibujarNodosPorTipo('poligono'), {
      unirEnOrden: false,
      abrirUnirPorNumero: true,
      preguntarSentidoEje: true,
    })
    // applyCoordRows / requestDraw leen dibujoTipoRef (no forzar 'nodo' fuera de huella).
    assert.match(modal, /const tipo = opts\.skipTipoActions\s*\n\s*\? 'nodo'\s*\n\s*: \(dibujoTipoRef\.current \|\| 'nodo'\)/)
    assert.match(modal, /const tipo = dibujoTipoRef\.current \|\| 'nodo'/)
    assert.doesNotMatch(
      modal,
      /const tipo = huellaMode \? \(huellaTipoRef\.current \|\| 'nodo'\) : 'nodo'/,
    )
    assert.doesNotMatch(
      modal,
      /if \(huellaMode && accion\.preguntarSentidoEje\)/,
    )
  })

  it('caso c · agregar nodo desde mapa y biblioteca 1:1 en tipo nodo (todos los módulos)', () => {
    assert.match(modal, /togglePickNodoFromMap|pickNodoFromMap/)
    assert.match(modal, /addNodoDesdePlanoAt/)
    assert.match(modal, /esquema-coords-pick-from-map/)
    // Insertar biblioteca en nodos ya no exige huellaMode.
    assert.match(modal, /if \(dibujoTipoRef\.current === 'nodo'\)/)
    assert.doesNotMatch(
      modal,
      /if \(huellaMode && huellaTipoRef\.current === 'nodo'\)/,
    )
    assert.match(modal, /instantiateLibraryItemAtRealScale/)
  })

  it('caso d · borrador guarda tabla + tipo; tabla vacía si no hay initialCoordRows', () => {
    const snap = buildEsquemaDraftSnapshot({
      objects: [{ type: 'nodo', id: '1', x: 0, y: 0, nodeNum: 1 }],
      coordRows: [
        { num: '1', norte: '100', este: '200', cota: '', desc: 'A' },
        { num: '2', norte: '110', este: '210', cota: '', desc: 'B' },
      ],
      dibujoTipo: 'linea',
    })
    assert.equal(snap.dibujoTipo, 'linea')
    assert.equal(snap.coordRows.length, 2)
    assert.match(modal, /dibujoTipo: dibujoTipoRef\.current/)
    assert.match(modal, /snap\.dibujoTipo/)
    // Sin initialCoordRows la tabla inicia vacía (no sync portada fuera de SicoeObra).
    assert.match(modal, /if \(!rows\.length\) \{\s*setCoordRows\(\[\]\)/)
  })

  it('caso e · SicoeObra: refs / sync portada / color ítem solo en huellaMode', () => {
    assert.match(modal, /referenciaDibujos/)
    assert.match(modal, /referenciasCount=\{huellaMode \? referenciasCount : 0\}/)
    assert.match(modal, /if \(!huellaMode\) return/)
    assert.match(modal, /resolveHuellaMapOrigin/)
    const sicoe = readFileSync(join(__dirname, '../../modules/sicoe-obra/SicoeDibujoReporteEditor.jsx'), 'utf8')
    assert.match(sicoe, /huellaMode/)
    assert.match(sicoe, /onHuellaDibujoTipoChange/)
    assert.match(sicoe, /referenciasCount=\{referencias\.length\}/)
    assert.match(sicoe, /initialCoordRows/)
  })

  it('contrato C-2D-13 / caso 33 cableados', () => {
    const md = readFileSync(join(__dirname, 'CONTRATO_ESQUEMA.md'), 'utf8')
    assert.match(md, /C-2D-13/)
    assert.match(md, /33\.\s*\*\*Dibujo por coordenadas/)
    assert.match(md, /esquemaCoordsTodosModulos/)
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8'))
    assert.match(pkg.scripts['test:esquema'], /esquemaCoordsTodosModulos\.scenario\.test\.js/)
  })
})
