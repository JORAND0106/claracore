import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MAX_SCALE, MIN_SCALE, viewBoxFromPanScale, zoomPanAtPoint } from './topoViewportMath'

export { zoomPanAtPoint, viewBoxFromPanScale } from './topoViewportMath'

function touchDistance(a, b) {
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
}

function touchMidpoint(a, b) {
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  }
}

/**
 * Gestos de viewport para planos SVG topográficos.
 * El zoom/pan se aplica vía viewBox (vectorial nítido), no con CSS scale
 * (que rasteriza y pixeliza al acercar).
 */
export function useTopoViewportGestures({
  minScale = MIN_SCALE,
  maxScale = MAX_SCALE,
  wheelFactor = 1.1,
  worldWidth = 560,
  worldHeight = 400,
} = {}) {
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [containerEl, setContainerEl] = useState(null)
  const [cssSize, setCssSize] = useState({ w: worldWidth, h: worldHeight })
  const scaleRef = useRef(1)
  const panStateRef = useRef({ x: 0, y: 0 })
  const gestureRef = useRef({
    mode: null,
    x0: 0,
    y0: 0,
    pan0: { x: 0, y: 0 },
    pinchDist0: 0,
    scale0: 1,
  })

  const containerRef = useCallback((node) => {
    setContainerEl(node)
  }, [])

  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  useEffect(() => {
    panStateRef.current = pan
  }, [pan])

  useEffect(() => {
    if (!containerEl || typeof ResizeObserver === 'undefined') {
      if (containerEl) {
        const r = containerEl.getBoundingClientRect()
        setCssSize({ w: r.width || worldWidth, h: r.height || worldHeight })
      }
      return undefined
    }
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (!cr) return
      setCssSize({
        w: cr.width || worldWidth,
        h: cr.height || worldHeight,
      })
    })
    ro.observe(containerEl)
    const r = containerEl.getBoundingClientRect()
    setCssSize({ w: r.width || worldWidth, h: r.height || worldHeight })
    return () => ro.disconnect()
  }, [containerEl, worldWidth, worldHeight])

  const resetVista = useCallback(() => {
    scaleRef.current = 1
    panStateRef.current = { x: 0, y: 0 }
    setScale(1)
    setPan({ x: 0, y: 0 })
    gestureRef.current.mode = null
  }, [])

  const applyZoomAtClient = useCallback((nextScale, clientX, clientY) => {
    const el = containerEl
    if (!el) {
      const s1 = Math.min(maxScale, Math.max(minScale, nextScale))
      scaleRef.current = s1
      setScale(s1)
      return
    }
    const rect = el.getBoundingClientRect()
    const origin = { x: rect.width / 2, y: rect.height / 2 }
    const focal = { x: clientX - rect.left, y: clientY - rect.top }
    const result = zoomPanAtPoint(
      panStateRef.current,
      scaleRef.current,
      nextScale,
      focal,
      origin,
      { minScale, maxScale },
    )
    scaleRef.current = result.scale
    panStateRef.current = result.pan
    setScale(result.scale)
    setPan(result.pan)
  }, [containerEl, minScale, maxScale])

  const onWheel = useCallback((e) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 1 / wheelFactor : wheelFactor
    applyZoomAtClient(scaleRef.current * factor, e.clientX, e.clientY)
  }, [applyZoomAtClient, wheelFactor])

  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    gestureRef.current = {
      mode: 'pan',
      x0: e.clientX,
      y0: e.clientY,
      pan0: { ...panStateRef.current },
      pinchDist0: 0,
      scale0: scaleRef.current,
    }
  }, [])

  const onMouseMove = useCallback((e) => {
    const g = gestureRef.current
    if (g.mode !== 'pan') return
    const next = {
      x: g.pan0.x + (e.clientX - g.x0),
      y: g.pan0.y + (e.clientY - g.y0),
    }
    panStateRef.current = next
    setPan(next)
  }, [])

  const onMouseUp = useCallback(() => {
    if (gestureRef.current.mode === 'pan') {
      gestureRef.current.mode = null
    }
  }, [])

  const onTouchStart = useCallback((e) => {
    const touches = e.touches
    if (touches.length === 1) {
      const t = touches[0]
      gestureRef.current = {
        mode: 'pan',
        x0: t.clientX,
        y0: t.clientY,
        pan0: { ...panStateRef.current },
        pinchDist0: 0,
        scale0: scaleRef.current,
      }
    } else if (touches.length >= 2) {
      const d = touchDistance(touches[0], touches[1])
      gestureRef.current = {
        mode: 'pinch',
        x0: 0,
        y0: 0,
        pan0: { ...panStateRef.current },
        pinchDist0: Math.max(d, 1),
        scale0: scaleRef.current,
      }
    }
  }, [])

  const onTouchMove = useCallback((e) => {
    const g = gestureRef.current
    const touches = e.touches
    if (g.mode === 'pan' && touches.length === 1) {
      e.preventDefault()
      const t = touches[0]
      const next = {
        x: g.pan0.x + (t.clientX - g.x0),
        y: g.pan0.y + (t.clientY - g.y0),
      }
      panStateRef.current = next
      setPan(next)
      return
    }
    if (g.mode === 'pinch' && touches.length >= 2) {
      e.preventDefault()
      const d = Math.max(touchDistance(touches[0], touches[1]), 1)
      const mid = touchMidpoint(touches[0], touches[1])
      const nextScale = g.scale0 * (d / g.pinchDist0)
      applyZoomAtClient(nextScale, mid.x, mid.y)
      g.pinchDist0 = d
      g.scale0 = scaleRef.current
      g.pan0 = { ...panStateRef.current }
    }
  }, [applyZoomAtClient])

  const onTouchEnd = useCallback((e) => {
    const touches = e.touches
    if (touches.length === 0) {
      gestureRef.current.mode = null
      return
    }
    if (touches.length === 1) {
      const t = touches[0]
      gestureRef.current = {
        mode: 'pan',
        x0: t.clientX,
        y0: t.clientY,
        pan0: { ...panStateRef.current },
        pinchDist0: 0,
        scale0: scaleRef.current,
      }
    }
  }, [])

  useEffect(() => {
    if (!containerEl) return undefined
    const move = (ev) => onTouchMove(ev)
    const start = (ev) => onTouchStart(ev)
    const end = (ev) => onTouchEnd(ev)
    containerEl.addEventListener('touchstart', start, { passive: true })
    containerEl.addEventListener('touchmove', move, { passive: false })
    containerEl.addEventListener('touchend', end, { passive: true })
    containerEl.addEventListener('touchcancel', end, { passive: true })
    return () => {
      containerEl.removeEventListener('touchstart', start)
      containerEl.removeEventListener('touchmove', move)
      containerEl.removeEventListener('touchend', end)
      containerEl.removeEventListener('touchcancel', end)
    }
  }, [containerEl, onTouchStart, onTouchMove, onTouchEnd])

  useEffect(() => {
    if (!containerEl) return undefined
    const wheel = (ev) => onWheel(ev)
    containerEl.addEventListener('wheel', wheel, { passive: false })
    return () => containerEl.removeEventListener('wheel', wheel)
  }, [containerEl, onWheel])

  const viewBox = useMemo(
    () => viewBoxFromPanScale(worldWidth, worldHeight, scale, pan, cssSize.w, cssSize.h).viewBox,
    [worldWidth, worldHeight, scale, pan, cssSize.w, cssSize.h],
  )

  return {
    containerRef,
    scale,
    pan,
    viewBox,
    resetVista,
    viewportHandlers: {
      onMouseDown,
      onMouseMove,
      onMouseUp,
      onMouseLeave: onMouseUp,
    },
    containerStyle: {
      overflow: 'hidden',
      touchAction: 'none',
      cursor: 'grab',
      WebkitUserSelect: 'none',
      userSelect: 'none',
    },
    /** Sin CSS transform/scale: el zoom va en viewBox (nitidez vectorial). */
    contentStyle: {
      display: 'block',
      width: '100%',
      height: '100%',
      maxHeight: worldHeight,
    },
  }
}
