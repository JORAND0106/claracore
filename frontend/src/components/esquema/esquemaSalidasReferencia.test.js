/**
 * Referencias aprobadas: bloquean el despliegue si una salida pierde
 * encabezado, tabla, columnas, totales o letra mínima.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ESQUEMA_SALIDAS_REFERENCIAS,
  fixtureMemoriaPocetaSnapshot,
  runApprovedSalidasVerification,
  verifySalidaAgainstReference,
} from './esquemaSalidasReferencia.js'
import { planEsquemaExportSalida, ESQUEMA_MEMORIA_TABLE_COLUMNS } from './esquemaExport.js'
import { memoriaDisplayRows } from './esquema3dCalcExport.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcRoot = join(__dirname, '../..')

function read(rel) {
  return readFileSync(join(srcRoot, rel), 'utf8')
}

describe('esquemaSalidasReferencia · catálogo aprobado', () => {
  it('incluye los 4 tipos de salida del concepto', () => {
    const ids = ESQUEMA_SALIDAS_REFERENCIAS.map((r) => r.id)
    assert.ok(ids.includes('esquema-con-memoria'))
    assert.ok(ids.includes('esquema-sin-tablas'))
    assert.ok(ids.includes('memoria-volúmenes'))
    assert.ok(ids.includes('cuadro-despiece'))
    assert.ok(ids.includes('tabla-coordenadas'))
  })

  it('fixture poceta: desglose 1 / 1.1…1.4 y total 2,27', () => {
    const snap = fixtureMemoriaPocetaSnapshot()
    const rows = memoriaDisplayRows(snap)
    assert.ok(rows.length >= 5)
    const labels = rows.map((r) => String(r.numLabel || r.num || ''))
    assert.ok(labels.some((x) => x === '1' || x.startsWith('1')))
    assert.ok(labels.some((x) => x.includes('1.1') || x === '1.1'))
    assert.equal(Math.round(snap.totalM3 * 100) / 100, 2.27)
  })
})

describe('esquemaSalidasReferencia · verificación pre-despliegue', () => {
  it('todas las referencias pasan con fixtures fijos', () => {
    const r = runApprovedSalidasVerification()
    assert.equal(r.ok, true, JSON.stringify(r.failed, null, 2))
    assert.equal(r.results.length, ESQUEMA_SALIDAS_REFERENCIAS.length)
  })

  it('si se quita la tabla de memoria, la verificación BLOQUEA el despliegue', () => {
    const r = runApprovedSalidasVerification({ stripMemoriaTable: true })
    assert.equal(r.ok, false, 'debe fallar al quitar la tabla')
    assert.ok(r.failed.length >= 1)
    assert.ok(
      r.failed.some((f) => (f.errors || []).some((e) => /memoria|tabla/i.test(e))),
      JSON.stringify(r.failed),
    )
  })

  it('plan de Cabezal 9A con cálculo exige encabezado + columnas de memoria', () => {
    const snap = fixtureMemoriaPocetaSnapshot()
    const plan = planEsquemaExportSalida({
      title: 'Cabezal 9A',
      calcSnapshots: [snap],
    })
    assert.equal(plan.hasMemoriaTable, true)
    assert.equal(plan.hasHeader, true)
    assert.ok(plan.header?.tipoTitulo)
    assert.ok(plan.header?.fecha)
    assert.ok(plan.header?.brandTitle)
    for (const col of ESQUEMA_MEMORIA_TABLE_COLUMNS) {
      assert.ok(plan.columnsRequired.includes(col), col)
    }
    const v = verifySalidaAgainstReference({
      ...plan,
      hasHeader: true,
      hasIso: true,
      columns: plan.columnsRequired,
      cellFontPx: plan.header.width / 55,
      width: plan.header.width,
    }, 'esquema-con-memoria')
    assert.equal(v.ok, true, v.errors.join('; '))
  })
})

describe('esquemaSalidasReferencia · cableado en código', () => {
  it('composeEsquemaExport usa encabezado institucional y calcSnapshots', () => {
    const exp = read('components/esquema/esquemaExport.js')
    assert.match(exp, /drawEsquemaSalidaHeader/)
    assert.match(exp, /calcSnapshots/)
    assert.match(exp, /renderMemoriaColorTableCanvas/)
    assert.match(exp, /planEsquemaExportSalida/)
    const modal = read('components/esquema/EsquemaEditorModal.jsx')
    assert.match(modal, /calcSnapshots:\s*snapshots/)
    assert.match(modal, /buildVolumeCalcAdjuntos/)
  })

  it('huecos curvos marcan aristas _fromHole (sin franja de rayas)', () => {
    const solids = read('components/esquema/esquema3dSolids.js')
    assert.match(solids, /fromHole:\s*true/)
    assert.match(solids, /e\._fromHole/)
    assert.match(solids, /strokeCurveHoles/)
  })

  it('contrato documenta referencias aprobadas', () => {
    const md = read('components/esquema/CONTRATO_ESQUEMA.md')
    assert.match(md, /referencia aprobada|referencias aprobadas/i)
    assert.match(md, /esquemaSalidasReferencia/)
    assert.match(md, /toda salida generada se verifica/i)
  })

  it('cableado en test:esquema', () => {
    const pkg = JSON.parse(readFileSync(join(srcRoot, '../package.json'), 'utf8'))
    assert.match(pkg.scripts['test:esquema'], /esquemaSalidasReferencia\.test\.js/)
  })
})
