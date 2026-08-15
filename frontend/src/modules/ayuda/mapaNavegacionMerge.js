import {
  MAPA_NAVEGACION_GRUPOS,
  MAPA_NAVEGACION_MODULOS,
} from './mapaNavegacionCatalogo.js'

/**
 * @typedef {{ url: string, caption?: string }} MapaImagen
 * @typedef {{ descripcion?: string, imagenes?: MapaImagen[] }} MapaContenidoModulo
 * @typedef {{ version?: number, updated_at?: string|null, modulos?: Record<string, MapaContenidoModulo> }} MapaContenidoDoc
 */

/** Normaliza un documento de contenido (JSON/API). */
export function normalizarContenidoMapa(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const modulosIn = src.modulos && typeof src.modulos === 'object' ? src.modulos : {}
  /** @type {Record<string, MapaContenidoModulo>} */
  const modulos = {}
  for (const [id, val] of Object.entries(modulosIn)) {
    if (!val || typeof val !== 'object') continue
    const imagenes = Array.isArray(val.imagenes)
      ? val.imagenes
          .filter((img) => img && typeof img === 'object' && String(img.url || '').trim())
          .map((img) => ({
            url: String(img.url).trim(),
            caption: String(img.caption || '').trim(),
          }))
      : []
    modulos[id] = {
      descripcion: String(val.descripcion || '').trim(),
      imagenes,
    }
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
  const filas = MAPA_NAVEGACION_MODULOS.map((m) => {
    const c = contenido.modulos[m.id] || {}
    return {
      ...m,
      descripcion: c.descripcion || '',
      imagenes: Array.isArray(c.imagenes) ? c.imagenes : [],
      contenidoPendiente: !String(c.descripcion || '').trim() && !(c.imagenes || []).length,
    }
  }).sort((a, b) => a.orden - b.orden)

  const porGrupo = MAPA_NAVEGACION_GRUPOS.map((g) => ({
    ...g,
    modulos: filas.filter((m) => m.grupo === g.id),
  })).filter((g) => g.modulos.length > 0)

  return {
    version: contenido.version,
    updated_at: contenido.updated_at,
    grupos: porGrupo,
    modulos: filas,
  }
}

/** Documento vacío listo para editar (todas las claves del catálogo). */
export function contenidoVacioDesdeCatalogo() {
  /** @type {Record<string, MapaContenidoModulo>} */
  const modulos = {}
  for (const m of MAPA_NAVEGACION_MODULOS) {
    modulos[m.id] = { descripcion: '', imagenes: [] }
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
