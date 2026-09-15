/**
 * Flujo secuencial de pestañas del editor de actas.
 *
 * Orden de desbloqueo:
 *   encabezado → orden → asistentes → compromisos → ideas → apartados + acciones
 *
 * Compromisos: no se marca avance mientras exista al menos un compromiso
 * previo con estado_gestion === 'abierto'.
 */

export const FLUJO_TAB_KEYS = ['orden', 'asistentes', 'compromisos', 'ideas']

/** Mapa tab UI → hito de flujo requerido para abrirla. */
export const TAB_REQUIERE_FLUJO = {
  encabezado: null,
  orden: null, // solo encabezado guardado (actaId)
  asistentes: 'orden',
  compromisos: 'asistentes',
  ideas: 'compromisos',
  apartados: 'ideas',
  acciones: 'ideas',
}

/** Al guardar esta pestaña se marca este hito (si la validación pasa). */
export const TAB_MARCA_FLUJO = {
  orden: 'orden',
  asistentes: 'asistentes',
  compromisos: 'compromisos',
  ideas: 'ideas',
}

export function emptyFlujoTabs(partial = null) {
  const base = {
    orden: false,
    asistentes: false,
    compromisos: false,
    ideas: false,
  }
  if (!partial || typeof partial !== 'object') return base
  for (const k of FLUJO_TAB_KEYS) {
    if (partial[k]) base[k] = true
  }
  return base
}

export function parseFlujoTabs(raw) {
  if (!raw) return emptyFlujoTabs()
  if (typeof raw === 'string') {
    try {
      return emptyFlujoTabs(JSON.parse(raw))
    } catch {
      return emptyFlujoTabs()
    }
  }
  return emptyFlujoTabs(raw)
}

/** Compromisos que aún bloquean el avance (estado literal «abierto»). */
export function compromisosQueBloqueanAvance(items = []) {
  if (!Array.isArray(items)) return []
  return items.filter((c) => {
    const est = String(c?.estado_gestion || '').trim().toLowerCase()
    return est === 'abierto'
  })
}

export function puedeAvanzarDesdeCompromisos(items = []) {
  return compromisosQueBloqueanAvance(items).length === 0
}

/**
 * ¿La pestaña `tabId` está desbloqueada?
 * @param {string} tabId
 * @param {{ encabezadoGuardado: boolean, flujo: object }} ctx
 */
export function tabDesbloqueada(tabId, { encabezadoGuardado, flujo }) {
  if (!encabezadoGuardado) return tabId === 'encabezado'
  const req = TAB_REQUIERE_FLUJO[tabId]
  if (req == null) {
    // encabezado u orden: basta con acta creada
    return tabId === 'encabezado' || tabId === 'orden'
  }
  const f = emptyFlujoTabs(flujo)
  return !!f[req]
}

export function mensajeTabBloqueada(tabId, { encabezadoGuardado, flujo, tieneAbiertos } = {}) {
  if (!encabezadoGuardado) {
    return 'Guarde el encabezado primero para definir el elaborador'
  }
  if (tabId === 'ideas' && tieneAbiertos) {
    return 'Cierre o cambie el estado de todos los compromisos abiertos antes de continuar'
  }
  const req = TAB_REQUIERE_FLUJO[tabId]
  const labels = {
    orden: 'Orden del día',
    asistentes: 'Asistentes',
    compromisos: 'Compromisos abiertos',
    ideas: 'Temas y Compromisos',
  }
  if (req && !emptyFlujoTabs(flujo)[req]) {
    return `Guarde «${labels[req] || req}» para habilitar esta pestaña`
  }
  return 'Pestaña bloqueada'
}

/**
 * Tras guardar con éxito en `tabId`, calcula el nuevo flujo y la siguiente pestaña.
 * Devuelve null nextTab si no debe avanzar (p. ej. bloqueo por compromisos abiertos).
 */
export function avanceTrasGuardar(tabId, flujoActual, { compromisPrevios = [] } = {}) {
  const flujo = emptyFlujoTabs(flujoActual)
  const marca = TAB_MARCA_FLUJO[tabId]
  if (tabId === 'compromisos') {
    if (!puedeAvanzarDesdeCompromisos(compromisPrevios)) {
      return {
        ok: false,
        flujo,
        nextTab: null,
        error: 'No puede avanzar mientras existan compromisos en estado «Abierto». Actualice su estado y vuelva a guardar.',
      }
    }
  }
  if (marca) flujo[marca] = true

  const order = ['encabezado', 'orden', 'asistentes', 'compromisos', 'ideas', 'apartados', 'acciones']
  const idx = order.indexOf(tabId)
  let nextTab = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null
  // Tras Temas, apartados y acciones quedan habilitados; avanzar a apartados.
  return { ok: true, flujo, nextTab, error: null }
}

/** Normaliza ítems del orden del día (texto, hecho, expositor). */
export function normalizeOrdenItem(x, keyFn) {
  const key = typeof keyFn === 'function' ? keyFn() : undefined
  if (typeof x !== 'object' || x == null) {
    return {
      texto: String(x || ''),
      hecho: false,
      expositor_nombre: '',
      expositor_usuario_id: null,
      key,
    }
  }
  const expositorId = x.expositor_usuario_id ?? x.expositor_id ?? null
  return {
    texto: x.texto || x.titulo || '',
    hecho: !!(x.hecho || x.checked || x.done),
    expositor_nombre: String(x.expositor_nombre || x.expositor || '').trim(),
    expositor_usuario_id: expositorId != null && Number(expositorId) > 0
      ? Number(expositorId)
      : null,
    key: x.key || key,
  }
}

export function serializeOrdenItems(items = []) {
  return (items || [])
    .filter((x) => (x.texto || '').trim())
    .map((x) => {
      const row = {
        texto: String(x.texto || '').trim(),
        hecho: !!x.hecho,
      }
      const nombre = String(x.expositor_nombre || '').trim()
      if (nombre) row.expositor_nombre = nombre
      const uid = x.expositor_usuario_id
      if (uid != null && Number(uid) > 0) row.expositor_usuario_id = Number(uid)
      return row
    })
}
