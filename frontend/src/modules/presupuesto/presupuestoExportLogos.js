/**
 * Resolución y layout de logos para export Excel de Presupuesto.
 * Contratista e interventoría: misma caja máxima; entidad a la derecha.
 * Escalado proporcional (contain) — nunca deformar.
 */

/** Caja máx. compartida contratista / interventoría (px). */
export const LOGO_PAR_MAX_W = 96
export const LOGO_PAR_MAX_H = 40
/** Caja máx. entidad (px). */
export const LOGO_ENTIDAD_MAX_W = 104
export const LOGO_ENTIDAD_MAX_H = 40

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
 * Escala contain dentro de maxW×maxH conservando proporción.
 * @returns {{ width: number, height: number, offsetX: number, offsetY: number }}
 */
export function fitLogoContain(natW, natH, maxW, maxH) {
  const mw = Math.max(1, Number(maxW) || 1)
  const mh = Math.max(1, Number(maxH) || 1)
  const nw = Math.max(1, Number(natW) || mw)
  const nh = Math.max(1, Number(natH) || mh)
  const scale = Math.min(mw / nw, mh / nh, 1)
  const width = Math.max(1, Math.round(nw * scale))
  const height = Math.max(1, Math.round(nh * scale))
  return {
    width,
    height,
    offsetX: Math.max(0, (mw - width) / 2),
    offsetY: Math.max(0, (mh - height) / 2),
  }
}

/**
 * Posición flotante (fracción de columna/fila) centrada en un hueco del encabezado.
 * ExcelJS con `ext` fija el tamaño en EMUs (no se deforma al cambiar columnas).
 *
 * @param {{ colStart: number, slotCols?: number, maxW: number, maxH: number, natW?: number|null, natH?: number|null, rowHeightPt?: number }} opts
 * colStart es 1-based (columna Excel).
 */
export function posicionLogoFlotante({
  colStart,
  slotCols = 2,
  maxW,
  maxH,
  natW = null,
  natH = null,
  rowHeightPt = 54,
}) {
  const fit = fitLogoContain(natW || maxW, natH || maxH, maxW, maxH)
  const slots = Math.max(1, slotCols)
  // Desplazamiento horizontal como fracción del bloque de columnas del hueco.
  const col = (colStart - 1) + (fit.offsetX / maxW) * slots
  // Altura de fila ~ pt→px (96dpi): pt * 96/72
  const rowPx = Math.max(1, rowHeightPt * (96 / 72))
  const row = Math.max(0, fit.offsetY / rowPx)
  return {
    tl: { col, row },
    ext: { width: fit.width, height: fit.height },
    fit,
  }
}

/**
 * Une meta del GET /contratos, fila en usuario._contratos y logos de sesión.
 * @param {object|null|undefined} metaContrato
 * @param {object|null|undefined} usuario
 * @param {number|string|null|undefined} contratoId
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
 * Calcula spans del encabezado: [C|I|título|E].
 * Cada logo izquierdo ocupa 2 columnas propias (no se comparten en un solo merge).
 * @param {{ contratista?: number|null, interventoria?: number|null, entidad?: number|null }|null} logos
 * @param {number} cols
 */
export function planLayoutLogosEncabezado(logos, cols) {
  const n = Math.max(Number(cols) || 7, 7)
  // imageId 0 es válido → no usar truthiness.
  const hasC = logoImageId(logos?.contratista) != null
  const hasI = logoImageId(logos?.interventoria) != null
  const hasE = logoImageId(logos?.entidad) != null
  const leftSlots = (hasC ? 1 : 0) + (hasI ? 1 : 0)
  const leftSpan = leftSlots * 2
  const rightSpan = hasE ? Math.min(2, Math.max(1, n - leftSpan - 2)) : 0
  const titleStart = leftSpan + 1
  const titleEnd = Math.max(titleStart, n - rightSpan)
  const entidadStart = hasE ? titleEnd + 1 : null

  /** @type {{ role: 'contratista'|'interventoria', colStart: number, logo: any }[]} */
  const leftLogos = []
  let cursor = 1
  if (hasC) {
    leftLogos.push({ role: 'contratista', colStart: cursor, logo: logos.contratista })
    cursor += 2
  }
  if (hasI) {
    leftLogos.push({ role: 'interventoria', colStart: cursor, logo: logos.interventoria })
    cursor += 2
  }

  return {
    cols: n,
    leftSpan,
    rightSpan,
    titleStart,
    titleEnd,
    entidadStart,
    leftLogos,
    hasEntidad: hasE,
    entidadLogo: hasE ? logos.entidad : null,
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
