import {
  MAPA_NAVEGACION_GRUPOS,
  MAPA_NAVEGACION_ID_LEGACY,
  MAPA_NAVEGACION_MODULOS,
  MAPA_NAVEGACION_SECCIONES,
  MAPA_NAVEGACION_SUBTEMAS,
} from './mapaNavegacionCatalogo.js'

/**
 * @typedef {{ url: string, caption?: string }} MapaImagen
 * @typedef {{
 *   descripcion?: string,
 *   imagenes?: MapaImagen[],
 *   videoUrl?: string,
 * }} MapaContenidoSubtema
 * @typedef {{
 *   version?: number,
 *   updated_at?: string|null,
 *   modulos?: Record<string, MapaContenidoSubtema>,
 * }} MapaContenidoDoc
 */

function normalizarEntradaContenido(val) {
  if (!val || typeof val !== 'object') {
    return { descripcion: '', imagenes: [], videoUrl: '' }
  }
  const imagenes = Array.isArray(val.imagenes)
    ? val.imagenes
        .filter((img) => img && typeof img === 'object' && String(img.url || '').trim())
        .map((img) => ({
          url: String(img.url).trim(),
          caption: String(img.caption || '').trim(),
        }))
    : []
  return {
    descripcion: String(val.descripcion || '').trim(),
    imagenes,
    videoUrl: String(val.videoUrl || val.video_url || '').trim(),
  }
}

function contenidoPendienteDe(c) {
  return (
    !String(c.descripcion || '').trim()
    && !(c.imagenes || []).length
    && !String(c.videoUrl || '').trim()
  )
}

/**
 * Aplica migración de ids legacy sobre un mapa de contenido crudo.
 * @param {Record<string, any>} modulosIn
 */
export function migrarIdsContenidoMapa(modulosIn) {
  const src = modulosIn && typeof modulosIn === 'object' ? modulosIn : {}
  /** @type {Record<string, any>} */
  const out = { ...src }
  for (const [legacyId, nuevoId] of Object.entries(MAPA_NAVEGACION_ID_LEGACY)) {
    if (!src[legacyId]) continue
    const legacy = normalizarEntradaContenido(src[legacyId])
    const actual = normalizarEntradaContenido(out[nuevoId])
    // Solo rellena el destino si aún está vacío (no pisa contenido nuevo).
    if (contenidoPendienteDe(actual) && !contenidoPendienteDe(legacy)) {
      out[nuevoId] = legacy
    }
  }
  return out
}

/** Normaliza un documento de contenido (JSON/API). */
export function normalizarContenidoMapa(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const modulosIn = migrarIdsContenidoMapa(
    src.modulos && typeof src.modulos === 'object' ? src.modulos : {},
  )
  /** @type {Record<string, MapaContenidoSubtema>} */
  const modulos = {}
  for (const [id, val] of Object.entries(modulosIn)) {
    if (!val || typeof val !== 'object') continue
    modulos[id] = normalizarEntradaContenido(val)
  }
  return {
    version: Number(src.version) || 1,
    updated_at: src.updated_at || null,
    modulos,
  }
}

/** Une catálogo fijo + contenido editable. Sin deep links. */
export function fusionarMapaNavegacion(contenidoRaw) {
  const contenido = normalizarContenidoMapa(contenidoRaw)
  const filas = MAPA_NAVEGACION_SUBTEMAS.map((m) => {
    const c = contenido.modulos[m.id] || {}
    return {
      ...m,
      descripcion: c.descripcion || '',
      imagenes: Array.isArray(c.imagenes) ? c.imagenes : [],
      videoUrl: c.videoUrl || '',
      contenidoPendiente: contenidoPendienteDe(c),
    }
  }).sort((a, b) => a.orden - b.orden)

  const secciones = (MAPA_NAVEGACION_SECCIONES.length
    ? MAPA_NAVEGACION_SECCIONES
    : MAPA_NAVEGACION_GRUPOS
  ).map((g) => ({
    ...g,
    modulos: filas.filter((m) => m.grupo === g.id),
  })).filter((g) => g.modulos.length > 0)

  return {
    version: contenido.version,
    updated_at: contenido.updated_at,
    grupos: secciones,
    secciones,
    modulos: filas,
    subtemas: filas,
  }
}

/** Documento vacío listo para editar (todas las claves del catálogo). */
export function contenidoVacioDesdeCatalogo() {
  /** @type {Record<string, MapaContenidoSubtema>} */
  const modulos = {}
  for (const m of MAPA_NAVEGACION_SUBTEMAS) {
    modulos[m.id] = { descripcion: '', imagenes: [], videoUrl: '' }
  }
  return { version: 1, updated_at: null, modulos }
}

/** Mezcla contenido parcial sobre la plantilla completa del catálogo. */
export function contenidoEditableCompleto(contenidoRaw) {
  const base = contenidoVacioDesdeCatalogo()
  const norm = normalizarContenidoMapa(contenidoRaw)
  for (const id of Object.keys(base.modulos)) {
    if (norm.modulos[id]) base.modulos[id] = norm.modulos[id]
  }
  return {
    version: norm.version || 1,
    updated_at: norm.updated_at,
    modulos: base.modulos,
  }
}

export { MAPA_NAVEGACION_MODULOS, MAPA_NAVEGACION_SUBTEMAS }
