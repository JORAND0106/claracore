/** @typedef {{ url: string, numero?: number|null, creado_en?: string|null, origen?: string|null }} SicoeGraficoEntrada */

/**
 * Historial de gráficos en so_registros.graficos_historial (jsonb).
 * Si no hay historial pero sí grafico_url, se trata como un único ítem legacy.
 */
export function parseGraficosHistorial(reg) {
  const raw = reg?.graficos_historial
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
export function listaGraficosRegistro(reg) {
  const hist = parseGraficosHistorial(reg)
  if (hist.length) {
    return [...hist].sort((a, b) => {
      const ta = a.creado_en ? Date.parse(a.creado_en) : 0
      const tb = b.creado_en ? Date.parse(b.creado_en) : 0
      return ta - tb
    })
  }
  const url = reg?.grafico_url
  if (url) {
    return [{
      url,
      numero: reg.grafico_numero ?? null,
      creado_en: reg.updated_at || reg.created_at || null,
      origen: 'legacy',
    }]
  }
  return []
}

export function etiquetaOrigenGrafico(origen) {
  if (origen === 'mapa') return 'Plano automático'
  if (origen === 'manual') return 'Carga manual'
  if (origen === 'esquema') return 'Esquema a mano'
  if (origen === 'galeria') return 'Galería'
  return 'Gráfico'
}

export function fmtFechaGrafico(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

/** Añade entrada al historial (sin duplicar misma URL). */
export function agregarEntradaGraficoHistorial(hist, entrada) {
  const base = Array.isArray(hist) ? hist.filter((x) => x && x.url !== entrada.url) : []
  return [...base, entrada]
}

/** Huella de localización para agrupar registros en lotes al reabrir borradores. */
export function sicoeLocFingerprint(r) {
  return [
    r?.pk_id_id ?? r?.pkSeleccionado?.id ?? '',
    r?.abs_inicio ?? '',
    r?.abs_final ?? '',
    r?.nodo_ini ?? '',
    r?.nodo_fin ?? '',
    r?.coord_lat ?? '',
    r?.coord_lng ?? '',
  ].join('|')
}

/** Asigna loteLocIdx inferido por localización distinta (modo multiple). */
export function inferLoteLocIdxEnRegistros(regs) {
  const seen = new Map()
  let next = 0
  return (regs || []).map((r) => {
    const k = sicoeLocFingerprint(r)
    if (!seen.has(k)) seen.set(k, next++)
    return { ...r, loteLocIdx: seen.get(k) }
  })
}

/** Mapa loteLocIdx → historial de gráficos (desde registros ya guardados). */
export function graficosPorLoteFromRegistros(regs) {
  /** @type {Record<number, SicoeGraficoEntrada[]>} */
  const map = {}
  for (const r of regs || []) {
    const idx = r.loteLocIdx ?? 0
    const hist = listaGraficosRegistro(r)
    if (!hist.length) continue
    const prev = map[idx] || []
    if (hist.length >= prev.length) map[idx] = hist
  }
  return map
}

/** Campos grafico_* listos para API a partir del historial del lote del registro. */
export function graficosPayloadDesdeHistorial(hist) {
  const lista = Array.isArray(hist) ? hist.filter((x) => x && x.url) : []
  if (!lista.length) {
    return {
      grafico_url: null,
      grafico_numero: null,
      grafico_descripcion: null,
      graficos_historial: [],
    }
  }
  const ult = lista[lista.length - 1]
  return {
    grafico_url: ult.url,
    grafico_numero: ult.numero ?? null,
    grafico_descripcion: 'Gráfico del registro',
    graficos_historial: lista,
  }
}

/**
 * Convierte URL/blob/data URI a data URI para cargarlo en EsquemaEditorModal
 * sin tainting del canvas (necesario al reabrir un gráfico remoto del registro).
 * Si no se puede leer (CORS, etc.), devuelve null → editor en blanco.
 */
export async function urlADataUriParaEsquema(src) {
  if (src == null) return null
  const s = String(src).trim()
  if (!s || s === 'null' || s === 'undefined') return null
  if (s.startsWith('data:')) return s

  const blobToDataUri = (blob) => new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(typeof fr.result === 'string' ? fr.result : null)
    fr.onerror = () => reject(fr.error || new Error('FileReader failed'))
    fr.readAsDataURL(blob)
  })

  try {
    const res = await fetch(s, { mode: 'cors', credentials: 'omit' })
    if (res.ok) {
      const blob = await res.blob()
      if (blob && blob.size > 0) return await blobToDataUri(blob)
    }
  } catch {
    /* fallback Image + canvas */
  }

  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth || img.width || 1
        c.height = img.naturalHeight || img.height || 1
        const ctx = c.getContext('2d')
        ctx.drawImage(img, 0, 0)
        resolve(c.toDataURL('image/png'))
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = s
  })
}

/** PNG data URI del editor → File listo para upload-grafico. */
export async function dataUriEsquemaAFile(dataUrl, nombreBase = 'esquema') {
  if (!dataUrl) return null
  const resp = await fetch(dataUrl)
  const blob = await resp.blob()
  return new File(
    [blob],
    `${nombreBase}_${Date.now()}.png`,
    { type: blob.type || 'image/png' },
  )
}
