/**
 * Fondo animado de cielo para el banner de clima (Canvas API).
 * Escena según hora local del dispositivo + código WMO de la zona de obra.
 */
import { useEffect, useRef, useMemo } from 'react'

const DEG15 = Math.PI / 12
const RAIN_DX = Math.sin(DEG15)
const RAIN_DY = Math.cos(DEG15)

export function resolveSkyScene(wmoCode, hour = new Date().getHours()) {
  const c = Number(wmoCode)
  const isDay = hour >= 6 && hour < 18
  const isRainy = (c >= 51 && c <= 67) || (c >= 80 && c <= 82)
  const isCloudy = c >= 2 && c <= 3

  if (isDay) {
    if (isRainy) return 'day_rain'
    if (isCloudy) return 'day_cloudy'
    return 'day_clear'
  }
  if (isRainy) return 'night_rain'
  if (isCloudy) return 'night_cloudy'
  return 'night_clear'
}

const SCENE_GRADIENTS = {
  day_clear: ['#4a90d9', '#87ceeb'],
  day_cloudy: ['#8fa8c0', '#b8cdd9'],
  day_rain: ['#607080', '#8090a0'],
  night_clear: ['#0a0a2e', '#1a1a4e'],
  night_cloudy: ['#1a1a3e', '#252535'],
  night_rain: ['#0d1520', '#1a2535'],
}

function rand(min, max) {
  return min + Math.random() * (max - min)
}

function makeClouds(count, w, h, { dense = false, dark = false } = {}) {
  return Array.from({ length: count }, () => {
    const scale = rand(0.7, dense ? 1.35 : 1.1)
    const blobs = Array.from({ length: dense ? 6 : 4 }, () => ({
      ox: rand(-40, 40) * scale,
      oy: rand(-12, 12) * scale,
      rx: rand(28, 58) * scale,
      ry: rand(14, 28) * scale,
    }))
    return {
      x: rand(-w * 0.2, w * 1.1),
      y: rand(h * 0.08, h * 0.55),
      scale,
      speed: rand(0.04, 0.2),
      opacity: dark ? rand(0.45, 0.62) : rand(0.6, 0.75),
      dark,
      blobs,
    }
  })
}

function makeRain(count, w, h) {
  return Array.from({ length: count }, () => ({
    x: rand(0, w),
    y: rand(-h, h),
    len: rand(8, 16),
    speed: rand(2.5, 5),
  }))
}

function makeStars(count, w, h) {
  return Array.from({ length: count }, () => ({
    x: rand(0, w),
    y: rand(0, h * 0.72),
    r: rand(0.6, 1.4),
    phase: rand(0, Math.PI * 2),
    period: rand(3000, 5000),
  }))
}

function drawCloud(ctx, cloud, w) {
  ctx.save()
  ctx.globalAlpha = cloud.opacity
  cloud.blobs.forEach((b) => {
    const cx = cloud.x + b.ox
    const cy = cloud.y + b.oy
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, b.rx)
    if (cloud.dark) {
      g.addColorStop(0, 'rgba(55,62,78,0.88)')
      g.addColorStop(1, 'rgba(55,62,78,0)')
    } else {
      g.addColorStop(0, 'rgba(255,255,255,0.92)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
    }
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(cx, cy, b.rx, b.ry, 0, 0, Math.PI * 2)
    ctx.fill()
  })
  ctx.restore()
  cloud.x += cloud.speed
  if (cloud.x > w + 120) cloud.x = -160
}

function drawRain(ctx, drops, w, h) {
  ctx.strokeStyle = 'rgba(200,210,225,0.35)'
  ctx.lineWidth = 1
  drops.forEach((d) => {
    ctx.beginPath()
    ctx.moveTo(d.x, d.y)
    ctx.lineTo(d.x + d.len * RAIN_DX, d.y + d.len * RAIN_DY)
    ctx.stroke()
    d.x += d.speed * RAIN_DX
    d.y += d.speed * RAIN_DY
    if (d.y > h + 20 || d.x > w + 20) {
      d.x = rand(-20, w * 0.4)
      d.y = rand(-40, -10)
    }
  })
}

function drawStars(ctx, stars, t) {
  stars.forEach((s) => {
    const pulse = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin((t / s.period) * Math.PI * 2 + s.phase))
    ctx.fillStyle = `rgba(255,255,255,${pulse.toFixed(3)})`
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fill()
  })
}

function drawSun(ctx, w, h) {
  const x = w * 0.88
  const y = h * 0.22
  ctx.fillStyle = '#FFE87C'
  ctx.beginPath()
  ctx.arc(x, y, Math.min(w, h) * 0.07, 0, Math.PI * 2)
  ctx.fill()
}

function drawMoon(ctx, w, h) {
  const x = w * 0.86
  const y = h * 0.24
  const r = Math.min(w, h) * 0.065
  ctx.fillStyle = '#F0EAD6'
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#141432'
  ctx.beginPath()
  ctx.arc(x + r * 0.45, y - r * 0.05, r * 0.82, 0, Math.PI * 2)
  ctx.fill()
}

function drawMist(ctx, w, h) {
  const g = ctx.createLinearGradient(0, h * 0.55, 0, h)
  g.addColorStop(0, 'rgba(180,190,205,0)')
  g.addColorStop(1, 'rgba(180,190,205,0.12)')
  ctx.fillStyle = g
  ctx.fillRect(0, h * 0.55, w, h * 0.45)
}

function drawSkyFrame(ctx, w, h, scene, state, t) {
  const [top, bottom] = SCENE_GRADIENTS[scene] || SCENE_GRADIENTS.day_clear
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, top)
  grad.addColorStop(1, bottom)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  if (scene === 'day_clear') drawSun(ctx, w, h)
  if (scene === 'night_clear') drawMoon(ctx, w, h)

  if (scene === 'night_clear') drawStars(ctx, state.stars, t)

  const showClouds = scene.includes('cloud') || scene.includes('rain') || scene === 'day_clear'
  if (showClouds) {
    state.clouds.forEach((c) => drawCloud(ctx, c, w))
  }

  if (scene.includes('rain')) {
    drawRain(ctx, state.rain, w, h)
    drawMist(ctx, w, h)
  }
}

function buildSceneState(scene, w, h) {
  const isRain = scene.includes('rain')
  const isCloudy = scene.includes('cloud')
  const isClearDay = scene === 'day_clear'
  const isNight = scene.startsWith('night')
  const cloudCount = isRain ? 7 : isCloudy ? 6 : isClearDay ? 2 : 0
  return {
    clouds: cloudCount
      ? makeClouds(cloudCount, w, h, { dense: isRain || isCloudy, dark: isNight || isRain })
      : [],
    rain: isRain ? makeRain(Math.floor(w * 0.35), w, h) : [],
    stars: scene === 'night_clear' ? makeStars(Math.floor(w * 0.08), w, h) : [],
  }
}

export default function CieloClimaCanvas({ wmoCode, className, style }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const animRef = useRef(null)
  const stateRef = useRef(null)
  const sceneRef = useRef('day_clear')
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  const scene = useMemo(() => resolveSkyScene(wmoCode), [wmoCode])

  useEffect(() => {
    sceneRef.current = scene
  }, [scene])

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return undefined

    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    const resize = () => {
      const w = Math.max(wrap.clientWidth, 320)
      const h = Math.max(wrap.clientHeight, 82)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      stateRef.current = buildSceneState(sceneRef.current, w, h)
      if (reducedMotion) {
        drawSkyFrame(ctx, w, h, sceneRef.current, stateRef.current, 0)
      }
    }

    resize()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    ro?.observe(wrap)
    window.addEventListener('resize', resize)

    if (!reducedMotion) {
      const loop = (ts) => {
        const w = wrap.clientWidth
        const h = wrap.clientHeight
        const st = stateRef.current
        if (st && w > 0 && h > 0) {
          drawSkyFrame(ctx, w, h, sceneRef.current, st, ts)
        }
        animRef.current = requestAnimationFrame(loop)
      }
      animRef.current = requestAnimationFrame(loop)
    }

    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', resize)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [reducedMotion])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || !stateRef.current) return
    const w = wrap.clientWidth
    const h = wrap.clientHeight
    stateRef.current = buildSceneState(scene, w, h)
    if (reducedMotion && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) drawSkyFrame(ctx, w, h, scene, stateRef.current, 0)
    }
  }, [scene, reducedMotion])

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', ...style }}
      aria-hidden
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
    </div>
  )
}
