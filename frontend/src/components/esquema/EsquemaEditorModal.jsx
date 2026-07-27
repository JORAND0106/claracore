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
  cursorForHandle,
  drawResizeHandles,
  drawSnapMarker,
  findSnap,
  hitResizeHandle,
  parsePositive,
} from './esquemaGeometry'

const HATCHES = [
  { id: 0, label: 'Diagonal /' },
  { id: 1, label: 'Diagonal \\' },
  { id: 2, label: 'Cruzado' },
  { id: 3, label: 'Puntos' },
  { id: 4, label: 'Horizontal' },
]

const TOOLS = [
  { id: 'seleccion', label: 'Seleccionar', Icon: IconSeleccion },
  { id: 'paneo', label: 'Paneo', Icon: IconPaneo },
  { id: 'lapiz', label: 'Lápiz', Icon: IconLapiz },
  { id: 'borrador', label: 'Borrador', Icon: IconBorrador },
  { id: 'linea', label: 'Línea', Icon: IconLinea },
  { id: 'flecha', label: 'Flecha', Icon: IconFlecha },
  { id: 'rect', label: 'Rectángulo', Icon: IconRect },
  { id: 'elipse', label: 'Elipse', Icon: IconElipse },
  { id: 'triangulo', label: 'Triángulo', Icon: IconTriangulo },
  { id: 'tabla', label: 'Tabla', Icon: IconTabla },
  { id: 'hatch', label: 'Relleno hatch (región)', Icon: IconHatch },
  { id: 'mover', label: 'Mover / rotar', Icon: IconMover },
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
export default function EsquemaEditorModal({
  t,
  title = 'Crear esquema',
  initialDataUri = null,
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
  // Medida solo restringe el trazo si el usuario la digitó (no al sincronizar desde selección)
  const measureArmedRef = useRef(false)

  const [tool, setTool] = useState('lapiz')
  const [color, setColor] = useState('#1e293b')
  const [width, setWidth] = useState(3)
  const [hatch, setHatch] = useState(0)
  const [measureW, setMeasureW] = useState('')
  const [measureH, setMeasureH] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [liveMeasure, setLiveMeasure] = useState('')
  const [canUndo, setCanUndo] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [panTick, setPanTick] = useState(0)
  const [zoomPct, setZoomPct] = useState(100)
  const [hoverCursor, setHoverCursor] = useState(null)
  const [hasClipboard, setHasClipboard] = useState(false)
  const [measureArmed, setMeasureArmed] = useState(false)
  const selectedIdRef = useRef(null)
  const redrawRef = useRef(() => {})

  toolRef.current = tool
  colorRef.current = color
  widthRef.current = width
  hatchRef.current = hatch
  measureWRef.current = measureW
  measureHRef.current = measureH
  selectedIdRef.current = selectedId

  const selectedObj = selectedId
    ? (objectsRef.current.find((o) => o.id === selectedId) || null)
    : null
  const editingTabla = (
    selectedObj?.type === 'tabla'
    && (tool === 'seleccion' || tool === 'tabla')
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
    const list = [...objectsRef.current]
    if (extraDraft) list.push(extraDraft)
    const hideTablaTextId = (
      toolRef.current === 'seleccion' || toolRef.current === 'tabla'
    ) ? selectedId : null
    for (const obj of list) {
      drawObject(ctx, obj, obj.id === selectedId, {
        skipTablaText: obj.type === 'tabla' && obj.id === hideTablaTextId,
        zoom: zoomRef.current,
      })
    }
    if (snapRef.current) drawSnapMarker(ctx, snapRef.current, zoomRef.current)
    ctx.restore()
  }, [selectedId, panTick])

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
    setSelectedId(null)
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
      const z1 = Math.max(0.25, Math.min(4, z0 * factor))
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
    const z1 = Math.max(0.25, Math.min(4, nextZoom))
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

  const applyMeasureToShape = (shape, toolId, a, b, { force = false } = {}) => {
    // Sin medida digitada a propósito → trazo 100 % libre (como antes del sistema de medidas)
    if (!force && !measureArmedRef.current) {
      return { ...shape, x1: a.x, y1: a.y, x2: b.x, y2: b.y }
    }
    const wVal = parsePositive(measureWRef.current)
    const hVal = parsePositive(measureHRef.current)
    const signX = b.x >= a.x ? 1 : -1
    const signY = b.y >= a.y ? 1 : -1

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

    // Rectángulo / elipse: ancho y alto independientes
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

    // Triángulo: longitud/ancho digitado; alto proporcional al arrastre
    if (!wVal) return { ...shape, x1: a.x, y1: a.y, x2: b.x, y2: b.y }
    const dragH = Math.abs(b.y - a.y) || wVal
    const dragW = Math.abs(b.x - a.x) || wVal
    const ratio = dragW > 0 ? dragH / dragW : 1
    const height = Math.max(1, wVal * ratio)
    return {
      ...shape,
      x1: a.x,
      y1: a.y,
      x2: a.x + signX * wVal,
      y2: a.y + signY * height,
    }
  }

  const measureLabelFor = (toolId, a, b) => {
    if (toolId === 'linea' || toolId === 'flecha') {
      return `${Math.round(dist(a, b))}`
    }
    const w = Math.round(Math.abs(b.x - a.x))
    const h = Math.round(Math.abs(b.y - a.y))
    return `${w} × ${h}`
  }

  // Snap solo con intención clara: ~6–7 px de pantalla (no ~14). Manijas usan umbral aparte.
  const snapThreshold = () => 6.5 / (zoomRef.current || 1)
  const handleHitThreshold = () => 10 / (zoomRef.current || 1)

  const snapWorldPoint = (p, { fromPoint = null } = {}) => {
    const hit = findSnap(p, objectsRef.current, {
      threshold: snapThreshold(),
      fromPoint,
      // Solo puntos discretos + ⊥; sin proyección continua sobre bordes al iniciar
      allowEdgeProject: false,
    })
    snapRef.current = hit
    return hit ? { x: hit.x, y: hit.y } : p
  }

  const syncMeasureFromObject = (obj) => {
    if (!obj || !SHAPE_TOOLS.has(obj.type)) return
    // Rellena la barra para «Aplicar a selección», pero NO arma la medida del próximo trazo
    setMeasureArmedBoth(false)
    if (LINE_TOOLS.has(obj.type)) {
      setMeasureW(String(Math.round(dist({ x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 }))))
      setMeasureH('')
      return
    }
    setMeasureW(String(Math.round(Math.abs(obj.x2 - obj.x1))))
    setMeasureH(String(Math.round(Math.abs(obj.y2 - obj.y1))))
  }

  const copySelected = () => {
    const id = selectedIdRef.current
    if (!id) return false
    const obj = objectsRef.current.find((o) => o.id === id)
    if (!obj || obj.type === 'image') return false
    clipboardRef.current = cloneScene([obj])[0]
    setHasClipboard(true)
    return true
  }

  const pasteClipboard = () => {
    if (!clipboardRef.current) return false
    pushHistory()
    const offset = 24 / (zoomRef.current || 1)
    let copy = cloneScene([clipboardRef.current])[0]
    copy.id = uid()
    copy = translateObject(copy, offset, offset)
    clipboardRef.current = cloneScene([copy])[0]
    setHasClipboard(true)
    objectsRef.current = [...objectsRef.current, copy]
    setSelectedId(copy.id)
    if (SHAPE_TOOLS.has(copy.type)) syncMeasureFromObject(copy)
    setDirty(true)
    setPanTick((n) => n + 1)
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

  const onPointerDown = (e) => {
    e.preventDefault()
    const c = canvasRef.current
    c.setPointerCapture?.(e.pointerId)
    const screen = screenPosFromEvent(e)
    pointersRef.current.set(e.pointerId, screen)

    // Dos dedos → pellizco (zoom). No iniciar dibujo ni pan con el segundo puntero.
    if (pointersRef.current.size >= 2) {
      beginPinchIfNeeded()
      return
    }
    if (pinchRef.current) return

    let p = posFromEvent(e)
    const currentTool = toolRef.current
    drawing.current = true

    // Manijas de redimensionado (selección o mover) — priorizan sobre dibujo/selección
    if (currentTool === 'seleccion' || currentTool === 'mover') {
      const selId = selectedIdRef.current
      const sel = selId ? objectsRef.current.find((o) => o.id === selId) : null
      const handle = sel ? hitResizeHandle(p, sel, handleHitThreshold()) : null
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

    if (currentTool === 'seleccion') {
      const hit = hitTest(p)
      setSelectedId(hit ? hit.id : null)
      if (hit && SHAPE_TOOLS.has(hit.type)) syncMeasureFromObject(hit)
      // Si el clic cae en manija de la figura recién seleccionada, iniciar resize
      if (hit) {
        const handle = hitResizeHandle(p, hit, handleHitThreshold())
        if (handle) {
          dragRef.current = {
            id: hit.id,
            mode: 'resize',
            handle: handle.id,
            origin: cloneScene([hit])[0],
          }
          pushHistory()
          drawing.current = true
          startPt.current = p
          lastPt.current = p
          redraw()
          return
        }
      }
      drawing.current = false
      snapRef.current = null
      redraw()
      return
    }

    if (currentTool === 'tabla') {
      const hit = hitTest(p)
      if (hit?.type === 'tabla') {
        setSelectedId(hit.id)
        drawing.current = false
        redraw()
        return
      }
      pushHistory()
      const table = createTablaAt(p.x, p.y)
      objectsRef.current = [...objectsRef.current, table]
      setSelectedId(table.id)
      setDirty(true)
      drawing.current = false
      redraw()
      return
    }

    if (currentTool === 'mover') {
      // Requiere selección previa con la herramienta «Seleccionar»
      const selId = selectedIdRef.current
      const sel = selId ? objectsRef.current.find((o) => o.id === selId) : null
      if (!sel || !pointInObject(p, sel)) {
        dragRef.current = null
        drawing.current = false
        return
      }
      const center = objectCenter(sel)
      // Las tablas se mueven; la rotación se omite para no desalinear el overlay de celdas
      const rotating = (e.altKey || e.shiftKey) && sel.type !== 'tabla'
      dragRef.current = {
        id: sel.id,
        mode: rotating ? 'rotate' : 'move',
        ox: p.x,
        oy: p.y,
        startAngle: Math.atan2(p.y - center.y, p.x - center.x),
        baseRot: sel.rotation || 0,
        origin: cloneScene([sel])[0],
      }
      pushHistory()
      startPt.current = p
      lastPt.current = p
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
        setSelectedId(withId.id)
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
        const z1 = Math.max(0.25, Math.min(4, pinch.zoom0 * (distNow / pinch.dist0)))
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

    const raw = posFromEvent(e)
    const currentTool = toolRef.current

    // Hover de manijas (cursor) cuando no se dibuja — sin preview de snap (evita interferir)
    if (!drawing.current) {
      const selId = selectedIdRef.current
      const sel = selId ? objectsRef.current.find((o) => o.id === selId) : null
      if (sel && (currentTool === 'seleccion' || currentTool === 'mover')) {
        const handle = hitResizeHandle(raw, sel, handleHitThreshold())
        setHoverCursor(handle ? cursorForHandle(handle.id) : null)
      } else {
        setHoverCursor(null)
      }
      if (snapRef.current) {
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

    if ((currentTool === 'mover' || currentTool === 'seleccion') && dragRef.current) {
      const d = dragRef.current
      if (d.mode === 'move' || d.mode === 'rotate') {
        objectsRef.current = objectsRef.current.map((o) => {
          if (o.id !== d.id) return o
          if (d.mode === 'move') {
            return translateObject(d.origin, p.x - d.ox, p.y - d.oy)
          }
          const center = objectCenter(d.origin)
          const ang = Math.atan2(p.y - center.y, p.x - center.x)
          return { ...o, rotation: d.baseRot + (ang - d.startAngle) }
        })
        setDirty(true)
        redraw()
      }
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

    if (SHAPE_TOOLS.has(currentTool) && draftRef.current && startPt.current) {
      p = snapWorldPoint(raw, { fromPoint: startPt.current })
      lastPt.current = p
      let shape = {
        ...draftRef.current,
        x1: startPt.current.x,
        y1: startPt.current.y,
        x2: p.x,
        y2: p.y,
      }
      shape = applyMeasureToShape(shape, currentTool, startPt.current, p)
      shape.label = measureLabelFor(currentTool, { x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 })
      draftRef.current = shape
      setLiveMeasure(shape.label)
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

    if (currentTool === 'mover' || currentTool === 'seleccion') {
      dragRef.current = null
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
      const hasMeasure = measureArmedRef.current && !!(parsePositive(measureWRef.current) || parsePositive(measureHRef.current))
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
      setSelectedId(shape.id)
      syncMeasureFromObject(shape)
      setLiveMeasure(shape.label)
      setDirty(true)
      draftRef.current = null
      snapRef.current = null
      redraw()
    }
  }

  const undo = () => {
    if (!historyRef.current.length) return
    objectsRef.current = historyRef.current.pop()
    setCanUndo(historyRef.current.length > 0)
    setSelectedId(null)
    setDirty(true)
    redraw()
  }

  const clearAll = () => {
    pushHistory()
    objectsRef.current = []
    setSelectedId(null)
    setDirty(true)
    redraw()
  }

  const applyMeasureToSelected = () => {
    const id = selectedId
    if (!id) return
    const obj = objectsRef.current.find((o) => o.id === id)
    if (!obj || !SHAPE_TOOLS.has(obj.type)) return
    const wVal = parsePositive(measureW)
    const hVal = parsePositive(measureH)
    if (BOX_TOOLS.has(obj.type)) {
      if (!wVal && !hVal) return
    } else if (!wVal) {
      return
    }
    pushHistory()
    measureWRef.current = measureW
    measureHRef.current = measureH
    const a = { x: obj.x1, y: obj.y1 }
    const b = { x: obj.x2, y: obj.y2 }
    const dir = (b.x === a.x && b.y === a.y) ? { x: a.x + 1, y: a.y } : b
    // force: aplicar aunque la barra se haya rellenado al seleccionar (sin armar el próximo trazo)
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

  copySelectedRef.current = copySelected
  pasteClipboardRef.current = pasteClipboard

  // Copiar / pegar (Ctrl/⌘+C / Ctrl/⌘+V); ignora si el foco está en un input
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const key = String(e.key || '').toLowerCase()
      if (key === 'c') {
        if (copySelectedRef.current()) e.preventDefault()
      } else if (key === 'v') {
        if (pasteClipboardRef.current()) e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const guardar = async () => {
    setBusy(true)
    try {
      // Raster final sin resaltado de selección (incluye hatch por región)
      const prevSel = selectedId
      setSelectedId(null)
      await preloadHatchRegions(objectsRef.current)
      await new Promise((r) => requestAnimationFrame(r))
      const c = canvasRef.current
      const dpr = window.devicePixelRatio || 1
      const { w, h } = cssSize()
      const ctx = c.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.save()
      ctx.translate(panRef.current.x, panRef.current.y)
      ctx.scale(zoomRef.current, zoomRef.current)
      for (const obj of objectsRef.current) drawObject(ctx, obj, false, {})
      ctx.restore()
      const dataUrl = c.toDataURL('image/png')
      setSelectedId(prevSel)
      await onSave?.(dataUrl)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
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
                onClick={() => setTool(tb.id)}
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
            disabled={!selectedId || selectedObj?.type === 'image'}
            onClick={() => copySelected()}
            style={{ ...iconBtn(t, false), opacity: (!selectedId || selectedObj?.type === 'image') ? 0.4 : 1 }}
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
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button type="button" style={ghost(t)} onClick={onClose}>Cancelar</button>
            <button type="button" disabled={busy || !dirty} style={{ ...primary(t), opacity: dirty ? 1 : 0.45 }} onClick={guardar}>
              {busy ? 'Guardando…' : 'Guardar esquema PNG'}
            </button>
          </div>
        </div>

        {/* Barra de dimensiones: ancho/alto independientes para rect/elipse */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
          padding: '8px 14px', borderBottom: `1px solid ${t.border}`,
          background: `${t.primary}08`, flexShrink: 0,
        }}>
          <span style={{ fontSize: 'var(--cc-xs)', fontWeight: 800, color: t.text }}>Dimensiones</span>
          {needsBoxMeasure ? (
            <>
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 'var(--cc-xs)', color: t.textMuted, fontWeight: 600,
              }}
              >
                Ancho
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={measureW}
                  onChange={(e) => {
                    setMeasureW(e.target.value)
                    armMeasureFromInputs(e.target.value, measureHRef.current)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      applyMeasureToSelected()
                    }
                  }}
                  placeholder="ej. 120"
                  title="Ancho (eje X). Solo restringe el trazo si usted lo digita."
                  style={{
                    width: 72, padding: '5px 8px', borderRadius: 6,
                    border: `1px solid ${t.border}`, fontSize: 'var(--cc-sm)',
                    color: t.text, background: t.bgCard || '#fff', fontWeight: 700,
                  }}
                />
              </label>
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 'var(--cc-xs)', color: t.textMuted, fontWeight: 600,
              }}
              >
                Alto
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={measureH}
                  onChange={(e) => {
                    setMeasureH(e.target.value)
                    armMeasureFromInputs(measureWRef.current, e.target.value)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      applyMeasureToSelected()
                    }
                  }}
                  placeholder="ej. 80"
                  title="Alto (eje Y). Solo restringe el trazo si usted lo digita."
                  style={{
                    width: 72, padding: '5px 8px', borderRadius: 6,
                    border: `1px solid ${t.border}`, fontSize: 'var(--cc-sm)',
                    color: t.text, background: t.bgCard || '#fff', fontWeight: 700,
                  }}
                />
                <span style={{ color: t.textMuted }}>u.p.</span>
              </label>
            </>
          ) : (
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 'var(--cc-xs)', color: t.textMuted, fontWeight: 600,
            }}
            >
              {needsLengthMeasure ? 'Longitud / ancho' : 'Valor deseado'}
              <input
                type="number"
                min={1}
                step={1}
                value={measureW}
                onChange={(e) => {
                  setMeasureW(e.target.value)
                  armMeasureFromInputs(e.target.value, measureHRef.current)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    applyMeasureToSelected()
                  }
                }}
                placeholder="ej. 120"
                title="Longitud o ancho. Solo restringe el trazo si usted lo digita."
                style={{
                  width: 88, padding: '5px 8px', borderRadius: 6,
                  border: `1px solid ${t.border}`, fontSize: 'var(--cc-sm)',
                  color: t.text, background: t.bgCard || '#fff', fontWeight: 700,
                }}
              />
              <span style={{ color: t.textMuted }}>u.p.</span>
            </label>
          )}
          <button
            type="button"
            disabled={!canApplyMeasure}
            onClick={applyMeasureToSelected}
            title="Ajusta la figura ya seleccionada al valor digitado"
            style={{
              ...primary(t),
              padding: '6px 12px',
              fontSize: 'var(--cc-xs)',
              opacity: canApplyMeasure ? 1 : 0.4,
            }}
          >
            Aplicar a selección
          </button>
          <span style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, flex: '1 1 220px', lineHeight: 1.35 }}>
            {measureArmed && (parsePositive(measureW) || parsePositive(measureH))
              ? (needsBoxMeasure
                ? `Medida activa al dibujar: ${measureW || 'arrastre'} × ${measureH || 'arrastre'} u.p. (borre los campos para trazo libre).`
                : `Medida activa al dibujar: ${measureW} u.p. (borre el campo para trazo libre).`)
              : (selectedId && selectedObj && SHAPE_TOOLS.has(selectedObj.type)
                ? 'Figura seleccionada: digite o ajuste el valor y pulse «Aplicar a selección». El trazo nuevo sigue libre.'
                : 'Trazo libre por defecto. Digite una medida solo si desea fijarla. Snap: acérquese a extremo/medio/⊥.')}
            {liveMeasure ? ` · Arrastre actual: ${liveMeasure}` : ''}
          </span>
        </div>

        <div ref={wrapRef} style={{ flex: 1, minHeight: 0, background: '#e2e8f0', padding: 10, position: 'relative' }}>
          <canvas
            ref={canvasRef}
            style={{
              display: 'block', width: '100%', height: '100%',
              background: '#fff', borderRadius: 8, touchAction: 'none',
              cursor: hoverCursor
                || (tool === 'paneo' ? 'grab'
                  : tool === 'seleccion' ? 'default'
                    : tool === 'mover' ? 'move'
                      : tool === 'hatch' || tool === 'tabla' ? 'cell'
                        : 'crosshair'),
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
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
        </div>
        <div style={{ padding: '6px 14px', fontSize: 'var(--cc-xs)', color: t.textMuted, borderTop: `1px solid ${t.border}`, flexShrink: 0 }}>
          Zoom: rueda/scroll o pellizco. Copiar/pegar/limpiar: iconos o Ctrl/⌘+C / V. Selección: manijas para redimensionar.
          Trazo libre por defecto. Medida y snap (extremo/medio/⊥) solo si usted los busca; acérquese al punto guía para enganchar.
        </div>
      </div>
    </div>
  )
}

/* ─── Dibujo de objetos ─────────────────────────────────────────────────── */

function drawObject(ctx, obj, selected, opts = {}) {
  if (!obj) return
  ctx.save()
  if (obj.type === 'image') {
    drawImageObj(ctx, obj)
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
      drawResizeHandles(ctx, obj, opts.zoom || 1)
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
      drawResizeHandles(ctx, obj, opts.zoom || 1)
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
  if (obj.type === 'stroke') {
    ctx.lineCap = 'round'
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
    if (obj.label) {
      ctx.globalCompositeOperation = 'source-over'
      ctx.font = '11px sans-serif'
      ctx.fillStyle = '#334155'
      ctx.fillText(String(obj.label), (a.x + b.x) / 2 + 6, (a.y + b.y) / 2 - 6)
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
      drawResizeHandles(ctx, obj, opts.zoom || 1)
    }
  }
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

function objectCenter(obj) {
  if (obj.type === 'stroke') {
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
  if (obj.type === 'hatchRegion') {
    return { x: (obj.x || 0) + (obj.w || 0) / 2, y: (obj.y || 0) + (obj.h || 0) / 2 }
  }
  if (obj.type === 'image') return { x: (obj.x || 0) + (obj.w || 0) / 2, y: (obj.y || 0) + (obj.h || 0) / 2 }
  return { x: ((obj.x1 || 0) + (obj.x2 || 0)) / 2, y: ((obj.y1 || 0) + (obj.y2 || 0)) / 2 }
}

function objectBounds(obj) {
  if (obj.type === 'stroke') {
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
  if (obj.type === 'hatchRegion') {
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
  if (obj.type === 'stroke') {
    return { ...obj, points: (obj.points || []).map((p) => ({ x: p.x + dx, y: p.y + dy })) }
  }
  if (obj.type === 'tabla' || obj.type === 'hatchRegion') {
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
function IconFlecha() { return <svg {...iconProps()}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg> }
function IconRect() { return <svg {...iconProps()}><rect x="4" y="6" width="16" height="12" rx="1" /></svg> }
function IconElipse() { return <svg {...iconProps()}><ellipse cx="12" cy="12" rx="9" ry="6" /></svg> }
function IconTriangulo() { return <svg {...iconProps()}><path d="M12 4 21 19H3Z" /></svg> }
function IconHatch() { return <svg {...iconProps()}><path d="M4 20 20 4" /><path d="M4 14 14 4" /><path d="M10 20 20 10" /></svg> }
function IconMover() { return <svg {...iconProps()}><path d="M5 9 2 12l3 3" /><path d="M9 5 12 2l3 3" /><path d="M15 19 12 22l-3-3" /><path d="M19 9 22 12l-3 3" /><path d="M2 12h20" /><path d="M12 2v20" /></svg> }
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
