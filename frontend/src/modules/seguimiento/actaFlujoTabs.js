/**
 * Flujo secuencial de pestañas del editor de actas.
 *
 * Aplica SOLO en el primer diligenciamiento (acta nueva, aún no liberada):
 *   encabezado → orden → asistentes → compromisos → ideas → Vista previa
 *
 * Al guardar Temas (ideas) se marca `liberado` y todo el documento queda
 * editable sin restricción de orden. Las actas existentes se migran con
 * liberado=true.
 *
 * Compromisos: en primer diligenciamiento no se avanza mientras exista al
 * menos un compromiso previo con estado_gestion === 'abierto'.
 */

export const FLUJO_TAB_KEYS = ['orden', 'asistentes', 'compromisos', 'ideas']

/** Mapa tab UI → hito de flujo requerido para abrirla (solo si !liberado). */
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
    liberado: false,
  }
  if (!partial || typeof partial !== 'object') return base
  for (const k of FLUJO_TAB_KEYS) {
    if (partial[k]) base[k] = true
  }
  // ideas completado (= llegó a Vista previa) o flag explícito → edición libre
  if (partial.liberado || base.ideas) base.liberado = true
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

export function flujoLiberado(flujo) {
  return !!emptyFlujoTabs(flujo).liberado
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
  const f = emptyFlujoTabs(flujo)
  // Tras Vista previa (o actas legacy liberadas): todo el documento libre.
  if (f.liberado) return true
  const req = TAB_REQUIERE_FLUJO[tabId]
  if (req == null) {
    // encabezado u orden: basta con acta creada
    return tabId === 'encabezado' || tabId === 'orden'
  }
  return !!f[req]
}

export function mensajeTabBloqueada(tabId, { encabezadoGuardado, flujo, tieneAbiertos } = {}) {
  if (!encabezadoGuardado) {
    return 'Guarde el encabezado primero para definir el elaborador'
  }
  if (flujoLiberado(flujo)) return ''
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

  // Edición libre: no aplicar gate de compromisos ni forzar hitos.
  if (flujo.liberado) {
    const orderLibre = ['encabezado', 'orden', 'asistentes', 'compromisos', 'ideas', 'apartados', 'acciones']
    const idxL = orderLibre.indexOf(tabId)
    const nextLibre = idxL >= 0 && idxL < orderLibre.length - 1 ? orderLibre[idxL + 1] : null
    return { ok: true, flujo, nextTab: nextLibre, error: null }
  }

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

  // Al completar Temas se libera el documento (llegó a Vista previa).
  if (tabId === 'ideas' || flujo.ideas) {
    flujo.ideas = true
    flujo.liberado = true
  }

  const order = ['encabezado', 'orden', 'asistentes', 'compromisos', 'ideas', 'apartados', 'acciones']
  const idx = order.indexOf(tabId)
  let nextTab = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null
  // Tras Temas: ir a Vista previa (acciones); apartados también quedan libres por liberado.
  if (tabId === 'ideas') nextTab = 'acciones'
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
