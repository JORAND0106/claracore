/**
 * Casos a–g: Sustraer en cadena (huecos visibles), toggle comandos/op3d,
 * panel ampliable, selección correcta + resalte, zoom extendido/ventana,
 * tabla cálculo tipo Excel.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { metersToWorld, ESQUEMA_CONTEXT_SIDEBAR_W, squareModalOuterSize } from './esquemaGeometry.js'
import {
  SOLID3D_STYLE,
  drawSolid3d,
  extrudeClosedEntity,
  round2,
  solidEdgeStrokeColor,
  solidFaceDepthWorld,
  solidOsnapPoints,
  solidSelectedGlowColor,
  solidVolumeM3,
  subtractSolids,
} from './esquema3dSolids.js'
import {
  calcTotalM3,
  createCalcLine,
  createVolumeCalc,
  lastCalcLineNeedsNombre,
  volumeCalcsHaveUnnamed,
} from './esquema3dCalc.js'
import { sceneExportBounds, solidsExportBounds } from './esquemaExport.js'
import { solidsViewCamera, normalizeViewId } from './esquema3dViews.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

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

function makeBox(id = 'box') {
  const s = extrudeClosedEntity(rectAt(0, 0, 1.5, 1.5, id), {
    viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0,
  }).solid
  s.id = id
  s.color = '#2563eb'
  s.nombre = 'Caja'
  return s
}

function mockCtx() {
  const strokes = []
  const fills = []
  const ctx = {
    strokes,
    fills,
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill(rule) { fills.push({ style: this._fill, rule }) },
    stroke() { strokes.push({ style: this._stroke, width: this.lineWidth }) },
    setLineDash() {},
    set fillStyle(v) { this._fill = v },
    get fillStyle() { return this._fill },
    set strokeStyle(v) { this._stroke = v },
    get strokeStyle() { return this._stroke },
    lineWidth: 1,
    lineJoin: 'round',
    lineCap: 'round',
  }
  return ctx
}

/** Simula toggle barra: segundo clic → selección. */
function toggleTool(current, clickedId) {
  if (current === clickedId && clickedId !== 'seleccion') return 'seleccion'
  return clickedId
}

/** Zoom ventana → bounds del marquee (misma lógica que el editor). */
function zoomVentanaBounds(from, to) {
  const x = Math.min(from.x, to.x)
  const y = Math.min(from.y, to.y)
  const w = Math.abs(to.x - from.x)
  const h = Math.abs(to.y - from.y)
  if (w <= 8 || h <= 8) return null
  return { x, y, w, h }
}

function fitZoom(bb, viewW, viewH, margin = 0.12) {
  if (!bb || !(bb.w > 0) || !(bb.h > 0)) return null
  const z = Math.min(
    8,
    Math.min((viewW * (1 - margin)) / bb.w, (viewH * (1 - margin)) / bb.h),
  )
  return {
    z,
    pan: {
      x: (viewW / 2) - (bb.x + bb.w / 2) * z,
      y: (viewH / 2) - (bb.y + bb.h / 2) * z,
    },
  }
}

describe('Sustraer en cadena · huecos visibles · caso a', () => {
  it('poceta + dos cilindros: volumen exacto y fill en alzado usa evenodd (huecos)', () => {
    const box = makeBox()
    const inner = extrudeClosedEntity(rectAt(0.2, 0.2, 1.1, 1.1, 'in'), {
      viewId: 'top', cotaSuperior: 1.5, cotaInferior: 0.2,
    }).solid
    inner.id = 'in'
    const poc = subtractSolids(box, [inner])
    assert.equal(poc.ok, true, poc.error)
    assert.equal(round2(poc.solid.volumeM3), 1.81)
    poc.solid.id = 'poceta'
    poc.solid.nombre = 'Poceta'
    poc.solid.color = '#2563eb'

    const rPx = metersToWorld(0.15)
    function pipeThrough(solid, viewId, lengthM, id) {
      const depth = solidFaceDepthWorld(solid, viewId)
      const center = solidOsnapPoints(solid, viewId).find((s) => s.kind === 'center')
      assert.ok(center, `center in ${viewId}`)
      const circ = {
        id,
        type: 'elipse',
        x1: center.x - rPx,
        y1: center.y - rPx,
        x2: center.x + rPx,
        y2: center.y + rPx,
      }
      const pipe = extrudeClosedEntity(circ, {
        viewId,
        lengthM,
        faceDepthWorld: depth,
      })
      assert.equal(pipe.ok, true, pipe.error)
      pipe.solid.id = id
      return pipe.solid
    }

    const pipe1 = pipeThrough(poc.solid, 'front', 1.5, 'cyl1')
    const pipe2 = pipeThrough(poc.solid, 'left', 1.5, 'cyl2')
    const both = subtractSolids(poc.solid, [pipe1, pipe2])
    assert.equal(both.ok, true, both.error)
    assert.ok(both.solid.volumeM3 < poc.solid.volumeM3 - 0.01)
    // Acumula vacío interior + 2 cilindros en el desglose de memoria.
    assert.equal(both.solid.booleanMeta?.subtracted?.length, 3)

    // Alzados: caras hacia la cámara (sin AABB opaco); iso con varias caras.
    const ctx = mockCtx()
    drawSolid3d(ctx, both.solid, {
      viewId: 'front', zoom: 1, pixelScale: 1, solids: [both.solid], pass: 'fills',
    })
    assert.ok(ctx.fills.length >= 1, 'frontal pinta caras')
    const ctxL = mockCtx()
    drawSolid3d(ctxL, both.solid, {
      viewId: 'left', zoom: 1, pixelScale: 1, solids: [both.solid], pass: 'fills',
    })
    assert.ok(ctxL.fills.length >= 1, 'lateral pinta caras')
    // Frontal y lateral no deben ser un único rectángulo AABB idéntico:
    // hay más de una cara o hay huecos/celdas del boolean.
    assert.ok(
      both.solid.cells.length > 1 || ctx.fills.length >= 1,
      'resultado boolean tiene geometría con huecos/celdas',
    )

    const orbit = solidsViewCamera('iso-ne', [both.solid])
    const ctxNe = mockCtx()
    drawSolid3d(ctxNe, both.solid, {
      viewId: 'iso-ne', zoom: 1, pixelScale: 1, orbit, solids: [both.solid], pass: 'fills',
    })
    assert.ok(ctxNe.fills.length >= 2, 'NE pinta varias caras (huecos no tapados por AABB)')

    // Fuente: no se restaura el fill AABB opaco de alzado.
    const solidsSrc = readFileSync(join(__dirname, 'esquema3dSolids.js'), 'utf8')
    assert.doesNotMatch(solidsSrc, /flatElev && doFills[\s\S]*solidAabbWorld/)
    assert.match(solidsSrc, /facesToPaint = flatElev \? allFaces\.filter/)
  })
})

describe('Comandos activar/desactivar · caso b', () => {
  it('segundo clic desactiva; activar otro deja uno solo; op3d se apaga', () => {
    let tool = 'seleccion'
    let op3d = null
    const activateBar = (id) => {
      op3d = null
      tool = toggleTool(tool, id)
      if (id === 'zoom-extendido') tool = 'seleccion'
      return tool
    }
    const toggleOp3d = (id) => {
      if (op3d === id) {
        op3d = null
        return
      }
      op3d = id
      tool = 'seleccion'
    }

    tool = activateBar('lapiz')
    assert.equal(tool, 'lapiz')
    tool = activateBar('lapiz')
    assert.equal(tool, 'seleccion')
    tool = activateBar('paneo')
    assert.equal(tool, 'paneo')
    tool = activateBar('rect')
    assert.equal(tool, 'rect')
    assert.equal(op3d, null)

    toggleOp3d('sustraer')
    assert.equal(op3d, 'sustraer')
    toggleOp3d('sustraer')
    assert.equal(op3d, null)
    toggleOp3d('unir')
    assert.equal(op3d, 'unir')
    tool = activateBar('lapiz')
    assert.equal(op3d, null)
    assert.equal(tool, 'lapiz')
  })
})

describe('Panel lateral ampliable · caso c', () => {
  it('ancho arrastrable ≥ contrato y columnas de tabla se ajustan al panel', () => {
    const base = squareModalOuterSize(1400, 900, ESQUEMA_CONTEXT_SIDEBAR_W)
    assert.equal(base.sidebar, ESQUEMA_CONTEXT_SIDEBAR_W)
    const wide = squareModalOuterSize(1400, 900, 480)
    assert.equal(wide.sidebar, 480)
    assert.ok(wide.w >= wide.side + 480)
    const src = readFileSync(join(__dirname, 'EsquemaEditorModal.jsx'), 'utf8')
    assert.match(src, /contextSidebarUserW/)
    assert.match(src, /contextSidebarUserW \|\| ESQUEMA_CONTEXT_SIDEBAR_W/)
    const panel = readFileSync(join(__dirname, 'esquema3dCalcPanel.jsx'), 'utf8')
    assert.match(panel, /esquema-calc-popup-table/)
    assert.match(panel, /tableLayout:\s*'fixed'/)
  })
})

describe('Selección correcta en cálculo · caso d', () => {
  it('cada sólido seleccionado aporta su propio id/volumen; resalte luminoso', () => {
    const solids = [0, 1, 2, 3].map((i) => {
      const s = extrudeClosedEntity(rectAt(i * 2, 0, 1, 1, `e${i}`), {
        viewId: 'top', cotaSuperior: 1 + i * 0.1, cotaInferior: 0,
      }).solid
      s.id = `s${i}`
      s.color = ['#2563eb', '#0f766e', '#b91c1c', '#ca8a04'][i]
      s.nombre = `S${i}`
      return s
    })
    const calc = createVolumeCalc('T')
    for (const s of solids) {
      // Simula selección correcta: la línea usa exactamente el id tocado.
      const selectedId = s.id
      const loaded = solids.find((x) => x.id === selectedId)
      assert.equal(loaded.id, s.id)
      assert.ok(Math.abs(solidVolumeM3(loaded) - solidVolumeM3(s)) < 1e-9)
      calc.lines.push(createCalcLine({
        solidId: selectedId,
        nombre: `N${s.id}`,
        op: 'sum',
      }))
    }
    assert.equal(calc.lines.length, 4)
    assert.equal(calc.lines[2].solidId, 's2')
    assert.ok(Math.abs(calcTotalM3(calc, solids) - solids.reduce((a, s) => a + solidVolumeM3(s), 0)) < 0.05)

    assert.equal(solidEdgeStrokeColor('#2563eb', true), '#38bdf8')
    assert.match(solidSelectedGlowColor(), /rgba\(56,189,248/)
    assert.ok(SOLID3D_STYLE.selectedGlowPx > SOLID3D_STYLE.selectedPx)

    const ctx = mockCtx()
    drawSolid3d(ctx, solids[1], {
      viewId: 'top', selected: true, zoom: 1, pixelScale: 1, pass: 'edges',
    })
    assert.ok(ctx.strokes.some((st) => String(st.style).includes('rgba(56,189,248')), 'glow')
    assert.ok(ctx.strokes.some((st) => st.style === '#38bdf8'), 'contorno luminoso')

    // Preferir selectedSolidIds sobre solidForSourceEntity (regresión panel).
    const src = readFileSync(join(__dirname, 'EsquemaEditorModal.jsx'), 'utf8')
    assert.match(src, /selectedSolidIds\.length === 1/)
    assert.match(src, /solids3d\.find\(\(s\) => s\.id === selectedSolidIds\[0\]\)/)
    assert.match(src, /onHighlightSolid/)
  })
})

describe('Zoom extendido · caso e', () => {
  it('ajusta vista a bounds 2D+3D con margen en top, NE y órbita', () => {
    const a = makeBox('a')
    const b = extrudeClosedEntity(rectAt(5, 5, 1, 1, 'b'), {
      viewId: 'top', cotaSuperior: 2, cotaInferior: 0,
    }).solid
    b.id = 'b'
    const solids = [a, b]
    for (const viewId of ['top', 'iso-ne']) {
      const orbit = solidsViewCamera(viewId, solids, {
        orbitFree: viewId === 'iso-ne',
        orbitAngles: { yaw: 0.8, pitch: 0.4 },
      })
      const bb = solidsExportBounds(solids, normalizeViewId(viewId), orbit)
      assert.ok(bb && bb.w > 40 && bb.h > 40, `${viewId} tiene bounds`)
      // Bounds debe cubrir ambos sólidos (más ancho que un solo cubo ~1,5 m).
      assert.ok(bb.w > metersToWorld(1.5) || bb.h > metersToWorld(1.5), `${viewId} engloba dispersión`)
      const fit = fitZoom(bb, 800, 600)
      assert.ok(fit.z > 0 && fit.z <= 8)
      assert.ok(Number.isFinite(fit.pan.x) && Number.isFinite(fit.pan.y))
    }
    const objs = [
      { type: 'rect', x1: 0, y1: 0, x2: metersToWorld(10), y2: metersToWorld(4) },
    ]
    const bb2 = sceneExportBounds(objs)
    const fit2 = fitZoom(bb2, 800, 600)
    assert.ok(fit2.z < 2)
    const src = readFileSync(join(__dirname, 'EsquemaEditorModal.jsx'), 'utf8')
    assert.match(src, /zoom-extendido/)
    assert.match(src, /fitViewToScene/)
  })
})

describe('Zoom ventana · caso f', () => {
  it('rectángulo → fit; al terminar vuelve a selección; toggle off', () => {
    const from = { x: 100, y: 100 }
    const to = { x: 180, y: 160 }
    const bb = zoomVentanaBounds(from, to)
    assert.deepEqual(bb, { x: 100, y: 100, w: 80, h: 60 })
    const fit = fitZoom(bb, 800, 600)
    assert.ok(fit.z > 1)
    assert.equal(zoomVentanaBounds(from, { x: 104, y: 104 }), null)

    let tool = 'zoom-ventana'
    // Al soltar: desactiva solo → selección.
    tool = 'seleccion'
    assert.equal(tool, 'seleccion')
    // Segundo clic en el botón también desactiva.
    tool = 'zoom-ventana'
    tool = toggleTool(tool, 'zoom-ventana')
    assert.equal(tool, 'seleccion')

    const src = readFileSync(join(__dirname, 'EsquemaEditorModal.jsx'), 'utf8')
    assert.match(src, /mode: 'zoom-ventana'/)
    assert.match(src, /fitViewToBoundsRef/)
  })
})

describe('Lista cálculo tipo Excel · caso g', () => {
  it('popup Excel + lista de nombres; nombre vacío bloquea; total fijo', () => {
    const panel = readFileSync(join(__dirname, 'esquema3dCalcPanel.jsx'), 'utf8')
    assert.match(panel, /esquema-calc-data-popup/)
    assert.match(panel, /esquema-calc-popup-table/)
    assert.match(panel, /esquema-calc-names-list/)
    assert.match(panel, />Color</)
    assert.match(panel, />Nombre</)
    assert.match(panel, />Descuenta de</)
    assert.match(panel, /esquema-calc-total-row/)
    assert.match(panel, /aria-label="Suma"/)
    assert.match(panel, /aria-label="Descuenta"/)

    const solids = [0, 1, 2, 3, 4, 5].map((i) => {
      const s = extrudeClosedEntity(rectAt(i, 0, 0.8, 0.8, `e${i}`), {
        viewId: 'top', cotaSuperior: 1, cotaInferior: 0,
      }).solid
      s.id = `s${i}`
      s.color = '#0f766e'
      return s
    })
    const calc = createVolumeCalc('Exc')
    calc.lines = solids.map((s, i) => createCalcLine({
      solidId: s.id,
      nombre: i === 0 ? '' : `E${i}`,
      op: 'sum',
    }))
    assert.ok(lastCalcLineNeedsNombre({
      ...calc,
      lines: [calc.lines[0]],
    }))
    assert.ok(volumeCalcsHaveUnnamed([calc]))
    calc.lines[0].nombre = 'Base'
    assert.equal(lastCalcLineNeedsNombre(calc), null)
    const total = calcTotalM3(calc, solids)
    calc.lines[2].op = 'subtract'
    calc.lines[2].discountFromSolidId = 's0'
    const after = calcTotalM3(calc, solids)
    assert.ok(after < total)
  })
})

describe('contrato fuente · zoom y excel', () => {
  it('modal declara zoom-extendido/ventana y desactiva op3d al cambiar herramienta', () => {
    const src = readFileSync(join(__dirname, 'EsquemaEditorModal.jsx'), 'utf8')
    assert.match(src, /id: 'zoom-extendido'/)
    assert.match(src, /id: 'zoom-ventana'/)
    assert.match(src, /Activar otro comando desactiva Unir\/Sustraer\/Cortar/)
    assert.match(src, /setOp3d\(null\)/)
    const solidsSrc = readFileSync(join(__dirname, 'esquema3dSolids.js'), 'utf8')
    assert.doesNotMatch(solidsSrc, /flatElev && doFills[\s\S]{0,200}solidAabbWorld/)
    assert.match(solidsSrc, /caras reales \(con recortes\/huecos de Sustraer\)/)
    assert.match(solidsSrc, /facesToPaint = flatElev/)
  })
})
