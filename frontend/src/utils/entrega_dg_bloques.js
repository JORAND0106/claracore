function parseNum(v) {
  if (v === '' || v == null) return null
  const n = parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function hiDesdeCotaVplus(cota, vplus) {
  const c = parseNum(cota)
  const v = parseNum(vplus)
  if (c == null || v == null) return null
  return c + v
}

export function bloqueAplicableEntrega(bloques, abscisa) {
  if (!bloques?.length) return null
  const ordenados = [...bloques].sort((a, b) => {
    const ia = a.abscisa_inicio ?? -1e18
    const ib = b.abscisa_inicio ?? -1e18
    if (ia !== ib) return ia - ib
    return (a.orden || 0) - (b.orden || 0)
  })
  let aplicable = null
  for (const b of ordenados) {
    if (b.abscisa_inicio == null || b.abscisa_inicio <= abscisa + 1e-9) aplicable = b
  }
  return aplicable
}

export function esInicioBloqueEntrega(bloque, abscisa) {
  if (!bloque) return false
  if (bloque.abscisa_inicio == null) return (bloque.orden || 1) === 1
  return Math.abs(bloque.abscisa_inicio - abscisa) < 1e-6
}

export function abscisaInicioBloque(bloque, matriz, abscisaDesde) {
  if (!bloque) return null
  if (bloque.abscisa_inicio != null) return bloque.abscisa_inicio
  if ((bloque.orden || 1) === 1) {
    return matriz?.[0]?.abscisa ?? abscisaDesde ?? null
  }
  return bloque.abscisa_inicio ?? null
}

export function hiDesdeBloque(bloque) {
  if (!bloque) return null
  const hi = parseNum(bloque.altura_instrumento)
  if (hi != null) return hi
  return hiDesdeCotaVplus(bloque.cota_punto, bloque.v_mas)
}

/** Altura instrumental vigente en la abscisa (bloque + borrador en vivo del inicio de bloque). */
export function resolveHiEntrega({
  bloques,
  matriz,
  abscisa,
  abscisaDesde,
  instDraft = {},
  instrumentoFallback = null,
}) {
  const b = bloqueAplicableEntrega(bloques, abscisa)
  if (!b) {
    return parseNum(instrumentoFallback?.altura_instrumento)
  }

  const abInicio = abscisaInicioBloque(b, matriz, abscisaDesde)
  const esCambio = esInicioBloqueEntrega(b, abscisa)

  if (esCambio) {
    const d = instDraft[String(abscisa)]
    const live = d ? hiDesdeCotaVplus(d.cota_punto, d.v_mas) : null
    if (live != null) return live
  }

  if (abInicio != null && String(abInicio) !== String(abscisa)) {
    const dStart = instDraft[String(abInicio)]
    const liveStart = dStart ? hiDesdeCotaVplus(dStart.cota_punto, dStart.v_mas) : null
    if (liveStart != null) return liveStart
  }

  const fromBloque = hiDesdeBloque(b)
  if (fromBloque != null) return fromBloque

  return parseNum(instrumentoFallback?.altura_instrumento)
}

export function interpLinealOrdenada(puntos, ordenada) {
  if (!puntos?.length) return null
  const pts = [...puntos].sort((a, b) => a[0] - b[0])
  const o = Number(ordenada)
  if (o <= pts[0][0]) return pts[0][1]
  if (o >= pts[pts.length - 1][0]) return pts[pts.length - 1][1]
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [o1, c1] = pts[i]
    const [o2, c2] = pts[i + 1]
    if (o1 <= o && o <= o2) {
      if (Math.abs(o2 - o1) < 1e-12) return c1
      return c1 + ((o - o1) / (o2 - o1)) * (c2 - c1)
    }
  }
  return null
}

/** Cota ref. (campo o diseño) en una ordenada; interpola si el sobre-ancho no coincide con la entrega ref. */
export function cotaReferenciaEnOrdenada(f, col, ordenadasCols, origen = 'campo') {
  const map = origen === 'campo' ? f.referencia_campo : f.referencia
  const direct = map?.[col.key]
  if (direct != null && direct !== '') return Number(direct)
  const pts = ordenadasCols
    .map((c) => {
      const v = map?.[c.key]
      return v != null && v !== '' ? [c.ordenada, Number(v)] : null
    })
    .filter(Boolean)
  return interpLinealOrdenada(pts, col.ordenada)
}

export function matrizConBloquesEntrega(matriz, bloques) {
  return matriz.map((f) => {
    const b = bloqueAplicableEntrega(bloques, f.abscisa)
    const esCambio = esInicioBloqueEntrega(b, f.abscisa)
    const hi = hiDesdeBloque(b)
    return {
      ...f,
      bloque_id: b?.id ?? f.bloque_id,
      instrumento: {
        ...(f.instrumento || {}),
        bloque_id: b?.id ?? f.instrumento?.bloque_id,
        es_cambio: esCambio,
        altura_instrumento: hi ?? f.instrumento?.altura_instrumento,
        punto_biblioteca_id: esCambio
          ? (b?.punto_biblioteca_id ?? f.instrumento?.punto_biblioteca_id)
          : f.instrumento?.punto_biblioteca_id,
        nombre_punto: esCambio
          ? (b?.nombre_punto ?? f.instrumento?.nombre_punto)
          : f.instrumento?.nombre_punto,
        v_mas: esCambio ? (b?.v_mas ?? f.instrumento?.v_mas) : f.instrumento?.v_mas,
        cota_punto: esCambio
          ? (b?.cota_punto ?? f.instrumento?.cota_punto)
          : f.instrumento?.cota_punto,
      },
    }
  })
}
