/** Estado global de versión activa (biblioteca paralela) por contrato. */

const STORAGE_PREFIX = 'ppto_version_activa_'

export function pptoVersionActivaStorageKey(contratoId) {
  return `${STORAGE_PREFIX}${contratoId}`
}

/** @typedef {{ id: string, etiqueta: string, numero_version?: number }} PptoVersionActiva */

/** @returns {PptoVersionActiva | null} */
export function pptoLeerVersionActiva(contratoId) {
  if (!contratoId || typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(pptoVersionActivaStorageKey(contratoId))
    if (!raw) return null
    const o = JSON.parse(raw)
    if (!o?.id) return null
    return {
      id: String(o.id),
      etiqueta: String(o.etiqueta || o.numero_version || 'Versión'),
      numero_version: o.numero_version != null ? Number(o.numero_version) : undefined,
    }
  } catch {
    return null
  }
}

/** @param {PptoVersionActiva | null} version */
export function pptoGuardarVersionActiva(contratoId, version) {
  if (!contratoId || typeof window === 'undefined') return
  const key = pptoVersionActivaStorageKey(contratoId)
  if (!version?.id) {
    window.sessionStorage.removeItem(key)
    return
  }
  window.sessionStorage.setItem(
    key,
    JSON.stringify({
      id: String(version.id),
      etiqueta: String(version.etiqueta || ''),
      numero_version: version.numero_version,
    }),
  )
}

/**
 * Endpoints del módulo presupuesto según modo vivo vs biblioteca de versión.
 * @param {{ API: string, contratoId: number|string, versionActiva?: PptoVersionActiva | null }} ctx
 */
export function buildPptoEndpoints({ API, contratoId, versionActiva }) {
  const cid = contratoId
  const vid = versionActiva?.id ? String(versionActiva.id) : null
  const bib = vid ? 'biblioteca=1' : ''
  const bibAmp = (qs) => {
    if (!vid) return qs || ''
    const b = 'biblioteca=1'
    if (!qs) return `?${b}`
    return qs.startsWith('?') ? `${qs}&${b}` : `?${qs}&${b}`
  }

  if (!vid) {
    const base = `${API}/presupuesto/${cid}`
    return {
      mode: 'vivo',
      versionId: null,
      versionActiva: null,
      list: `${base}`,
      conteo: `${base}/conteo`,
      item: (id) => `${API}/presupuesto/item/${id}`,
      itemDarBaja: (id) => `${API}/presupuesto/item/${id}/dar-baja`,
      itemRestaurar: (id) => `${API}/presupuesto/item/${id}/restaurar`,
      capitulosLista: `${base}/capitulos-lista`,
      itemsLista: `${base}/items-lista`,
      panelValidacion: `${base}/panel-validacion-interv`,
      bulk: `${base}/bulk`,
      bulkValidar: `${base}/bulk-validar`,
      bulkRecalcular: `${base}/bulk-recalcular`,
      bulkEstado: `${base}/bulk-estado`,
      bulkPreInterv: `${base}/bulk-pre-interv`,
      bulkTipoEjecucion: `${base}/bulk-tipo-ejecucion`,
      bulkObservacion: `${base}/bulk-observacion`,
      agregarCantidad: `${base}/agregar-cantidad`,
      filtros: `${base}/filtros`,
      graficosUpload: `${base}/graficos/upload`,
      graficosGrupos: `${base}/graficos/grupos`,
      graficosGrupo: (gid) => `${base}/graficos/grupos/${gid}`,
      graficosBuscarRegs: `${base}/graficos/buscar-registros`,
      materializar: null,
      appendBibliotecaQuery: (p) => p,
    }
  }

  const vb = `${API}/presupuesto/${cid}/versiones/${vid}`
  return {
    mode: 'version',
    versionId: vid,
    versionActiva,
    list: `${vb}/items`,
    conteo: `${vb}/conteo`,
    item: (id) => `${vb}/item/${id}`,
    itemDarBaja: (id) => `${vb}/item/${id}/dar-baja`,
    itemRestaurar: (id) => `${vb}/item/${id}/restaurar`,
    capitulosLista: `${vb}/capitulos-lista`,
    itemsLista: `${vb}/items-lista`,
    panelValidacion: `${vb}/panel-validacion-interv`,
    bulk: `${vb}/bulk`,
    bulkValidar: `${API}/presupuesto/${cid}/bulk-validar`,
    bulkRecalcular: `${vb}/bulk-recalcular`,
    bulkEstado: `${vb}/bulk-estado`,
    bulkPreInterv: `${vb}/bulk-pre-interv`,
    bulkTipoEjecucion: `${vb}/bulk-tipo-ejecucion`,
    bulkObservacion: `${vb}/bulk-observacion`,
    agregarCantidad: `${vb}/bulk`,
    filtros: `${API}/presupuesto/${cid}/filtros`,
    // Gráficos de memoria solo se asocian al presupuesto vivo.
    graficosUpload: `${API}/presupuesto/${cid}/graficos/upload`,
    graficosGrupos: `${API}/presupuesto/${cid}/graficos/grupos`,
    materializar: `${vb}/biblioteca/materializar`,
    appendBibliotecaQuery: (p) => {
      if (!p) {
        const u = new URLSearchParams()
        u.set('biblioteca', '1')
        return u
      }
      if (p instanceof URLSearchParams) {
        p.set('biblioteca', '1')
        return p
      }
      const u = new URLSearchParams(String(p).replace(/^\?/, ''))
      u.set('biblioteca', '1')
      return u
    },
    bibAmp,
  }
}

export async function pptoMaterializarBiblioteca(endpoints, token) {
  if (!endpoints?.materializar || !token) return { ok: true }
  const res = await fetch(endpoints.materializar, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const msg = await res.text().catch(() => '')
    throw new Error(msg || `Error ${res.status} al preparar la biblioteca`)
  }
  return res.json()
}
