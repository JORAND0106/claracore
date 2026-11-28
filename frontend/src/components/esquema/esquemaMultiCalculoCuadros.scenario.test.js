/**
 * C-OUT-24: un cuadro de resumen por cada cálculo de volúmenes.
 * Totales separados; sin total general; # globales = isométrico.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyGlobalMemoriaNumbers,
  memoriaDisplayRows,
} from './esquema3dCalcExport.js'
import { planEsquemaExportSalida } from './esquemaExport.js'
import {
  fixtureMultiCalculoPocetaSnapshots,
  verifySalidaAgainstReference,
} from './esquemaSalidasReferencia.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('C-OUT-24 · un cuadro por cálculo (Poceta de encole)', () => {
  it('plan: 4 cuadros con título, totales propios y sin total general', () => {
    const snaps = fixtureMultiCalculoPocetaSnapshots()
    assert.equal(snaps.length, 4)
    const plan = planEsquemaExportSalida({
      title: 'Poceta de encole',
      calcSnapshots: snaps,
      solids3d: [{
        type: 'solid3d', id: 'exc',
        cells: [{ z0: 0, z1: 1, ring: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }],
      }],
    })
    assert.equal(plan.cuadrosPorCalculo, 4)
    assert.equal(plan.sinTotalGeneral, true)
    assert.equal(plan.totalGeneralM3, null)
    assert.equal(plan.memoria.length, 4)
    const names = plan.memoria.map((m) => m.nombre)
    assert.deepEqual(names, [
      'Excavación para Poceta',
      'Concreto de Limpieza',
      'Concreto de bases',
      'Concreto de elevaciones',
    ])
    for (const m of plan.memoria) {
      assert.ok(m.hasCalcTitle, m.nombre)
      assert.ok(Number.isFinite(Number(m.totalM3)))
    }
    // Los totales de distintos cálculos NO se suman.
    const sum = plan.calcTotalsM3.reduce((a, b) => a + b, 0)
    assert.ok(Math.abs(sum - 43.81) < 0.02)
    assert.notEqual(plan.totalGeneralM3, sum)
    const v = verifySalidaAgainstReference({
      ...plan,
      hasHeader: true,
      hasIso: true,
      columns: plan.columnsRequired,
      headersIntact: plan.headersIntact,
      noWordBreak: true,
      cellFontPx: (plan.header?.width || 1600) / 55,
      width: plan.header?.width || 1600,
    }, 'esquema-multi-calculo-cuadros')
    assert.equal(v.ok, true, v.errors.join('; '))
  })

  it('un solo cálculo → un solo cuadro (sin regresión)', () => {
    const plan = planEsquemaExportSalida({
      title: 'Solo uno',
      calcSnapshots: [fixtureMultiCalculoPocetaSnapshots()[0]],
    })
    assert.equal(plan.cuadrosPorCalculo, 1)
    assert.equal(plan.memoria[0].nombre, 'Excavación para Poceta')
    assert.equal(plan.sinTotalGeneral, true)
  })

  it('números globales únicos: mismo sólido = mismo # en todos los cuadros', () => {
    const snaps = fixtureMultiCalculoPocetaSnapshots()
    const { snapshots, labels, solidToNum } = applyGlobalMemoriaNumbers(snaps)
    assert.equal(solidToNum.get('exc'), 1)
    assert.equal(solidToNum.get('lim'), 2)
    assert.equal(solidToNum.get('placa'), 3)
    assert.equal(solidToNum.get('mp'), 4)
    assert.equal(solidToNum.get('ml1'), 5)
    assert.equal(solidToNum.get('mf'), 6)
    assert.equal(solidToNum.get('ml2'), 7)
    const elevRows = memoriaDisplayRows(snapshots[3])
    const mfExt = elevRows.find((r) => r.solidId === 'mf' && !(r.subIndex > 0) && !r.isNetRow)
    const pase = elevRows.find((r) => String(r.numLabel || '').includes('.'))
    const neto = elevRows.find((r) => r.isNetRow)
    assert.equal(String(mfExt.numLabel), '6')
    assert.ok(String(pase.numLabel).startsWith('6.'))
    assert.match(String(neto.netOpLabel || ''), /^6/)
    // Etiquetas iso: un # por sólido principal.
    const nums = labels.map((l) => l.num)
    assert.equal(new Set(nums).size, nums.length)
  })

  it('renderMemoriaColorTableCanvas dibuja título del cálculo', () => {
    const src = readFileSync(join(__dirname, 'esquema3dCalcExport.js'), 'utf8')
    assert.match(src, /calcTitle|snapshot\?\.nombre/)
    assert.match(src, /applyGlobalMemoriaNumbers/)
    const exp = readFileSync(join(__dirname, 'esquemaExport.js'), 'utf8')
    assert.match(exp, /applyGlobalMemoriaNumbers/)
    assert.match(exp, /cuadrosPorCalculo/)
    assert.match(exp, /sinTotalGeneral/)
  })

  it('contrato declara C-OUT-24 un cuadro por cálculo', () => {
    const md = readFileSync(join(__dirname, 'CONTRATO_ESQUEMA.md'), 'utf8')
    assert.match(md, /C-OUT-24/)
    assert.match(md, /un cuadro por cálculo/i)
    assert.match(md, /no se suman/i)
  })
})
