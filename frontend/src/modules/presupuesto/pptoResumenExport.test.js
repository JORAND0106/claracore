import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  costoDirectoResumenFila,
  costoDirectoResumenFilaRecalcLegacy,
  formulaSumaFilas,
  planFilasResumenConSubtotales,
  totalesDesdeSubtotalesCapitulo,
} from './pptoResumenExport.js'

describe('costoDirectoResumenFila — congruencia con plataforma', () => {
  it('usa Σ costo_directo y no ROUND(vlr×Σcant)', () => {
    // Caso típico de divergencia: vlr con decimales + Math.round en Excel legacy.
    const row = {
      vlr_unitario: 1250.75,
      cantidad: 10.5,
      // Plataforma / backend: Σ round(cant_i × vlr_i) para el ítem
      costo_directo: 13133,
    }
    assert.equal(costoDirectoResumenFila(row), 13133)
    assert.equal(
      costoDirectoResumenFilaRecalcLegacy(row),
      Math.round(Math.round(1250.75) * 10.5),
      'legacy recalcula ROUND(round(vlr)×cant)',
    )
    assert.notEqual(
      costoDirectoResumenFila(row),
      costoDirectoResumenFilaRecalcLegacy(row),
      'el bug histórico diverge del valor de plataforma',
    )
  })

  it('también diverge cuando el redondeo por registro no conmuta con el agregado', () => {
    // Tres registros del mismo ítem: Σ round(c×v) ≠ round(v × Σc) tras Math.round(vlr)
    const regs = [
      { cant: 1.4, vlr: 333.4 },
      { cant: 1.4, vlr: 333.4 },
      { cant: 1.2, vlr: 333.4 },
    ]
    const sumCd = regs.reduce((s, r) => s + Math.round(r.cant * r.vlr), 0)
    const sumCant = regs.reduce((s, r) => s + r.cant, 0)
    const legacy = Math.round(Math.round(333.4) * sumCant)
    // round(1.4×333.4)=467; ×2 + round(1.2×333.4)=400 → 1334
    assert.equal(sumCd, 1334)
    // legacy: Math.round(333.4)×4 = 333×4 = 1332
    assert.equal(legacy, 1332)
    assert.notEqual(sumCd, legacy)

    const rowResumen = {
      vlr_unitario: 333.4,
      cantidad: sumCant,
      costo_directo: sumCd,
    }
    assert.equal(costoDirectoResumenFila(rowResumen), 1334)
    assert.equal(costoDirectoResumenFilaRecalcLegacy(rowResumen), 1332)
  })
})

describe('planFilasResumenConSubtotales', () => {
  const resumen = [
    { capitulo: '1', item: '1.1', vlr_unitario: 100, cantidad: 2, costo_directo: 200 },
    { capitulo: '1', item: '1.2', vlr_unitario: 50.4, cantidad: 3, costo_directo: 151 },
    { capitulo: '2', item: '2.1', vlr_unitario: 1000.2, cantidad: 1.5, costo_directo: 1500 },
    { capitulo: '2', item: '2.2', vlr_unitario: 10, cantidad: 10, costo_directo: 100 },
  ]

  it('inserta subtotal al final de cada capítulo', () => {
    const plan = planFilasResumenConSubtotales(resumen)
    assert.deepEqual(
      plan.map((p) => (p.tipo === 'item' ? `item:${p.row.item}` : `sub:${p.capitulo}`)),
      ['item:1.1', 'item:1.2', 'sub:1', 'item:2.1', 'item:2.2', 'sub:2'],
    )
  })

  it('con competencias inserta sub-filas antes del subtotal sin alterar el total', () => {
    const comps = [
      { capitulo: '1', competencia: 'IDU', cantidad: 5, costo_directo: 351 },
      { capitulo: '2', competencia: 'ETB', cantidad: 5, costo_directo: 800 },
      { capitulo: '2', competencia: 'IDU', cantidad: 6.5, costo_directo: 800 },
    ]
    const plan = planFilasResumenConSubtotales(resumen, comps)
    assert.deepEqual(
      plan.map((p) => {
        if (p.tipo === 'item') return `item:${p.row.item}`
        if (p.tipo === 'competencia') return `comp:${p.label}`
        return `sub:${p.capitulo}`
      }),
      [
        'item:1.1', 'item:1.2', 'comp:IDU', 'sub:1',
        'item:2.1', 'item:2.2', 'comp:ETB', 'comp:IDU', 'sub:2',
      ],
    )
    assert.equal(totalesDesdeSubtotalesCapitulo(plan).costoDirecto, 1951)
  })

  it('subtotales = Σ costo_directo del capítulo; total general = Σ subtotales', () => {
    const plan = planFilasResumenConSubtotales(resumen)
    const { costoDirecto, porCapitulo } = totalesDesdeSubtotalesCapitulo(plan)

    assert.deepEqual(porCapitulo, [
      { capitulo: '1', costoDirecto: 351 },
      { capitulo: '2', costoDirecto: 1600 },
    ])
    assert.equal(costoDirecto, 1951)

    // Comparación capítulo a capítulo: legacy vs correcto
    const legacyPorCap = [
      {
        capitulo: '1',
        legacy: costoDirectoResumenFilaRecalcLegacy(resumen[0])
          + costoDirectoResumenFilaRecalcLegacy(resumen[1]),
        correcto: 351,
      },
      {
        capitulo: '2',
        legacy: costoDirectoResumenFilaRecalcLegacy(resumen[2])
          + costoDirectoResumenFilaRecalcLegacy(resumen[3]),
        correcto: 1600,
      },
    ]
    // Cap 1: ROUND(100*2)+ROUND(50*3)=200+150=350 vs 351 → diverge aquí
    assert.equal(legacyPorCap[0].legacy, 350)
    assert.notEqual(legacyPorCap[0].legacy, legacyPorCap[0].correcto)
    // Cap 2: ROUND(1000*1.5)+ROUND(10*10)=1500+100=1600 (coincide en este caso)
    assert.equal(legacyPorCap[1].legacy, 1600)

    const totalLegacy = legacyPorCap.reduce((s, c) => s + c.legacy, 0)
    assert.equal(totalLegacy, 1950)
    assert.notEqual(totalLegacy, costoDirecto)
  })
})

describe('formulaSumaFilas', () => {
  it('rango contiguo y lista no contigua', () => {
    assert.equal(formulaSumaFilas('G', [8, 9, 10]), 'SUM(G8:G10)')
    assert.equal(formulaSumaFilas('G', [10, 15, 20]), 'SUM(G10,G15,G20)')
    assert.equal(formulaSumaFilas('F', [12]), 'F12')
    assert.equal(formulaSumaFilas('F', []), '0')
  })
})
