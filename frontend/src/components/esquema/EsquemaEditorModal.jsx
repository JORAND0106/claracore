import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createHatchRegionFromClick,
  drawHatchRegion,
  makeHatchPattern,
  preloadHatchRegions,
} from './esquemaHatch'
import {
  BOX_TOOLS,
  LINE_TOOLS,
  applyResizeHandle,
  applySoftOrtho,
  clampZoom,
  cursorForHandle,
  drawDotGrid,
  drawMoveGuide,
  drawNorthIndicator,
  drawResizeHandles,
  drawSelectionMarquee,
  drawSnapMarker,
  drawTransformHandles,
  ellipseFromCenter,
  findSnap,
  formatMeters,
  gridStepWorld,
  hitResizeHandle,
  hitTransformHandle,
  metersToWorld,
  resizeHandleWorldSize,
  parseDynMeasure,
  landscapeExportSize,
  nodeMarkerWorldRadius,
  parsePositive,
  pointAtDistance,
  scaleObjectUniform,
  selectIdsInDrag,
  worldToMeters,
} from './esquemaGeometry'
import { parseCoordFile, topoToWorld, coordOriginFromRows } from './esquemaCoords'
import {
  deleteLibraryItem,
  instantiateLibraryItem,
  loadLibrary,
  packLibraryBlock,
  resolveContratoId,
  saveLibraryItem,
} from './esquemaLibrary'
import CcModalBrandHeader from '../CcModalBrandHeader'

const HATCHES = [
  { id: 0, label: 'Diagonal /' },
  { id: 1, label: 'Diagonal \\' },
  { id: 2, label: 'Cruzado' },
  { id: 3, label: 'Puntos' },
  { id: 4, label: 'Horizontal' },
  { id: 5, label: 'Sólido' },
  { id: 6, label: 'Ladrillo (tabique)' },
  { id: 7, label: 'Césped' },
]

const TOOLS = [
  { id: 'seleccion', label: 'Selección / mover', Icon: IconSeleccion },
  { id: 'paneo', label: 'Paneo', Icon: IconPaneo },
  { id: 'lapiz', label: 'Lápiz', Icon: IconLapiz },
  { id: 'borrador', label: 'Borrador', Icon: IconBorrador },
  { id: 'linea', label: 'Línea', Icon: IconLinea },
  { id: 'polilinea', label: 'Polilínea', Icon: IconPolilinea },
  { id: 'flecha', label: 'Flecha', Icon: IconFlecha },
  { id: 'rect', label: 'Rectángulo', Icon: IconRect },
  { id: 'elipse', label: 'Círculo / elipse (desde el centro)', Icon: IconElipse },
  { id: 'triangulo', label: 'Triángulo', Icon: IconTriangulo },
  { id: 'nodo', label: 'Nodo', Icon: IconNodo },
  { id: 'unir-nodos', label: 'Unir nodos por número', Icon: IconUnirNodos },
  { id: 'girar-escalar', label: 'Girar y escalar', Icon: IconGirarEscalar },
  { id: 'tabla', label: 'Tabla', Icon: IconTabla },
  { id: 'texto', label: 'Texto', Icon: IconTexto },
  { id: 'hatch', label: 'Relleno hatch (región)', Icon: IconHatch },
]

function createTablaAt(x, y, rows = 2, cols = 3) {
  const r = Math.max(1, Math.min(20, rows))
  const c = Math.max(1, Math.min(12, cols))
  return {
    id: uid(),
    type: 'tabla',
    x,
    y,
    cellW: 78,
    cellH: 30,
    rows: r,
    cols: c,
    cells: Array.from({ length: r }, () => Array.from({ length: c }, () => '')),
    color: '#1e293b',
    rotation: 0,
  }
}

/** Caja de texto libre sobre el lienzo (edición vía overlay HTML nativo). */
function createTextoAt(x, y, color = '#1e293b') {
  return {
    id: uid(),
    type: 'texto',
    x,
    y,
    w: 180,
    h: 56,
    text: '',
    color: color || '#1e293b',
    fontSize: 16,
    rotation: 0,
  }
}

function tablaSize(obj) {
  const cols = Math.max(1, obj.cols || (obj.cells?.[0]?.length) || 1)
  const rows = Math.max(1, obj.rows || (obj.cells?.length) || 1)
  const cellW = obj.cellW || 78
  const cellH = obj.cellH || 30
  return { w: cols * cellW, h: rows * cellH, cols, rows, cellW, cellH }
}

function resizeTablaObj(obj, dRows, dCols) {
  const { rows, cols, cellW, cellH } = tablaSize(obj)
  const nextRows = Math.max(1, Math.min(20, rows + dRows))
  const nextCols = Math.max(1, Math.min(12, cols + dCols))
  const cells = []
  for (let i = 0; i < nextRows; i += 1) {
    const row = []
    for (let j = 0; j < nextCols; j += 1) {
      row.push(obj.cells?.[i]?.[j] ?? '')
    }
    cells.push(row)
  }
  return { ...obj, rows: nextRows, cols: nextCols, cellW, cellH, cells }
}

const SHAPE_TOOLS = new Set(['linea', 'flecha', 'rect', 'elipse', 'triangulo'])
const PATH_TYPES = new Set(['stroke', 'polilinea'])

function uid() {
  return `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function cloneScene(objs) {
  return JSON.parse(JSON.stringify(objs || []))
}

/**
 * Editor vectorial de esquema: undo, mover/rotar, hatch, medidas editables al crear.
 */
function renumberCoordRows(rows) {
  return (rows || []).map((r, i) => ({ ...(r || {}), num: String(i + 1) }))
}

const WIDTH_TYPES = new Set(['linea', 'flecha', 'rect', 'elipse', 'triangulo', 'stroke', 'polilinea'])

export default function EsquemaEditorModal({
  t,
  title = 'Crear esquema',
  initialDataUri = null,
  contratoId: contratoIdProp = null,
  onSave,
  onClose,
}) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const objectsRef = useRef([])
  const historyRef = useRef([])
  const drawing = useRef(false)
  const startPt = useRef(null)
  const lastPt = useRef(null)
  const draftRef = useRef(null)
  const dragRef = useRef(null) // { id, mode: 'move'|'rotate'|'resize', handle?, ox, oy, ... }
  const panRef = useRef({ x: 0, y: 0 })
  const zoomRef = useRef(1)
  const panDragRef = useRef(null)
  const toolRef = useRef('lapiz')
  const colorRef = useRef('#1e293b')
  const widthRef = useRef(3)
  const hatchRef = useRef(0)
  const measureWRef = useRef('')
  const measureHRef = useRef('')
  const pointersRef = useRef(new Map()) // pointerId → { x, y } (pantalla, para pellizco)
  const pinchRef = useRef(null) // { dist0, zoom0, midX, midY, pan0 }
  const snapRef = useRef(null) // { x, y, kind, guide? }
  const clipboardRef = useRef(null)
  const copySelectedRef = useRef(() => false)
  const pasteClipboardRef = useRef(() => false)
  const deleteSelectedRef = useRef(() => false)
  const escapeActionRef = useRef(() => false)
  const enterActionRef = useRef(() => false)
  // Medida solo restringe el trazo si el usuario la digitó (no al sincronizar desde selección)
  const measureArmedRef = useRef(false)
  const dynBufferRef = useRef('')
  const lastScreenRef = useRef({ x: 24, y: 24 })
  const moveGuideRef = useRef(null)
  const joinSeqRef = useRef([])
  const pendingInsertRef = useRef(null)
  const coordOriginRef = useRef({ este0: 0, norte0: 0 })
  const coordFileRef = useRef(null)
  const contratoId = resolveContratoId(contratoIdProp)

  const [tool, setTool] = useState('lapiz')
  const [color, setColor] = useState('#1e293b')
  const [width, setWidth] = useState(3)
  const [hatch, setHatch] = useState(0)
  const [measureW, setMeasureW] = useState('')
  const [measureH, setMeasureH] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const [liveMeasure, setLiveMeasure] = useState('')
  const [canUndo, setCanUndo] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [panTick, setPanTick] = useState(0)
  const [zoomPct, setZoomPct] = useState(100)
  const [hoverCursor, setHoverCursor] = useState(null)
  const [hasClipboard, setHasClipboard] = useState(false)
  const [measureArmed, setMeasureArmed] = useState(false)
  const [dynHud, setDynHud] = useState({ text: '', typing: false, x: 24, y: 24 })
  const [coordRows, setCoordRows] = useState([])
  const [coordPanelOpen, setCoordPanelOpen] = useState(false)
  const [savePrompt, setSavePrompt] = useState(null)
  const [joinSeq, setJoinSeq] = useState([])
  const [libOpen, setLibOpen] = useState(false)
  const [libItems, setLibItems] = useState([])
  const [insertHint, setInsertHint] = useState('')
  const [libNamePrompt, setLibNamePrompt] = useState(null)
  const [libNotice, setLibNotice] = useState('')
  const selectedIdRef = useRef(null)
  const selectedIdsRef = useRef(new Set())
  const marqueeRef = useRef(null)
  const redrawRef = useRef(() => {})

  toolRef.current = tool
  colorRef.current = color
  widthRef.current = width
  hatchRef.current = hatch
  measureWRef.current = measureW
  measureHRef.current = measureH
  selectedIdRef.current = selectedId
  selectedIdsRef.current = new Set(selectedIds)
  joinSeqRef.current = joinSeq

  const selectIds = (ids) => {
    const list = [...new Set((ids || []).filter(Boolean))]
    selectedIdsRef.current = new Set(list)
    setSelectedIds(list)
    setSelectedId(list.length === 1 ? list[0] : (list[0] || null))
  }

  const selectOne = (id) => selectIds(id ? [id] : [])

  const selectedObj = selectedIds.length === 1 && selectedId
    ? (objectsRef.current.find((o) => o.id === selectedId) || null)
    : null
  const editingTabla = (
    selectedObj?.type === 'tabla'
    && (tool === 'seleccion' || tool === 'tabla')
    && !selectedObj.rotation
  )
  const editingTexto = (
    selectedObj?.type === 'texto'
    && (tool === 'seleccion' || tool === 'texto')
    && !selectedObj.rotation
  )
  const needsBoxMeasure = (
    BOX_TOOLS.has(tool)
    || (selectedObj && BOX_TOOLS.has(selectedObj.type))
  )
  const needsLengthMeasure = (
    LINE_TOOLS.has(tool)
    || tool === 'triangulo'
    || (selectedObj && (LINE_TOOLS.has(selectedObj.type) || selectedObj.type === 'triangulo'))
  )

  const cssSize = () => {
    const c = canvasRef.current
    return { w: c?.clientWidth || 0, h: c?.clientHeight || 0 }
  }

  const pushHistory = () => {
    historyRef.current.push(cloneScene(objectsRef.current))
    if (historyRef.current.length > 40) historyRef.current.shift()
    setCanUndo(historyRef.current.length > 0)
  }

  const redraw = useCallback((extraDraft = null) => {
    const c = canvasRef.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const { w, h } = cssSize()
    if (!w || !h) return
    const ctx = c.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.save()
    ctx.translate(panRef.current.x, panRef.current.y)
    ctx.scale(zoomRef.current, zoomRef.current)
    const zGrid = zoomRef.current || 1
    drawDotGrid(ctx, {
      x: -panRef.current.x / zGrid,
      y: -panRef.current.y / zGrid,
      w: w / zGrid,
      h: h / zGrid,
    }, gridStepWorld(zGrid), zGrid)
    const list = [...objectsRef.current]
    if (extraDraft) list.push(extraDraft)
    const hideOverlayTextId = (
      toolRef.current === 'seleccion'
      || toolRef.current === 'tabla'
      || toolRef.current === 'texto'
    ) ? selectedId : null
    const selSet = selectedIdsRef.current
    const multi = selSet.size > 1
    for (const obj of list) {
      drawObject(ctx, obj, selSet.has(obj.id), {
        skipTablaText: obj.type === 'tabla' && obj.id === hideOverlayTextId,
        skipTextoText: obj.type === 'texto' && obj.id === hideOverlayTextId,
        zoom: zoomRef.current,
        skipResize: toolRef.current === 'girar-escalar' || multi,
      })
    }
    if (toolRef.current === 'girar-escalar' && selectedId && selSet.size === 1) {
      const sel = objectsRef.current.find((o) => o.id === selectedId)
      if (sel && sel.type !== 'image') drawTransformHandles(ctx, sel, zoomRef.current)
    }
    if (marqueeRef.current?.from && marqueeRef.current?.to) {
      drawSelectionMarquee(ctx, marqueeRef.current.from, marqueeRef.current.to, zoomRef.current)
    }
    if (moveGuideRef.current?.a && moveGuideRef.current?.b) {
      drawMoveGuide(ctx, moveGuideRef.current.a, moveGuideRef.current.b, zoomRef.current)
    }
    if (snapRef.current) drawSnapMarker(ctx, snapRef.current, zoomRef.current)
    ctx.restore()
    drawNorthIndicator(ctx, w, h)
  }, [selectedId, selectedIds, panTick])

  redrawRef.current = redraw

  const setupCanvas = useCallback(() => {
    const c = canvasRef.current
    const wrap = wrapRef.current
    if (!c || !wrap) return
    const dpr = window.devicePixelRatio || 1
    const w = Math.max(480, wrap.clientWidth)
    const h = Math.max(360, wrap.clientHeight)
    c.width = Math.floor(w * dpr)
    c.height = Math.floor(h * dpr)
    c.style.width = `${w}px`
    c.style.height = `${h}px`
    redrawRef.current()
  }, [])

  useEffect(() => {
    setupCanvas()
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => { if (!drawing.current && !pinchRef.current) setupCanvas() })
      : null
    if (ro && wrapRef.current) ro.observe(wrapRef.current)
    return () => ro?.disconnect()
  }, [setupCanvas])

  // IMPORTANTE: no depender de `redraw` aquí. Si se incluye, cada pan/zoom/selección
  // recrea el callback y este efecto vacía objectsRef → el lienzo deja de dibujar.
  useEffect(() => {
    panRef.current = { x: 0, y: 0 }
    zoomRef.current = 1
    setZoomPct(100)
    selectOne(null)
    draftRef.current = null
    drawing.current = false
    pinchRef.current = null
    pointersRef.current.clear()
    if (!initialDataUri) {
      objectsRef.current = []
    } else {
      objectsRef.current = [{
        id: uid(),
        type: 'image',
        dataUri: initialDataUri,
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        fit: true,
      }]
    }
    historyRef.current = []
    setCanUndo(false)
    setDirty(false)
    requestAnimationFrame(() => redrawRef.current())
  }, [initialDataUri])

  useEffect(() => { redraw(draftRef.current) }, [selectedId, redraw, panTick])

  // Zoom con rueda/scroll: listener nativo no-pasivo para poder preventDefault
  // (evita scroll de página y no depende de Ctrl/⌘).
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return undefined
    const onWheelNative = (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (pinchRef.current || drawing.current) return
      const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1
      const r = c.getBoundingClientRect()
      const screenX = e.clientX - r.left
      const screenY = e.clientY - r.top
      const z0 = zoomRef.current || 1
      const z1 = clampZoom(z0 * factor)
      if (Math.abs(z1 - z0) < 0.0005) return
      const wx = (screenX - panRef.current.x) / z0
      const wy = (screenY - panRef.current.y) / z0
      panRef.current = {
        x: screenX - wx * z1,
        y: screenY - wy * z1,
      }
      zoomRef.current = z1
      setZoomPct(Math.round(z1 * 100))
      setPanTick((n) => n + 1)
    }
    c.addEventListener('wheel', onWheelNative, { passive: false })
    return () => c.removeEventListener('wheel', onWheelNative)
  }, [])

  const screenPosFromEvent = (e) => {
    const c = canvasRef.current
    const r = c.getBoundingClientRect()
    const src = e.touches?.[0] || e.changedTouches?.[0] || e
    return { x: src.clientX - r.left, y: src.clientY - r.top }
  }

  const posFromEvent = (e) => {
    const s = screenPosFromEvent(e)
    const z = zoomRef.current || 1
    return {
      x: (s.x - panRef.current.x) / z,
      y: (s.y - panRef.current.y) / z,
    }
  }

  /** Zoom anclado a un punto de pantalla (centro del pellizco o cursor del scroll). */
  const setZoomAtScreenPoint = (nextZoom, screenX, screenY) => {
    const z0 = zoomRef.current || 1
    const z1 = clampZoom(nextZoom)
    if (Math.abs(z1 - z0) < 0.0005) return
    const wx = (screenX - panRef.current.x) / z0
    const wy = (screenY - panRef.current.y) / z0
    panRef.current = {
      x: screenX - wx * z1,
      y: screenY - wy * z1,
    }
    zoomRef.current = z1
    setZoomPct(Math.round(z1 * 100))
    setPanTick((n) => n + 1)
  }

  const setZoomAroundCenter = (nextZoom) => {
    const { w, h } = cssSize()
    setZoomAtScreenPoint(nextZoom, w / 2, h / 2)
  }

  const pointerDistance = () => {
    const pts = [...pointersRef.current.values()]
    if (pts.length < 2) return 0
    return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
  }

  const pointerMidpoint = () => {
    const pts = [...pointersRef.current.values()]
    if (pts.length < 2) return { x: 0, y: 0 }
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
  }

  const beginPinchIfNeeded = () => {
    if (pointersRef.current.size !== 2) return
    const dist = pointerDistance()
    if (dist < 8) return
    // Cancelar cualquier trazo en curso: el pellizco no debe dibujar
    drawing.current = false
    draftRef.current = null
    dragRef.current = null
    panDragRef.current = null
    const mid = pointerMidpoint()
    pinchRef.current = {
      dist0: dist,
      zoom0: zoomRef.current || 1,
      midX: mid.x,
      midY: mid.y,
      pan0: { ...panRef.current },
    }
  }

  const setMeasureArmedBoth = (armed) => {
    measureArmedRef.current = !!armed
    setMeasureArmed(!!armed)
  }

  const armMeasureFromInputs = (w = measureWRef.current, h = measureHRef.current) => {
    setMeasureArmedBoth(!!(parsePositive(w) || parsePositive(h)))
  }

  const updateDynHud = (text, typing) => {
    const s = lastScreenRef.current
    setDynHud({
      text: text || '',
      typing: !!typing,
      x: (s?.x || 24) + 16,
      y: (s?.y || 24) + 16,
    })
  }

  const clearDynBuffer = () => {
    dynBufferRef.current = ''
    updateDynHud('', false)
  }

  const activeMeasureMeters = () => {
    const dyn = parseDynMeasure(dynBufferRef.current)
    if (dyn && (dyn.w != null || dyn.h != null)) return dyn
    if (!measureArmedRef.current) return null
    const w = parsePositive(measureWRef.current)
    const h = parsePositive(measureHRef.current)
    if (w == null && h == null) return null
    return { w, h }
  }

  const applyMeasureToShape = (shape, toolId, a, b, { force = false } = {}) => {
    const dyn = parseDynMeasure(dynBufferRef.current)
    const toolbar = {
      w: parsePositive(measureWRef.current),
      h: parsePositive(measureHRef.current),
    }
    const src = (dyn && (dyn.w != null || dyn.h != null))
      ? dyn
      : ((force || measureArmedRef.current) ? toolbar : null)
    const wVal = src?.w != null ? metersToWorld(src.w) : null
    const hVal = src?.h != null ? metersToWorld(src.h) : null
    const signX = b.x >= a.x ? 1 : -1
    const signY = b.y >= a.y ? 1 : -1

    if (toolId === 'elipse') {
      const circle = (wVal != null && hVal == null)
      return {
        ...shape,
        ...ellipseFromCenter(a.x, a.y, b.x, b.y, {
          circle,
          rxWorld: wVal,
          ryWorld: hVal != null ? hVal : (circle ? wVal : null),
        }),
      }
    }

    if (!src && toolId !== 'elipse') {
      return { ...shape, x1: a.x, y1: a.y, x2: b.x, y2: b.y }
    }

    if (toolId === 'linea' || toolId === 'flecha') {
      if (!wVal) return { ...shape, x1: a.x, y1: a.y, x2: b.x, y2: b.y }
      const ang = Math.atan2(b.y - a.y, b.x - a.x)
      return {
        ...shape,
        x1: a.x,
        y1: a.y,
        x2: a.x + Math.cos(ang) * wVal,
        y2: a.y + Math.sin(ang) * wVal,
      }
    }

    // Rectángulo: ancho y alto independientes desde la esquina
    if (BOX_TOOLS.has(toolId)) {
      if (!wVal && !hVal) return { ...shape, x1: a.x, y1: a.y, x2: b.x, y2: b.y }
      const finalW = wVal || Math.abs(b.x - a.x) || 1
      const finalH = hVal || Math.abs(b.y - a.y) || 1
      return {
        ...shape,
        x1: a.x,
        y1: a.y,
        x2: a.x + signX * finalW,
        y2: a.y + signY * finalH,
      }
    }

    // Triángulo: ancho y alto en metros (si falta uno, se toma del arrastre)
    if (!wVal && !hVal) return { ...shape, x1: a.x, y1: a.y, x2: b.x, y2: b.y }
    const finalW = wVal || Math.abs(b.x - a.x) || 1
    const finalH = hVal || Math.abs(b.y - a.y) || finalW
    return {
      ...shape,
      x1: a.x,
      y1: a.y,
      x2: a.x + signX * finalW,
      y2: a.y + signY * finalH,
    }
  }

  const measureLabelFor = (toolId, a, b) => {
    if (toolId === 'linea' || toolId === 'flecha') {
      return formatMeters(dist(a, b))
    }
    if (toolId === 'elipse') {
      const rx = Math.abs(b.x - a.x) / 2
      const ry = Math.abs(b.y - a.y) / 2
      if (Math.abs(rx - ry) < 2) return `R ${formatMeters(rx)}`
      return `${formatMeters(rx).replace(/ m$/, '')} × ${formatMeters(ry)}`
    }
    const w = formatMeters(Math.abs(b.x - a.x)).replace(/ m$/, '')
    const h = formatMeters(Math.abs(b.y - a.y))
    return `${w} × ${h}`
  }

  // Snap solo con intención clara: ~6–7 px de pantalla (no ~14).
  const snapThreshold = () => 6.5 / (zoomRef.current || 1)
  const handleHitThreshold = () => 10 / (zoomRef.current || 1)
  /** Hit de manija = mitad del cuadrado visible (no el umbral amplio de 10 wu/zoom). */
  const resizeHandleGrabThreshold = (obj) => resizeHandleWorldSize(obj, zoomRef.current) * 0.5

  const snapWorldPoint = (p, { fromPoint = null, excludeId = null } = {}) => {
    const hit = findSnap(p, objectsRef.current, {
      threshold: snapThreshold(),
      fromPoint,
      allowNear: true,
      excludeId,
    })
    const discrete = hit && hit.kind !== 'near'
    if (discrete) {
      snapRef.current = hit
      return { x: hit.x, y: hit.y }
    }
    const drawingLine = fromPoint && (
      LINE_TOOLS.has(toolRef.current) || toolRef.current === 'polilinea'
    )
    if (drawingLine) {
      const ortho = applySoftOrtho(fromPoint, p, {
        // Ejes cartesianos fijos del lienzo (0/90/180/270), no la última figura
        referenceAngle: 0,
      })
      if (ortho) {
        if (hit?.kind === 'near') {
          const dNear = Math.hypot(p.x - hit.x, p.y - hit.y)
          const dOrtho = Math.hypot(p.x - ortho.x, p.y - ortho.y)
          if (dNear <= dOrtho) {
            snapRef.current = hit
            return { x: hit.x, y: hit.y }
          }
        }
        snapRef.current = ortho
        return { x: ortho.x, y: ortho.y }
      }
    }
    if (hit) {
      snapRef.current = hit
      return { x: hit.x, y: hit.y }
    }
    snapRef.current = null
    return p
  }

  const syncMeasureFromObject = (obj) => {
    if (!obj || !SHAPE_TOOLS.has(obj.type)) return
    // Rellena la barra para «Aplicar a selección», pero NO arma la medida del próximo trazo
    setMeasureArmedBoth(false)
    if (LINE_TOOLS.has(obj.type)) {
      setMeasureW(worldToMeters(dist({ x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 })).toFixed(2))
      setMeasureH('')
      return
    }
    if (obj.type === 'elipse') {
      setMeasureW(worldToMeters(Math.abs(obj.x2 - obj.x1) / 2).toFixed(2))
      setMeasureH(worldToMeters(Math.abs(obj.y2 - obj.y1) / 2).toFixed(2))
      return
    }
    setMeasureW(worldToMeters(Math.abs(obj.x2 - obj.x1)).toFixed(2))
    setMeasureH(worldToMeters(Math.abs(obj.y2 - obj.y1)).toFixed(2))
  }

  const copySelected = () => {
    const ids = selectedIdsRef.current
    const objs = objectsRef.current.filter((o) => ids.has(o.id) && o.type !== 'image')
    if (!objs.length) return false
    clipboardRef.current = cloneScene(objs)
    setHasClipboard(true)
    return true
  }

  const pasteClipboard = () => {
    if (!clipboardRef.current) return false
    pushHistory()
    const offset = 24 / (zoomRef.current || 1)
    const source = Array.isArray(clipboardRef.current) ? clipboardRef.current : [clipboardRef.current]
    const copies = cloneScene(source).map((copy) => {
      copy.id = uid()
      return translateObject(copy, offset, offset)
    })
    clipboardRef.current = cloneScene(copies)
    setHasClipboard(true)
    objectsRef.current = [...objectsRef.current, ...copies]
    selectIds(copies.map((c) => c.id))
    if (copies.length === 1 && SHAPE_TOOLS.has(copies[0].type)) syncMeasureFromObject(copies[0])
    setDirty(true)
    setPanTick((n) => n + 1)
    return true
  }

  const finishPolyline = () => {
    const draft = draftRef.current
    if (!draft || draft.type !== 'polilinea') return false
    const pts = (draft.points || []).filter((pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y))
    draftRef.current = null
    drawing.current = false
    if (pts.length < 2) {
      snapRef.current = null
      setLiveMeasure('')
      redraw()
      return true
    }
    pushHistory()
    const obj = { ...draft, points: pts }
    objectsRef.current = [...objectsRef.current, obj]
    selectOne(obj.id)
    setDirty(true)
    snapRef.current = null
    setLiveMeasure('')
    redraw()
    return true
  }

  const deleteSelected = () => {
    const ids = selectedIdsRef.current
    if (!ids.size) return false
    const removable = objectsRef.current.filter((o) => ids.has(o.id) && !(o.type === 'image' && o.fit))
    if (!removable.length) return false
    pushHistory()
    objectsRef.current = objectsRef.current.filter((o) => !ids.has(o.id) || (o.type === 'image' && o.fit))
    selectOne(null)
    setDirty(true)
    snapRef.current = null
    redraw()
    return true
  }

  const hitTest = (p) => {
    const objs = objectsRef.current
    for (let i = objs.length - 1; i >= 0; i -= 1) {
      const o = objs[i]
      if (o.type === 'image' && o.fit) continue
      if (pointInObject(p, o)) return o
    }
    return null
  }

  const nextNodeNumber = (objs) => {
    let max = 0
    for (const o of objs || []) {
      const n = Number(o.nodeNum)
      if (Number.isFinite(n) && n > max) max = n
    }
    return max + 1
  }

  const findNodeByNum = (num) => {
    const key = String(num ?? '').trim()
    if (!key) return null
    return objectsRef.current.find((o) => o.type === 'nodo' && String(o.nodeNum) === key) || null
  }

  const rebuildJoinLines = (nums) => {
    const nodes = (nums || []).map((n) => findNodeByNum(n)).filter(Boolean)
    pushHistory()
    objectsRef.current = objectsRef.current.filter((o) => !o.joinSeq)
    const lines = []
    for (let i = 1; i < nodes.length; i += 1) {
      const a = nodes[i - 1]
      const b = nodes[i]
      lines.push({
        id: uid(),
        type: 'linea',
        joinSeq: true,
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        color: colorRef.current,
        width: widthRef.current,
        rotation: 0,
      })
    }
    objectsRef.current = [...objectsRef.current, ...lines]
    setDirty(true)
    redraw()
  }

  const setJoinSequence = (nums) => {
    const next = (nums || []).map((n) => String(n))
    joinSeqRef.current = next
    setJoinSeq(next)
    rebuildJoinLines(next)
  }

  const appendJoinNode = (node) => {
    if (!node || node.type !== 'nodo') return false
    const key = String(node.nodeNum ?? '')
    if (!key) return false
    const chain = [...joinSeqRef.current]
    if (chain[chain.length - 1] === key) return false
    chain.push(key)
    setJoinSequence(chain)
    return true
  }

  const finishJoinCircuit = () => {
    const nums = [...joinSeqRef.current]
    if (!nums.length) return
    const first = nums[0]
    const last = nums[nums.length - 1]
    pushHistory()
    if (nums.length >= 3 && first !== last) {
      const a = findNodeByNum(last)
      const b = findNodeByNum(first)
      if (a && b) {
        objectsRef.current = [...objectsRef.current, {
          id: uid(),
          type: 'linea',
          joinSeq: true,
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          color: colorRef.current,
          width: widthRef.current,
          rotation: 0,
        }]
      }
    }
    objectsRef.current = objectsRef.current.map((o) => (
      o.joinSeq ? { ...o, joinSeq: false } : o
    ))
    joinSeqRef.current = []
    setJoinSeq([])
    setDirty(true)
    redraw()
  }

  const applyCoordRowsToCanvas = (rows) => {
    const list = (rows || []).filter((r) => r && (r.norte !== '' || r.este !== ''))
    const parsed = list.map((r, i) => ({
      num: String(i + 1),
      norte: Number(r.norte),
      este: Number(r.este),
      cota: r.cota === '' || r.cota == null ? null : Number(r.cota),
      desc: String(r.desc || ''),
    })).filter((r) => Number.isFinite(r.norte) && Number.isFinite(r.este))
    const origin = coordOriginFromRows(parsed)
    coordOriginRef.current = origin
    pushHistory()
    const keep = objectsRef.current.filter((o) => o.type !== 'nodo')
    const nodes = parsed.map((r) => {
      const pt = topoToWorld(r.este, r.norte, origin)
      return {
        id: uid(),
        type: 'nodo',
        x: pt.x,
        y: pt.y,
        nodeNum: r.num,
        norte: r.norte,
        este: r.este,
        cota: r.cota,
        desc: r.desc,
        color: colorRef.current,
      }
    })
    objectsRef.current = [...keep, ...nodes]
    setCoordRows(parsed.map((r) => ({
      num: r.num,
      norte: r.norte,
      este: r.este,
      cota: r.cota ?? '',
      desc: r.desc,
    })))
    setCoordPanelOpen(true)
    selectOne(null)
    setDirty(true)
    if (nodes.length) {
      const xs = nodes.map((n) => n.x)
      const ys = nodes.map((n) => n.y)
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)
      const { w, h } = cssSize()
      const bw = Math.max(40, maxX - minX)
      const bh = Math.max(40, maxY - minY)
      const z = clampZoom(Math.min(2.5, Math.min((w - 80) / bw, (h - 80) / bh)))
      zoomRef.current = z
      panRef.current = {
        x: w / 2 - ((minX + maxX) / 2) * z,
        y: h / 2 - ((minY + maxY) / 2) * z,
      }
      setZoomPct(Math.round(z * 100))
    }
    setPanTick((n) => n + 1)
  }

  const onPointerDown = (e) => {
    e.preventDefault()
    const c = canvasRef.current
    c.focus?.()
    c.setPointerCapture?.(e.pointerId)
    const screen = screenPosFromEvent(e)
    lastScreenRef.current = screen
    pointersRef.current.set(e.pointerId, screen)

    // Dos dedos → pellizco (zoom). No iniciar dibujo ni pan con el segundo puntero.
    if (pointersRef.current.size >= 2) {
      beginPinchIfNeeded()
      return
    }
    if (pinchRef.current) return

    let p = posFromEvent(e)
    const currentTool = toolRef.current
    if (pendingInsertRef.current) {
      const placed = instantiateLibraryItem(pendingInsertRef.current, p)
      pushHistory()
      objectsRef.current = [...objectsRef.current, ...placed]
      pendingInsertRef.current = null
      setInsertHint('')
      selectIds(placed.map((o) => o.id))
      setDirty(true)
      drawing.current = false
      redraw()
      return
    }
    drawing.current = true

    // Manijas de girar/escalar (solo esa herramienta)
    if (currentTool === 'girar-escalar') {
      const selId = selectedIdRef.current
      const sel = selId ? objectsRef.current.find((o) => o.id === selId) : null
      const th = sel ? hitTransformHandle(p, sel, handleHitThreshold() + 4, zoomRef.current) : null
      if (th) {
        const center = objectCenter(sel)
        dragRef.current = {
          id: sel.id,
          mode: th.id === 'rotate' ? 'rotate' : 'scale',
          ox: p.x,
          oy: p.y,
          startDist: Math.max(8, dist(p, center)),
          startAngle: Math.atan2(p.y - center.y, p.x - center.x),
          baseRot: sel.rotation || 0,
          origin: cloneScene([sel])[0],
        }
        pushHistory()
        startPt.current = p
        lastPt.current = p
        return
      }
      const hit = hitTest(p)
      selectOne(hit ? hit.id : null)
      if (hit && SHAPE_TOOLS.has(hit.type)) syncMeasureFromObject(hit)
      drawing.current = false
      redraw()
      return
    }

    // Resize SOLO si el clic cae dentro del cuadrado visible de una manija.
    // El cuerpo (incluido un osnap que coincida visualmente con una esquina) inicia move.
    if (currentTool === 'seleccion' && selectedIdsRef.current.size <= 1) {
      const selId = selectedIdRef.current
      const sel = selId ? objectsRef.current.find((o) => o.id === selId) : null
      const handle = sel ? hitResizeHandle(p, sel, resizeHandleGrabThreshold(sel)) : null
      if (handle) {
        dragRef.current = {
          id: sel.id,
          mode: 'resize',
          handle: handle.id,
          origin: cloneScene([sel])[0],
        }
        pushHistory()
        startPt.current = p
        lastPt.current = p
        return
      }
    }

    if (currentTool === 'paneo') {
      const src = e.touches?.[0] || e
      panDragRef.current = {
        startX: src.clientX,
        startY: src.clientY,
        originX: panRef.current.x,
        originY: panRef.current.y,
      }
      startPt.current = p
      lastPt.current = p
      return
    }

    if (currentTool === 'polilinea') {
      const last = (draftRef.current?.type === 'polilinea' && (draftRef.current.points || []).length)
        ? draftRef.current.points[draftRef.current.points.length - 1]
        : null
      p = snapWorldPoint(p, last ? { fromPoint: last } : {})
      if (e.detail >= 2 && draftRef.current?.type === 'polilinea') {
        finishPolyline()
        drawing.current = false
        return
      }
      if (!draftRef.current || draftRef.current.type !== 'polilinea') {
        draftRef.current = {
          id: uid(),
          type: 'polilinea',
          points: [p],
          color: colorRef.current,
          width: widthRef.current,
          rotation: 0,
        }
      } else {
        const pts = draftRef.current.points || []
        const prev = pts[pts.length - 1]
        if (!prev || dist(prev, p) >= 2) {
          draftRef.current = { ...draftRef.current, points: [...pts, p] }
        }
      }
      lastPt.current = p
      redraw(draftRef.current)
      return
    }

    if (currentTool === 'seleccion') {
      const hit = hitTest(p)
      if (hit) {
        const already = selectedIdsRef.current.has(hit.id)
        if (!already) selectOne(hit.id)
        if (SHAPE_TOOLS.has(hit.type) && selectedIdsRef.current.size === 1) syncMeasureFromObject(hit)
        const group = objectsRef.current.filter((o) => (
          selectedIdsRef.current.has(o.id) || o.id === hit.id
        ) && !(o.type === 'image' && o.fit))
        dragRef.current = {
          id: hit.id,
          mode: 'move',
          pending: true,
          ox: p.x,
          oy: p.y,
          groupOrigins: cloneScene(group),
        }
        drawing.current = true
        startPt.current = p
        lastPt.current = p
        moveGuideRef.current = null
        redraw()
        return
      }
      dragRef.current = { mode: 'box', ox: p.x, oy: p.y }
      marqueeRef.current = { from: { x: p.x, y: p.y }, to: { x: p.x, y: p.y } }
      drawing.current = true
      startPt.current = p
      lastPt.current = p
      snapRef.current = null
      moveGuideRef.current = null
      redraw()
      return
    }

    if (currentTool === 'nodo') {
      p = snapWorldPoint(p)
      const nextNum = nextNodeNumber(objectsRef.current)
      pushHistory()
      const node = {
        id: uid(),
        type: 'nodo',
        x: p.x,
        y: p.y,
        nodeNum: String(nextNum),
        norte: null,
        este: null,
        cota: null,
        desc: '',
        color: colorRef.current,
      }
      objectsRef.current = [...objectsRef.current, node]
      selectOne(node.id)
      setDirty(true)
      drawing.current = false
      redraw()
      return
    }

    if (currentTool === 'unir-nodos') {
      const hit = hitTest(p)
      if (hit?.type === 'nodo') appendJoinNode(hit)
      drawing.current = false
      return
    }

    if (currentTool === 'tabla') {
      const hit = hitTest(p)
      if (hit?.type === 'tabla') {
        selectOne(hit.id)
        drawing.current = false
        redraw()
        return
      }
      pushHistory()
      const table = createTablaAt(p.x, p.y)
      objectsRef.current = [...objectsRef.current, table]
      selectOne(table.id)
      setDirty(true)
      drawing.current = false
      redraw()
      return
    }

    if (currentTool === 'texto') {
      const hit = hitTest(p)
      if (hit?.type === 'texto') {
        selectOne(hit.id)
        drawing.current = false
        redraw()
        return
      }
      pushHistory()
      const box = createTextoAt(p.x, p.y, colorRef.current)
      objectsRef.current = [...objectsRef.current, box]
      selectOne(box.id)
      setDirty(true)
      drawing.current = false
      redraw()
      return
    }

    if (currentTool === 'hatch') {
      // Flood-fill de la subregión cerrada bajo el clic (líneas/figuras = fronteras)
      const region = createHatchRegionFromClick(
        objectsRef.current,
        p.x,
        p.y,
        hatchRef.current,
        colorRef.current,
      )
      if (region) {
        pushHistory()
        const withId = { ...region, id: uid() }
        objectsRef.current = [...objectsRef.current, withId]
        selectOne(withId.id)
        setDirty(true)
        // Redibujar cuando la máscara esté lista
        const img = new Image()
        img.onload = () => redraw()
        img.src = withId.maskDataUri
        redraw()
      }
      drawing.current = false
      return
    }

    // Snap al iniciar trazo de figura (extremo / medio)
    if (SHAPE_TOOLS.has(currentTool)) {
      p = snapWorldPoint(p)
    }

    startPt.current = p
    lastPt.current = p

    if (currentTool === 'lapiz' || currentTool === 'borrador') {
      snapRef.current = null
      draftRef.current = {
        id: uid(),
        type: 'stroke',
        points: [p],
        color: colorRef.current,
        width: widthRef.current,
        erase: currentTool === 'borrador',
      }
      return
    }

    if (SHAPE_TOOLS.has(currentTool)) {
      draftRef.current = {
        id: uid(),
        type: currentTool,
        x1: p.x,
        y1: p.y,
        x2: p.x,
        y2: p.y,
        color: colorRef.current,
        width: widthRef.current,
        rotation: 0,
        hatch: null,
        label: '0',
      }
    }
  }

  const onPointerMove = (e) => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, screenPosFromEvent(e))
    }

    // Pellizco: zoom anclado al punto medio; pan sigue el centro del gesto
    if (pinchRef.current && pointersRef.current.size >= 2) {
      e.preventDefault()
      const distNow = pointerDistance()
      if (distNow >= 8) {
        const pinch = pinchRef.current
        const mid = pointerMidpoint()
        const z1 = clampZoom(pinch.zoom0 * (distNow / pinch.dist0))
        const wx = (pinch.midX - pinch.pan0.x) / pinch.zoom0
        const wy = (pinch.midY - pinch.pan0.y) / pinch.zoom0
        panRef.current = {
          x: mid.x - wx * z1,
          y: mid.y - wy * z1,
        }
        zoomRef.current = z1
        setZoomPct(Math.round(z1 * 100))
        setPanTick((n) => n + 1)
      }
      return
    }

    lastScreenRef.current = screenPosFromEvent(e)
    const raw = posFromEvent(e)
    const currentTool = toolRef.current

    // Hover: manijas / cursor de mover; preview de snap al dibujar o seleccionar
    if (!drawing.current) {
      const selId = selectedIdRef.current
      const sel = selId ? objectsRef.current.find((o) => o.id === selId) : null
      if (currentTool === 'seleccion') {
        const handle = (sel && selectedIdsRef.current.size <= 1)
          ? hitResizeHandle(raw, sel, resizeHandleGrabThreshold(sel))
          : null
        if (handle) setHoverCursor(cursorForHandle(handle.id))
        else if (hitTest(raw)) setHoverCursor('move')
        else setHoverCursor('crosshair')
      } else if (currentTool === 'girar-escalar') {
        const th = sel ? hitTransformHandle(raw, sel, handleHitThreshold() + 4, zoomRef.current) : null
        setHoverCursor(th ? (th.id === 'rotate' ? 'grab' : 'nwse-resize') : (hitTest(raw) ? 'pointer' : null))
      } else {
        setHoverCursor(null)
      }
      if (SHAPE_TOOLS.has(currentTool) || currentTool === 'polilinea' || currentTool === 'seleccion' || currentTool === 'nodo') {
        const prevSnap = snapRef.current
        const lastPoly = (
          currentTool === 'polilinea'
          && draftRef.current?.type === 'polilinea'
          && draftRef.current.points?.length
        ) ? draftRef.current.points[draftRef.current.points.length - 1] : null
        snapWorldPoint(raw, lastPoly ? { fromPoint: lastPoly } : {})
        if (prevSnap !== snapRef.current || snapRef.current) redraw()
      } else if (snapRef.current) {
        snapRef.current = null
        redraw()
      }
      return
    }

    e.preventDefault()

    if (currentTool === 'paneo' && panDragRef.current) {
      const src = e.touches?.[0] || e
      const d = panDragRef.current
      panRef.current = {
        x: d.originX + (src.clientX - d.startX),
        y: d.originY + (src.clientY - d.startY),
      }
      setPanTick((n) => n + 1)
      return
    }

    // Redimensionado por manijas (sin snap: el arrastre debe ser libre)
    if (dragRef.current?.mode === 'resize') {
      const d = dragRef.current
      lastPt.current = raw
      snapRef.current = null
      objectsRef.current = objectsRef.current.map((o) => {
        if (o.id !== d.id) return o
        const next = applyResizeHandle(d.origin, d.handle, raw)
        if (SHAPE_TOOLS.has(next.type)) {
          next.label = measureLabelFor(
            next.type,
            { x: next.x1, y: next.y1 },
            { x: next.x2, y: next.y2 },
          )
          setLiveMeasure(next.label)
        }
        return next
      })
      setDirty(true)
      redraw()
      return
    }

    let p = raw
    lastPt.current = p

    if ((currentTool === 'seleccion' || currentTool === 'girar-escalar') && dragRef.current) {
      const d = dragRef.current
      if (d.mode === 'resize') {
        return
      }
      if (d.mode === 'box') {
        marqueeRef.current = { from: { x: d.ox, y: d.oy }, to: raw }
        redraw()
        return
      }
      if (d.pending && d.mode === 'move') {
        if (dist(raw, { x: d.ox, y: d.oy }) < 4) return
        d.pending = false
        pushHistory()
      }
      const origins = new Map((d.groupOrigins || (d.origin ? [d.origin] : [])).map((o) => [o.id, o]))
      if (d.mode === 'move') {
        let dest = snapWorldPoint(raw, { excludeId: d.id })
        const ortho = applySoftOrtho({ x: d.ox, y: d.oy }, dest, { referenceAngle: 0 })
        if (ortho && (!snapRef.current || snapRef.current.kind === 'ortho' || snapRef.current.kind === 'near')) {
          dest = { x: ortho.x, y: ortho.y }
          if (!snapRef.current || snapRef.current.kind === 'near') snapRef.current = ortho
        }
        const dyn = parseDynMeasure(dynBufferRef.current)
        if (dyn?.w != null) {
          dest = pointAtDistance({ x: d.ox, y: d.oy }, dest, dyn.w) || dest
        }
        const dx = dest.x - d.ox
        const dy = dest.y - d.oy
        moveGuideRef.current = { a: { x: d.ox, y: d.oy }, b: dest }
        setLiveMeasure(formatMeters(Math.hypot(dx, dy)))
        updateDynHud(dynBufferRef.current || formatMeters(Math.hypot(dx, dy)), !!dynBufferRef.current)
        objectsRef.current = objectsRef.current.map((o) => {
          const origin = origins.get(o.id)
          return origin ? translateObject(origin, dx, dy) : o
        })
        setDirty(true)
        redraw()
        return
      }
      objectsRef.current = objectsRef.current.map((o) => {
        const origin = origins.get(o.id)
        if (!origin) return o
        if (d.mode === 'scale') {
          const center = objectCenter(d.origin)
          const now = Math.max(8, dist(raw, center))
          const factor = now / (d.startDist || now)
          return scaleObjectUniform(d.origin, factor, center)
        }
        const center = objectCenter(d.origin)
        const ang = Math.atan2(raw.y - center.y, raw.x - center.x)
        return { ...o, rotation: d.baseRot + (ang - d.startAngle) }
      })
      setDirty(true)
      redraw()
      return
    }

    if ((currentTool === 'lapiz' || currentTool === 'borrador') && draftRef.current) {
      draftRef.current = {
        ...draftRef.current,
        points: [...draftRef.current.points, p],
      }
      redraw(draftRef.current)
      return
    }

    if (currentTool === 'polilinea' && draftRef.current?.type === 'polilinea') {
      const pts = draftRef.current.points || []
      const last = pts[pts.length - 1]
      p = snapWorldPoint(raw, last ? { fromPoint: last } : {})
      const dyn = parseDynMeasure(dynBufferRef.current)
      if (dyn?.w != null && last) {
        p = pointAtDistance(last, p, dyn.w) || p
      }
      lastPt.current = p
      const preview = { ...draftRef.current, points: last ? [...pts, p] : pts }
      if (last) {
        const label = formatMeters(dist(last, p))
        setLiveMeasure(label)
        updateDynHud(dynBufferRef.current || label, !!dynBufferRef.current)
      }
      redraw(preview)
      return
    }

    if (SHAPE_TOOLS.has(currentTool) && draftRef.current && startPt.current) {
      p = snapWorldPoint(raw, { fromPoint: startPt.current })
      lastPt.current = p
      let shape
      if (currentTool === 'elipse') {
        const dyn = parseDynMeasure(dynBufferRef.current)
        const circle = !!(dyn?.w != null && dyn.h == null)
        const box = ellipseFromCenter(
          startPt.current.x,
          startPt.current.y,
          p.x,
          p.y,
          {
            circle,
            rxWorld: dyn?.w != null ? metersToWorld(dyn.w) : null,
            ryWorld: dyn?.h != null ? metersToWorld(dyn.h) : (circle && dyn?.w != null ? metersToWorld(dyn.w) : null),
          },
        )
        shape = { ...draftRef.current, ...box }
      } else {
        shape = {
          ...draftRef.current,
          x1: startPt.current.x,
          y1: startPt.current.y,
          x2: p.x,
          y2: p.y,
        }
        shape = applyMeasureToShape(shape, currentTool, startPt.current, p)
      }
      shape.label = measureLabelFor(currentTool, { x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 })
      draftRef.current = shape
      setLiveMeasure(shape.label)
      updateDynHud(dynBufferRef.current || shape.label, !!dynBufferRef.current)
      redraw(shape)
    }
  }

  const onPointerUp = (e) => {
    pointersRef.current.delete(e.pointerId)
    try { canvasRef.current.releasePointerCapture?.(e.pointerId) } catch { /* ignore */ }

    // Fin de pellizco: al quedar menos de 2 punteros, liberar el gesto
    if (pinchRef.current) {
      e.preventDefault()
      if (pointersRef.current.size < 2) {
        pinchRef.current = null
        drawing.current = false
        draftRef.current = null
      }
      return
    }

    if (toolRef.current === 'polilinea' && draftRef.current?.type === 'polilinea') {
      e.preventDefault()
      drawing.current = true
      return
    }

    if (!drawing.current) return
    e.preventDefault()
    drawing.current = false
    const currentTool = toolRef.current
    let p = posFromEvent(e)

    if (currentTool === 'paneo') {
      panDragRef.current = null
      return
    }

    if (dragRef.current?.mode === 'resize') {
      const id = dragRef.current.id
      const obj = objectsRef.current.find((o) => o.id === id)
      if (obj && SHAPE_TOOLS.has(obj.type)) syncMeasureFromObject(obj)
      dragRef.current = null
      snapRef.current = null
      redraw()
      return
    }

    if (currentTool === 'seleccion' || currentTool === 'girar-escalar') {
      if (dragRef.current?.mode === 'box') {
        const from = { x: dragRef.current.ox, y: dragRef.current.oy }
        const ids = selectIdsInDrag(objectsRef.current, from, p)
        selectIds(ids)
        marqueeRef.current = null
        dragRef.current = null
        redraw()
        return
      }
      dragRef.current = null
      moveGuideRef.current = null
      clearDynBuffer()
      redraw()
      return
    }

    if ((currentTool === 'lapiz' || currentTool === 'borrador') && draftRef.current) {
      if ((draftRef.current.points || []).length > 1) {
        pushHistory()
        objectsRef.current = [...objectsRef.current, draftRef.current]
        setDirty(true)
      }
      draftRef.current = null
      snapRef.current = null
      redraw()
      return
    }

    if (SHAPE_TOOLS.has(currentTool) && draftRef.current && startPt.current) {
      p = snapWorldPoint(p, { fromPoint: startPt.current })
      let shape = applyMeasureToShape(
        { ...draftRef.current },
        currentTool,
        startPt.current,
        p,
      )
      const a = { x: shape.x1, y: shape.y1 }
      const b = { x: shape.x2, y: shape.y2 }
      const hasMeasure = !!activeMeasureMeters()
      if (dist(a, b) < 3 && !hasMeasure) {
        draftRef.current = null
        setLiveMeasure('')
        snapRef.current = null
        redraw()
        return
      }
      shape.label = measureLabelFor(currentTool, a, b)
      pushHistory()
      objectsRef.current = [...objectsRef.current, shape]
      selectOne(shape.id)
      syncMeasureFromObject(shape)
      setLiveMeasure(shape.label)
      setDirty(true)
      draftRef.current = null
      snapRef.current = null
      clearDynBuffer()
      redraw()
    }
  }

  const undo = () => {
    if (!historyRef.current.length) return
    objectsRef.current = historyRef.current.pop()
    setCanUndo(historyRef.current.length > 0)
    selectOne(null)
    setDirty(true)
    redraw()
  }

  const clearAll = () => {
    pushHistory()
    objectsRef.current = []
    selectOne(null)
    setDirty(true)
    redraw()
  }

  const applyMeasureToSelected = (wRaw, hRaw) => {
    const id = selectedId
    if (!id) return
    const obj = objectsRef.current.find((o) => o.id === id)
    if (!obj || !SHAPE_TOOLS.has(obj.type)) return
    if (wRaw != null && (typeof wRaw === 'string' || typeof wRaw === 'number')) {
      setMeasureW(String(wRaw))
      measureWRef.current = String(wRaw)
    }
    if (hRaw != null && (typeof hRaw === 'string' || typeof hRaw === 'number')) {
      setMeasureH(String(hRaw))
      measureHRef.current = String(hRaw)
    }
    const wVal = parsePositive(wRaw != null ? wRaw : measureWRef.current)
    const hVal = parsePositive(hRaw != null ? hRaw : measureHRef.current)
    if (BOX_TOOLS.has(obj.type) || obj.type === 'triangulo') {
      if (!wVal && !hVal) return
    } else if (!wVal) {
      return
    }
    pushHistory()
    const a = obj.type === 'elipse'
      ? { x: (obj.x1 + obj.x2) / 2, y: (obj.y1 + obj.y2) / 2 }
      : { x: obj.x1, y: obj.y1 }
    const b = obj.type === 'elipse'
      ? { x: a.x + 1, y: a.y }
      : { x: obj.x2, y: obj.y2 }
    const dir = (b.x === a.x && b.y === a.y) ? { x: a.x + 1, y: a.y } : b
    const shaped = applyMeasureToShape(obj, obj.type, a, dir, { force: true })
    shaped.label = measureLabelFor(obj.type, { x: shaped.x1, y: shaped.y1 }, { x: shaped.x2, y: shaped.y2 })
    objectsRef.current = objectsRef.current.map((o) => (o.id === id ? shaped : o))
    setMeasureArmedBoth(false)
    setLiveMeasure(shaped.label)
    setDirty(true)
    redraw()
  }

  const canApplyMeasure = (() => {
    if (!(selectedId && selectedObj && SHAPE_TOOLS.has(selectedObj.type))) return false
    if (BOX_TOOLS.has(selectedObj.type)) return !!(parsePositive(measureW) || parsePositive(measureH))
    return !!parsePositive(measureW)
  })()

  const applySelectedColor = (nextColor) => {
    const id = selectedIdRef.current
    if (!id || !nextColor) return
    const obj = objectsRef.current.find((o) => o.id === id)
    if (!obj || (obj.type === 'image' && obj.fit)) return
    pushHistory()
    objectsRef.current = objectsRef.current.map((o) => (
      o.id === id ? { ...o, color: nextColor } : o
    ))
    setColor(nextColor)
    setDirty(true)
    setPanTick((n) => n + 1)
  }

  const applySelectedWidth = (nextWidth) => {
    const id = selectedIdRef.current
    const w = Number(nextWidth)
    if (!id || !Number.isFinite(w) || w <= 0) return
    const obj = objectsRef.current.find((o) => o.id === id)
    if (!obj || (obj.type === 'image' && obj.fit)) return
    pushHistory()
    objectsRef.current = objectsRef.current.map((o) => (
      o.id === id ? { ...o, width: w } : o
    ))
    setWidth(w)
    setDirty(true)
    setPanTick((n) => n + 1)
  }

  const refreshLibrary = () => {
    setLibItems(loadLibrary(contratoId))
  }

  const saveSelectionToLibrary = () => {
    setLibNotice('')
    if (!contratoId) {
      setLibNotice('No hay contrato activo para guardar en la biblioteca.')
      return
    }
    const source = objectsRef.current.filter((o) => selectedIdsRef.current.has(o.id))
    const usable = source.filter((o) => o && !(o.type === 'image' && o.fit))
    if (!usable.length) {
      setLibNotice('Seleccione una o varias entidades para guardarlas como bloque.')
      return
    }
    setLibNamePrompt({
      objects: usable,
      nombre: usable.length > 1 ? 'Bloque' : entityTypeLabel(usable[0].type),
      preview: libraryPreviewDataUri(usable),
    })
  }

  const confirmLibraryName = () => {
    const prompt = libNamePrompt
    if (!prompt?.objects?.length) return
    const item = saveLibraryItem(contratoId, {
      nombre: prompt.nombre,
      objects: prompt.objects,
    })
    setLibNamePrompt(null)
    if (!item) {
      setLibNotice('No se pudo guardar en la biblioteca.')
      return
    }
    refreshLibrary()
    setLibOpen(true)
  }

  const beginInsertLibraryItem = (item) => {
    if (!item?.objects?.length && !item?.children?.length) return
    pendingInsertRef.current = item
    setInsertHint(`Clic para insertar «${item.nombre}»`)
    setLibOpen(false)
  }

  // Reaplicar medida al cambiar el input solo si está armada (digitada por el usuario)
  useEffect(() => {
    measureWRef.current = measureW
    measureHRef.current = measureH
    if (
      measureArmedRef.current
      && draftRef.current
      && startPt.current
      && lastPt.current
      && SHAPE_TOOLS.has(toolRef.current)
    ) {
      let shape = applyMeasureToShape(
        { ...draftRef.current },
        toolRef.current,
        startPt.current,
        lastPt.current,
      )
      shape.label = measureLabelFor(toolRef.current, { x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 })
      draftRef.current = shape
      setLiveMeasure(shape.label)
      redraw(shape)
    }
  }, [measureW, measureH, redraw])

  const dynInputMode = () => {
    const tool = toolRef.current
    if (SHAPE_TOOLS.has(tool) && draftRef.current && startPt.current) return 'draw'
    if (tool === 'polilinea' && draftRef.current?.type === 'polilinea' && (draftRef.current.points || []).length) {
      return 'poly'
    }
    if (tool === 'seleccion' && dragRef.current?.mode === 'move' && !dragRef.current.pending) return 'move'
    return null
  }

  const previewDynLive = () => {
    const mode = dynInputMode()
    if (mode === 'draw' && startPt.current && lastPt.current) {
      let shape = applyMeasureToShape(
        { ...draftRef.current },
        toolRef.current,
        startPt.current,
        lastPt.current,
      )
      shape.label = measureLabelFor(toolRef.current, { x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 })
      draftRef.current = shape
      setLiveMeasure(shape.label)
      redraw(shape)
      return
    }
    if (mode === 'poly') {
      const pts = draftRef.current.points || []
      const last = pts[pts.length - 1]
      const toward = lastPt.current || last
      const dyn = parseDynMeasure(dynBufferRef.current)
      const dest = (dyn?.w != null && last)
        ? (pointAtDistance(last, toward, dyn.w) || toward)
        : toward
      lastPt.current = dest
      const preview = { ...draftRef.current, points: last ? [...pts, dest] : pts }
      if (last && dest) setLiveMeasure(formatMeters(dist(last, dest)))
      redraw(preview)
      return
    }
    if (mode === 'move') {
      const d = dragRef.current
      const toward = lastPt.current || { x: d.ox + 1, y: d.oy }
      const snapped = snapWorldPoint(toward, { excludeId: d.id })
      const dyn = parseDynMeasure(dynBufferRef.current)
      const dest = (dyn?.w != null)
        ? (pointAtDistance({ x: d.ox, y: d.oy }, snapped, dyn.w) || snapped)
        : snapped
      const dx = dest.x - d.ox
      const dy = dest.y - d.oy
      objectsRef.current = objectsRef.current.map((o) => (
        o.id === d.id ? translateObject(d.origin, dx, dy) : o
      ))
      setLiveMeasure(formatMeters(Math.hypot(dx, dy)))
      setDirty(true)
      redraw()
    }
  }

  const commitDynInput = () => {
    const mode = dynInputMode()
    const dyn = parseDynMeasure(dynBufferRef.current)
    if (!mode || !dyn || (dyn.w == null && dyn.h == null)) return false
    if (mode === 'draw' && startPt.current && lastPt.current) {
      let shape = applyMeasureToShape(
        { ...draftRef.current },
        toolRef.current,
        startPt.current,
        lastPt.current,
        { force: true },
      )
      const a = { x: shape.x1, y: shape.y1 }
      const b = { x: shape.x2, y: shape.y2 }
      if (dist(a, b) < 1) return false
      shape.label = measureLabelFor(toolRef.current, a, b)
      pushHistory()
      objectsRef.current = [...objectsRef.current, shape]
      selectOne(shape.id)
      syncMeasureFromObject(shape)
      setLiveMeasure(shape.label)
      setDirty(true)
      draftRef.current = null
      drawing.current = false
      snapRef.current = null
      clearDynBuffer()
      redraw()
      return true
    }
    if (mode === 'poly') {
      const pts = draftRef.current.points || []
      const last = pts[pts.length - 1]
      const toward = lastPt.current || last
      const dest = (dyn.w != null && last)
        ? (pointAtDistance(last, toward, dyn.w) || toward)
        : toward
      if (last && dest && dist(last, dest) >= 1) {
        draftRef.current = { ...draftRef.current, points: [...pts, dest] }
        lastPt.current = dest
      }
      dynBufferRef.current = ''
      updateDynHud('', false)
      redraw(draftRef.current)
      return true
    }
    if (mode === 'move') {
      previewDynLive()
      dragRef.current = null
      drawing.current = false
      clearDynBuffer()
      redraw()
      return true
    }
    return false
  }

  const appendDynKey = (key) => {
    if (toolRef.current === 'unir-nodos') {
      if (key === 'Backspace') dynBufferRef.current = dynBufferRef.current.slice(0, -1)
      else if (/^[0-9a-zA-Z.-]$/.test(key)) dynBufferRef.current += key
      else return false
      updateDynHud(dynBufferRef.current, true)
      return true
    }
    if (!dynInputMode()) return false
    if (key === 'Backspace') {
      dynBufferRef.current = dynBufferRef.current.slice(0, -1)
    } else if (/^[0-9]$/.test(key) || key === '.' || key === ',') {
      dynBufferRef.current += key
    } else if (key === 'x' || key === 'X' || key === '*') {
      if (!/[xX*]/.test(dynBufferRef.current)) dynBufferRef.current += 'x'
    } else {
      return false
    }
    updateDynHud(dynBufferRef.current, true)
    previewDynLive()
    return true
  }

  copySelectedRef.current = copySelected
  pasteClipboardRef.current = pasteClipboard
  deleteSelectedRef.current = deleteSelected
  escapeActionRef.current = () => {
    if (dynBufferRef.current) {
      clearDynBuffer()
      previewDynLive()
      return true
    }
    if (pendingInsertRef.current) {
      pendingInsertRef.current = null
      setInsertHint('')
      return true
    }
    if (joinSeqRef.current.length) {
      setJoinSequence([])
      return true
    }
    if (finishPolyline()) return true
    if (!selectedIdsRef.current.size) return false
    selectOne(null)
    snapRef.current = null
    redraw()
    return true
  }
  enterActionRef.current = () => {
    if (toolRef.current === 'unir-nodos') {
      const node = findNodeByNum(dynBufferRef.current)
      if (node) {
        appendJoinNode(node)
        dynBufferRef.current = ''
        updateDynHud('', false)
        return true
      }
      return false
    }
    if (commitDynInput()) return true
    return finishPolyline()
  }

  // Copiar / pegar; Delete elimina; Esc deselecciona o cierra la polilínea; Enter confirma medida o cierra polilínea
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return
      const mod = e.ctrlKey || e.metaKey
      const key = String(e.key || '')
      if (key === 'Escape') {
        if (escapeActionRef.current()) e.preventDefault()
        return
      }
      if ((key === 'Delete' || key === 'Del') && !mod) {
        if (deleteSelectedRef.current()) e.preventDefault()
        return
      }
      if (key === 'Enter' && !mod) {
        if (enterActionRef.current()) e.preventDefault()
        return
      }
      if (!mod && appendDynKey(key)) {
        e.preventDefault()
        return
      }
      if (!mod) return
      const k = key.toLowerCase()
      if (k === 'c') {
        if (copySelectedRef.current()) e.preventDefault()
      } else if (k === 'v') {
        if (pasteClipboardRef.current()) e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pedirGuardar = () => {
    if (busy || !dirty) return
    setSavePrompt({ title: '' })
  }

  const confirmarGuardar = async () => {
    const title = String(savePrompt?.title || '').trim() || 'Esquema'
    setSavePrompt(null)
    setBusy(true)
    try {
      moveGuideRef.current = null
      await preloadHatchRegions(objectsRef.current)
      await new Promise((r) => requestAnimationFrame(r))
      const nodes = objectsRef.current.filter((o) => o.type === 'nodo')
      const composed = await composeEsquemaExport({
        title,
        objects: objectsRef.current,
        nodes,
      })
      await onSave?.(composed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 13000,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(1640px, 98vw)',
          maxHeight: '92vh',
          height: 'min(820px, 92vh)',
          background: t.bgCard || '#fff',
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          boxShadow: t.shadow,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
          padding: '10px 14px', borderBottom: `1px solid ${t.border}`, flexShrink: 0,
        }}>
          <div style={{ fontWeight: 700, color: t.text, fontSize: 'var(--cc-lg)', marginRight: 4 }}>{title}</div>
          <button
            type="button"
            title="Deshacer"
            aria-label="Deshacer"
            disabled={!canUndo}
            onClick={undo}
            style={{ ...iconBtn(t, false), opacity: canUndo ? 1 : 0.4 }}
          >
            <IconUndo />
          </button>
          {TOOLS.map((tb) => {
            const active = tool === tb.id
            const Icon = tb.Icon
            return (
              <button
                key={tb.id}
                type="button"
                title={tb.label}
                aria-label={tb.label}
                onClick={() => {
                  if (tb.id !== 'polilinea') finishPolyline()
                  clearDynBuffer()
                  setTool(tb.id)
                }}
                style={iconBtn(t, active)}
              >
                <Icon />
              </button>
            )
          })}
          <button
            type="button"
            title="Alejar (zoom out)"
            aria-label="Alejar"
            onClick={() => setZoomAroundCenter(zoomRef.current / 1.25)}
            style={iconBtn(t, false)}
          >
            <IconZoomOut />
          </button>
          <button
            type="button"
            title="Acercar (zoom in)"
            aria-label="Acercar"
            onClick={() => setZoomAroundCenter(zoomRef.current * 1.25)}
            style={iconBtn(t, false)}
          >
            <IconZoomIn />
          </button>
          <button
            type="button"
            title="Restablecer zoom 100%"
            aria-label="Zoom 100%"
            onClick={() => setZoomAroundCenter(1)}
            style={{ ...ghost(t), padding: '6px 8px', fontSize: 'var(--cc-xs)', minWidth: 52 }}
          >
            {zoomPct}%
          </button>
          <label style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, display: 'inline-flex', gap: 4, alignItems: 'center' }} title="Color">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} disabled={tool === 'borrador'} />
          </label>
          <label style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, display: 'inline-flex', gap: 4, alignItems: 'center' }} title="Grosor">
            <input type="range" min={1} max={16} step={0.5} value={width} onChange={(e) => setWidth(Number(e.target.value))} style={{ width: 72 }} />
          </label>
          {(tool === 'hatch' || tool === 'rect' || tool === 'elipse' || tool === 'triangulo') && (
            <select
              title="Textura hatch"
              value={hatch}
              onChange={(e) => setHatch(Number(e.target.value))}
              style={{ fontSize: 'var(--cc-xs)', padding: '4px 6px', borderRadius: 6, border: `1px solid ${t.border}`, color: t.text, background: t.bgCard }}
            >
              {HATCHES.map((h) => (
                <option key={h.id} value={h.id}>{h.label}</option>
              ))}
            </select>
          )}
          {selectedObj?.type === 'tabla' && (
            <>
              <button
                type="button"
                style={ghost(t)}
                title="Agregar fila"
                onClick={() => {
                  pushHistory()
                  objectsRef.current = objectsRef.current.map((o) => (
                    o.id === selectedId ? resizeTablaObj(o, 1, 0) : o
                  ))
                  setDirty(true)
                  setPanTick((n) => n + 1)
                }}
              >
                + Fila
              </button>
              <button
                type="button"
                style={ghost(t)}
                title="Quitar fila"
                disabled={(selectedObj.rows || 1) <= 1}
                onClick={() => {
                  pushHistory()
                  objectsRef.current = objectsRef.current.map((o) => (
                    o.id === selectedId ? resizeTablaObj(o, -1, 0) : o
                  ))
                  setDirty(true)
                  setPanTick((n) => n + 1)
                }}
              >
                − Fila
              </button>
              <button
                type="button"
                style={ghost(t)}
                title="Agregar columna"
                onClick={() => {
                  pushHistory()
                  objectsRef.current = objectsRef.current.map((o) => (
                    o.id === selectedId ? resizeTablaObj(o, 0, 1) : o
                  ))
                  setDirty(true)
                  setPanTick((n) => n + 1)
                }}
              >
                + Col
              </button>
              <button
                type="button"
                style={ghost(t)}
                title="Quitar columna"
                disabled={(selectedObj.cols || 1) <= 1}
                onClick={() => {
                  pushHistory()
                  objectsRef.current = objectsRef.current.map((o) => (
                    o.id === selectedId ? resizeTablaObj(o, 0, -1) : o
                  ))
                  setDirty(true)
                  setPanTick((n) => n + 1)
                }}
              >
                − Col
              </button>
            </>
          )}
          <button
            type="button"
            title="Copiar selección (Ctrl/⌘+C)"
            aria-label="Copiar selección"
            disabled={!selectedIds.length || selectedIds.every((id) => objectsRef.current.find((o) => o.id === id)?.type === 'image')}
            onClick={() => copySelected()}
            style={{ ...iconBtn(t, false), opacity: selectedIds.length ? 1 : 0.4 }}
          >
            <IconCopiar />
          </button>
          <button
            type="button"
            title="Pegar (Ctrl/⌘+V)"
            aria-label="Pegar"
            disabled={!hasClipboard}
            onClick={() => pasteClipboard()}
            style={{ ...iconBtn(t, false), opacity: hasClipboard ? 1 : 0.4 }}
          >
            <IconPegar />
          </button>
          <button
            type="button"
            title="Limpiar lienzo"
            aria-label="Limpiar lienzo"
            onClick={clearAll}
            style={iconBtn(t, false)}
          >
            <IconLimpiar />
          </button>
          <button
            type="button"
            title="Cargar tabla de coordenadas (CSV / Excel)"
            aria-label="Cargar coordenadas"
            onClick={() => setCoordPanelOpen(true)}
            style={iconBtn(t, coordPanelOpen)}
          >
            <IconCoords />
          </button>
          <button
            type="button"
            title="Biblioteca de entidades del contrato"
            aria-label="Biblioteca de entidades"
            onClick={() => {
              refreshLibrary()
              setLibOpen((v) => !v)
            }}
            style={iconBtn(t, libOpen)}
          >
            <IconBiblioteca />
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" style={ghost(t)} onClick={onClose}>Cancelar</button>
            <button
              type="button"
              title={busy ? 'Guardando…' : 'Guardar esquema (PNG con título y tabla)'}
              aria-label="Guardar esquema"
              disabled={busy || !dirty}
              onClick={pedirGuardar}
              style={{ ...iconBtn(t, false), opacity: dirty ? 1 : 0.4 }}
            >
              <IconGuardar />
            </button>
          </div>
        </div>

        <div ref={wrapRef} style={{ flex: 1, minHeight: 0, background: '#e2e8f0', padding: 10, position: 'relative' }}>
          <canvas
            ref={canvasRef}
            tabIndex={0}
            style={{
              display: 'block', width: '100%', height: '100%',
              background: '#fff', borderRadius: 8, touchAction: 'none',
              outline: 'none',
              cursor: hoverCursor
                || (tool === 'paneo' ? 'grab'
                  : tool === 'seleccion' ? 'default'
                    : tool === 'girar-escalar' ? 'alias'
                      : tool === 'texto' ? 'text'
                        : tool === 'hatch' || tool === 'tabla' ? 'cell'
                          : 'crosshair'),
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={() => {
              if (drawing.current) return
              if (!snapRef.current) return
              snapRef.current = null
              redraw()
            }}
          />
          {editingTabla && selectedObj && (
            <TablaOverlay
              key={`${selectedObj.id}-${selectedObj.rows}-${selectedObj.cols}-${zoomPct}`}
              obj={selectedObj}
              pan={panRef.current}
              zoom={zoomRef.current}
              canvasEl={canvasRef.current}
              onCellChange={(ri, ci, text) => {
                objectsRef.current = objectsRef.current.map((o) => {
                  if (o.id !== selectedObj.id) return o
                  const cells = (o.cells || []).map((row, r) => (
                    row.map((cell, c) => (r === ri && c === ci ? text : cell))
                  ))
                  return { ...o, cells }
                })
                setDirty(true)
              }}
            />
          )}
          {editingTexto && selectedObj && (
            <TextoOverlay
              key={`${selectedObj.id}-${selectedObj.w}-${selectedObj.h}-${zoomPct}`}
              obj={selectedObj}
              pan={panRef.current}
              zoom={zoomRef.current}
              canvasEl={canvasRef.current}
              onTextChange={(text) => {
                objectsRef.current = objectsRef.current.map((o) => (
                  o.id === selectedObj.id ? { ...o, text } : o
                ))
                setDirty(true)
              }}
            />
          )}
          {dynHud.text ? (
            <div
              style={{
                position: 'absolute',
                left: Math.max(12, dynHud.x),
                top: Math.max(12, dynHud.y),
                zIndex: 4,
                pointerEvents: 'none',
                padding: '3px 8px',
                borderRadius: 4,
                border: `1px solid ${dynHud.typing ? t.primary : t.border}`,
                background: dynHud.typing ? '#fffbeb' : 'rgba(255,255,255,0.94)',
                color: t.text,
                fontSize: 12,
                fontWeight: 700,
                fontFamily: 'ui-monospace, Consolas, monospace',
                boxShadow: '0 1px 4px rgba(15,23,42,0.12)',
              }}
            >
              {dynHud.typing ? `${dynHud.text}| m` : dynHud.text}
            </div>
          ) : null}
          {selectedIds.length > 1 && (
            <div
              style={{
                position: 'absolute',
                top: 18,
                right: 18,
                zIndex: 5,
                width: 220,
                padding: '10px 12px',
                borderRadius: 10,
                border: `1px solid ${t.border}`,
                background: t.bgCard || 'rgba(255,255,255,0.96)',
                boxShadow: '0 8px 24px rgba(15,23,42,0.14)',
                fontSize: 12,
                color: t.text,
                fontWeight: 700,
              }}
            >
              {selectedIds.length} entidades seleccionadas
              <div style={{ fontSize: 11, fontWeight: 600, color: t.textMuted, marginTop: 4 }}>
                Puede guardarlas juntas en la biblioteca del contrato.
              </div>
            </div>
          )}
          {selectedObj && selectedObj.type !== 'image' && (
            <PropiedadesPanel
              t={t}
              obj={selectedObj}
              measureW={measureW}
              measureH={measureH}
              onMeasureW={setMeasureW}
              onMeasureH={setMeasureH}
              onApplyDims={(w, h) => applyMeasureToSelected(w, h)}
              onColor={applySelectedColor}
              onWidth={applySelectedWidth}
            />
          )}
          {coordPanelOpen && (
            <CoordsPanel
              t={t}
              rows={coordRows}
              fileRef={coordFileRef}
              onClose={() => setCoordPanelOpen(false)}
              onRowsChange={(next) => setCoordRows(renumberCoordRows(next))}
              onApply={() => applyCoordRowsToCanvas(coordRows)}
              onImport={async (file) => {
                try {
                  const parsed = await parseCoordFile(file)
                  const numbered = renumberCoordRows(parsed)
                  setCoordRows(numbered)
                  applyCoordRowsToCanvas(numbered)
                } catch (err) {
                  window.alert(err?.message || 'No se pudo leer el archivo')
                }
              }}
            />
          )}
          {(tool === 'unir-nodos' || joinSeq.length > 0) ? (
            <JoinSeqPanel
              t={t}
              seq={joinSeq}
              onChange={setJoinSequence}
              onFinish={finishJoinCircuit}
            />
          ) : null}
          {libOpen ? (
            <BibliotecaPanel
              t={t}
              contratoId={contratoId}
              items={libItems}
              notice={libNotice}
              canSaveSelection={selectedIds.some((id) => {
                const o = objectsRef.current.find((x) => x.id === id)
                return o && o.type !== 'image'
              })}
              onClose={() => setLibOpen(false)}
              onSaveSelection={saveSelectionToLibrary}
              onInsert={beginInsertLibraryItem}
              onDelete={(id) => {
                setLibItems(deleteLibraryItem(contratoId, id))
              }}
            />
          ) : null}
          {insertHint ? (
            <div style={{
              position: 'absolute', left: 18, bottom: 72, zIndex: 5,
              padding: '4px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.94)',
              border: `1px solid ${t.border}`, fontSize: 12, fontWeight: 700, color: t.text,
            }}
            >
              {insertHint}
            </div>
          ) : null}
        </div>
        {libNamePrompt && (
          <div
            style={{
              position: 'absolute', inset: 0, zIndex: 22,
              background: t.overlay || 'rgba(15,23,42,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="cc-esquema-lib-name"
              style={{
                width: 400,
                borderRadius: 14,
                overflow: 'hidden',
                background: t.bgCard || '#fff',
                border: `1px solid ${t.border}`,
                boxShadow: t.shadow || '0 12px 32px rgba(15,23,42,0.2)',
                color: t.text,
              }}
            >
              <CcModalBrandHeader theme={t} />
              <div style={{
                padding: '12px 16px 8px',
                borderBottom: `1px solid ${t.border}`,
                background: `color-mix(in srgb, ${t.primary || '#0077B6'} 14%, ${t.bgCard || '#fff'})`,
              }}>
                <div id="cc-esquema-lib-name" style={{ fontWeight: 800, color: t.primary || '#0077B6', fontSize: 14 }}>
                  Guardar bloque en la biblioteca
                </div>
              </div>
              <div style={{ padding: 16 }}>
                {libNamePrompt.preview ? (
                  <div style={{
                    display: 'flex', justifyContent: 'center', marginBottom: 12,
                    border: `1px solid ${t.sheetGridBorder || '#94a3b8'}`,
                    background: '#fff', borderRadius: 4, padding: 8,
                  }}>
                    <img src={libNamePrompt.preview} alt="Vista previa del bloque" width={96} height={96} />
                  </div>
                ) : null}
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>
                  Nombre
                  <input
                    autoFocus
                    value={libNamePrompt.nombre}
                    onChange={(e) => setLibNamePrompt({ ...libNamePrompt, nombre: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        confirmLibraryName()
                      }
                    }}
                    style={{
                      display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 4,
                      padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.border}`,
                      fontSize: 14, color: t.text, background: t.inputBg || t.bg || '#fff',
                    }}
                  />
                </label>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                  <button type="button" style={ghost(t)} onClick={() => setLibNamePrompt(null)}>Cancelar</button>
                  <button type="button" style={primary(t)} onClick={confirmLibraryName}>Guardar</button>
                </div>
              </div>
            </div>
          </div>
        )}
        {savePrompt && (
          <div
            style={{
              position: 'absolute', inset: 0, zIndex: 20,
              background: 'rgba(15,23,42,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={() => setSavePrompt(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 360, padding: 16, borderRadius: 12,
                background: t.bgCard || '#fff', border: `1px solid ${t.border}`,
                boxShadow: '0 12px 32px rgba(15,23,42,0.2)',
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 10, color: t.text }}>Título del esquema</div>
              <input
                autoFocus
                value={savePrompt.title}
                onChange={(e) => setSavePrompt({ title: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    confirmarGuardar()
                  }
                }}
                placeholder="Ej. Esquema de localización"
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '8px 10px',
                  borderRadius: 8, border: `1px solid ${t.border}`,
                  fontSize: 14, color: t.text,
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button type="button" style={ghost(t)} onClick={() => setSavePrompt(null)}>Cancelar</button>
                <button type="button" style={primary(t)} onClick={confirmarGuardar}>Guardar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function entityTypeLabel(type) {
  return ({
    linea: 'Línea',
    flecha: 'Flecha',
    rect: 'Rectángulo',
    elipse: 'Elipse / círculo',
    triangulo: 'Triángulo',
    polilinea: 'Polilínea',
    nodo: 'Nodo',
    stroke: 'Trazo',
    tabla: 'Tabla',
    texto: 'Texto',
    hatchRegion: 'Hatch',
    bloque: 'Bloque',
  })[type] || type
}

function pathLengthWorld(obj) {
  const pts = obj?.points || []
  let s = 0
  for (let i = 1; i < pts.length; i += 1) {
    s += Math.hypot((pts[i].x || 0) - (pts[i - 1].x || 0), (pts[i].y || 0) - (pts[i - 1].y || 0))
  }
  return s
}

function isNearCircle(obj) {
  if (!obj || obj.type !== 'elipse') return false
  return Math.abs(Math.abs(obj.x2 - obj.x1) - Math.abs(obj.y2 - obj.y1)) < 3
}

function PropField({ t, label, value, onChange, onCommit, suffix = 'm' }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: t.textMuted, fontWeight: 600 }}>
      {label}
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onCommit?.()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onCommit?.()
            }
          }}
          style={{
            width: 88, padding: '4px 6px', borderRadius: 6,
            border: `1px solid ${t.border}`, fontSize: 12,
            color: t.text, background: t.bgCard || '#fff', fontWeight: 700,
          }}
        />
        <span>{suffix}</span>
      </span>
    </label>
  )
}

function CircleRadioField({ t, diameterMeters, onCommitDiameter }) {
  const [raw, setRaw] = useState(() => {
    const n = Number(diameterMeters)
    return Number.isFinite(n) && n > 0 ? (n / 2).toFixed(3) : ''
  })
  useEffect(() => {
    const n = Number(diameterMeters)
    if (Number.isFinite(n) && n > 0) setRaw((n / 2).toFixed(3))
  }, [diameterMeters])
  return (
    <PropField
      t={t}
      label="Radio"
      value={raw}
      onChange={setRaw}
      onCommit={() => {
        const r = parsePositive(raw)
        if (r == null) return
        onCommitDiameter((r * 2).toFixed(3))
      }}
    />
  )
}

function PropiedadesPanel({
  t, obj, measureW, measureH, onMeasureW, onMeasureH, onApplyDims, onColor, onWidth,
}) {
  const isShape = SHAPE_TOOLS.has(obj.type)
  const isBox = BOX_TOOLS.has(obj.type)
  const circle = isNearCircle(obj)
  const pathLen = PATH_TYPES.has(obj.type) ? formatMeters(pathLengthWorld(obj)) : ''

  return (
    <div
      style={{
        position: 'absolute',
        top: 18,
        right: 18,
        zIndex: 5,
        width: 220,
        padding: '10px 12px',
        borderRadius: 10,
        border: `1px solid ${t.border}`,
        background: t.bgCard || 'rgba(255,255,255,0.96)',
        boxShadow: '0 8px 24px rgba(15,23,42,0.14)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div style={{ fontSize: 11, fontWeight: 800, color: t.text, letterSpacing: 0.02 }}>
        Propiedades · {entityTypeLabel(obj.type)}
      </div>
      {circle ? (
        <PropField
          t={t}
          label="Radio"
          value={String(measureW ?? '')}
          onChange={onMeasureW}
          onCommit={() => onApplyDims(measureW, measureW)}
        />
      ) : null}
      {isShape && !circle && obj.type === 'elipse' ? (
        <>
          <PropField t={t} label="Semieje X" value={String(measureW ?? '')} onChange={onMeasureW} onCommit={onApplyDims} />
          <PropField t={t} label="Semieje Y" value={String(measureH ?? '')} onChange={onMeasureH} onCommit={onApplyDims} />
        </>
      ) : null}
      {isShape && !circle && isBox && obj.type !== 'elipse' ? (
        <>
          <PropField t={t} label="Ancho" value={String(measureW ?? '')} onChange={onMeasureW} onCommit={onApplyDims} />
          <PropField t={t} label="Alto" value={String(measureH ?? '')} onChange={onMeasureH} onCommit={onApplyDims} />
        </>
      ) : null}
      {isShape && !circle && !isBox ? (
        <PropField
          t={t}
          label={obj.type === 'triangulo' ? 'Ancho' : 'Longitud'}
          value={String(measureW ?? '')}
          onChange={onMeasureW}
          onCommit={onApplyDims}
        />
      ) : null}
      {obj.type === 'triangulo' ? (
        <PropField t={t} label="Alto" value={String(measureH ?? '')} onChange={onMeasureH} onCommit={onApplyDims} />
      ) : null}
      {obj.type === 'bloque' ? (
        <div style={{ fontSize: 11, color: t.textMuted }}>
          Bloque cohesionado · {(obj.children || []).length} parte{(obj.children || []).length === 1 ? '' : 's'}
        </div>
      ) : null}
      {obj.type === 'nodo' ? (
        <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.4 }}>
          N° {obj.nodeNum || '—'}
          {obj.norte != null && obj.este != null ? (
            <div>N {obj.norte} · E {obj.este}</div>
          ) : null}
        </div>
      ) : null}
      {pathLen ? (
        <div style={{ fontSize: 11, color: t.textMuted }}>Longitud total: <b style={{ color: t.text }}>{pathLen}</b></div>
      ) : null}
      {obj.color != null || isShape || PATH_TYPES.has(obj.type) || obj.type === 'tabla' || obj.type === 'texto' ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: t.textMuted, fontWeight: 600 }}>
          Color
          <input
            type="color"
            value={obj.color || '#1e293b'}
            onChange={(e) => onColor(e.target.value)}
          />
        </label>
      ) : null}
      {WIDTH_TYPES.has(obj.type) ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: t.textMuted, fontWeight: 600 }}>
          Grosor
          <input
            type="range"
            min={1}
            max={16}
            step={0.5}
            value={obj.width || 3}
            onChange={(e) => onWidth(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ color: t.text, minWidth: 22, textAlign: 'right' }}>{obj.width || 3}</span>
        </label>
      ) : null}
    </div>
  )
}

/* ─── Dibujo de objetos ─────────────────────────────────────────────────── */

function drawObject(ctx, obj, selected, opts = {}) {
  if (!obj) return
  ctx.save()
  if (obj.type === 'nodo') {
    drawNodo(ctx, obj, selected, opts.zoom || 1)
    ctx.restore()
    return
  }
  if (obj.type === 'image') {
    drawImageObj(ctx, obj)
    ctx.restore()
    return
  }
  if (obj.type === 'bloque') {
    const center = objectCenter(obj)
    if (obj.rotation) {
      ctx.translate(center.x, center.y)
      ctx.rotate(obj.rotation)
      ctx.translate(-center.x, -center.y)
    }
    ctx.translate(obj.x || 0, obj.y || 0)
    for (const child of obj.children || []) {
      drawObject(ctx, child, false, { ...opts, skipResize: true })
    }
    ctx.translate(-(obj.x || 0), -(obj.y || 0))
    if (selected) {
      ctx.strokeStyle = '#2563eb'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.strokeRect((obj.x || 0) - 4, (obj.y || 0) - 4, (obj.w || 0) + 8, (obj.h || 0) + 8)
      ctx.setLineDash([])
      if (!opts.skipResize) drawResizeHandles(ctx, obj, opts.zoom || 1)
    }
    ctx.restore()
    return
  }
  if (obj.type === 'hatchRegion') {
    drawHatchRegion(ctx, obj)
    if (selected) {
      ctx.strokeStyle = '#2563eb'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.strokeRect((obj.x || 0) - 4, (obj.y || 0) - 4, (obj.w || 0) + 8, (obj.h || 0) + 8)
      ctx.setLineDash([])
      if (!opts.skipResize) drawResizeHandles(ctx, obj, opts.zoom || 1)
    }
    ctx.restore()
    return
  }
  if (obj.type === 'tabla') {
    const center = objectCenter(obj)
    if (obj.rotation) {
      ctx.translate(center.x, center.y)
      ctx.rotate(obj.rotation)
      ctx.translate(-center.x, -center.y)
    }
    drawTabla(ctx, obj, { skipText: !!opts.skipTablaText })
    if (selected) {
      const { w, h } = tablaSize(obj)
      ctx.strokeStyle = '#2563eb'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.strokeRect((obj.x || 0) - 4, (obj.y || 0) - 4, w + 8, h + 8)
      ctx.setLineDash([])
      if (!opts.skipResize) drawResizeHandles(ctx, obj, opts.zoom || 1)
    }
    ctx.restore()
    return
  }
  if (obj.type === 'texto') {
    const center = objectCenter(obj)
    if (obj.rotation) {
      ctx.translate(center.x, center.y)
      ctx.rotate(obj.rotation)
      ctx.translate(-center.x, -center.y)
    }
    drawTexto(ctx, obj, { skipText: !!opts.skipTextoText })
    if (selected) {
      ctx.strokeStyle = '#2563eb'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.strokeRect((obj.x || 0) - 4, (obj.y || 0) - 4, (obj.w || 0) + 8, (obj.h || 0) + 8)
      ctx.setLineDash([])
      if (!opts.skipResize) drawResizeHandles(ctx, obj, opts.zoom || 1)
    }
    ctx.restore()
    return
  }
  const center = objectCenter(obj)
  if (obj.rotation) {
    ctx.translate(center.x, center.y)
    ctx.rotate(obj.rotation)
    ctx.translate(-center.x, -center.y)
  }
  if (PATH_TYPES.has(obj.type)) {
    ctx.lineCap = obj.type === 'polilinea' ? 'round' : 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = obj.erase ? Math.max(8, (obj.width || 3) * 3) : (obj.width || 3)
    ctx.globalCompositeOperation = obj.erase ? 'destination-out' : 'source-over'
    ctx.strokeStyle = obj.color || '#1e293b'
    const pts = obj.points || []
    if (pts.length) {
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y)
      ctx.stroke()
    }
  } else if (SHAPE_TOOLS.has(obj.type) || obj.type === 'linea' || obj.type === 'flecha') {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = obj.color || '#1e293b'
    ctx.fillStyle = obj.color || '#1e293b'
    ctx.lineWidth = obj.width || 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const a = { x: obj.x1, y: obj.y1 }
    const b = { x: obj.x2, y: obj.y2 }
    if (obj.hatch != null && ['rect', 'elipse', 'triangulo'].includes(obj.type)) {
      fillHatch(ctx, obj)
    }
    if (obj.type === 'linea' || obj.type === 'flecha') {
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      if (obj.type === 'flecha') {
        const ang = Math.atan2(b.y - a.y, b.x - a.x)
        const len = 12 + (obj.width || 3) * 2
        ctx.beginPath()
        ctx.moveTo(b.x, b.y)
        ctx.lineTo(b.x - len * Math.cos(ang - 0.4), b.y - len * Math.sin(ang - 0.4))
        ctx.lineTo(b.x - len * Math.cos(ang + 0.4), b.y - len * Math.sin(ang + 0.4))
        ctx.closePath()
        ctx.fill()
      }
    } else if (obj.type === 'rect') {
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y)
    } else if (obj.type === 'elipse') {
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      ctx.beginPath()
      ctx.ellipse(cx, cy, Math.max(Math.abs(b.x - a.x) / 2, 0.5), Math.max(Math.abs(b.y - a.y) / 2, 0.5), 0, 0, Math.PI * 2)
      ctx.stroke()
    } else if (obj.type === 'triangulo') {
      const midX = (a.x + b.x) / 2
      ctx.beginPath()
      ctx.moveTo(midX, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.lineTo(a.x, b.y)
      ctx.closePath()
      ctx.stroke()
    }
  }
  if (selected) {
    ctx.globalCompositeOperation = 'source-over'
    const bb = objectBounds(obj)
    if (bb) {
      ctx.strokeStyle = '#2563eb'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.strokeRect(bb.x - 4, bb.y - 4, bb.w + 8, bb.h + 8)
      ctx.setLineDash([])
    }
    // Manijas tipo Tinkercad (también para stroke/tabla vía getResizeHandles)
    if (obj.type !== 'image') {
      if (!opts.skipResize) drawResizeHandles(ctx, obj, opts.zoom || 1)
    }
  }
  ctx.restore()
}

function drawNodo(ctx, obj, selected, zoom = 1) {
  const x = obj.x || 0
  const y = obj.y || 0
  const z = zoom || 1
  const r = nodeMarkerWorldRadius(z)
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = obj.color || '#1e293b'
  ctx.strokeStyle = selected ? '#2563eb' : '#fff'
  ctx.lineWidth = Math.min(1.2 / z, r * 0.35)
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.font = `600 ${10 / z}px sans-serif`
  ctx.fillStyle = obj.color || '#1e293b'
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = 2.2 / z
  const label = String(obj.nodeNum ?? '')
  ctx.strokeText(label, x + r + 2.5 / z, y - 1.5 / z)
  ctx.fillText(label, x + r + 2.5 / z, y - 1.5 / z)
  ctx.restore()
}

function drawImageObj(ctx, obj) {
  const cache = drawImageObj._cache || (drawImageObj._cache = {})
  const key = obj.dataUri
  const paint = (image) => {
    const dpr = window.devicePixelRatio || 1
    const cw = ctx.canvas.width / dpr
    const ch = ctx.canvas.height / dpr
    if (obj.fit) ctx.drawImage(image, 0, 0, cw, ch)
    else ctx.drawImage(image, obj.x || 0, obj.y || 0, obj.w || image.width, obj.h || image.height)
  }
  if (cache[key]?.complete && cache[key].naturalWidth) {
    paint(cache[key])
    return
  }
  const image = new Image()
  cache[key] = image
  image.onload = () => paint(image)
  image.src = key
}

function pathForClosed(ctx, obj) {
  const a = { x: obj.x1, y: obj.y1 }
  const b = { x: obj.x2, y: obj.y2 }
  ctx.beginPath()
  if (obj.type === 'rect') {
    ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y)
  } else if (obj.type === 'elipse') {
    ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.max(Math.abs(b.x - a.x) / 2, 0.5), Math.max(Math.abs(b.y - a.y) / 2, 0.5), 0, 0, Math.PI * 2)
  } else if (obj.type === 'triangulo') {
    const midX = (a.x + b.x) / 2
    ctx.moveTo(midX, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.lineTo(a.x, b.y)
    ctx.closePath()
  }
}

function fillHatch(ctx, obj) {
  const pattern = makeHatchPattern(ctx, obj.hatch, obj.color || '#1e293b')
  if (!pattern) return
  ctx.save()
  pathForClosed(ctx, obj)
  ctx.fillStyle = pattern
  ctx.fill()
  ctx.restore()
}

function drawTabla(ctx, obj, { skipText = false } = {}) {
  const { w, h, rows, cols, cellW, cellH } = tablaSize(obj)
  const x = obj.x || 0
  const y = obj.y || 0
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = obj.color || '#1e293b'
  ctx.lineWidth = 1.5
  ctx.strokeRect(x, y, w, h)
  for (let i = 1; i < rows; i += 1) {
    const yy = y + i * cellH
    ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke()
  }
  for (let j = 1; j < cols; j += 1) {
    const xx = x + j * cellW
    ctx.beginPath(); ctx.moveTo(xx, y); ctx.lineTo(xx, y + h); ctx.stroke()
  }
  if (!skipText) {
    ctx.fillStyle = obj.color || '#1e293b'
    ctx.font = '12px sans-serif'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < rows; i += 1) {
      for (let j = 0; j < cols; j += 1) {
        const text = String(obj.cells?.[i]?.[j] ?? '')
        if (!text) continue
        const cx = x + j * cellW + 4
        const cy = y + i * cellH + cellH / 2
        const maxW = cellW - 8
        ctx.fillText(text.length > 18 ? `${text.slice(0, 17)}…` : text, cx, cy, maxW)
      }
    }
  }
  ctx.restore()
}

function wrapTextoLines(ctx, text, maxWidth) {
  const raw = String(text ?? '')
  if (!raw) return []
  const paragraphs = raw.split('\n')
  const lines = []
  for (const para of paragraphs) {
    if (!para) {
      lines.push('')
      continue
    }
    const words = para.split(/(\s+)/)
    let line = ''
    for (const word of words) {
      const trial = line + word
      if (line && ctx.measureText(trial).width > maxWidth) {
        lines.push(line)
        line = word.trimStart()
      } else {
        line = trial
      }
    }
    lines.push(line)
  }
  return lines
}

function drawTexto(ctx, obj, { skipText = false } = {}) {
  const x = obj.x || 0
  const y = obj.y || 0
  const w = Math.max(24, obj.w || 180)
  const h = Math.max(20, obj.h || 56)
  const fontSize = Math.max(10, obj.fontSize || 16)
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)'
  ctx.lineWidth = 1
  ctx.setLineDash([3, 3])
  ctx.strokeRect(x, y, w, h)
  ctx.setLineDash([])
  if (!skipText) {
    ctx.fillStyle = obj.color || '#1e293b'
    ctx.font = `${fontSize}px sans-serif`
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    const pad = 4
    const lines = wrapTextoLines(ctx, obj.text, Math.max(8, w - pad * 2))
    const lineH = fontSize * 1.25
    let yy = y + pad
    const maxY = y + h - pad
    for (const line of lines) {
      if (yy + lineH > maxY + fontSize * 0.25) break
      ctx.fillText(line, x + pad, yy)
      yy += lineH
    }
  }
  ctx.restore()
}

function objectCenter(obj) {
  if (obj.type === 'nodo') return { x: obj.x || 0, y: obj.y || 0 }
  if (PATH_TYPES.has(obj.type)) {
    const pts = obj.points || []
    if (!pts.length) return { x: 0, y: 0 }
    const sx = pts.reduce((s, p) => s + p.x, 0)
    const sy = pts.reduce((s, p) => s + p.y, 0)
    return { x: sx / pts.length, y: sy / pts.length }
  }
  if (obj.type === 'tabla') {
    const { w, h } = tablaSize(obj)
    return { x: (obj.x || 0) + w / 2, y: (obj.y || 0) + h / 2 }
  }
  if (obj.type === 'texto' || obj.type === 'hatchRegion' || obj.type === 'bloque') {
    return { x: (obj.x || 0) + (obj.w || 0) / 2, y: (obj.y || 0) + (obj.h || 0) / 2 }
  }
  if (obj.type === 'image') return { x: (obj.x || 0) + (obj.w || 0) / 2, y: (obj.y || 0) + (obj.h || 0) / 2 }
  return { x: ((obj.x1 || 0) + (obj.x2 || 0)) / 2, y: ((obj.y1 || 0) + (obj.y2 || 0)) / 2 }
}

function objectBounds(obj) {
  if (obj.type === 'nodo') return { x: (obj.x || 0) - 8, y: (obj.y || 0) - 8, w: 16, h: 16 }
  if (PATH_TYPES.has(obj.type)) {
    const pts = obj.points || []
    if (!pts.length) return null
    let minX = pts[0].x; let maxX = pts[0].x; let minY = pts[0].y; let maxY = pts[0].y
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }
  if (obj.type === 'tabla') {
    const { w, h } = tablaSize(obj)
    return { x: obj.x || 0, y: obj.y || 0, w, h }
  }
  if (obj.type === 'texto' || obj.type === 'hatchRegion' || obj.type === 'bloque') {
    return { x: obj.x || 0, y: obj.y || 0, w: obj.w || 0, h: obj.h || 0 }
  }
  if (obj.x1 == null) return null
  const x = Math.min(obj.x1, obj.x2)
  const y = Math.min(obj.y1, obj.y2)
  return { x, y, w: Math.abs(obj.x2 - obj.x1), h: Math.abs(obj.y2 - obj.y1) }
}

function pointInObject(p, obj) {
  const bb = objectBounds(obj)
  if (!bb) return false
  const pad = 8
  return p.x >= bb.x - pad && p.x <= bb.x + bb.w + pad && p.y >= bb.y - pad && p.y <= bb.y + bb.h + pad
}

function translateObject(obj, dx, dy) {
  if (obj.type === 'nodo') return { ...obj, x: (obj.x || 0) + dx, y: (obj.y || 0) + dy }
  if (PATH_TYPES.has(obj.type)) {
    return { ...obj, points: (obj.points || []).map((p) => ({ x: p.x + dx, y: p.y + dy })) }
  }
  if (obj.type === 'tabla' || obj.type === 'hatchRegion' || obj.type === 'texto' || obj.type === 'bloque') {
    return { ...obj, x: (obj.x || 0) + dx, y: (obj.y || 0) + dy }
  }
  if (obj.type === 'image') {
    return { ...obj, fit: false, x: (obj.x || 0) + dx, y: (obj.y || 0) + dy }
  }
  return {
    ...obj,
    x1: obj.x1 + dx,
    y1: obj.y1 + dy,
    x2: obj.x2 + dx,
    y2: obj.y2 + dy,
  }
}

function sceneExportBounds(objects) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const o of objects || []) {
    if (!o || (o.type === 'image' && o.fit)) continue
    const b = objectBounds(o)
    if (!b) continue
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + (b.w || 0))
    maxY = Math.max(maxY, b.y + (b.h || 0))
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 400, h: 280 }
  return {
    x: minX,
    y: minY,
    w: Math.max(40, maxX - minX),
    h: Math.max(40, maxY - minY),
  }
}

function drawExportCoordTable(ctx, nodes, x, y, width) {
  const rows = nodes || []
  const headerH = 26
  const rowH = 24
  const cols = [
    { k: 'nodeNum', t: 'N°', w: 0.08 },
    { k: 'norte', t: 'Norte', w: 0.20 },
    { k: 'este', t: 'Este', w: 0.20 },
    { k: 'cota', t: 'Cota', w: 0.16 },
    { k: 'desc', t: 'Descripción', w: 0.36 },
  ]
  const border = '#94a3b8'
  const headerBg = '#D6EAF8'
  const headerColor = '#0077B6'
  const text = '#0f172a'
  const tableW = width
  let cx = x
  ctx.save()
  ctx.font = '700 11px sans-serif'
  ctx.textBaseline = 'middle'
  for (const col of cols) {
    const cw = tableW * col.w
    ctx.fillStyle = headerBg
    ctx.fillRect(cx, y, cw, headerH)
    ctx.strokeStyle = border
    ctx.lineWidth = 1
    ctx.strokeRect(cx, y, cw, headerH)
    ctx.fillStyle = headerColor
    ctx.fillText(col.t, cx + 8, y + headerH / 2)
    cx += cw
  }
  ctx.font = '12px sans-serif'
  ctx.fillStyle = text
  rows.forEach((n, i) => {
    const ry = y + headerH + i * rowH
    cx = x
    const bg = i % 2 ? '#f8fafc' : '#ffffff'
    const values = [
      String(n.nodeNum ?? ''),
      n.norte == null ? '' : String(n.norte),
      n.este == null ? '' : String(n.este),
      n.cota == null ? '' : String(n.cota),
      String(n.desc || ''),
    ]
    cols.forEach((col, ci) => {
      const cw = tableW * col.w
      ctx.fillStyle = bg
      ctx.fillRect(cx, ry, cw, rowH)
      ctx.strokeStyle = border
      ctx.strokeRect(cx, ry, cw, rowH)
      ctx.fillStyle = text
      ctx.fillText(values[ci], cx + 8, ry + rowH / 2, cw - 14)
      cx += cw
    })
  })
  ctx.restore()
  return headerH + rows.length * rowH
}

function composeEsquemaExport({ title, objects, nodes }) {
  const margin = 48
  const titleH = 56
  const tableGap = 20
  const tableTitleH = 22
  const rows = nodes || []
  const bb = sceneExportBounds(objects)
  const maxInner = 1100
  const scale = Math.min(2.2, maxInner / bb.w, maxInner / bb.h)
  const drawW = Math.round(bb.w * scale + margin * 2)
  const drawH = Math.round(bb.h * scale + margin * 2)
  const tableBlock = rows.length ? tableGap + tableTitleH + 8 + 26 + rows.length * 24 + margin : margin
  const h = titleH + drawH + tableBlock
  const w = landscapeExportSize(Math.max(720, drawW), h).w
  const c = document.createElement('canvas')
  c.width = Math.round(w)
  c.height = Math.round(h)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#0f172a'
  ctx.font = '700 20px sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText(title || 'Esquema', margin, titleH / 2)

  const drawX = Math.round((w - drawW) / 2)
  ctx.save()
  ctx.beginPath()
  ctx.rect(drawX, titleH, drawW, drawH)
  ctx.clip()
  ctx.translate(drawX + margin - bb.x * scale, titleH + margin - bb.y * scale)
  ctx.scale(scale, scale)
  for (const obj of objects || []) {
    if (obj?.type === 'image' && obj.fit) continue
    drawObject(ctx, obj, false, { skipResize: true, zoom: scale })
  }
  ctx.restore()
  ctx.save()
  ctx.strokeStyle = '#334155'
  ctx.lineWidth = 1.5
  ctx.strokeRect(drawX + 0.75, titleH + 0.75, drawW - 1.5, drawH - 1.5)
  ctx.restore()
  drawNorthIndicator(ctx, drawW, drawH, { x: drawX, y: titleH })

  if (rows.length) {
    const tableX = margin
    const tableW = w - margin * 2
    const tableY = titleH + drawH + tableGap
    ctx.fillStyle = '#0f172a'
    ctx.font = '700 13px sans-serif'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText('Tabla de coordenadas', tableX, tableY + 14)
    drawExportCoordTable(ctx, rows, tableX, tableY + tableTitleH + 4, tableW)
  }
  return Promise.resolve(c.toDataURL('image/png'))
}

function coordSheetStyles(t) {
  const border = t?.sheetGridBorder || '#94a3b8'
  const headerBg = t?.sheetHeaderBg || '#D6EAF8'
  const headerColor = t?.sheetHeaderColor || t?.primary || '#0077B6'
  const text = t?.text || '#0f172a'
  const inputBg = t?.inputBg || t?.bg || '#f8fafc'
  return {
    border,
    wrap: {
      overflow: 'auto',
      border: `1px solid ${border}`,
      background: t?.bgCard || '#fff',
      borderRadius: 4,
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      tableLayout: 'fixed',
    },
    th: {
      textAlign: 'left',
      padding: '5px 6px',
      fontSize: 11,
      fontWeight: 800,
      color: headerColor,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      border: `1px solid ${border}`,
      background: headerBg,
      position: 'sticky',
      top: 0,
    },
    td: {
      padding: 0,
      border: `1px solid ${border}`,
      verticalAlign: 'middle',
      height: 28,
      background: '#fff',
    },
    inp: {
      width: '100%',
      boxSizing: 'border-box',
      border: 'none',
      outline: 'none',
      background: 'transparent',
      color: text,
      fontSize: 12,
      padding: '4px 6px',
      height: 26,
    },
    ro: {
      width: '100%',
      boxSizing: 'border-box',
      border: 'none',
      background: inputBg,
      color: text,
      fontSize: 12,
      padding: '4px 6px',
      height: 26,
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontVariantNumeric: 'tabular-nums',
      fontWeight: 700,
      textAlign: 'center',
    },
  }
}

function CoordsPanel({ t, rows, fileRef, onClose, onRowsChange, onApply, onImport }) {
  const list = rows?.length ? renumberCoordRows(rows) : [{ num: '1', norte: '', este: '', cota: '', desc: '' }]
  const sheet = coordSheetStyles(t)
  const setCell = (i, key, value) => {
    const next = list.map((r, idx) => (idx === i ? { ...r, [key]: value } : r))
    onRowsChange(next)
  }
  return (
    <div
      style={{
        position: 'absolute',
        left: 18,
        top: 18,
        zIndex: 6,
        width: 460,
        maxHeight: '70%',
        overflow: 'auto',
        padding: 10,
        borderRadius: 10,
        border: `1px solid ${t.border}`,
        background: t.bgCard || 'rgba(255,255,255,0.97)',
        boxShadow: '0 8px 24px rgba(15,23,42,0.14)',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: 12, color: t.text }}>Coordenadas</strong>
        <button type="button" style={ghost(t)} onClick={onClose}>Cerrar</button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button
          type="button"
          style={ghost(t)}
          onClick={() => fileRef.current?.click()}
        >
          Importar CSV/Excel
        </button>
        <button
          type="button"
          style={ghost(t)}
          onClick={() => onRowsChange([...list, { norte: '', este: '', cota: '', desc: '' }])}
        >
          + Fila
        </button>
        <button type="button" style={primary(t)} onClick={onApply}>Dibujar nodos</button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt,.xlsx,.xls"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onImport(file)
        }}
      />
      <div style={sheet.wrap}>
        <table style={sheet.table}>
          <colgroup>
            <col style={{ width: 44 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 70 }} />
            <col />
            <col style={{ width: 28 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={sheet.th}>N°</th>
              <th style={sheet.th}>Norte</th>
              <th style={sheet.th}>Este</th>
              <th style={sheet.th}>Cota</th>
              <th style={sheet.th}>Descripción</th>
              <th style={sheet.th} />
            </tr>
          </thead>
          <tbody>
            {list.map((r, i) => (
              <tr key={`c-${i}`}>
                <td style={sheet.td}>
                  <div style={sheet.ro}>{i + 1}</div>
                </td>
                {['norte', 'este', 'cota', 'desc'].map((key) => (
                  <td key={key} style={sheet.td}>
                    <input
                      value={r[key] ?? ''}
                      onChange={(e) => setCell(i, key, e.target.value)}
                      style={sheet.inp}
                    />
                  </td>
                ))}
                <td style={{ ...sheet.td, textAlign: 'center' }}>
                  <button
                    type="button"
                    title="Quitar fila"
                    onClick={() => onRowsChange(list.filter((_, idx) => idx !== i))}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: t.textMuted, fontWeight: 700 }}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function JoinSeqPanel({ t, seq, onChange, onFinish }) {
  const list = seq || []
  const sheet = coordSheetStyles(t)
  const move = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= list.length) return
    const next = list.slice()
    const tmp = next[i]
    next[i] = next[j]
    next[j] = tmp
    onChange(next)
  }
  const actionBtn = {
    ...ghost(t),
    padding: '2px 6px',
    minWidth: 26,
    fontSize: 12,
    lineHeight: 1,
  }
  return (
    <div
      style={{
        position: 'absolute',
        left: 18,
        bottom: 72,
        zIndex: 5,
        width: 320,
        padding: 10,
        borderRadius: 10,
        border: `1px solid ${t.border}`,
        background: t.bgCard || 'rgba(255,255,255,0.96)',
        boxShadow: '0 8px 24px rgba(15,23,42,0.14)',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 6 }}>
        <strong style={{ fontSize: 12, color: t.text }}>Secuencia de unión</strong>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            style={ghost(t)}
            disabled={!list.length}
            title="Terminar circuito y comenzar uno nuevo"
            aria-label="Terminar circuito"
            onClick={onFinish}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <IconTerminarCircuito />
              Terminar
            </span>
          </button>
          <button type="button" style={ghost(t)} disabled={!list.length} onClick={() => onChange([])}>
            Reiniciar
          </button>
        </div>
      </div>
      {!list.length ? (
        <div style={{ fontSize: 11, color: t.textMuted }}>Digite o pulse nodos. Terminar cierra el circuito y deja lista una secuencia nueva.</div>
      ) : (
        <div style={sheet.wrap}>
          <table style={sheet.table}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col style={{ width: 56 }} />
              <col />
              <col style={{ width: 92 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={sheet.th}>#</th>
                <th style={sheet.th}>Nodo</th>
                <th style={sheet.th}>Tramo</th>
                <th style={sheet.th}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.map((num, i) => (
                <tr key={`${num}-${i}`}>
                  <td style={sheet.td}><div style={sheet.ro}>{i + 1}</div></td>
                  <td style={sheet.td}><div style={sheet.ro}>{num}</div></td>
                  <td style={sheet.td}>
                    <div style={{ ...sheet.inp, color: t.textMuted }}>{i === 0 ? 'inicio' : `→ ${list[i - 1]}`}</div>
                  </td>
                  <td style={{ ...sheet.td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button type="button" style={actionBtn} disabled={i === 0} onClick={() => move(i, -1)} title="Subir">↑</button>
                    <button type="button" style={actionBtn} disabled={i === list.length - 1} onClick={() => move(i, 1)} title="Bajar">↓</button>
                    <button
                      type="button"
                      style={actionBtn}
                      title="Quitar"
                      onClick={() => onChange(list.filter((_, idx) => idx !== i))}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function libraryPreviewDataUri(objects, size = 88) {
  if (typeof document === 'undefined') return ''
  const packed = packLibraryBlock(objects)
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)
  const pad = 8
  const sc = Math.min(
    (size - pad * 2) / Math.max(1, packed.w),
    (size - pad * 2) / Math.max(1, packed.h),
  )
  ctx.translate(
    pad + (size - pad * 2 - packed.w * sc) / 2,
    pad + (size - pad * 2 - packed.h * sc) / 2,
  )
  ctx.scale(sc, sc)
  for (const child of packed.children) {
    drawObject(ctx, child, false, { skipResize: true, zoom: sc })
  }
  return c.toDataURL('image/png')
}

function BibliotecaPanel({
  t, contratoId, items, notice, canSaveSelection, onClose, onSaveSelection, onInsert, onDelete,
}) {
  const sheet = coordSheetStyles(t)
  const iconAction = {
    ...ghost(t),
    padding: 4,
    minWidth: 30,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  }
  return (
    <div
      style={{
        position: 'absolute',
        right: 18,
        bottom: 18,
        zIndex: 6,
        width: 360,
        maxHeight: '62%',
        overflow: 'auto',
        padding: 10,
        borderRadius: 10,
        border: `1px solid ${t.border}`,
        background: t.bgCard || 'rgba(255,255,255,0.97)',
        boxShadow: '0 8px 24px rgba(15,23,42,0.14)',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: 12, color: t.text }}>Biblioteca del contrato</strong>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            style={iconAction}
            disabled={!canSaveSelection}
            title="Guardar selección como bloque"
            aria-label="Guardar selección como bloque"
            onClick={onSaveSelection}
          >
            <IconGuardar />
          </button>
          <button type="button" style={iconAction} title="Cerrar" aria-label="Cerrar" onClick={onClose}>
            <IconCerrarPanel />
          </button>
        </div>
      </div>
      {notice ? (
        <div style={{ fontSize: 11, color: t.danger || '#b91c1c', marginBottom: 8 }}>{notice}</div>
      ) : null}
      {!contratoId ? (
        <div style={{ fontSize: 11, color: t.textMuted }}>No hay contrato activo. Inicie sesión en un contrato para guardar bloques reutilizables.</div>
      ) : !(items || []).length ? (
        <div style={{ fontSize: 11, color: t.textMuted }}>Vacía. Seleccione entidades y pulse el icono de guardar para crear un bloque.</div>
      ) : (
        <div style={sheet.wrap}>
          <table style={sheet.table}>
            <colgroup>
              <col style={{ width: 64 }} />
              <col />
              <col style={{ width: 72 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={sheet.th}>Vista</th>
                <th style={sheet.th}>Nombre</th>
                <th style={sheet.th}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(items || []).map((it) => (
                <tr key={it.id}>
                  <td style={{ ...sheet.td, textAlign: 'center', padding: 4 }}>
                    <img
                      src={libraryPreviewDataUri(it.objects?.length ? it.objects : it.children)}
                      alt=""
                      width={48}
                      height={48}
                      style={{ display: 'block', margin: '0 auto', background: '#fff' }}
                    />
                  </td>
                  <td style={sheet.td}>
                    <div style={{ ...sheet.inp, fontWeight: 700 }}>{it.nombre}</div>
                    <div style={{ ...sheet.inp, color: t.textMuted, fontSize: 10 }}>
                      {(it.objects || it.children || []).length} parte{(it.objects || it.children || []).length === 1 ? '' : 's'}
                    </div>
                  </td>
                  <td style={{ ...sheet.td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button type="button" style={iconAction} title="Insertar bloque" aria-label="Insertar bloque" onClick={() => onInsert(it)}>
                      <IconInsertarBloque />
                    </button>
                    <button type="button" style={iconAction} title="Eliminar" aria-label="Eliminar" onClick={() => onDelete(it.id)}>
                      <IconCerrarPanel />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Overlay HTML para editar celdas de la tabla seleccionada (teclado/táctil). */
function TablaOverlay({ obj, pan, zoom = 1, canvasEl, onCellChange }) {
  const [cells, setCells] = useState(() => cloneScene(obj.cells || []))
  useEffect(() => {
    setCells(cloneScene(obj.cells || []))
  }, [obj.id, obj.rows, obj.cols])

  if (!obj || !canvasEl) return null
  const z = zoom || 1
  const { rows, cols, cellW, cellH, w, h } = tablaSize(obj)
  const left = (canvasEl.offsetLeft || 0) + (pan?.x || 0) + (obj.x || 0) * z
  const top = (canvasEl.offsetTop || 0) + (pan?.y || 0) + (obj.y || 0) * z
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: w * z,
        height: h * z,
        zIndex: 2,
        pointerEvents: 'auto',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <table style={{
        width: '100%', height: '100%', borderCollapse: 'collapse',
        tableLayout: 'fixed', background: 'transparent',
      }}>
        <tbody>
          {Array.from({ length: rows }, (_, ri) => (
            <tr key={ri}>
              {Array.from({ length: cols }, (_, ci) => (
                <td
                  key={ci}
                  style={{
                    width: cellW * z, height: cellH * z, padding: 0,
                    border: '1px solid transparent', verticalAlign: 'middle',
                  }}
                >
                  <input
                    value={cells?.[ri]?.[ci] ?? ''}
                    onChange={(e) => {
                      const text = e.target.value
                      setCells((prev) => {
                        const next = (prev || []).map((row, r) => (
                          (row || []).map((cell, c) => (r === ri && c === ci ? text : cell))
                        ))
                        return next
                      })
                      onCellChange(ri, ci, text)
                    }}
                    style={{
                      width: '100%', height: '100%', boxSizing: 'border-box',
                      border: 'none', background: 'rgba(255,255,255,0.92)',
                      fontSize: 12, padding: '2px 4px', color: '#0f172a',
                      outline: '1px solid #93c5fd',
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Overlay de texto: <textarea> nativo para que Shift/Bloq Mayús / teclado en pantalla
 * y la capitalización del SO se apliquen sin transformación del editor.
 */
function TextoOverlay({ obj, pan, zoom = 1, canvasEl, onTextChange }) {
  const ref = useRef(null)
  const [value, setValue] = useState(() => String(obj?.text ?? ''))

  useEffect(() => {
    setValue(String(obj?.text ?? ''))
  }, [obj.id])

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const t = window.setTimeout(() => {
      el.focus()
      const len = el.value.length
      try { el.setSelectionRange(len, len) } catch { /* ignore */ }
    }, 30)
    return () => window.clearTimeout(t)
  }, [obj.id])

  if (!obj || !canvasEl) return null
  const z = zoom || 1
  const w = Math.max(24, obj.w || 180)
  const h = Math.max(20, obj.h || 56)
  const fontSize = Math.max(10, (obj.fontSize || 16) * z)
  const left = (canvasEl.offsetLeft || 0) + (pan?.x || 0) + (obj.x || 0) * z
  const top = (canvasEl.offsetTop || 0) + (pan?.y || 0) + (obj.y || 0) * z

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: w * z,
        height: h * z,
        zIndex: 2,
        pointerEvents: 'auto',
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <textarea
        ref={ref}
        value={value}
        // Entrada fiel al teclado del dispositivo: sin text-transform ni forzar casing.
        // autoCorrect off evita correcciones no deseadas; autoCapitalize sin forzar
        // (omitido) deja que el SO móvil aplique su propia capitalización si el usuario la usa.
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="enter"
        onChange={(e) => {
          const text = e.target.value
          setValue(text)
          onTextChange(text)
        }}
        placeholder="Escriba aquí…"
        style={{
          width: '100%',
          height: '100%',
          boxSizing: 'border-box',
          margin: 0,
          padding: `${4 * z}px`,
          border: '1px solid #93c5fd',
          borderRadius: 4,
          background: 'rgba(255,255,255,0.96)',
          color: obj.color || '#0f172a',
          fontSize,
          fontFamily: 'sans-serif',
          lineHeight: 1.25,
          resize: 'none',
          textTransform: 'none',
          WebkitTextFillColor: obj.color || '#0f172a',
          outline: 'none',
          overflow: 'auto',
        }}
      />
    </div>
  )
}

function primary(t) {
  return { border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', background: t.primary, color: '#fff', fontWeight: 700, fontSize: 'var(--cc-sm)' }
}
function ghost(t) {
  return { border: `1px solid ${t.border}`, borderRadius: 8, padding: '6px 10px', cursor: 'pointer', background: 'transparent', color: t.text, fontSize: 'var(--cc-sm)' }
}
function iconBtn(t, active) {
  return {
    width: 34, height: 34, padding: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, cursor: 'pointer',
    border: `1px solid ${active ? t.primary : t.border}`,
    background: active ? `${t.primary}18` : 'transparent',
    color: active ? t.primary : t.text,
  }
}

function iconProps() {
  return { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
}
function IconSeleccion() {
  return (
    <svg {...iconProps()}>
      <path d="M4 4h6v2H6v4H4V4Z" />
      <path d="M14 4h6v6h-2V6h-4V4Z" />
      <path d="M4 14h2v4h4v2H4v-6Z" />
      <path d="M18 14h2v6h-6v-2h4v-4Z" />
      <path d="m9 15 2-7 2 7 3 1-7 3-1-3Z" />
    </svg>
  )
}
function IconZoomIn() {
  return (
    <svg {...iconProps()}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
      <path d="M11 8v6" />
      <path d="M8 11h6" />
    </svg>
  )
}
function IconZoomOut() {
  return (
    <svg {...iconProps()}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
      <path d="M8 11h6" />
    </svg>
  )
}
function IconTabla() {
  return (
    <svg {...iconProps()}>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M3 10h18" />
      <path d="M3 15h18" />
      <path d="M9 4v16" />
      <path d="M15 4v16" />
    </svg>
  )
}
function IconTexto() {
  return (
    <svg {...iconProps()}>
      <path d="M4 5h16" />
      <path d="M12 5v14" />
      <path d="M8 19h8" />
    </svg>
  )
}
function IconPaneo() {
  return (
    <svg {...iconProps()}>
      <path d="M9 11V6a2 2 0 1 1 4 0v1" />
      <path d="M13 7V5a2 2 0 1 1 4 0v6" />
      <path d="M17 11V9a2 2 0 1 1 4 0v5a7 7 0 0 1-7 7h-1a7 7 0 0 1-6.2-3.7L5 14a2 2 0 0 1 2.7-2.8L9 12" />
    </svg>
  )
}
function IconLapiz() { return <svg {...iconProps()}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg> }
function IconBorrador() { return <svg {...iconProps()}><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" /><path d="M22 21H7" /><path d="m5 11 9 9" /></svg> }
function IconLinea() { return <svg {...iconProps()}><path d="M4 18 20 6" /></svg> }
function IconPolilinea() { return <svg {...iconProps()}><path d="M4 18 9 8l6 8 5-12" /></svg> }
function IconFlecha() { return <svg {...iconProps()}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg> }
function IconRect() { return <svg {...iconProps()}><rect x="4" y="6" width="16" height="12" rx="1" /></svg> }
function IconElipse() { return <svg {...iconProps()}><ellipse cx="12" cy="12" rx="9" ry="6" /></svg> }
function IconTriangulo() { return <svg {...iconProps()}><path d="M12 4 21 19H3Z" /></svg> }
function IconHatch() { return <svg {...iconProps()}><path d="M4 20 20 4" /><path d="M4 14 14 4" /><path d="M10 20 20 10" /></svg> }
function IconMover() { return <svg {...iconProps()}><path d="M5 9 2 12l3 3" /><path d="M9 5 12 2l3 3" /><path d="M15 19 12 22l-3-3" /><path d="M19 9 22 12l-3 3" /><path d="M2 12h20" /><path d="M12 2v20" /></svg> }
function IconGirarEscalar() {
  return (
    <svg {...iconProps()}>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v6h-6" />
      <path d="M8 16h5v5" />
    </svg>
  )
}
function IconNodo() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
    </svg>
  )
}
function IconUnirNodos() {
  return (
    <svg {...iconProps()}>
      <circle cx="5" cy="7" r="2" />
      <circle cx="19" cy="7" r="2" />
      <circle cx="12" cy="18" r="2" />
      <path d="M7 8 17 8" />
      <path d="m10.5 16 6-7.5" />
    </svg>
  )
}
function IconTerminarCircuito() {
  return (
    <svg {...iconProps()} width="14" height="14">
      <circle cx="12" cy="12" r="8" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </svg>
  )
}
function IconCoords() {
  return (
    <svg {...iconProps()}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
      <path d="M8 4v16" />
    </svg>
  )
}
function IconCerrarPanel() {
  return (
    <svg {...iconProps()}>
      <path d="M6 6 18 18" />
      <path d="M18 6 6 18" />
    </svg>
  )
}
function IconInsertarBloque() {
  return (
    <svg {...iconProps()}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}
function IconBiblioteca() {
  return (
    <svg {...iconProps()}>
      <path d="M5 4h10a2 2 0 0 1 2 2v14H7a2 2 0 0 0-2 2V4Z" />
      <path d="M7 4v16" />
      <path d="M10 8h5" />
    </svg>
  )
}
function IconGuardar() {
  return (
    <svg {...iconProps()}>
      <path d="M5 3h11l3 3v15H5Z" />
      <path d="M8 3v6h8" />
      <path d="M8 21v-7h8v7" />
    </svg>
  )
}
function IconUndo() { return <svg {...iconProps()}><path d="M3 7v6h6" /><path d="M3 13a9 9 0 1 0 3-7.7L3 7" /></svg> }
function IconCopiar() {
  return (
    <svg {...iconProps()}>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M5 15V5a1 1 0 0 1 1-1h10" />
    </svg>
  )
}
function IconPegar() {
  return (
    <svg {...iconProps()}>
      <path d="M8 4h2a2 2 0 0 1 4 0h2a1 1 0 0 1 1 1v2H7V5a1 1 0 0 1 1-1Z" />
      <path d="M7 7h10v13H7Z" />
    </svg>
  )
}
function IconLimpiar() {
  return (
    <svg {...iconProps()}>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M7 7v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  )
}
