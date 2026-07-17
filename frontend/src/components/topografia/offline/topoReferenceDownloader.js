/**
 * Descarga datos de referencia Topografía al IndexedDB local.
 */
import { API_BASE } from '../../../apiBase'
import {
  entityDetailKey,
  setTopoSyncMeta,
  topoDb,
} from './topoDb'

async function fetchJson(contratoId, path, token) {
  const res = await fetch(`${API_BASE}/topografia/${contratoId}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.detail || `HTTP ${res.status} en ${path}`)
  }
  return res.json()
}

function putList(table, contratoId, rows, mapRow = (r) => r) {
  const cid = Number(contratoId)
  return table.bulkPut((rows || []).map((r) => mapRow({ ...r, contrato_id: cid })))
}

export async function downloadTopoReferenceData(contratoId, token) {
  const cid = Number(contratoId)
  const [
    puntos,
    puntosVerificados,
    poligonales,
    poligonalesSelladas,
    nivelaciones,
    newpoints,
    entregas,
    ejes,
    equipos,
    tuberias,
    areas,
  ] = await Promise.all([
    fetchJson(contratoId, '/puntos', token),
    fetchJson(contratoId, '/puntos/verificados', token),
    fetchJson(contratoId, '/poligonales', token),
    fetchJson(contratoId, '/poligonales/selladas', token),
    fetchJson(contratoId, '/nivelaciones', token),
    fetchJson(contratoId, '/newpoints', token),
    fetchJson(contratoId, '/entrega-dg', token),
    fetchJson(contratoId, '/diseno-geometrico/ejes', token),
    fetchJson(contratoId, '/equipos', token),
    fetchJson(contratoId, '/tuberias', token),
    fetchJson(contratoId, '/areas', token),
  ])

  await topoDb.transaction(
    'rw',
    [
      topoDb.topo_puntos,
      topoDb.topo_poligonales,
      topoDb.topo_nivelaciones,
      topoDb.topo_newpoints,
      topoDb.topo_entrega_dg,
      topoDb.topo_diseno_ejes,
      topoDb.topo_equipos,
      topoDb.topo_tuberias,
      topoDb.topo_areas,
    ],
    async () => {
      await topoDb.topo_puntos.where('contrato_id').equals(cid).and((p) => !p._local).delete()
      const mergedPuntos = [...(puntos || [])]
      const ids = new Set(mergedPuntos.map((p) => p.id))
      for (const p of puntosVerificados || []) {
        if (!ids.has(p.id)) mergedPuntos.push(p)
      }
      await putList(topoDb.topo_puntos, contratoId, mergedPuntos)

      await putList(topoDb.topo_poligonales, contratoId, poligonales || [])
      await putList(topoDb.topo_nivelaciones, contratoId, nivelaciones || [])
      await putList(topoDb.topo_newpoints, contratoId, newpoints || [])
      await putList(topoDb.topo_entrega_dg, contratoId, entregas || [])
      await putList(topoDb.topo_diseno_ejes, contratoId, ejes || [])
      await putList(topoDb.topo_equipos, contratoId, equipos || [])
      await putList(topoDb.topo_tuberias, contratoId, tuberias || [])
      await putList(topoDb.topo_areas, contratoId, areas || [])
    },
  )

  // Detalle DG por eje (rasante + estructura)
  const ejeIds = (ejes || []).map((e) => e.id).filter(Boolean)
  for (const ejeId of ejeIds) {
    try {
      const det = await fetchJson(contratoId, `/diseno-geometrico/ejes/${ejeId}`, token)
      await topoDb.topo_entity_detail.put({
        key: entityDetailKey(contratoId, 'diseno_eje', ejeId),
        data: det,
        updated_at: det?.eje?.updated_at || new Date().toISOString(),
      })
    } catch (e) {
      console.warn('[Topo offline] No se pudo cachear eje', ejeId, e)
    }
  }

  // Cachear selladas metadata (puntos-biblioteca se resuelve on-demand desde puntos)
  await topoDb.topo_entity_detail.put({
    key: entityDetailKey(contratoId, 'meta', 'poligonales_selladas'),
    data: poligonalesSelladas || [],
    updated_at: new Date().toISOString(),
  })

  await setTopoSyncMeta(contratoId, {
    puntos: (puntos || []).length,
    poligonales: (poligonales || []).length,
    ejes: ejeIds.length,
  })

  return {
    puntos: (puntos || []).length,
    poligonales: (poligonales || []).length,
    nivelaciones: (nivelaciones || []).length,
    entregas: (entregas || []).length,
    ejes: ejeIds.length,
  }
}

/** Cachea detalle bajo demanda (p. ej. al abrir poligonal online). */
export async function cacheTopoEntityDetail(contratoId, kind, id, data) {
  if (!id || !data) return
  await topoDb.topo_entity_detail.put({
    key: entityDetailKey(contratoId, kind, id),
    data,
    updated_at: data?.updated_at || data?.poligonal?.updated_at || new Date().toISOString(),
  })
}

export async function getCachedTopoEntityDetail(contratoId, kind, id) {
  const row = await topoDb.topo_entity_detail.get(entityDetailKey(contratoId, kind, id))
  return row?.data ?? null
}
