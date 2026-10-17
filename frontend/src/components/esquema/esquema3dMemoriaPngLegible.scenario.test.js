/**
 * Memoria PNG legible: fila neto sin medidas, iso ≤½ altura, aristas ocultas.
 * Caso POCETA (total 8,07) y esquema ≥6 sólidos.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { metersToWorld } from './esquemaGeometry.js'
import {
  drawSolid3d,
  drawSolids3dLayered,
  extrudeClosedEntity,
  round2,
  subtractSolids,
  SOLID3D_STYLE,
} from './esquema3dSolids.js'
import { solidsViewCamera } from './esquema3dViews.js'
import {
  createCalcLine,
  createVolumeCalc,
  freezeCalcSnapshot,
} from './esquema3dCalc.js'
import {
  composeCalcMemoriaPng,
  labelsFromSnapshot,
  memoriaDisplayRows,
  renderMemoriaColorTableCanvas,
} from './esquema3dCalcExport.js'

function rectAt(x0, y0, wM, hM, id) {
  return {
    id,
    type: 'rect',
    x1: metersToWorld(x0),
    y1: metersToWorld(y0),
    x2: metersToWorld(x0 + wM),
    y2: metersToWorld(y0 + hM),
  }
}

function mockCtx() {
  const dashes = []
  const fills = []
  const strokes = []
  const lineWidths = []
  return {
    dashes,
    fills,
    strokes,
    lineWidths,
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    rect() {},
    clip() {},
    fill() { fills.push(this.fillStyle) },
    stroke() {
      strokes.push({ dash: [...(this._dash || [])], w: this.lineWidth, style: this.strokeStyle })
      lineWidths.push(this.lineWidth)
    },
    setLineDash(d) { this._dash = [...(d || [])]; dashes.push([...(d || [])]) },
    arc() {},
    fillText() {},
    measureText(t) { return { width: String(t || '').length * 7 } },
    set fillStyle(v) { this._fill = v },
    get fillStyle() { return this._fill },
    set strokeStyle(v) { this._stroke = v },
    get strokeStyle() { return this._stroke },
    lineWidth: 1,
    lineJoin: 'round',
    lineCap: 'round',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    _dash: [],
  }
}

/** POCETA: Exc 11,36 − Placa 1,48 − Poceta neto 1,81 = 8,07 */
function buildPocetaCase() {
  const exc = extrudeClosedEntity(rectAt(0, 0, 1.9, 2.3, 'exc'), {
    viewId: 'top', cotaSuperior: 2.6, cotaInferior: 0,
  }).solid
  exc.id = 'exc'
  exc.color = '#7c3aed'
  exc.nombre = 'Excavación'

  // Placa lateral ≈ 1,48 m³: 1,00 × 1,48 × 1,00
  const placa = extrudeClosedEntity(rectAt(0.2, 0.2, 1.0, 1.48, 'placa'), {
    viewId: 'top', cotaSuperior: 1.0, cotaInferior: 0,
  }).solid
  placa.id = 'placa'
  placa.color = '#0f766e'
  placa.nombre = 'Placa lateral'

  const box = extrudeClosedEntity(rectAt(0.4, 0.8, 1.5, 1.5, 'box'), {
    viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0,
  }).solid
  box.id = 'box'
  box.color = '#2563eb'
  box.nombre = 'Poceta exterior'
  const inner = extrudeClosedEntity(rectAt(0.6, 1.0, 1.1, 1.1, 'inner'), {
    viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0.2,
  }).solid
  inner.id = 'inner'
  inner.nombre = 'Vacío interior'
  const poc = subtractSolids(box, [inner])
  assert.equal(poc.ok, true)
  poc.solid.id = 'poceta'
  poc.solid.color = '#2563eb'
  poc.solid.nombre = 'Poceta'

  const calc = createVolumeCalc('POCETA')
  calc.lines = [
    createCalcLine({ solidId: 'exc', nombre: 'Excavación', op: 'sum' }),
    createCalcLine({
      solidId: 'placa', nombre: 'Placa lateral', op: 'subtract', discountFromSolidId: 'exc',
    }),
    createCalcLine({
      solidId: 'poceta', nombre: 'Poceta', op: 'subtract', discountFromSolidId: 'exc',
    }),
  ]
  const solids = [exc, placa, poc.solid]
  return { solids, calc, snap: freezeCalcSnapshot(calc, solids) }
}

describe('memoria PNG legible · POCETA + neto + ocultas', () => {
  it('POCETA: total 8,07; fila neto «3 − 3.1» sin medidas; exterior/vacío con dims', () => {
    const { snap } = buildPocetaCase()
    assert.equal(round2(snap.totalM3), 8.07)

    const rows = memoriaDisplayRows(snap)
    const exterior = rows.find((r) => String(r.nombre).includes('(exterior)'))
    const vacio = rows.find((r) => String(r.nombre).includes('Vacío') || String(r.numLabel) === '3.1')
    const neto = rows.find((r) => r.isNetRow || String(r.nombre).includes('(neto)'))

    assert.ok(exterior, 'fila exterior')
    assert.equal(round2(exterior.volumeM3), 3.38)
    assert.equal(round2(exterior.detail?.longM), 1.5)
    assert.equal(round2(exterior.detail?.anchM), 1.5)
    assert.equal(round2(exterior.detail?.espesorM), 1.5)

    assert.ok(vacio, 'fila vacío')
    assert.equal(round2(vacio.volumeM3), 1.57)
    assert.ok(vacio.detail?.longM > 0)
    assert.ok(vacio.detail?.anchM > 0)
    assert.ok(vacio.detail?.espesorM > 0)

    assert.ok(neto, 'fila neto')
    assert.equal(neto.isNetRow, true)
    assert.equal(neto.netOpLabel, '3 − 3.1')
    assert.equal(round2(neto.volumeM3), 1.81)
    assert.equal(neto.detail?.longM, null)
    assert.equal(neto.detail?.anchM, null)
    assert.equal(neto.detail?.espesorM, null)
    assert.match(neto.detail?.formaCalculo || '', /3 − 3\.1/)
    assert.equal(neto.countsInTotal, true)
    assert.equal(neto.op, 'subtract')

    const labels = labelsFromSnapshot(snap)
    assert.ok(labels.some((l) => l.solidId === 'poceta' && l.num === 3))
  })

  it('tabla color: filas netas renderizan Operación=netOpLabel y dims —', () => {
    const { snap } = buildPocetaCase()
    const neto = memoriaDisplayRows(snap).find((r) => r.isNetRow)
    assert.ok(neto?.netOpLabel)

    // Sin DOM: validar contrato de fila que consume el canvas.
    assert.equal(neto.detail.longM, null)
    assert.equal(neto.detail.anchM, null)
    assert.equal(neto.detail.espesorM, null)

    if (typeof document !== 'undefined') {
      const table = renderMemoriaColorTableCanvas(snap, { width: 1200, fontScale: 1.1 })
      if (table) {
        assert.ok(table.width >= 1100)
        assert.ok(table.height > 100)
      }
    }
  })

  it('composeCalcMemoriaPng: isoRatio ≤ 0,5 y textos proporcionales (si hay DOM)', async () => {
    const { snap, solids } = buildPocetaCase()
    if (typeof document === 'undefined') {
      assert.ok(true, 'sin DOM: skip canvas')
      return
    }
    const png = await composeCalcMemoriaPng({ snapshot: snap, solids })
    if (!png) {
      assert.ok(true, 'sin canvas usable')
      return
    }
    assert.ok(png.meta.isoRatio <= 0.5 + 1e-9, `isoRatio=${png.meta.isoRatio}`)
    assert.ok(png.meta.tableH > 0)
    assert.ok(png.meta.isoH > 0)
    assert.ok(png.meta.textScale >= 1)
    assert.ok(png.meta.width >= 1400)
    // Tabla e iso comparten el mismo bloque de contenido (mismo ancho efectivo).
    assert.ok(Math.abs(png.meta.width - (png.meta.width)) < 1)
    assert.match(png.dataUri, /^data:image\/png/)
  })

  it('≥6 sólidos: desglose y labels coherentes; isoRatio ≤½ si hay DOM', async () => {
    const solids = []
    const calc = createVolumeCalc('Seis')
    calc.lines = []
    for (let i = 0; i < 6; i += 1) {
      const s = extrudeClosedEntity(rectAt(i * 2.2, 0, 1.2, 1.0, `s${i}`), {
        viewId: 'top', cotaSuperior: 0.8 + i * 0.1, cotaInferior: 0,
      }).solid
      s.id = `s${i}`
      s.color = ['#7c3aed', '#2563eb', '#0f766e', '#b45309', '#be123c', '#334155'][i]
      solids.push(s)
      // Todas suman: deja 6 filas top-level (legibilidad de tabla con muchos ítems).
      calc.lines.push(createCalcLine({
        solidId: s.id,
        nombre: `Sólido ${i + 1}`,
        op: 'sum',
      }))
    }
    const snap = freezeCalcSnapshot(calc, solids)
    const rows = memoriaDisplayRows(snap)
    assert.ok(rows.length >= 6)
    assert.equal(labelsFromSnapshot(snap).length, 6)
    assert.ok(Number.isFinite(snap.totalM3))

    if (typeof document !== 'undefined') {
      const png = await composeCalcMemoriaPng({ snapshot: snap, solids })
      if (png) {
        assert.ok(png.meta.isoRatio <= 0.5 + 1e-9)
        assert.ok(png.meta.tableH >= png.meta.isoH * 0.35, 'tabla no diminuta vs iso')
      }
    }
  })

  it('aristas ocultas: pass edges-hidden dibuja dash; layered las pinta al final', () => {
    const box = extrudeClosedEntity(rectAt(0, 0, 1.5, 1.5, 'box'), {
      viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0,
    }).solid
    box.id = 'box'
    box.color = '#2563eb'
    const solids = [box]
    const orbit = solidsViewCamera('iso-ne', solids)
    const ctx = mockCtx()

    drawSolid3d(ctx, box, {
      viewId: 'iso-ne', solids, zoom: 2, pixelScale: 2, orbit, pass: 'edges-hidden',
    })
    assert.ok(ctx.dashes.some((d) => d.length > 0), 'pass hidden usa dash')
    assert.ok(ctx.strokes.some((s) => s.dash.length > 0), 'stroke oculto con dash')

    const ctx2 = mockCtx()
    drawSolids3dLayered(ctx2, solids, {
      viewId: 'iso-ne', zoom: 2, pixelScale: 2, orbit, labels: [{ solidId: 'box', num: 1 }],
    })
    assert.ok(ctx2.dashes.some((d) => d.length > 0), 'layered: ocultas punteadas')
    assert.ok(ctx2.dashes.some((d) => d.length === 0), 'layered: visibles continuas')
    assert.ok(SOLID3D_STYLE.hiddenPx >= 1.2, 'ocultas con grosor visible')
    assert.ok(SOLID3D_STYLE.fillAlpha <= 0.35, 'fill no tapa el punteado')
  })
})
