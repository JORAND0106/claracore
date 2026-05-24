/**
 * Fondo animado de cielo para el banner de clima (Canvas API).
 * Estilo atmosférico realista: gradientes profundos, luna texturizada, nubes volumétricas.
 */
import { useEffect, useRef, useMemo } from 'react'

const DEG15 = Math.PI / 12
const RAIN_DX = Math.sin(DEG15)
const RAIN_DY = Math.cos(DEG15)

const MOON_MARIA = [
  { ox: -0.18, oy: -0.08, rx: 0.28, ry: 0.22, a: 0.14, rot: -0.15 },
  { ox: 0.12, oy: 0.14, rx: 0.22, ry: 0.18, a: 0.11, rot: 0.1 },
  { ox: -0.05, oy: 0.22, rx: 0.18, ry: 0.14, a: 0.09, rot: 0.05 },
  { ox: 0.24, oy: -0.12, rx: 0.12, ry: 0.1, a: 0.08, rot: -0.08 },
]

const MOON_CRATERS = [
  { ang: 0.8, dist: 0.35, cr: 0.028 },
  { ang: 2.1, dist: 0.52, cr: 0.022 },
  { ang: 3.5, dist: 0.28, cr: 0.018 },
  { ang: 4.2, dist: 0.62, cr: 0.024 },
  { ang: 5.1, dist: 0.18, cr: 0.016 },
  { ang: 1.4, dist: 0.48, cr: 0.02 },
  { ang: 2.8, dist: 0.22, cr: 0.014 },
  { ang: 3.9, dist: 0.55, cr: 0.019 },
]

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

function rand(min, max) {
  return min + Math.random() * (max - min)
}

/** Escala visual anclada a la altura del banner (evita estirar por el ancho). */
function skyUnit(h) {
  return Math.max(h, 82)
}

/** Limita elipses horizontales para que no se vean como manchas alargadas. */
function capEllipse(rx, ry) {
  const maxRx = Math.max(ry * 1.45, 18)
  const maxRy = 42
  return { rx: Math.min(rx, maxRx), ry: Math.min(ry, maxRy) }
}

function cloudAnchorX(w, h, index) {
  const u = skyUnit(h)
  const zones = [
    rand(-u * 0.15, Math.min(w * 0.1, 80)),
    rand(Math.max(w * 0.72, w - 220), w + u * 0.1),
    rand(Math.max(w * 0.82, w - 140), w + u * 0.08),
  ]
  return zones[index % zones.length]
}

function moonLayout(scene, w, h) {
  const u = skyUnit(h)
  if (scene === 'night_cloudy') {
    return { x: w * 0.78, y: h * 0.4, r: u * 0.14, full: true }
  }
  if (scene === 'night_clear') {
    return { x: w * 0.9, y: h * 0.32, r: u * 0.1, full: false }
  }
  return null
}

function makeClouds(count, w, h, { dense = false, dark = false, yRange = [0.08, 0.55], edgeOnly = false } = {}) {
  const u = skyUnit(h)
  return Array.from({ length: count }, (_, i) => {
    const scale = rand(0.75, dense ? 1 : 0.92)
    const blobN = dense ? 4 : 3
    const blobs = Array.from({ length: blobN }, () => {
      const rx = rand(u * 0.22, u * (dense ? 0.38 : 0.32)) * scale
      const ry = rand(u * 0.1, u * (dense ? 0.18 : 0.15)) * scale
      return {
        ox: rand(-u * 0.22, u * 0.22),
        oy: rand(-u * 0.06, u * 0.06),
        ...capEllipse(rx, ry),
      }
    })
    return {
      x: edgeOnly ? cloudAnchorX(w, h, i) : rand(-u * 0.3, w + u * 0.15),
      y: rand(h * yRange[0], h * yRange[1]),
      speed: rand(0.03, 0.1),
      dark,
      alpha: dark ? rand(0.45, 0.62) : rand(0.72, 0.88),
      blobs,
    }
  })
}

/** Nube compacta delante de la luna — tamaño solo según altura, no ancho del banner. */
function makeHeroCloud(w, h) {
  const u = skyUnit(h)
  const blobs = [
    { ox: 0, oy: 0, rx: u * 0.42, ry: u * 0.22 },
    { ox: -u * 0.28, oy: u * 0.03, rx: u * 0.32, ry: u * 0.18 },
    { ox: u * 0.22, oy: -u * 0.02, rx: u * 0.3, ry: u * 0.19 },
    { ox: -u * 0.08, oy: u * 0.06, rx: u * 0.24, ry: u * 0.15 },
  ].map((b) => ({ ...b, ...capEllipse(b.rx, b.ry) }))

  return {
    x: w * 0.78,
    y: h * 0.4,
    speed: 0.025,
    alpha: 0.9,
    dark: true,
    blobs,
  }
}

function makeRain(count, w, h) {
  return Array.from({ length: count }, () => ({
    x: rand(0, w),
    y: rand(-h, h),
    len: rand(10, 18),
    speed: rand(2.8, 5.5),
  }))
}

function makeStarField(w, h, density = 1) {
  const n = Math.floor((w * h) / 1100 * density)
  return Array.from({ length: Math.min(Math.max(n, 30), 90) }, () => ({
    x: rand(0, w),
    y: rand(0, h * 0.88),
    r: rand(0.35, rand(0.5, 1.6)),
    mag: rand(0.35, 1),
    phase: rand(0, Math.PI * 2),
    period: rand(4500, 9000),
    sparkle: Math.random() > 0.94,
  }))
}

function drawSkyBackground(ctx, w, h, scene) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  if (scene.startsWith('night')) {
    g.addColorStop(0, '#2a1848')
    g.addColorStop(0.35, '#151830')
    g.addColorStop(0.72, '#0c1020')
    g.addColorStop(1, '#060810')
  } else if (scene === 'day_clear') {
    g.addColorStop(0, '#3a7ec8')
    g.addColorStop(0.55, '#6db3e8')
    g.addColorStop(1, '#b9ddf5')
  } else if (scene === 'day_cloudy') {
    g.addColorStop(0, '#7a95ad')
    g.addColorStop(0.5, '#9eb3c4')
    g.addColorStop(1, '#c5d4df')
  } else {
    g.addColorStop(0, '#566674')
    g.addColorStop(0.5, '#6e7d8a')
    g.addColorStop(1, '#8896a3')
  }
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  if (scene.startsWith('night')) {
    const hx = w * 0.82
    const hy = h * 0.22
    const haze = ctx.createRadialGradient(hx, hy, 0, hx, hy, skyUnit(h) * 1.1)
    haze.addColorStop(0, 'rgba(80,60,120,0.14)')
    haze.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = haze
    ctx.fillRect(0, 0, w, h)
  }
}

function drawStars(ctx, stars, t, dim = 1) {
  stars.forEach((s) => {
    const pulse = s.mag * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin((t / s.period) * Math.PI * 2 + s.phase)))
    const a = Math.min(1, pulse * dim)
    const px = Math.round(s.x) + 0.5
    const py = Math.round(s.y) + 0.5
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`
    ctx.beginPath()
    ctx.arc(px, py, s.r, 0, Math.PI * 2)
    ctx.fill()
    if (s.sparkle && a > 0.6) {
      ctx.strokeStyle = `rgba(255,255,255,${(a * 0.45).toFixed(3)})`
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(px - 2.5, py)
      ctx.lineTo(px + 2.5, py)
      ctx.moveTo(px, py - 2.5)
      ctx.lineTo(px, py + 2.5)
      ctx.stroke()
    }
  })
}

function drawMoon(ctx, mx, my, r, full = true) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(mx, my, r, 0, Math.PI * 2)
  ctx.clip()

  const base = ctx.createRadialGradient(mx - r * 0.35, my - r * 0.35, r * 0.08, mx, my, r)
  base.addColorStop(0, '#FAF6EE')
  base.addColorStop(0.55, '#E9E2D4')
  base.addColorStop(0.88, '#C9C0AE')
  base.addColorStop(1, '#9A9284')
  ctx.fillStyle = base
  ctx.fillRect(mx - r, my - r, r * 2, r * 2)

  MOON_MARIA.forEach((m) => {
    ctx.fillStyle = `rgba(110,105,95,${m.a})`
    ctx.beginPath()
    ctx.ellipse(mx + m.ox * r, my + m.oy * r, m.rx * r, m.ry * r, m.rot || 0, 0, Math.PI * 2)
    ctx.fill()
  })

  MOON_CRATERS.forEach((c) => {
    ctx.fillStyle = `rgba(130,125,115,${c.a || 0.12})`
    ctx.beginPath()
    ctx.arc(mx + Math.cos(c.ang) * c.dist * r, my + Math.sin(c.ang) * c.dist * r, c.cr * r, 0, Math.PI * 2)
    ctx.fill()
  })

  const limb = ctx.createRadialGradient(mx, my, r * 0.55, mx, my, r)
  limb.addColorStop(0, 'rgba(0,0,0,0)')
  limb.addColorStop(0.82, 'rgba(0,0,0,0)')
  limb.addColorStop(1, 'rgba(15,18,35,0.35)')
  ctx.fillStyle = limb
  ctx.fillRect(mx - r, my - r, r * 2, r * 2)

  ctx.restore()

  if (!full) {
    ctx.fillStyle = '#121528'
    ctx.beginPath()
    ctx.arc(mx + r * 0.42, my - r * 0.04, r * 0.88, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.save()
  ctx.globalAlpha = 0.25
  const glow = ctx.createRadialGradient(mx, my, r * 0.4, mx, my, r * 1.8)
  glow.addColorStop(0, 'rgba(240,235,220,0.5)')
  glow.addColorStop(1, 'rgba(240,235,220,0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(mx, my, r * 1.8, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawSun(ctx, w, h) {
  const u = skyUnit(h)
  const x = w * 0.92
  const y = h * 0.28
  const r = u * 0.075

  const corona = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.8)
  corona.addColorStop(0, 'rgba(255,230,140,0.45)')
  corona.addColorStop(0.35, 'rgba(255,210,100,0.15)')
  corona.addColorStop(1, 'rgba(255,210,100,0)')
  ctx.fillStyle = corona
  ctx.beginPath()
  ctx.arc(x, y, r * 2.8, 0, Math.PI * 2)
  ctx.fill()

  const disc = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, r * 0.1, x, y, r)
  disc.addColorStop(0, '#FFF8D0')
  disc.addColorStop(0.7, '#FFE080')
  disc.addColorStop(1, '#F0C860')
  ctx.fillStyle = disc
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

function drawVolumetricBlob(ctx, cx, cy, rx, ry, { dark = false, alpha = 1 } = {}) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  ctx.clip()

  const lx = cx - rx * 0.22
  const ly = cy - ry * 0.28
  const reach = Math.max(rx, ry) * 0.88

  const under = ctx.createRadialGradient(cx, cy + ry * 0.35, ry * 0.1, cx, cy, reach)
  if (dark) {
    under.addColorStop(0, 'rgba(35,42,56,0.55)')
    under.addColorStop(0.65, 'rgba(50,58,72,0.22)')
    under.addColorStop(1, 'rgba(0,0,0,0)')
  } else {
    under.addColorStop(0, 'rgba(110,130,155,0.35)')
    under.addColorStop(0.65, 'rgba(190,200,215,0.15)')
    under.addColorStop(1, 'rgba(0,0,0,0)')
  }
  ctx.fillStyle = under
  ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2)

  const body = ctx.createRadialGradient(lx, ly, reach * 0.08, cx, cy, reach)
  if (dark) {
    body.addColorStop(0, 'rgba(165,172,188,0.62)')
    body.addColorStop(0.42, 'rgba(105,115,132,0.48)')
    body.addColorStop(0.75, 'rgba(62,70,86,0.28)')
    body.addColorStop(1, 'rgba(0,0,0,0)')
  } else {
    body.addColorStop(0, 'rgba(255,255,255,0.96)')
    body.addColorStop(0.4, 'rgba(242,246,250,0.82)')
    body.addColorStop(0.72, 'rgba(215,225,235,0.35)')
    body.addColorStop(1, 'rgba(0,0,0,0)')
  }
  ctx.fillStyle = body
  ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2)

  ctx.restore()
}

function drawCloudCluster(ctx, cloud, w, drift = true) {
  cloud.blobs.forEach((b) => {
    const { rx, ry } = capEllipse(b.rx, b.ry)
    drawVolumetricBlob(ctx, cloud.x + b.ox, cloud.y + b.oy, rx, ry, {
      dark: cloud.dark,
      alpha: cloud.alpha,
    })
  })
  if (drift) {
    cloud.x += cloud.speed
    const u = 120
    if (cloud.x > w + u) cloud.x = -u
  }
}

function drawRain(ctx, drops, w, h) {
  ctx.strokeStyle = 'rgba(195,210,228,0.38)'
  ctx.lineWidth = 1
  ctx.lineCap = 'butt'
  drops.forEach((d) => {
    ctx.beginPath()
    ctx.moveTo(d.x, d.y)
    ctx.lineTo(d.x + d.len * RAIN_DX, d.y + d.len * RAIN_DY)
    ctx.stroke()
    d.x += d.speed * RAIN_DX
    d.y += d.speed * RAIN_DY
    if (d.y > h + 20 || d.x > w + 20) {
      d.x = rand(-20, w * 0.5)
      d.y = rand(-50, -8)
    }
  })
}

function drawMist(ctx, w, h) {
  const g = ctx.createLinearGradient(0, h * 0.62, 0, h)
  g.addColorStop(0, 'rgba(140,155,175,0)')
  g.addColorStop(1, 'rgba(140,155,175,0.08)')
  ctx.fillStyle = g
  ctx.fillRect(0, h * 0.62, w, h * 0.38)
}

function drawSkyFrame(ctx, w, h, scene, state, t) {
  ctx.imageSmoothingEnabled = true
  drawSkyBackground(ctx, w, h, scene)

  const moon = state.moon
  const showStars = scene === 'night_clear' || scene === 'night_cloudy'
  if (showStars) {
    drawStars(ctx, state.stars, t, scene === 'night_cloudy' ? 0.65 : 1)
  }

  if (moon && (scene === 'night_clear' || scene === 'night_cloudy')) {
    drawMoon(ctx, moon.x, moon.y, moon.r, moon.full)
  }

  if (scene === 'day_clear') drawSun(ctx, w, h)

  if (scene === 'night_cloudy' && state.heroCloud) {
    drawCloudCluster(ctx, state.heroCloud, w, false)
  }

  const showDriftClouds = scene.includes('cloud') || scene.includes('rain') || scene === 'day_clear'
  if (showDriftClouds) {
    state.clouds.forEach((c) => drawCloudCluster(ctx, c, w, true))
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
  const cloudCount = isRain ? 3 : isCloudy ? 4 : isClearDay ? 2 : 0

  return {
    moon: moonLayout(scene, w, h),
    heroCloud: scene === 'night_cloudy' ? makeHeroCloud(w, h) : null,
    clouds: cloudCount
      ? makeClouds(cloudCount, w, h, {
        dense: isRain || isCloudy,
        dark: isNight || isRain,
        edgeOnly: isRain || isCloudy,
        yRange: isRain ? [0.12, 0.48] : [0.1, 0.5],
      })
      : [],
    rain: isRain ? makeRain(Math.floor(w * 0.28), w, h) : [],
    stars: scene === 'night_clear'
      ? makeStarField(w, h, 1.15)
      : scene === 'night_cloudy'
        ? makeStarField(w, h, 0.55)
        : [],
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
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingQuality = 'high'
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
        const cw = wrap.clientWidth
        const ch = wrap.clientHeight
        const st = stateRef.current
        if (st && cw > 0 && ch > 0) {
          drawSkyFrame(ctx, cw, ch, sceneRef.current, st, ts)
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
    if (!wrap) return
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
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  )
}
