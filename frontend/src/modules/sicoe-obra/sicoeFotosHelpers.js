/** @typedef {{ url: string, numero?: number|null, creado_en?: string|null, origen?: string|null }} SicoeFotoEntrada */

/**
 * Historial de fotos en so_registros.fotos_historial (jsonb).
 * Si no hay historial pero sí foto_url, se trata como un único ítem legacy.
 */
export function parseFotosHistorial(reg) {
  const raw = reg?.fotos_historial
  if (Array.isArray(raw)) return raw.filter((x) => x && x.url)
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const j = JSON.parse(raw)
      return Array.isArray(j) ? j.filter((x) => x && x.url) : []
    } catch {
      return []
    }
  }
  return []
}

/** Lista ordenada por fecha (más antiguo → más reciente) para carrusel. */
export function listaFotosRegistro(reg) {
  const hist = parseFotosHistorial(reg)
  if (hist.length) {
    return [...hist].sort((a, b) => {
      const ta = a.creado_en ? Date.parse(a.creado_en) : 0
      const tb = b.creado_en ? Date.parse(b.creado_en) : 0
      return ta - tb
    })
  }
  const url = reg?.foto_url
  if (url) {
    return [{
      url,
      numero: reg.foto_numero ?? null,
      creado_en: reg.updated_at || reg.created_at || null,
      origen: 'legacy',
    }]
  }
  return []
}

/** Añade entrada al historial (sin duplicar misma URL). */
export function agregarEntradaFotoHistorial(hist, entrada) {
  const base = Array.isArray(hist) ? hist.filter((x) => x && x.url !== entrada.url) : []
  return [...base, entrada]
}

/**
 * Reemplaza la entrada en `idx` (o la última si idx inválido) sin tocar el resto.
 * Si el historial estaba vacío y había legacy, parte de esa foto.
 */
export function reemplazarEntradaFotoHistorial(hist, idx, entrada) {
  const base = Array.isArray(hist) ? hist.filter((x) => x && x.url) : []
  if (!base.length) return [entrada]
  const i = Number.isFinite(idx) && idx >= 0 && idx < base.length ? idx : base.length - 1
  const next = base.slice()
  next[i] = { ...entrada }
  // Evitar duplicar la misma URL en otra posición
  return next.filter((x, j) => j === i || x.url !== entrada.url)
}

/** Foto activa = la más reciente del historial. */
export function pickPrimaryFotoFromHistorial(hist) {
  const lista = Array.isArray(hist) ? hist.filter((x) => x && x.url) : []
  if (!lista.length) return null
  return lista[lista.length - 1]
}

/** Campos foto_* listos para API a partir del historial. */
export function fotosPayloadDesdeHistorial(hist) {
  const lista = Array.isArray(hist) ? hist.filter((x) => x && x.url) : []
  if (!lista.length) {
    return {
      foto_url: null,
      foto_numero: null,
      foto_descripcion: null,
      fotos_historial: [],
    }
  }
  const prim = pickPrimaryFotoFromHistorial(lista) || lista[lista.length - 1]
  return {
    foto_url: prim.url,
    foto_numero: prim.numero ?? null,
    foto_descripcion: prim.descripcion || '',
    fotos_historial: lista,
  }
}

/** True si la URL aún es un preview local (no persistible). */
export function esFotoPreviewLocal(url) {
  const s = String(url || '').trim()
  return s.startsWith('blob:') || s.startsWith('data:')
}
