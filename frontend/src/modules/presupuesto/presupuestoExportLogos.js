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

function rowNativeOffCentered(rowHeightPt, logoHeightPx) {
  const rowEmu = pointsToEmu(rowHeightPt)
  const logoEmu = pxToEmu(logoHeightPx)
  return {
    nativeRow: 0,
    nativeRowOff: Math.max(0, Math.floor((rowEmu - logoEmu) / 2)),
  }
}

function makeFloatingTl(cursorPx, colWidthsPx, rowHeightPt, logoHeightPx) {
  return {
    ...pxOffsetToNativeCol(cursorPx, colWidthsPx),
    ...rowNativeOffCentered(rowHeightPt, logoHeightPx),
  }
}

/**
 * Posiciones flotantes del par C+I: interventoría justo a la derecha del contratista.
 *
 * @param {{ logoC?: object|null, logoI?: object|null, colChars?: number, gapPx?: number, padLeftPx?: number, rowHeightPt?: number }} opts
 */
export function posicionParLogosFlotante({
  logoC = null,
  logoI = null,
  colChars = LOGO_LEFT_COL_CHARS,
  gapPx = LOGO_PAIR_GAP_PX,
  padLeftPx = LOGO_PAIR_PAD_LEFT_PX,
  rowHeightPt = 54,
} = {}) {
  const colPx = excelColWidthToPx(colChars)
  const colWidthsPx = [colPx]

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
      tl: makeFloatingTl(cursorPx, colWidthsPx, rowHeightPt, sizeC.height),
      ext: { width: sizeC.width, height: sizeC.height },
    }
    cursorPx += sizeC.width
  }
  if (sizeI) {
    if (sizeC) cursorPx += gapPx
    interventoria = {
      tl: makeFloatingTl(cursorPx, colWidthsPx, rowHeightPt, sizeI.height),
      ext: { width: sizeI.width, height: sizeI.height },
    }
    cursorPx += sizeI.width
  }

  const pairWidthPx = cursorPx + padLeftPx
  const leftSpanCols = Math.max(2, Math.ceil(pairWidthPx / colPx))

  return { contratista, interventoria, pairWidthPx, leftSpanCols, colChars, colPx }
}

/**
 * Posición del logo de entidad a la derecha (altura 1.8 cm, ancho proporcional).
 * @param {{ logo?: object|null, colStart: number, slotCols?: number, colChars?: number, rowHeightPt?: number }} opts
 */
export function posicionLogoEntidadFlotante({
  logo = null,
  colStart,
  slotCols = 2,
  colChars = 12,
  rowHeightPt = 54,
} = {}) {
  if (logoImageId(logo) == null) return null
  const { natW, natH } = logoNatSize(logo)
  const size = sizeLogoFixedHeight(natW, natH)
  const colPx = excelColWidthToPx(colChars)
  const slots = Math.max(1, slotCols)
  const slotWidthPx = slots * colPx
  const padX = Math.max(0, (slotWidthPx - size.width) / 2)
  const absolutePx = (Math.max(1, colStart) - 1) * colPx + padX
  const colWidthsPx = Array.from({ length: Math.max(1, colStart) + slots }, () => colPx)
  return {
    tl: makeFloatingTl(absolutePx, colWidthsPx, rowHeightPt, size.height),
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
  const leftSpan = leftSlots > 0
    ? Math.max(2, leftSpanOverride != null ? leftSpanOverride : (leftSlots >= 2 ? 4 : 2))
    : 0
  const rightSpan = hasE ? Math.min(2, Math.max(1, n - leftSpan - 2)) : 0
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
