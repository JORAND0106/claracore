/** Fusiona estructura WBS con costos de una versión de presupuesto (solo visualización). */

function mapItemFromPpto(it) {
  return {
    item: it.item,
    descripcion: it.descripcion || '',
    cant_total: Number(it.cantidad) || 0,
    und: it.und || '?',
    vlr_unitario: Number(it.precio_unitario) || 0,
    costo_directo: Number(it.subtotal) || 0,
  }
}

function buildAgrupadorFromOverlay(overlay) {
  const items = (overlay.items || []).map(mapItemFromPpto)
  const cantTotal = items.reduce((s, x) => s + (Number(x.cant_total) || 0), 0)
  return {
    agrupador_id: overlay.agrupador_id,
    agrupador_nombre: overlay.agrupador_nombre || overlay.nombre || '',
    codigo_wbs: overlay.codigo_wbs || '',
    orden: Number(overlay.orden) || 0,
    costo_directo: Number(overlay.costo_directo) || 0,
    cant_total: cantTotal,
    items,
  }
}

export function mergeEstructuraConCostosPpto(estructuraPorCapitulo, pptoCostos) {
  if (!pptoCostos || (!pptoCostos.agrupadores?.length && !pptoCostos.sin_agrupador?.items?.length)) {
    return estructuraPorCapitulo
  }

  const byAg = new Map()
  for (const ag of pptoCostos.agrupadores || []) {
    byAg.set(`${String(ag.capitulo || '').trim()}\0${ag.agrupador_id}`, ag)
  }

  const sinByCap = new Map()
  for (const it of pptoCostos.sin_agrupador?.items || []) {
    const cap = String(it.capitulo || '').trim()
    if (!cap) continue
    if (!sinByCap.has(cap)) sinByCap.set(cap, [])
    sinByCap.get(cap).push(mapItemFromPpto(it))
  }

  const out = {}
  const caps = new Set([...Object.keys(estructuraPorCapitulo || {}), ...sinByCap.keys()])
  for (const ag of pptoCostos.agrupadores || []) {
    const cap = String(ag.capitulo || '').trim()
    if (cap) caps.add(cap)
  }

  for (const cap of caps) {
    const base = estructuraPorCapitulo[cap] || { capitulo: cap, agrupadores: [], sin_agrupador: [] }
    const mergedById = new Map()

    for (const ag of base.agrupadores || []) {
      const key = `${cap}\0${ag.agrupador_id}`
      const overlay = byAg.get(key)
      if (!overlay) {
        mergedById.set(ag.agrupador_id, ag)
        continue
      }
      const overlayItems = (overlay.items || []).map(mapItemFromPpto)
      const items = overlayItems.length ? overlayItems : ag.items || []
      const cantTotal = items.reduce((s, x) => s + (Number(x.cant_total) || 0), 0)
      mergedById.set(ag.agrupador_id, {
        ...ag,
        costo_directo: Number(overlay.costo_directo) || Number(ag.costo_directo) || 0,
        cant_total: cantTotal || Number(ag.cant_total) || 0,
        items,
      })
    }

    for (const [key, overlay] of byAg) {
      const [capKey, agIdRaw] = key.split('\0')
      if (capKey !== cap) continue
      const agId = Number(agIdRaw)
      if (mergedById.has(agId)) continue
      mergedById.set(agId, buildAgrupadorFromOverlay(overlay))
    }

    const agrupadores = [...mergedById.values()].sort(
      (a, b) =>
        (Number(a.orden) || 0) - (Number(b.orden) || 0) ||
        String(a.codigo_wbs || '').localeCompare(String(b.codigo_wbs || '')) ||
        String(a.agrupador_nombre || '').localeCompare(String(b.agrupador_nombre || '')),
    )

    const sinOverlay = sinByCap.get(cap)
    const sinAgrupador = sinOverlay?.length
      ? sinOverlay.sort((a, b) => String(a.item).localeCompare(String(b.item), undefined, { numeric: true }))
      : base.sin_agrupador || []

    out[cap] = { ...base, capitulo: cap, agrupadores, sin_agrupador: sinAgrupador }
  }

  return out
}

export function defaultPptoVersionAnalisisId(versiones) {
  const vigente = (versiones || []).find((v) => v.es_vigente)
  return vigente?.id ? String(vigente.id) : null
}

export function pptoVigenteAprobada(versiones) {
  return (versiones || []).find((v) => v.es_vigente_aprobada) || null
}
