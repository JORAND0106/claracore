import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createHatchRegionFromClick,
  drawHatchRegion,
  makeHatchPattern,
  preloadHatchRegions,
} from './esquemaHatch'

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
  const dragRef = useRef(null) // { id, mode: 'move'|'rotate', ox, oy, startAngle, baseRot }
  const panRef = useRef({ x: 0, y: 0 })
  const panDragRef = useRef(null)
  const toolRef = useRef('lapiz')
  const colorRef = useRef('#1e293b')
  const widthRef = useRef(3)
  const hatchRef = useRef(0)
  const measureRef = useRef('')

  const [tool, setTool] = useState('lapiz')
  const [color, setColor] = useState('#1e293b')
  const [width, setWidth] = useState(3)
  const [hatch, setHatch] = useState(0)
  const [measureInput, setMeasureInput] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [liveMeasure, setLiveMeasure] = useState('')
  const [canUndo, setCanUndo] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [panTick, setPanTick] = useState(0)
  const selectedIdRef = useRef(null)

  toolRef.current = tool
  colorRef.current = color
  widthRef.current = width
  hatchRef.current = hatch
  measureRef.current = measureInput
  selectedIdRef.current = selectedId

  const selectedObj = selectedId
    ? (objectsRef.current.find((o) => o.id === selectedId) || null)
    : null
  const editingTabla = (
    selectedObj?.type === 'tabla'
    && (tool === 'seleccion' || tool === 'tabla')
    && !selectedObj.rotation
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
    const list = [...objectsRef.current]
    if (extraDraft) list.push(extraDraft)
    const hideTablaTextId = (
      toolRef.current === 'seleccion' || toolRef.current === 'tabla'
    ) ? selectedId : null
    for (const obj of list) {
      drawObject(ctx, obj, obj.id === selectedId, {
        skipTablaText: obj.type === 'tabla' && obj.id === hideTablaTextId,
      })
    }
    ctx.restore()
  }, [selectedId, panTick])

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
    redraw()
  }, [redraw])

  useEffect(() => {
    setupCanvas()
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => { if (!drawing.current) setupCanvas() })
      : null
    if (ro && wrapRef.current) ro.observe(wrapRef.current)
    return () => ro?.disconnect()
  }, [setupCanvas])

  useEffect(() => {
    if (!initialDataUri) return
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
    historyRef.current = []
    setCanUndo(false)
    setDirty(false)
    requestAnimationFrame(() => redraw())
  }, [initialDataUri, redraw])

  useEffect(() => { redraw(draftRef.current) }, [selectedId, redraw, panTick])

  const posFromEvent = (e) => {
    const c = canvasRef.current
    const r = c.getBoundingClientRect()
    const src = e.touches?.[0] || e.changedTouches?.[0] || e
    return {
      x: src.clientX - r.left - panRef.current.x,
      y: src.clientY - r.top - panRef.current.y,
    }
  }

  const applyMeasureToShape = (shape, toolId, a, b) => {
    const raw = String(measureRef.current || '').trim().replace(',', '.')
    const val = Number(raw)
    if (!Number.isFinite(val) || val <= 0) return { ...shape, x1: a.x, y1: a.y, x2: b.x, y2: b.y }

    if (toolId === 'linea' || toolId === 'flecha') {
      const ang = Math.atan2(b.y - a.y, b.x - a.x)
      return {
        ...shape,
        x1: a.x,
        y1: a.y,
        x2: a.x + Math.cos(ang) * val,
        y2: a.y + Math.sin(ang) * val,
      }
    }
    // Cajas: val = ancho; alto proporcional al arrastre (mín. 1)
    const signX = b.x >= a.x ? 1 : -1
    const signY = b.y >= a.y ? 1 : -1
    const dragH = Math.abs(b.y - a.y) || val
    const dragW = Math.abs(b.x - a.x) || val
    const ratio = dragW > 0 ? dragH / dragW : 1
    const height = Math.max(1, val * ratio)
    return {
      ...shape,
      x1: a.x,
      y1: a.y,
      x2: a.x + signX * val,
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
    const p = posFromEvent(e)
    const currentTool = toolRef.current
    drawing.current = true
    startPt.current = p
    lastPt.current = p

    if (currentTool === 'paneo') {
      const src = e.touches?.[0] || e
      panDragRef.current = {
        startX: src.clientX,
        startY: src.clientY,
        originX: panRef.current.x,
        originY: panRef.current.y,
      }
      return
    }

    if (currentTool === 'seleccion') {
      const hit = hitTest(p)
      setSelectedId(hit ? hit.id : null)
      drawing.current = false
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

    if (currentTool === 'lapiz' || currentTool === 'borrador') {
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
    if (!drawing.current) return
    e.preventDefault()
    const currentTool = toolRef.current

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

    const p = posFromEvent(e)
    lastPt.current = p

    if (currentTool === 'mover' && dragRef.current) {
      const d = dragRef.current
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
    if (!drawing.current) return
    e.preventDefault()
    drawing.current = false
    try { canvasRef.current.releasePointerCapture?.(e.pointerId) } catch { /* ignore */ }
    const currentTool = toolRef.current
    const p = posFromEvent(e)

    if (currentTool === 'paneo') {
      panDragRef.current = null
      return
    }

    if (currentTool === 'mover') {
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
      redraw()
      return
    }

    if (SHAPE_TOOLS.has(currentTool) && draftRef.current && startPt.current) {
      let shape = applyMeasureToShape(
        { ...draftRef.current },
        currentTool,
        startPt.current,
        p,
      )
      const a = { x: shape.x1, y: shape.y1 }
      const b = { x: shape.x2, y: shape.y2 }
      if (dist(a, b) < 3 && !Number(measureRef.current)) {
        draftRef.current = null
        setLiveMeasure('')
        redraw()
        return
      }
      shape.label = measureLabelFor(currentTool, a, b)
      pushHistory()
      objectsRef.current = [...objectsRef.current, shape]
      setSelectedId(shape.id)
      setLiveMeasure(shape.label)
      setDirty(true)
      draftRef.current = null
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
    const raw = String(measureInput || '').trim().replace(',', '.')
    const val = Number(raw)
    if (!Number.isFinite(val) || val <= 0) return
    pushHistory()
    measureRef.current = String(val)
    const a = { x: obj.x1, y: obj.y1 }
    const b = { x: obj.x2, y: obj.y2 }
    const dir = (b.x === a.x && b.y === a.y) ? { x: a.x + 1, y: a.y } : b
    const shaped = applyMeasureToShape(obj, obj.type, a, dir)
    shaped.label = measureLabelFor(obj.type, { x: shaped.x1, y: shaped.y1 }, { x: shaped.x2, y: shaped.y2 })
    objectsRef.current = objectsRef.current.map((o) => (o.id === id ? shaped : o))
    setLiveMeasure(shaped.label)
    setDirty(true)
    redraw()
  }

  // Reaplicar medida al cambiar el input si hay figura en borrador o seleccionada recién creada
  useEffect(() => {
    measureRef.current = measureInput
    if (draftRef.current && startPt.current && lastPt.current && SHAPE_TOOLS.has(toolRef.current)) {
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
  }, [measureInput, redraw])

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
          <label style={{ fontSize: 'var(--cc-xs)', color: t.textMuted, display: 'inline-flex', gap: 4, alignItems: 'center' }} title="Medida deseada al crear (unidades de pantalla)">
            Medida
            <input
              type="number"
              min={1}
              step={1}
              value={measureInput}
              onChange={(e) => setMeasureInput(e.target.value)}
              placeholder="auto"
              style={{ width: 72, padding: '4px 6px', borderRadius: 6, border: `1px solid ${t.border}`, fontSize: 'var(--cc-xs)', color: t.text, background: t.bgCard }}
            />
          </label>
          {selectedId && selectedObj && SHAPE_TOOLS.has(selectedObj.type) && (
            <button type="button" style={ghost(t)} onClick={applyMeasureToSelected} title="Aplicar medida a la figura seleccionada">
              Aplicar medida
            </button>
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
          {liveMeasure && (
            <span style={{ fontSize: 'var(--cc-xs)', color: t.textMuted }}>Actual: {liveMeasure}</span>
          )}
          <button type="button" style={ghost(t)} onClick={clearAll}>Limpiar</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button type="button" style={ghost(t)} onClick={onClose}>Cancelar</button>
            <button type="button" disabled={busy || !dirty} style={{ ...primary(t), opacity: dirty ? 1 : 0.45 }} onClick={guardar}>
              {busy ? 'Guardando…' : 'Guardar esquema PNG'}
            </button>
          </div>
        </div>
        <div ref={wrapRef} style={{ flex: 1, minHeight: 0, background: '#e2e8f0', padding: 10, position: 'relative' }}>
          <canvas
            ref={canvasRef}
            style={{
              display: 'block', width: '100%', height: '100%',
              background: '#fff', borderRadius: 8, touchAction: 'none',
              cursor: tool === 'paneo' ? 'grab'
                : tool === 'seleccion' ? 'default'
                  : tool === 'mover' ? 'move'
                    : tool === 'hatch' || tool === 'tabla' ? 'cell'
                      : 'crosshair',
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          {editingTabla && selectedObj && (
            <TablaOverlay
              key={`${selectedObj.id}-${selectedObj.rows}-${selectedObj.cols}`}
              obj={selectedObj}
              pan={panRef.current}
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
          Seleccionar: elija un elemento. Mover/rotar actúa solo sobre la selección (Alt/Shift = rotar).
          Tabla: pulse el lienzo para insertar; edite celdas con Seleccionar. Paneo y hatch sin cambios.
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
function TablaOverlay({ obj, pan, canvasEl, onCellChange }) {
  const [cells, setCells] = useState(() => cloneScene(obj.cells || []))
  useEffect(() => {
    setCells(cloneScene(obj.cells || []))
  }, [obj.id, obj.rows, obj.cols])

  if (!obj || !canvasEl) return null
  const { rows, cols, cellW, cellH, w, h } = tablaSize(obj)
  const left = (canvasEl.offsetLeft || 0) + (pan?.x || 0) + (obj.x || 0)
  const top = (canvasEl.offsetTop || 0) + (pan?.y || 0) + (obj.y || 0)
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: w,
        height: h,
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
                    width: cellW, height: cellH, padding: 0,
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
