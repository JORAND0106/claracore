/**
 * Plantillas paramétricas de tubería y accesorios (C-3D-17).
 * Construyen sólidos exterior (volumen = cubicaje exterior) reutilizando
 * extrude / loft / subtract / unite existentes.
 */
import {
  extrudeClosedEntity,
  lockSolidVolume,
  solidVolumeM3,
  translateSolid3d,
  uniteSolids,
} from './esquema3dSolids.js'
import { metersToWorld, worldToMeters } from './esquemaGeometry.js'

export const PIPE_TEMPLATE_FAMILY = 'pipe_fitting'

/** Catálogo: se pueden agregar más plantillas en el futuro. */
export const PIPE_TEMPLATE_CATALOG = Object.freeze([
  { id: 'tuberia', label: 'Tubería', kind: 'tuberia', angleDeg: null },
  { id: 'codo90', label: 'Codo 90°', kind: 'codo', angleDeg: 90 },
  { id: 'codo45', label: 'Codo 45°', kind: 'codo', angleDeg: 45 },
  { id: 'codo225', label: 'Codo 22,5°', kind: 'codo', angleDeg: 22.5 },
  { id: 'codo1125', label: 'Codo 11,25°', kind: 'codo', angleDeg: 11.25 },
  { id: 'tee', label: 'TEE', kind: 'tee', angleDeg: null },
  { id: 'reduccion', label: 'Reducción', kind: 'reduccion', angleDeg: null },
])

export function pipeTemplateById(id) {
  return PIPE_TEMPLATE_CATALOG.find((t) => t.id === id) || null
}

export function parsePipeMeasure(raw) {
  if (raw == null || String(raw).trim() === '') return null
  const n = Number(String(raw).trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Redondeo estable de metros (evita 0,30+0,04 → 0,339999…). */
function roundMeters(n, decimals = 9) {
  const x = Number(n)
  if (!Number.isFinite(x)) return null
  const f = 10 ** decimals
  return Math.round(x * f) / f
}

/** Diámetro exterior = DI + 2×espesor. */
export function pipeOuterDiameterM(diM, espesorM) {
  const di = Number(diM)
  const e = Number(espesorM)
  if (!(di > 0) || !(e >= 0)) return null
  return roundMeters(di + 2 * e)
}

/** Eje = cota lomo − DE/2. */
export function pipeAxisCotaFromLomo(cotaLomo, deM) {
  const c = Number(cotaLomo)
  const de = Number(deM)
  if (!Number.isFinite(c) || !(de > 0)) return null
  return roundMeters(c - de / 2)
}

export function pipeExteriorVolumeCylinderM3(deM, lengthM) {
  const r = Number(deM) / 2
  const L = Number(lengthM)
  if (!(r > 0) || !(L > 0)) return 0
  return Math.PI * r * r * L
}

/** Volumen exterior de codo: π × r_ext² × (R_curvatura × θ_rad). */
export function pipeExteriorVolumeElbowM3(deM, bendRadiusM, angleDeg) {
  const r = Number(deM) / 2
  const R = Number(bendRadiusM)
  const ang = Number(angleDeg)
  if (!(r > 0) || !(R > 0) || !(ang > 0)) return 0
  const arc = R * ((ang * Math.PI) / 180)
  return Math.PI * r * r * arc
}

/** Tronco de cono exterior (reducción). */
export function pipeExteriorVolumeReducerM3(deMajorM, deMinorM, lengthM) {
  const R = Number(deMajorM) / 2
  const r = Number(deMinorM) / 2
  const h = Number(lengthM)
  if (!(R >= 0) || !(r >= 0) || !(h > 0)) return 0
  return Math.PI * (h / 3) * (R * R + R * r + r * r)
}

function uid(prefix = 'pipe') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

function circleEntity(rM, id = 'circ') {
  const r = metersToWorld(rM)
  return {
    type: 'elipse',
    id,
    x1: -r,
    y1: -r,
    x2: r,
    y2: r,
  }
}

function circleEntityAt(cxM, cyM, rM, id = 'circ') {
  const cx = metersToWorld(cxM)
  const cy = metersToWorld(cyM)
  const r = metersToWorld(rM)
  return {
    type: 'elipse',
    id,
    x1: cx - r,
    y1: cy - r,
    x2: cx + r,
    y2: cy + r,
  }
}

function makeEnds({ deM, diM, centers, normals, roles }) {
  return (centers || []).map((c, i) => ({
    id: String.fromCharCode(97 + i),
    role: roles?.[i] || (i === 0 ? 'run_in' : 'run_out'),
    center: { x: c.x, y: c.y, zCota: c.zCota },
    normal: normals?.[i] || { x: i === 0 ? -1 : 1, y: 0, z: 0 },
    odM: deM,
    idM: diM,
  }))
}

function attachTemplate(solid, meta) {
  if (!solid) return solid
  solid.templateMeta = {
    family: PIPE_TEMPLATE_FAMILY,
    version: 1,
    ...meta,
  }
  return solid
}

/**
 * Hueco visual sin boolean: el sólido geométrico sigue siendo el exterior
 * (cubicaje y sustracción de concreto usan Ø exterior). El interior se marca
 * en curveHoles para contornos limpios al dibujar.
 */
function hollowizeKeepingExteriorVolume(outerSolid, diM, lengthM, viewId = 'left', deM = null) {
  const rInt = Number(diM) / 2
  if (!(rInt > 0) || !outerSolid) return outerSolid
  const exteriorV = solidVolumeM3(outerSolid)
  const od = Number(deM) || Number(outerSolid.formMeta?.diameterM) || (rInt * 2)
  const pd = outerSolid.profileDraw
  if (pd?.kind === 'ellipse_tube') {
    const scale = od > 0 ? (Number(diM) / od) : 1
    outerSolid.curveHoles = [{
      ...pd,
      rx: Number(pd.rx) * scale,
      rzM: rInt,
      circular: true,
      _fromHole: true,
    }]
  } else {
    const faceDepthWorld = outerSolid.extrudeParams?.faceDepthWorld ?? 0
    const inner = extrudeClosedEntity(circleEntity(rInt, 'inner'), {
      viewId,
      lengthM,
      faceDepthWorld,
    })
    if (inner.ok && inner.solid.profileDraw) {
      outerSolid.curveHoles = [{
        ...inner.solid.profileDraw,
        circular: true,
        _fromHole: true,
      }]
    }
  }
  lockSolidVolume(outerSolid, exteriorV)
  return outerSolid
}

/** Coloca un cilindro extruido (vista left = +X, front = +Y) con extremo A en origin. */
function placeExtrudedRun(solid, {
  axis, // 'x' | 'y'
  originM,
  lengthM,
  ejeCota,
}) {
  const ox = Number(originM.x) || 0
  const oy = Number(originM.y) || 0
  const L = Number(lengthM) || 0
  if (axis === 'x') {
    // left: depth 0→L en +X; situar extremo A en ox.
    return translateSolid3d(solid, {
      dx: metersToWorld(ox),
      dy: metersToWorld(oy),
      dzCota: ejeCota,
    })
  }
  // front: depth 0→L en +Y
  return translateSolid3d(solid, {
    dx: metersToWorld(ox),
    dy: metersToWorld(oy),
    dzCota: ejeCota,
  })
}

/**
 * Campos requeridos por plantilla (valores parseados). Placeholders grises; sin precarga.
 */
export function pipeTemplateFields(templateId) {
  const t = pipeTemplateById(templateId)
  if (!t) return []
  if (t.kind === 'tuberia') {
    return [
      { key: 'diM', label: 'Ø interior (m)', required: true },
      { key: 'espesorM', label: 'Espesor (m)', required: true },
      { key: 'lengthM', label: 'Longitud (m)', required: true },
      { key: 'cotaLomo', label: 'Cota lomo inicial', required: true },
      { key: 'cotaLomoFinal', label: 'Cota lomo final', required: false },
    ]
  }
  if (t.kind === 'codo') {
    return [
      { key: 'diM', label: 'Ø interior (m)', required: true },
      { key: 'espesorM', label: 'Espesor (m)', required: true },
      { key: 'bendRadiusM', label: 'Radio curvatura (m)', required: true },
      { key: 'cotaLomo', label: 'Cota lomo', required: true },
    ]
  }
  if (t.kind === 'tee') {
    return [
      { key: 'diM', label: 'Ø int. principal (m)', required: true },
      { key: 'diBranchM', label: 'Ø int. ramal (m)', required: true },
      { key: 'espesorM', label: 'Espesor (m)', required: true },
      { key: 'lengthM', label: 'Long. principal (m)', required: true },
      { key: 'branchLengthM', label: 'Long. ramal (m)', required: true },
      { key: 'cotaLomo', label: 'Cota lomo', required: true },
    ]
  }
  if (t.kind === 'reduccion') {
    return [
      { key: 'diMajorM', label: 'Ø int. mayor (m)', required: true },
      { key: 'diMinorM', label: 'Ø int. menor (m)', required: true },
      { key: 'espesorM', label: 'Espesor (m)', required: true },
      { key: 'lengthM', label: 'Longitud (m)', required: true },
      { key: 'cotaLomo', label: 'Cota lomo', required: true },
    ]
  }
  return []
}

export function validatePipeTemplateValues(templateId, values = {}) {
  const fields = pipeTemplateFields(templateId)
  const parsed = {}
  for (const f of fields) {
    const raw = values[f.key]
    const empty = raw == null || String(raw).trim() === ''
    const v = parsePipeMeasure(raw)
    const isCota = f.key === 'cotaLomo' || f.key === 'cotaLomoFinal'
    if (isCota) {
      if (f.required && empty) return { ok: false, error: `Indique ${f.label}.` }
      if (!empty && v == null) return { ok: false, error: `${f.label} no es numérica.` }
      if (v != null) parsed[f.key] = v
      continue
    }
    if (f.required && (empty || v == null || !(v > 0))) {
      return { ok: false, error: `Indique ${f.label}.` }
    }
    if (!empty) {
      if (v == null || !(v > 0)) return { ok: false, error: `${f.label} debe ser > 0.` }
      parsed[f.key] = v
    }
  }
  const t = pipeTemplateById(templateId)
  if (t?.kind === 'tuberia' || t?.kind === 'codo' || t?.kind === 'tee') {
    parsed.deM = pipeOuterDiameterM(parsed.diM, parsed.espesorM)
  }
  if (t?.kind === 'tee') {
    parsed.deBranchM = pipeOuterDiameterM(parsed.diBranchM, parsed.espesorM)
  }
  if (t?.kind === 'reduccion') {
    parsed.deMajorM = pipeOuterDiameterM(parsed.diMajorM, parsed.espesorM)
    parsed.deMinorM = pipeOuterDiameterM(parsed.diMinorM, parsed.espesorM)
  }
  if (t?.kind === 'codo') parsed.angleDeg = t.angleDeg
  return { ok: true, parsed, template: t }
}

/**
 * Tubería recta (horizontal o con pendiente si hay cota final).
 * Origen = extremo A en planta (metros world XY); eje +X por defecto.
 */
export function buildTuberiaSolid(values, {
  originM = { x: 0, y: 0 },
  yawDeg = 0,
  id = null,
  color = undefined,
} = {}) {
  const v = validatePipeTemplateValues('tuberia', values)
  if (!v.ok) return v
  const { diM, espesorM, lengthM, cotaLomo, cotaLomoFinal, deM } = v.parsed
  const rExt = deM / 2
  const cotaFinal = cotaLomoFinal != null ? cotaLomoFinal : cotaLomo
  const eje0 = pipeAxisCotaFromLomo(cotaLomo, deM)
  const eje1 = pipeAxisCotaFromLomo(cotaFinal, deM)
  const yaw = (Number(yawDeg) || 0) * Math.PI / 180
  const dir = { x: Math.cos(yaw), y: Math.sin(yaw) }
  const ox = Number(originM.x) || 0
  const oy = Number(originM.y) || 0

  let solid
  const flat = Math.abs(eje1 - eje0) < 1e-9
  // Extrusión canónica left (+X) solo con yaw≈0 y horizontal; resto → loft en planta.
  if (flat && Math.abs(yawDeg) < 1e-6) {
    const built = extrudeClosedEntity(circleEntity(rExt, 'pipe_od'), {
      viewId: 'left',
      lengthM,
      faceDepthWorld: 0,
      id: id || uid('tuberia'),
      color,
    })
    if (!built.ok) return built
    solid = hollowizeKeepingExteriorVolume(built.solid, diM, lengthM, 'left', deM)
    solid = placeExtrudedRun(solid, {
      axis: 'x', originM: { x: ox, y: oy }, lengthM, ejeCota: eje0,
    })
  } else {
    return buildTuberiaSolidSloped({
      diM, deM, lengthM, espesorM, eje0, eje1, ox, oy, dir, id, color,
      cotaLomo, cotaLomoFinal: cotaFinal,
    })
  }

  const endA = { x: metersToWorld(ox), y: metersToWorld(oy), zCota: eje0 }
  const endB = {
    x: metersToWorld(ox + dir.x * lengthM),
    y: metersToWorld(oy + dir.y * lengthM),
    zCota: eje1,
  }
  lockSolidVolume(solid, pipeExteriorVolumeCylinderM3(deM, lengthM))
  if (id) solid.id = id
  if (color) solid.color = color
  solid.formMeta = {
    kind: 'cylinder',
    rxM: rExt,
    ryM: rExt,
    lengthM,
    diameterM: deM,
  }
  attachTemplate(solid, {
    templateId: 'tuberia',
    kind: 'tuberia',
    params: {
      diM, espesorM, lengthM, deM, cotaLomo, cotaLomoFinal: cotaFinal, yawDeg: Number(yawDeg) || 0,
    },
    ends: makeEnds({
      deM,
      diM,
      centers: [endA, endB],
      normals: [
        { x: -dir.x, y: -dir.y, z: 0 },
        { x: dir.x, y: dir.y, z: 0 },
      ],
      roles: ['run_in', 'run_out'],
    }),
  })
  return { ok: true, solid, deM, ejeCota: eje0 }
}

function buildTuberiaSolidSloped({
  diM, deM, lengthM, espesorM, eje0, eje1, ox, oy, dir, id, color, cotaLomo, cotaLomoFinal,
}) {
  const rExt = deM / 2
  // Aproximación: segmentos cortos a lo largo del eje (planta + pendiente).
  const segments = Math.max(4, Math.min(24, Math.round(lengthM / 0.25)))
  const segLen = lengthM / segments
  const solids = []
  for (let i = 0; i < segments; i += 1) {
    const t0 = i / segments
    const t1 = (i + 1) / segments
    const tm = (t0 + t1) / 2
    const px = ox + dir.x * lengthM * tm
    const py = oy + dir.y * lengthM * tm
    const pz = eje0 + (eje1 - eje0) * tm
    const alongX = Math.abs(dir.x) >= Math.abs(dir.y)
    const built = extrudeClosedEntity(circleEntity(rExt, `pipe_seg_${i}`), {
      viewId: alongX ? 'left' : 'front',
      lengthM: segLen * 1.05,
      faceDepthWorld: 0,
    })
    if (!built.ok) continue
    const half = (segLen * 1.05) / 2
    let s = built.solid
    if (alongX) {
      s = translateSolid3d(s, {
        dx: metersToWorld(px - half * Math.sign(dir.x || 1)),
        dy: metersToWorld(py),
        dzCota: pz,
      })
    } else {
      s = translateSolid3d(s, {
        dx: metersToWorld(px),
        dy: metersToWorld(py - half * Math.sign(dir.y || 1)),
        dzCota: pz,
      })
    }
    solids.push(s)
  }
  let solid
  if (!solids.length) return { ok: false, error: 'No se pudo construir la tubería.' }
  if (solids.length === 1) {
    solid = solids[0]
  } else {
    const u = uniteSolids(solids)
    solid = u.ok ? u.solid : solids[0]
  }
  const vol = pipeExteriorVolumeCylinderM3(deM, lengthM)
  lockSolidVolume(solid, vol)
  if (id) solid.id = id
  if (color) solid.color = color
  solid.formMeta = {
    kind: 'cylinder',
    rxM: rExt,
    ryM: rExt,
    lengthM,
    diameterM: deM,
  }
  const endA = { x: metersToWorld(ox), y: metersToWorld(oy), zCota: eje0 }
  const endB = {
    x: metersToWorld(ox + dir.x * lengthM),
    y: metersToWorld(oy + dir.y * lengthM),
    zCota: eje1,
  }
  attachTemplate(solid, {
    templateId: 'tuberia',
    kind: 'tuberia',
    params: {
      diM, espesorM, lengthM, deM, cotaLomo, cotaLomoFinal,
      yawDeg: Math.atan2(dir.y, dir.x) * 180 / Math.PI,
    },
    ends: makeEnds({
      deM,
      diM,
      centers: [endA, endB],
      normals: [
        { x: -dir.x, y: -dir.y, z: 0 },
        { x: dir.x, y: dir.y, z: 0 },
      ],
    }),
  })
  return { ok: true, solid, deM, ejeCota: eje0 }
}

/**
 * Codo: volumen analítico; geometría ≈ segmentos unidos a lo largo del arco en planta.
 */
export function buildCodoSolid(templateId, values, {
  originM = { x: 0, y: 0 },
  yawDeg = 0,
  id = null,
  color = undefined,
} = {}) {
  const v = validatePipeTemplateValues(templateId, values)
  if (!v.ok) return v
  const { diM, espesorM, bendRadiusM, cotaLomo, deM, angleDeg } = v.parsed
  const rExt = deM / 2
  const eje = pipeAxisCotaFromLomo(cotaLomo, deM)
  const segments = Math.max(6, Math.round(angleDeg / 7.5))
  const yaw0 = (Number(yawDeg) || 0) * Math.PI / 180
  const ox = Number(originM.x) || 0
  const oy = Number(originM.y) || 0
  // Centro de curvatura a la izquierda del extremo de entrada.
  const cx = ox - Math.sin(yaw0) * bendRadiusM
  const cy = oy + Math.cos(yaw0) * bendRadiusM
  const solids = []
  const arcLen = bendRadiusM * (angleDeg * Math.PI / 180)
  const segLen = arcLen / segments
  for (let i = 0; i < segments; i += 1) {
    const a0 = yaw0 - Math.PI / 2 + (i / segments) * (angleDeg * Math.PI / 180)
    const a1 = yaw0 - Math.PI / 2 + ((i + 1) / segments) * (angleDeg * Math.PI / 180)
    const am = (a0 + a1) / 2
    const px = cx + Math.cos(am) * bendRadiusM
    const py = cy + Math.sin(am) * bendRadiusM
    const tx = Math.cos(am + Math.PI / 2)
    const ty = Math.sin(am + Math.PI / 2)
    const alongX = Math.abs(tx) >= Math.abs(ty)
    const built = extrudeClosedEntity(circleEntity(rExt, `codo_${i}`), {
      viewId: alongX ? 'left' : 'front',
      lengthM: segLen * 1.15,
      faceDepthWorld: 0,
    })
    if (!built.ok) continue
    const half = (segLen * 1.15) / 2
    let s = built.solid
    if (alongX) {
      s = translateSolid3d(s, {
        dx: metersToWorld(px - half * Math.sign(tx || 1)),
        dy: metersToWorld(py),
        dzCota: eje,
      })
    } else {
      s = translateSolid3d(s, {
        dx: metersToWorld(px),
        dy: metersToWorld(py - half * Math.sign(ty || 1)),
        dzCota: eje,
      })
    }
    solids.push(s)
  }
  if (!solids.length) return { ok: false, error: 'No se pudo construir el codo.' }
  let united = solids[0]
  if (solids.length > 1) {
    const u = uniteSolids(solids)
    united = u.ok ? u.solid : solids[0]
  }
  const vol = pipeExteriorVolumeElbowM3(deM, bendRadiusM, angleDeg)
  lockSolidVolume(united, vol)
  if (id) united.id = id
  if (color) united.color = color
  united.formMeta = {
    kind: 'pipe_elbow',
    rxM: rExt,
    diameterM: deM,
    bendRadiusM,
    angleDeg,
    lengthM: arcLen,
  }
  const aIn = yaw0 - Math.PI / 2
  const aOut = yaw0 - Math.PI / 2 + (angleDeg * Math.PI / 180)
  const endA = {
    x: metersToWorld(cx + Math.cos(aIn) * bendRadiusM),
    y: metersToWorld(cy + Math.sin(aIn) * bendRadiusM),
    zCota: eje,
  }
  const endB = {
    x: metersToWorld(cx + Math.cos(aOut) * bendRadiusM),
    y: metersToWorld(cy + Math.sin(aOut) * bendRadiusM),
    zCota: eje,
  }
  const nIn = { x: Math.cos(yaw0 + Math.PI), y: Math.sin(yaw0 + Math.PI), z: 0 }
  const nOutAng = yaw0 + (angleDeg * Math.PI / 180)
  const nOut = { x: Math.cos(nOutAng), y: Math.sin(nOutAng), z: 0 }
  attachTemplate(united, {
    templateId,
    kind: 'codo',
    params: {
      diM, espesorM, bendRadiusM, deM, cotaLomo, angleDeg, yawDeg: Number(yawDeg) || 0,
    },
    ends: makeEnds({
      deM, diM, centers: [endA, endB], normals: [nIn, nOut],
    }),
  })
  return { ok: true, solid: united, deM, ejeCota: eje }
}

export function buildTeeSolid(values, {
  originM = { x: 0, y: 0 },
  yawDeg = 0,
  id = null,
  color = undefined,
} = {}) {
  const v = validatePipeTemplateValues('tee', values)
  if (!v.ok) return v
  const {
    diM, diBranchM, espesorM, lengthM, branchLengthM, cotaLomo, deM, deBranchM,
  } = v.parsed
  const rMain = deM / 2
  const rBr = deBranchM / 2
  const eje = pipeAxisCotaFromLomo(cotaLomo, deM)
  const yaw = (Number(yawDeg) || 0) * Math.PI / 180
  const dir = { x: Math.cos(yaw), y: Math.sin(yaw) }
  const perp = { x: -dir.y, y: dir.x }
  const ox = Number(originM.x) || 0
  const oy = Number(originM.y) || 0
  const cx = ox + dir.x * (lengthM / 2)
  const cy = oy + dir.y * (lengthM / 2)

  // Principal a lo largo de +X local (vista left); ramal a lo largo de +Y (vista front).
  // Con yaw≠0 se aproximan extremos; geometría canónica en yaw=0.
  const mainBuilt = extrudeClosedEntity(circleEntity(rMain, 'tee_main'), {
    viewId: 'left',
    lengthM,
    faceDepthWorld: 0,
    id: id || uid('tee'),
    color,
  })
  if (!mainBuilt.ok) return mainBuilt
  let mainS = placeExtrudedRun(mainBuilt.solid, {
    axis: 'x', originM: { x: ox, y: oy }, lengthM, ejeCota: eje,
  })
  const brBuilt = extrudeClosedEntity(circleEntity(rBr, 'tee_br'), {
    viewId: 'front',
    lengthM: branchLengthM,
    faceDepthWorld: 0,
  })
  if (!brBuilt.ok) return brBuilt
  let brS = translateSolid3d(brBuilt.solid, {
    dx: metersToWorld(cx),
    dy: metersToWorld(cy),
    dzCota: eje,
  })
  // Si el TEE está girado en planta, desplazar el ramal según perp (yaw≈0 ⇒ +Y).
  if (Math.abs(yaw) > 1e-6) {
    brS = translateSolid3d(brBuilt.solid, {
      dx: metersToWorld(cx + perp.x * 0),
      dy: metersToWorld(cy + perp.y * 0),
      dzCota: eje,
    })
  }

  const u = uniteSolids([mainS, brS])
  let solid = u.ok ? u.solid : mainS
  const volMain = pipeExteriorVolumeCylinderM3(deM, lengthM)
  const volBr = pipeExteriorVolumeCylinderM3(deBranchM, branchLengthM)
  // Aprox. sin doble contar el cruce cilíndrico.
  const vol = volMain + volBr
    - pipeExteriorVolumeCylinderM3(Math.min(deM, deBranchM), Math.min(deM, deBranchM))
  lockSolidVolume(solid, Math.max(volMain, vol))
  if (id) solid.id = id
  if (color) solid.color = color
  solid.formMeta = {
    kind: 'pipe_tee',
    diameterM: deM,
    diameterBranchM: deBranchM,
    lengthM,
    branchLengthM,
  }
  const endA = { x: metersToWorld(ox), y: metersToWorld(oy), zCota: eje }
  const endB = {
    x: metersToWorld(ox + dir.x * lengthM),
    y: metersToWorld(oy + dir.y * lengthM),
    zCota: eje,
  }
  const endC = {
    x: metersToWorld(cx + perp.x * branchLengthM),
    y: metersToWorld(cy + perp.y * branchLengthM),
    zCota: eje,
  }
  attachTemplate(solid, {
    templateId: 'tee',
    kind: 'tee',
    params: {
      diM, diBranchM, espesorM, lengthM, branchLengthM, deM, deBranchM, cotaLomo,
      yawDeg: Number(yawDeg) || 0,
    },
    ends: makeEnds({
      deM,
      diM,
      centers: [endA, endB, endC],
      normals: [
        { x: -dir.x, y: -dir.y, z: 0 },
        { x: dir.x, y: dir.y, z: 0 },
        { x: perp.x, y: perp.y, z: 0 },
      ],
      roles: ['run_in', 'run_out', 'branch'],
    }),
  })
  if (solid.templateMeta?.ends?.[2]) {
    solid.templateMeta.ends[2].odM = deBranchM
    solid.templateMeta.ends[2].idM = diBranchM
  }
  return { ok: true, solid, deM, ejeCota: eje }
}

export function buildReduccionSolid(values, {
  originM = { x: 0, y: 0 },
  yawDeg = 0,
  id = null,
  color = undefined,
} = {}) {
  const v = validatePipeTemplateValues('reduccion', values)
  if (!v.ok) return v
  const {
    diMajorM, diMinorM, espesorM, lengthM, cotaLomo, deMajorM, deMinorM,
  } = v.parsed
  const eje = pipeAxisCotaFromLomo(cotaLomo, deMajorM)
  const yaw = (Number(yawDeg) || 0) * Math.PI / 180
  const dir = { x: Math.cos(yaw), y: Math.sin(yaw) }
  const ox = Number(originM.x) || 0
  const oy = Number(originM.y) || 0
  // Geometría: cilindro Ø mayor a lo largo de +X; volumen = tronco de cono exterior.
  const built = extrudeClosedEntity(circleEntity(deMajorM / 2, 'red_od'), {
    viewId: 'left',
    lengthM,
    faceDepthWorld: 0,
    id: id || uid('reduccion'),
    color,
  })
  if (!built.ok) return built
  let solid = placeExtrudedRun(built.solid, {
    axis: 'x', originM: { x: ox, y: oy }, lengthM, ejeCota: eje,
  })
  const vol = pipeExteriorVolumeReducerM3(deMajorM, deMinorM, lengthM)
  lockSolidVolume(solid, vol)
  if (id) solid.id = id
  if (color) solid.color = color
  solid.formMeta = {
    kind: 'cone_frustum',
    RM: deMajorM / 2,
    rM: deMinorM / 2,
    heightM: lengthM,
    diameterBaseM: deMajorM,
    diameterTopM: deMinorM,
  }
  const endA = { x: metersToWorld(ox), y: metersToWorld(oy), zCota: eje }
  const endB = {
    x: metersToWorld(ox + dir.x * lengthM),
    y: metersToWorld(oy + dir.y * lengthM),
    zCota: eje,
  }
  attachTemplate(solid, {
    templateId: 'reduccion',
    kind: 'reduccion',
    params: {
      diMajorM, diMinorM, espesorM, lengthM, deMajorM, deMinorM, cotaLomo,
      yawDeg: Number(yawDeg) || 0,
    },
    ends: makeEnds({
      deM: deMajorM,
      diM: diMajorM,
      centers: [endA, endB],
      normals: [
        { x: -dir.x, y: -dir.y, z: 0 },
        { x: dir.x, y: dir.y, z: 0 },
      ],
      roles: ['run_in', 'reduce_out'],
    }),
  })
  if (solid.templateMeta?.ends?.[1]) {
    solid.templateMeta.ends[1].odM = deMinorM
    solid.templateMeta.ends[1].idM = diMinorM
  }
  return { ok: true, solid, deM: deMajorM, ejeCota: eje }
}

export function buildPipeTemplateSolid(templateId, values, opts = {}) {
  const t = pipeTemplateById(templateId)
  if (!t) return { ok: false, error: 'Plantilla desconocida.' }
  if (t.kind === 'tuberia') return buildTuberiaSolid(values, opts)
  if (t.kind === 'codo') return buildCodoSolid(templateId, values, opts)
  if (t.kind === 'tee') return buildTeeSolid(values, opts)
  if (t.kind === 'reduccion') return buildReduccionSolid(values, opts)
  return { ok: false, error: 'Plantilla no implementada.' }
}

export function isPipeTemplateSolid(solid) {
  return solid?.type === 'solid3d'
    && solid?.templateMeta?.family === PIPE_TEMPLATE_FAMILY
}

/** Rebuild in place (mismo id/color). */
export function updatePipeTemplateSolid(solid, values, opts = {}) {
  if (!isPipeTemplateSolid(solid)) {
    return { ok: false, error: 'No es una plantilla de tubería.' }
  }
  const tid = solid.templateMeta.templateId
  const yaw = opts.yawDeg ?? solid.templateMeta.params?.yawDeg ?? 0
  const end0 = solid.templateMeta.ends?.[0]?.center
  const originM = end0
    ? { x: worldToMeters(end0.x), y: worldToMeters(end0.y) }
    : (opts.originM || { x: 0, y: 0 })
  const built = buildPipeTemplateSolid(tid, values, {
    ...opts,
    originM,
    yawDeg: yaw,
    id: solid.id,
    color: solid.color,
  })
  return built
}

const CONNECT_EPS_M = 0.08

/**
 * Si un extremo libre del sólido movido está cerca de un extremo libre de otro,
 * calcula el delta world para pegarlos (mismo eje/cota).
 */
export function proposePipeAutoConnect(movedSolid, others, { thresholdM = CONNECT_EPS_M } = {}) {
  if (!isPipeTemplateSolid(movedSolid)) return null
  const ends = movedSolid.templateMeta?.ends || []
  for (const end of ends) {
    for (const other of others || []) {
      if (!other || other.id === movedSolid.id || !isPipeTemplateSolid(other)) continue
      for (const oEnd of other.templateMeta?.ends || []) {
        // Compatibilidad de diámetro (tolerancia 5 mm)
        if (end.odM && oEnd.odM && Math.abs(end.odM - oEnd.odM) > 0.005) continue
        const dx = worldToMeters(oEnd.center.x - end.center.x)
        const dy = worldToMeters(oEnd.center.y - end.center.y)
        const dz = (oEnd.center.zCota ?? 0) - (end.center.zCota ?? 0)
        const dist = Math.hypot(dx, dy, dz)
        if (dist > thresholdM || dist < 1e-9) continue
        return {
          dxWorld: metersToWorld(dx),
          dyWorld: metersToWorld(dy),
          dzCota: dz,
          fromEnd: end,
          toEnd: oEnd,
          otherId: other.id,
          inheritCotaLomo: !movedSolid.templateMeta?.params?.cotaLomo
            ? other.templateMeta?.params?.cotaLomo
            : null,
        }
      }
    }
  }
  return null
}

/** Desplaza los extremos de conexión junto con el sólido. */
export function shiftPipeTemplateEnds(solid, { dx = 0, dy = 0, dzCota = 0 } = {}) {
  if (!isPipeTemplateSolid(solid) || !solid.templateMeta?.ends?.length) return solid
  if (!dx && !dy && !dzCota) return solid
  return {
    ...solid,
    templateMeta: {
      ...solid.templateMeta,
      ends: solid.templateMeta.ends.map((e) => ({
        ...e,
        center: {
          x: (e.center?.x || 0) + dx,
          y: (e.center?.y || 0) + dy,
          zCota: (e.center?.zCota || 0) + dzCota,
        },
      })),
    },
  }
}

export function applyPipeAutoConnect(solid, proposal) {
  if (!solid || !proposal) return solid
  let next = translateSolid3d(solid, {
    dx: proposal.dxWorld,
    dy: proposal.dyWorld,
    dzCota: proposal.dzCota,
  })
  next = shiftPipeTemplateEnds(next, {
    dx: proposal.dxWorld,
    dy: proposal.dyWorld,
    dzCota: proposal.dzCota,
  })
  if (next.templateMeta) {
    next = {
      ...next,
      templateMeta: {
        ...next.templateMeta,
        connectedTo: {
          ...(next.templateMeta.connectedTo || {}),
          [proposal.fromEnd.id]: { solidId: proposal.otherId, endId: proposal.toEnd.id },
        },
      },
    }
  }
  return next
}

/** Fórmula natural para memoria (operand). */
export function naturalFormulaPipeFormMeta(fm, volumeM3) {
  if (!fm) return null
  const fmt = (n) => {
    const x = Number(n)
    if (!Number.isFinite(x)) return '—'
    const r = Math.round(x * 1000) / 1000
    return String(r)
  }
  if (fm.kind === 'pipe_elbow') {
    const r = fm.rxM
    const R = fm.bendRadiusM
    const ang = fm.angleDeg
    const arc = R * ((ang * Math.PI) / 180)
    return {
      forma: `Codo ${fmt(ang)}°`,
      dimensiones: `Ø ${fmt(fm.diameterM)} m · R ${fmt(R)} m · ${fmt(ang)}°`,
      formula: `π × ${fmt(r)}² × (${fmt(R)} × ${fmt(ang)}°)`,
      formaCalculo: `π × ${fmt(r)}² × ${fmt(arc)} = ${fmt(volumeM3)} m³`,
    }
  }
  if (fm.kind === 'pipe_tee') {
    return {
      forma: 'TEE',
      dimensiones: `Ø ${fmt(fm.diameterM)} · ramal Ø ${fmt(fm.diameterBranchM)} · L ${fmt(fm.lengthM)} m`,
      formula: `π × r_ext² × L (principal + ramal)`,
      formaCalculo: `${fmt(volumeM3)} m³`,
    }
  }
  return null
}
