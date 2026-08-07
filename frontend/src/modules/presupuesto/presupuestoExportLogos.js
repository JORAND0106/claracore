/**
 * Resolución y layout de logos para export Excel de Presupuesto.
 *
 * - Altura fija 1.8 cm para los tres logos; ancho proporcional al aspect ratio.
 * - Interventoría pegada al contratista por coordenadas (no al inicio de columna).
 * - Entidad a la derecha.
 */

/** Altura estándar de los tres logos. */
export const LOGO_HEIGHT_CM = 1.8
/** 96 dpi → px/cm = 96/2.54 */
export const LOGO_HEIGHT_PX = Math.round((LOGO_HEIGHT_CM * 96) / 2.54) // 68 px
/**
 * Separación horizontal entre logo contratista e interventoría.
 * 8 px ≈ 0.21 cm a 96 dpi — margen pequeño y consistente.
 */
export const LOGO_PAIR_GAP_PX = 8
/** Padding izquierdo del primer logo respecto al borde del encabezado (px). */
export const LOGO_PAIR_PAD_LEFT_PX = 6
/** Ancho de columna (chars Excel) usado en el bloque izquierdo para convertir px→col. */
export const LOGO_LEFT_COL_CHARS = 12
/** DrawingML: EMUs por píxel a 96 dpi (mismo factor que ExcelJS ExtXform). */
export const EMU_PER_PX = 9525
/** DrawingML: EMUs por punto tipográfico. */
export const EMU_PER_POINT = 12700

/**
 * Encabezado fijo de la pestaña Resumen (7 columnas de datos):
 * A1:B1 logos C+I · C1:E1 título · F1:G1 entidad.
 */
export const RESUMEN_HEADER_LEFT_START = 1
export const RESUMEN_HEADER_LEFT_END = 2
export const RESUMEN_HEADER_TITLE_START = 3
export const RESUMEN_HEADER_TITLE_END = 5
export const RESUMEN_HEADER_ENTIDAD_START = 6
export const RESUMEN_HEADER_ENTIDAD_END = 7
/** Máximo de ancho (chars Excel) para la columna B en Resumen. */
export const RESUMEN_COL_B_MAX_CHARS = 15

/**
 * Encabezado fijo memorias de ítem (13 cols A–M tras eliminar ex-columna M):
 * A1:D1 logos C+I · E1:L1 título · M1 entidad (antes N1; corrimiento al borrar M).
 */
export const ITEM_HEADER_LEFT_START = 1
export const ITEM_HEADER_LEFT_END = 4
export const ITEM_HEADER_TITLE_START = 5
export const ITEM_HEADER_TITLE_END = 12
/** Columna final (M): logo de entidad. */
export const ITEM_HEADER_ENTIDAD_COL = 13
export const ITEM_HEADER_COLS = 13

/** @param {...(string|null|undefined)} candidates */
export function pickLogoUrl(...candidates) {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return null
}

/**
 * Lee ancho/alto de PNG o JPEG desde bytes (sin dependencias).
 * @param {Uint8Array|ArrayBuffer} buf
 * @returns {{ width: number, height: number }|null}
 */
export function dimensionesImagenBuffer(buf) {
  try {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
    if (u8.length >= 24 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) {
      const width = ((u8[16] << 24) | (u8[17] << 16) | (u8[18] << 8) | u8[19]) >>> 0
      const height = ((u8[20] << 24) | (u8[21] << 16) | (u8[22] << 8) | u8[23]) >>> 0
      if (width > 0 && height > 0) return { width, height }
    }
    if (u8.length > 4 && u8[0] === 0xff && u8[1] === 0xd8) {
      let i = 2
      while (i + 9 < u8.length) {
        if (u8[i] !== 0xff) break
        const marker = u8[i + 1]
        if (marker === 0xd9 || marker === 0xda) break
        if (marker >= 0xc0 && marker <= 0xc3) {
          const height = (u8[i + 5] << 8) | u8[i + 6]
          const width = (u8[i + 7] << 8) | u8[i + 8]
          if (width > 0 && height > 0) return { width, height }
          break
        }
        const seglen = (u8[i + 2] << 8) | u8[i + 3]
        if (seglen < 2) break
        i += 2 + seglen
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

/**
 * Altura fija; ancho = altura × (natW/natH). Siempre 1.8 cm de alto.
 * @returns {{ width: number, height: number }}
 */
export function sizeLogoFixedHeight(natW, natH, heightPx = LOGO_HEIGHT_PX) {
  const height = Math.max(1, Math.round(Number(heightPx) || LOGO_HEIGHT_PX))
  const nw = Math.max(1, Number(natW) || height)
  const nh = Math.max(1, Number(natH) || height)
  const width = Math.max(1, Math.round(height * (nw / nh)))
  return { width, height }
}

/** Conversión Excel (ancho en chars) → píxeles (fórmula clásica de Excel). */
export function excelColWidthToPx(widthChars) {
  const w = Number(widthChars)
  if (!Number.isFinite(w) || w <= 0) return 64
  if (w < 1) return Math.max(1, Math.floor(w * 12))
  return Math.max(1, Math.floor(((256 * w + Math.floor(128 / 7)) / 256) * 7))
}

/** Inversa aproximada de excelColWidthToPx (chars mínimos para alcanzar `px`). */
export function excelPxToColWidth(px) {
  const target = Math.max(1, Math.round(Number(px) || 1))
  let lo = 1
  let hi = 120
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (excelColWidthToPx(mid) < target) lo = mid + 1
    else hi = mid
  }
  return lo
}

export function pxToEmu(px) {
  return Math.round(Math.max(0, Number(px) || 0) * EMU_PER_PX)
}

export function pointsToEmu(pt) {
  return Math.round(Math.max(0, Number(pt) || 0) * EMU_PER_POINT)
}

/**
 * Offset horizontal en px (desde col A) → ancla nativa ExcelJS en EMUs reales.
 * Evita fracciones `col` (ExcelJS las convierte con width*10000, no EMUs).
 * @param {number} px
 * @param {number[]} colWidthsPx anchos sucesivos de columnas desde A
 */
export function pxOffsetToNativeCol(px, colWidthsPx) {
  let remaining = Math.max(0, Number(px) || 0)
  const widths = Array.isArray(colWidthsPx) && colWidthsPx.length ? colWidthsPx : [64]
  let col = 0
  for (let i = 0; i < 64; i += 1) {
    const cw = widths[i] ?? widths[widths.length - 1] ?? 64
    if (remaining < cw) {
      return { nativeCol: col, nativeColOff: pxToEmu(remaining) }
    }
    remaining -= cw
    col += 1
  }
  return { nativeCol: col, nativeColOff: pxToEmu(remaining) }
}

function rowNativeOffCentered(rowHeightPt, logoHeightPx, nativeRow = 0) {
  const rowEmu = pointsToEmu(rowHeightPt)
  const logoEmu = pxToEmu(logoHeightPx)
  return {
    nativeRow: Math.max(0, Math.floor(Number(nativeRow) || 0)),
    nativeRowOff: Math.max(0, Math.floor((rowEmu - logoEmu) / 2)),
  }
}

function makeFloatingTl(cursorPx, colWidthsPx, rowHeightPt, logoHeightPx, nativeRow = 0) {
  return {
    ...pxOffsetToNativeCol(cursorPx, colWidthsPx),
    ...rowNativeOffCentered(rowHeightPt, logoHeightPx, nativeRow),
  }
}

/**
 * Posiciones flotantes del par C+I: interventoría justo a la derecha del contratista.
 *
 * @param {{
 *   logoC?: object|null,
 *   logoI?: object|null,
 *   colChars?: number,
 *   colWidthsPx?: number[]|null,
 *   gapPx?: number,
 *   padLeftPx?: number,
 *   padRightPx?: number,
 *   rowHeightPt?: number,
 * }} opts
 */
export function posicionParLogosFlotante({
  logoC = null,
  logoI = null,
  colChars = LOGO_LEFT_COL_CHARS,
  colWidthsPx = null,
  gapPx = LOGO_PAIR_GAP_PX,
  padLeftPx = LOGO_PAIR_PAD_LEFT_PX,
  padRightPx = LOGO_PAIR_PAD_LEFT_PX,
  rowHeightPt = 54,
} = {}) {
  const colPx = excelColWidthToPx(colChars)
  const widths = Array.isArray(colWidthsPx) && colWidthsPx.length
    ? colWidthsPx.map((w) => Math.max(1, Number(w) || colPx))
    : [colPx]

  const sizeC = logoImageId(logoC) != null
    ? sizeLogoFixedHeight(logoNatSize(logoC).natW, logoNatSize(logoC).natH)
    : null
  const sizeI = logoImageId(logoI) != null
    ? sizeLogoFixedHeight(logoNatSize(logoI).natW, logoNatSize(logoI).natH)
    : null

  let cursorPx = padLeftPx
  let contratista = null
  let interventoria = null

  if (sizeC) {
    contratista = {
      tl: makeFloatingTl(cursorPx, widths, rowHeightPt, sizeC.height),
      ext: { width: sizeC.width, height: sizeC.height },
    }
    cursorPx += sizeC.width
  }
  if (sizeI) {
    if (sizeC) cursorPx += gapPx
    interventoria = {
      tl: makeFloatingTl(cursorPx, widths, rowHeightPt, sizeI.height),
      ext: { width: sizeI.width, height: sizeI.height },
    }
    cursorPx += sizeI.width
  }

  const pairWidthPx = cursorPx + Math.max(0, Number(padRightPx) || 0)
  const leftSpanCols = Math.max(2, Math.ceil(pairWidthPx / (widths[0] || colPx)))

  return { contratista, interventoria, pairWidthPx, leftSpanCols, colChars, colPx: widths[0] || colPx }
}

/**
 * Par C+I en extremos de un bloque de columnas (p. ej. A:B o A:D):
 * contratista al borde izquierdo; interventoría al borde derecho del bloque.
 *
 * @param {{
 *   logoC?: object|null,
 *   logoI?: object|null,
 *   colWidthsPx: number[],
 *   rowHeightPt?: number,
 *   padLeftPx?: number,
 *   padRightPx?: number,
 * }} opts
 */
export function posicionParLogosExtremosBloque({
  logoC = null,
  logoI = null,
  colWidthsPx = null,
  rowHeightPt = 54,
  padLeftPx = 0,
  padRightPx = 0,
  nativeRow = 0,
} = {}) {
  const fallback = excelColWidthToPx(LOGO_LEFT_COL_CHARS)
  const widths = Array.isArray(colWidthsPx) && colWidthsPx.length
    ? colWidthsPx.map((w) => Math.max(1, Number(w) || fallback))
    : [fallback, fallback]
  const blockW = widths.reduce((a, b) => a + b, 0)
  const padL = Math.max(0, Number(padLeftPx) || 0)
  const padR = Math.max(0, Number(padRightPx) || 0)

  const sizeC = logoImageId(logoC) != null
    ? sizeLogoFixedHeight(logoNatSize(logoC).natW, logoNatSize(logoC).natH)
    : null
  const sizeI = logoImageId(logoI) != null
    ? sizeLogoFixedHeight(logoNatSize(logoI).natW, logoNatSize(logoI).natH)
    : null

  let contratista = null
  let interventoria = null

  if (sizeC) {
    contratista = {
      tl: makeFloatingTl(padL, widths, rowHeightPt, sizeC.height, nativeRow),
      ext: { width: sizeC.width, height: sizeC.height },
    }
  }
  if (sizeI) {
    const startI = Math.max(padL, blockW - padR - sizeI.width)
    interventoria = {
      tl: makeFloatingTl(startI, widths, rowHeightPt, sizeI.height, nativeRow),
      ext: { width: sizeI.width, height: sizeI.height },
    }
  }

  return { contratista, interventoria, blockWidthPx: blockW, colWidthsPx: widths }
}

/** Layout fijo fila 1 de memorias de ítem: A1:D1 | E1:L1 | M1. */
export function planLayoutItemEncabezado(logos = null) {
  const hasC = logoImageId(logos?.contratista) != null
  const hasI = logoImageId(logos?.interventoria) != null
  const hasE = logoImageId(logos?.entidad) != null
  return {
    cols: ITEM_HEADER_COLS,
    leftSpan: ITEM_HEADER_LEFT_END - ITEM_HEADER_LEFT_START + 1,
    rightSpan: hasE ? 1 : 0,
    titleStart: ITEM_HEADER_TITLE_START,
    titleEnd: ITEM_HEADER_TITLE_END,
    entidadStart: ITEM_HEADER_ENTIDAD_COL,
    entidadEnd: ITEM_HEADER_ENTIDAD_COL,
    hasContratista: hasC,
    hasInterventoria: hasI,
    hasEntidad: hasE,
    entidadLogo: hasE ? logos.entidad : null,
    logoContratista: hasC ? logos.contratista : null,
    logoInterventoria: hasI ? logos.interventoria : null,
    tieneLogo: hasC || hasI || hasE,
  }
}

/**
 * Ancho en px necesario para el par C+I (pads + logos + gap), altura 1.8 cm.
 */
export function anchoNecesarioParLogosPx({
  logoC = null,
  logoI = null,
  gapPx = LOGO_PAIR_GAP_PX,
  padLeftPx = LOGO_PAIR_PAD_LEFT_PX,
  padRightPx = LOGO_PAIR_PAD_LEFT_PX,
} = {}) {
  let w = padLeftPx + padRightPx
  const hasC = logoImageId(logoC) != null
  const hasI = logoImageId(logoI) != null
  if (hasC) {
    const s = sizeLogoFixedHeight(logoNatSize(logoC).natW, logoNatSize(logoC).natH)
    w += s.width
  }
  if (hasI) {
    const s = sizeLogoFixedHeight(logoNatSize(logoI).natW, logoNatSize(logoI).natH)
    if (hasC) w += gapPx
    w += s.width
  }
  return w
}

/**
 * Logo centrado horizontalmente dentro de un rango de columnas (p. ej. F:G).
 */
export function posicionLogoCentradoEnRango({
  logo = null,
  colStart = 1,
  colEnd = 1,
  colWidthsPx = null,
  rowHeightPt = 54,
  padPx = LOGO_PAIR_PAD_LEFT_PX,
  nativeRow = 0,
} = {}) {
  if (logoImageId(logo) == null) return null
  const { natW, natH } = logoNatSize(logo)
  const size = sizeLogoFixedHeight(natW, natH)
  const start0 = Math.max(0, (Number(colStart) || 1) - 1)
  const end0 = Math.max(start0, (Number(colEnd) || colStart) - 1)
  const fallback = excelColWidthToPx(LOGO_LEFT_COL_CHARS)
  const widths = Array.isArray(colWidthsPx) && colWidthsPx.length
    ? colWidthsPx.map((w) => Math.max(1, Number(w) || fallback))
    : Array.from({ length: end0 + 1 }, () => fallback)

  let blockStartPx = 0
  for (let i = 0; i < start0; i += 1) blockStartPx += widths[i] ?? fallback
  let blockW = 0
  for (let i = start0; i <= end0; i += 1) blockW += widths[i] ?? fallback

  const pad = Math.max(0, Number(padPx) || 0)
  const inner = Math.max(0, blockW - pad * 2)
  const offsetInBlock = pad + Math.max(0, (inner - size.width) / 2)
  return {
    tl: makeFloatingTl(blockStartPx + offsetInBlock, widths, rowHeightPt, size.height, nativeRow),
    ext: { width: size.width, height: size.height },
  }
}

/**
 * Ajuste "contain" en caja fija: escala proporcional sin deformar (sin stretch).
 * @returns {{ width: number, height: number }}
 */
export function sizeContainInBox(natW, natH, boxW, boxH) {
  const bw = Math.max(1, Number(boxW) || 1)
  const bh = Math.max(1, Number(boxH) || 1)
  const w = Number(natW)
  const h = Number(natH)
  if (!(w > 0) || !(h > 0)) return { width: bw, height: bh }
  const scale = Math.min(bw / w, bh / h)
  return { width: Math.max(1, w * scale), height: Math.max(1, h * scale) }
}

/** Layout fijo fila 1 de Resumen: A1:B1 | C1:E1 | F1:G1. */
export function planLayoutResumenEncabezado(logos = null) {
  const hasC = logoImageId(logos?.contratista) != null
  const hasI = logoImageId(logos?.interventoria) != null
  const hasE = logoImageId(logos?.entidad) != null
  return {
    cols: 7,
    leftSpan: 2,
    rightSpan: 2,
    titleStart: RESUMEN_HEADER_TITLE_START,
    titleEnd: RESUMEN_HEADER_TITLE_END,
    entidadStart: RESUMEN_HEADER_ENTIDAD_START,
    entidadEnd: RESUMEN_HEADER_ENTIDAD_END,
    hasContratista: hasC,
    hasInterventoria: hasI,
    hasEntidad: hasE,
    entidadLogo: hasE ? logos.entidad : null,
    logoContratista: hasC ? logos.contratista : null,
    logoInterventoria: hasI ? logos.interventoria : null,
    tieneLogo: hasC || hasI || hasE,
  }
}

/**
 * Posición del logo de entidad al extremo derecho del área usada.
 * Preferir `colWidthsPx` + `colCount` (anchos reales de la hoja) para alinear al borde.
 *
 * @param {{
 *   logo?: object|null,
 *   colCount?: number,
 *   colWidthsPx?: number[],
 *   colStart?: number,
 *   slotCols?: number,
 *   colChars?: number,
 *   rowHeightPt?: number,
 *   padRightPx?: number,
 * }} opts
 */
export function posicionLogoEntidadFlotante({
  logo = null,
  colCount = null,
  colWidthsPx = null,
  colStart = null,
  slotCols = 2,
  colChars = 12,
  rowHeightPt = 54,
  padRightPx = LOGO_PAIR_PAD_LEFT_PX,
} = {}) {
  if (logoImageId(logo) == null) return null
  const { natW, natH } = logoNatSize(logo)
  const size = sizeLogoFixedHeight(natW, natH)
  const padR = Math.max(0, Number(padRightPx) || 0)

  let widths
  let usedCols
  if (Array.isArray(colWidthsPx) && colWidthsPx.length && colCount != null) {
    usedCols = Math.max(1, Number(colCount) || colWidthsPx.length)
    widths = colWidthsPx.slice(0, usedCols)
    while (widths.length < usedCols) widths.push(excelColWidthToPx(colChars))
  } else {
    const colPx = excelColWidthToPx(colChars)
    const slots = Math.max(1, slotCols)
    const start0 = Math.max(0, (Number(colStart) || 1) - 1)
    usedCols = start0 + slots
    widths = Array.from({ length: usedCols }, () => colPx)
  }

  const totalPx = widths.reduce((a, b) => a + b, 0)
  const absolutePx = Math.max(0, totalPx - size.width - padR)
  return {
    tl: makeFloatingTl(absolutePx, widths, rowHeightPt, size.height),
    ext: { width: size.width, height: size.height },
  }
}

/**
 * Une meta del GET /contratos, fila en usuario._contratos y logos de sesión.
 */
export function resolverMetaLogosPresupuesto(metaContrato, usuario, contratoId) {
  const list = Array.isArray(usuario?._contratos) ? usuario._contratos : []
  const fromLista =
    contratoId != null
      ? list.find((c) => Number(c.id) === Number(contratoId)) || null
      : null
  const base = { ...(metaContrato && typeof metaContrato === 'object' ? metaContrato : {}) }
  if (fromLista) {
    if (!base.numero && fromLista.numero) base.numero = fromLista.numero
    if (!base.contratista && fromLista.contratista) base.contratista = fromLista.contratista
    if (!base.interventoria && fromLista.interventoria) base.interventoria = fromLista.interventoria
    if (!base.objeto && fromLista.objeto) base.objeto = fromLista.objeto
  }
  base.logo_contratista = pickLogoUrl(
    metaContrato?.logo_contratista,
    fromLista?.logo_contratista,
    usuario?.logo_contratista,
  )
  base.logo_interventoria = pickLogoUrl(
    metaContrato?.logo_interventoria,
    fromLista?.logo_interventoria,
    usuario?.logo_interventoria,
  )
  base.logo_entidad = pickLogoUrl(
    metaContrato?.logo_entidad,
    fromLista?.logo_entidad,
    usuario?.logo_entidad,
  )
  return base
}

/**
 * Calcula spans del encabezado: bloque izquierdo (C+I juntos) | título | entidad.
 */
export function planLayoutLogosEncabezado(logos, cols, { leftSpanOverride = null } = {}) {
  const n = Math.max(Number(cols) || 7, 7)
  const hasC = logoImageId(logos?.contratista) != null
  const hasI = logoImageId(logos?.interventoria) != null
  const hasE = logoImageId(logos?.entidad) != null
  const leftSlots = (hasC ? 1 : 0) + (hasI ? 1 : 0)
  // Bloque único a la izquierda (ambos logos flotan dentro); no 2 cols por logo.
  let leftSpan = leftSlots > 0
    ? Math.max(2, leftSpanOverride != null ? leftSpanOverride : (leftSlots >= 2 ? 4 : 2))
    : 0
  // Reservar al menos 1 col de título y 1 de entidad si aplica (no empujar entidad fuera).
  const minRight = hasE ? 1 : 0
  const minTitle = 1
  leftSpan = Math.min(leftSpan, Math.max(0, n - minTitle - minRight))
  const rightSpan = hasE ? Math.min(2, Math.max(1, n - leftSpan - minTitle)) : 0
  const titleStart = leftSpan + 1
  const titleEnd = Math.max(titleStart, n - rightSpan)
  const entidadStart = hasE ? titleEnd + 1 : null

  return {
    cols: n,
    leftSpan,
    rightSpan,
    titleStart,
    titleEnd,
    entidadStart,
    hasContratista: hasC,
    hasInterventoria: hasI,
    hasEntidad: hasE,
    entidadLogo: hasE ? logos.entidad : null,
    logoContratista: hasC ? logos.contratista : null,
    logoInterventoria: hasI ? logos.interventoria : null,
    tieneLogo: leftSlots > 0 || hasE,
  }
}

/** Normaliza id numérico legacy o descriptor { imageId, natW, natH }. */
export function logoImageId(logo) {
  if (logo == null) return null
  if (typeof logo === 'number') return logo
  if (typeof logo === 'object' && logo.imageId != null) return logo.imageId
  return null
}

export function logoNatSize(logo) {
  if (logo && typeof logo === 'object') {
    return {
      natW: logo.natW || null,
      natH: logo.natH || null,
    }
  }
  return { natW: null, natH: null }
}
