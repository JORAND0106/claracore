/**
 * Resolución y layout de logos para export Excel de Presupuesto.
 * Contratista e interventoría: mismo tamaño; entidad a la derecha.
 */

/** @param {...(string|null|undefined)} candidates */
export function pickLogoUrl(...candidates) {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return null
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
  const hasC = logos?.contratista != null
  const hasI = logos?.interventoria != null
  const hasE = logos?.entidad != null
  const leftSlots = (hasC ? 1 : 0) + (hasI ? 1 : 0)
  const leftSpan = leftSlots * 2
  const rightSpan = hasE ? Math.min(2, Math.max(1, n - leftSpan - 2)) : 0
  const titleStart = leftSpan + 1
  const titleEnd = Math.max(titleStart, n - rightSpan)
  const entidadStart = hasE ? titleEnd + 1 : null

  /** @type {{ role: 'contratista'|'interventoria', colStart: number, imageId: number }[]} */
  const leftLogos = []
  let cursor = 1
  if (hasC) {
    leftLogos.push({ role: 'contratista', colStart: cursor, imageId: logos.contratista })
    cursor += 2
  }
  if (hasI) {
    leftLogos.push({ role: 'interventoria', colStart: cursor, imageId: logos.interventoria })
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
    entidadImageId: hasE ? logos.entidad : null,
    tieneLogo: leftSlots > 0 || hasE,
  }
}
