/**
 * Router offline Topografía — lecturas desde IndexedDB y encolado de mutaciones.
 */
import { v4 as uuidv4 } from 'uuid'
import {
  buildNewpointOfflineResponse,
  newpointPorAnguloDistancias,
} from '../../../utils/topografia_newpoint.js'
import {
  calcularVistaNivelacion,
  filasToLecturas,
} from '../../../utils/topografia_nivelacion.js'
import {
  cacheTopoEntityDetail,
  getCachedTopoEntityDetail,
} from './topoReferenceDownloader.js'
import {
  entityDetailKey,
  topoDb,
} from './topoDb.js'

export const TOPO_SUBMODULES = {
  biblioteca: 'biblioteca',
  poligonal: 'poligonal',
  newpoint: 'newpoint',
  nivelacion: 'nivelacion',
  entrega_dg: 'entrega_dg',
  tuberia: 'tuberia',
  areas: 'areas',
  equipos: 'equipos',
  diseno: 'diseno',
}

const MAX_ATTEMPTS = 3

function parseBody(body) {
  if (!body) return {}
  if (typeof body === 'string') {
    try { return JSON.parse(body) } catch { return {} }
  }
  return body
}

function localId() {
  return `local_${uuidv4()}`
}

function inferSubmodule(path, method) {
  if (path.startsWith('/puntos')) return TOPO_SUBMODULES.biblioteca
  if (path.startsWith('/poligonales')) return TOPO_SUBMODULES.poligonal
  if (path.startsWith('/newpoints')) return TOPO_SUBMODULES.newpoint
  if (path.startsWith('/nivelaciones')) return TOPO_SUBMODULES.nivelacion
  if (path.startsWith('/entrega-dg')) return TOPO_SUBMODULES.entrega_dg
  if (path.startsWith('/tuberias')) return TOPO_SUBMODULES.tuberia
  if (path.startsWith('/areas')) return TOPO_SUBMODULES.areas
  if (path.startsWith('/equipos')) return TOPO_SUBMODULES.equipos
  if (path.startsWith('/diseno-geometrico')) return TOPO_SUBMODULES.diseno
  return 'otros'
}

function inferOpType(method, path) {
  if (path.includes('/recalcular')) return 'calcular'
  if (path.includes('/calcular')) return 'calcular'
  if (path.includes('/cerrar')) return 'cerrar'
  if (path.includes('/guardar-cartera')) return 'editar'
  if (method === 'POST') return 'crear'
  if (method === 'PUT' || method === 'PATCH') return 'editar'
  if (method === 'DELETE') return 'eliminar'
  return 'editar'
}

function extractEntityId(path) {
  const m = path.match(
    /\/(poligonales|nivelaciones|newpoints|entrega-dg|puntos|tuberias|areas|equipos|diseno-geometrico\/ejes)\/([^/?]+)/,
  )
  return m ? m[2] : null
}

function extractDependsOn(body, path) {
  const deps = []
  const b = parseBody(body)
  if (b.poligonal_id?.startsWith?.('local_')) deps.push(b.poligonal_id)
  if (b.punto_inicial_id?.startsWith?.('local_')) deps.push(b.punto_inicial_id)
  if (b.bm_inicial_id?.startsWith?.('local_')) deps.push(b.bm_inicial_id)
  if (b.punto_biblioteca_id?.startsWith?.('local_')) deps.push(b.punto_biblioteca_id)
  const parent = extractEntityId(path)
  if (parent?.startsWith?.('local_')) deps.push(parent)
  return [...new Set(deps)]
}

async function inferServerUpdatedAt(contratoId, path, submodule, entityId) {
  if (!entityId || String(entityId).startsWith('local_')) return null
  const kindBySub = {
    [TOPO_SUBMODULES.poligonal]: 'poligonal',
    [TOPO_SUBMODULES.nivelacion]: 'nivelacion',
    [TOPO_SUBMODULES.entrega_dg]: 'entrega_dg',
    [TOPO_SUBMODULES.newpoint]: 'newpoint',
  }
  const kind = kindBySub[submodule]
  if (!kind) return null
  try {
    const det = await getCachedTopoEntityDetail(contratoId, kind, entityId)
    if (!det) return null
    return det.updated_at
      || det.poligonal?.updated_at
      || det.nivelacion?.updated_at
      || det.entrega?.updated_at
      || null
  } catch {
    return null
  }
}

export async function enqueueTopoOperation(contratoId, path, method, body, options = {}) {
  const cid = Number(contratoId)
  const parsed = parseBody(body)
  const entityId = options.localEntityId || extractEntityId(path) || localId()
  const submodule = inferSubmodule(path, method)
  const serverUpdatedAt = options.serverUpdatedAt
    || await inferServerUpdatedAt(contratoId, path, submodule, entityId)
  const op = {
    contrato_id: cid,
    op_type: inferOpType(method, path),
    submodule,
    method: method.toUpperCase(),
    endpoint: path,
    payload: parsed,
    local_entity_id: entityId,
    server_entity_id: entityId.startsWith('local_') ? null : entityId,
    depends_on: extractDependsOn(body, path),
    status: 'pendiente',
    attempts: 0,
    max_attempts: MAX_ATTEMPTS,
    created_at: new Date().toISOString(),
    idempotency_key: uuidv4(),
    error_message: null,
    server_updated_at: serverUpdatedAt || null,
  }

  const localIdNum = await topoDb.topo_pending_ops.add(op)
  const optimistic = await applyOptimisticMutation(contratoId, op)
  const base = { ...op, local_id: localIdNum, _queued: true, _offline: true }
  if (optimistic && typeof optimistic === 'object' && !Array.isArray(optimistic)) {
    return { ...base, ...optimistic }
  }
  return base
}

async function ensurePoligonalDetail(contratoId, polId) {
  let det = await getCachedTopoEntityDetail(contratoId, 'poligonal', polId)
  if (!det) {
    const pol = await topoDb.topo_poligonales.get(polId)
    det = {
      poligonal: pol || { id: polId },
      estaciones: [],
      armadas: [],
      cierre: null,
    }
  }
  if (!Array.isArray(det.estaciones)) det.estaciones = []
  if (!Array.isArray(det.armadas)) det.armadas = []
  return det
}

/** Actualiza entity_detail de poligonal para estaciones/armadas/amarres/sentido offline. */
async function applyPoligonalNestedOptimistic(contratoId, op) {
  const ep = op.endpoint || ''
  const m = (op.method || '').toUpperCase()
  const b = op.payload || {}
  const parts = ep.split('/').filter(Boolean)
  if (parts[0] !== 'poligonales' || !parts[1]) return null
  const polId = parts[1]
  const ahoraIso = () => new Date().toISOString()
  const esActivo = (r) => r && !r.dado_de_baja

  // POST /poligonales/{id}/estaciones
  if (m === 'POST' && parts[2] === 'estaciones' && parts.length === 3) {
    const det = await ensurePoligonalDetail(contratoId, polId)
    const estId = localId()
    const orden = (det.estaciones.reduce((max, e) => Math.max(max, e.orden || 0), 0) || 0) + 1
    const armadasActivas = (det.armadas || []).filter(esActivo)
    const armadaId = b.armada_id
      || (armadasActivas.length ? armadasActivas[armadasActivas.length - 1].id : null)
    const row = {
      id: estId,
      poligonal_id: polId,
      armada_id: armadaId,
      tipo_punto: b.tipo_punto || 'auxiliar',
      orden,
      nombre_punto: (b.nombre_punto || '').trim(),
      angulo_medido: b.angulo_gms != null ? b.angulo_gms : b.angulo_medido,
      angulo_vertical: b.angulo_vertical_gms != null ? b.angulo_vertical_gms : b.angulo_vertical,
      distancia: b.distancia ?? null,
      altura_objetivo: b.altura_objetivo ?? 0,
      dado_de_baja: false,
      dado_de_baja_at: null,
      _local: true,
      _pending_sync: true,
    }
    // Guardar GMS crudo; el backend convierte. Offline mostramos lo capturado.
    det.estaciones = [...det.estaciones, row]
    det._pending_sync = true
    await cacheTopoEntityDetail(contratoId, 'poligonal', polId, det)
    return { id: estId, ...row, _offline: true }
  }

  // PUT /poligonales/{id}/estaciones/{estId}/restaurar
  if (m === 'PUT' && parts[2] === 'estaciones' && parts[3] && parts[4] === 'restaurar') {
    const estId = parts[3]
    const det = await ensurePoligonalDetail(contratoId, polId)
    const maxOrden = det.estaciones.reduce((max, e) => Math.max(max, e.orden || 0), 0)
    det.estaciones = det.estaciones.map((e) => {
      if (e.id !== estId) return e
      const arm = det.armadas.find((a) => a.id === e.armada_id)
      if (arm?.dado_de_baja) {
        det.armadas = det.armadas.map((a) => (
          a.id === arm.id ? { ...a, dado_de_baja: false, dado_de_baja_at: null, _pending_sync: true } : a
        ))
      }
      return {
        ...e,
        dado_de_baja: false,
        dado_de_baja_at: null,
        orden: maxOrden + 1,
        _pending_sync: true,
      }
    })
    det._pending_sync = true
    await cacheTopoEntityDetail(contratoId, 'poligonal', polId, det)
    return { id: estId, ok: true, _offline: true }
  }

  // PUT /poligonales/{id}/estaciones/{estId}
  if (m === 'PUT' && parts[2] === 'estaciones' && parts[3] && !parts[4]) {
    const estId = parts[3]
    const det = await ensurePoligonalDetail(contratoId, polId)
    det.estaciones = det.estaciones.map((e) => {
      if (e.id !== estId) return e
      return {
        ...e,
        ...(b.tipo_punto != null ? { tipo_punto: b.tipo_punto } : {}),
        ...(b.nombre_punto != null ? { nombre_punto: String(b.nombre_punto).trim() } : {}),
        ...(b.angulo_gms != null ? { angulo_medido: b.angulo_gms } : {}),
        ...(b.angulo_vertical_gms !== undefined ? { angulo_vertical: b.angulo_vertical_gms } : {}),
        ...(b.distancia !== undefined ? { distancia: b.distancia } : {}),
        ...(b.altura_objetivo !== undefined ? { altura_objetivo: b.altura_objetivo } : {}),
        _pending_sync: true,
      }
    })
    det._pending_sync = true
    await cacheTopoEntityDetail(contratoId, 'poligonal', polId, det)
    return { id: estId, ok: true, _offline: true }
  }

  // DELETE /poligonales/{id}/estaciones/{estId}/purgar
  if (m === 'DELETE' && parts[2] === 'estaciones' && parts[3] && parts[4] === 'purgar') {
    const estId = parts[3]
    const det = await ensurePoligonalDetail(contratoId, polId)
    det.estaciones = det.estaciones.filter((e) => e.id !== estId)
    det._pending_sync = true
    await cacheTopoEntityDetail(contratoId, 'poligonal', polId, det)
    return { ok: true, _offline: true }
  }

  // DELETE /poligonales/{id}/estaciones/{estId} — soft-delete (papelera)
  if (m === 'DELETE' && parts[2] === 'estaciones' && parts[3] && !parts[4]) {
    const estId = parts[3]
    const det = await ensurePoligonalDetail(contratoId, polId)
    const bajaAt = ahoraIso()
    det.estaciones = det.estaciones.map((e) => (
      e.id === estId
        ? { ...e, dado_de_baja: true, dado_de_baja_at: bajaAt, _pending_sync: true }
        : e
    ))
    let ord = 1
    det.estaciones = det.estaciones.map((e) => {
      if (e.dado_de_baja) return e
      const next = { ...e, orden: ord }
      ord += 1
      return next
    })
    det._pending_sync = true
    await cacheTopoEntityDetail(contratoId, 'poligonal', polId, det)
    return { ok: true, papelera: true, id: estId, _offline: true }
  }

  // GET /poligonales/{id}/papelera — handled in read path; no-op here
  if (m === 'GET' && parts[2] === 'papelera') {
    return null
  }

  // POST /poligonales/{id}/armadas
  if (m === 'POST' && parts[2] === 'armadas' && parts.length === 3) {
    const det = await ensurePoligonalDetail(contratoId, polId)
    const armId = localId()
    const orden = (det.armadas.reduce((max, a) => Math.max(max, a.orden || 0), 0) || 0) + 1
    const arm = {
      id: armId,
      poligonal_id: polId,
      orden,
      estacion_nombre: (b.estacion_nombre || '').trim(),
      visado_nombre: (b.visado_nombre || '').trim(),
      altura_instrumento: b.altura_instrumento ?? null,
      puntos: [],
      dado_de_baja: false,
      dado_de_baja_at: null,
      _local: true,
      _pending_sync: true,
    }
    det.armadas = [...det.armadas, arm]
    det._pending_sync = true
    await cacheTopoEntityDetail(contratoId, 'poligonal', polId, det)
    return { id: armId, ...arm, _offline: true }
  }

  // PUT /poligonales/{id}/armadas/{armId}/restaurar
  if (m === 'PUT' && parts[2] === 'armadas' && parts[3] && parts[4] === 'restaurar') {
    const armId = parts[3]
    const det = await ensurePoligonalDetail(contratoId, polId)
    det.armadas = det.armadas.map((a) => (
      a.id === armId
        ? { ...a, dado_de_baja: false, dado_de_baja_at: null, _pending_sync: true }
        : a
    ))
    let nextOrden = det.estaciones.reduce((max, e) => Math.max(max, e.orden || 0), 0) + 1
    det.estaciones = det.estaciones.map((e) => {
      if (e.armada_id !== armId || !e.dado_de_baja) return e
      const row = {
        ...e,
        dado_de_baja: false,
        dado_de_baja_at: null,
        orden: nextOrden,
        _pending_sync: true,
      }
      nextOrden += 1
      return row
    })
    det._pending_sync = true
    await cacheTopoEntityDetail(contratoId, 'poligonal', polId, det)
    return { ok: true, id: armId, _offline: true }
  }

  // PUT /poligonales/{id}/armadas/{armId} (HI / nombres)
  if (m === 'PUT' && parts[2] === 'armadas' && parts[3] && !parts[4]) {
    const armId = parts[3]
    const det = await ensurePoligonalDetail(contratoId, polId)
    det.armadas = det.armadas.map((a) => (
      a.id === armId
        ? {
            ...a,
            ...(b.altura_instrumento !== undefined ? { altura_instrumento: b.altura_instrumento } : {}),
            ...(b.estacion_nombre != null ? { estacion_nombre: b.estacion_nombre } : {}),
            ...(b.visado_nombre != null ? { visado_nombre: b.visado_nombre } : {}),
            _pending_sync: true,
          }
        : a
    ))
    if (b.altura_instrumento !== undefined) {
      det.estaciones = det.estaciones.map((e) => (
        e.armada_id === armId && !e.dado_de_baja
          ? { ...e, altura_instrumento: b.altura_instrumento, _pending_sync: true }
          : e
      ))
    }
    det._pending_sync = true
    await cacheTopoEntityDetail(contratoId, 'poligonal', polId, det)
    return { ok: true, _offline: true }
  }

  // DELETE /poligonales/{id}/armadas/{armId}/purgar
  if (m === 'DELETE' && parts[2] === 'armadas' && parts[3] && parts[4] === 'purgar') {
    const armId = parts[3]
    const det = await ensurePoligonalDetail(contratoId, polId)
    det.estaciones = det.estaciones.filter((e) => e.armada_id !== armId)
    det.armadas = det.armadas.filter((a) => a.id !== armId)
    det._pending_sync = true
    await cacheTopoEntityDetail(contratoId, 'poligonal', polId, det)
    return { ok: true, _offline: true }
  }

  // DELETE /poligonales/{id}/armadas/{armId} — soft-delete
  if (m === 'DELETE' && parts[2] === 'armadas' && parts[3] && !parts[4]) {
    const armId = parts[3]
    const det = await ensurePoligonalDetail(contratoId, polId)
    const activas = (det.armadas || []).filter(esActivo)
    if (activas.length <= 1) {
      throw new Error('No se puede eliminar la armada inicial.')
    }
    const bajaAt = ahoraIso()
    det.armadas = det.armadas.map((a) => (
      a.id === armId
        ? { ...a, dado_de_baja: true, dado_de_baja_at: bajaAt, _pending_sync: true }
        : a
    ))
    det.estaciones = det.estaciones.map((e) => (
      e.armada_id === armId && !e.dado_de_baja
        ? { ...e, dado_de_baja: true, dado_de_baja_at: bajaAt, _pending_sync: true }
        : e
    ))
    let ord = 1
    det.estaciones = det.estaciones.map((e) => {
      if (e.dado_de_baja) return e
      const next = { ...e, orden: ord }
      ord += 1
      return next
    })
    det._pending_sync = true
    await cacheTopoEntityDetail(contratoId, 'poligonal', polId, det)
    return { ok: true, papelera: true, id: armId, _offline: true }
  }

  // POST /poligonales/{id}/sentido
  if (m === 'POST' && parts[2] === 'sentido') {
    const det = await ensurePoligonalDetail(contratoId, polId)
    if (det.poligonal) {
      det.poligonal = { ...det.poligonal, sentido: b.sentido || det.poligonal.sentido, _pending_sync: true }
    }
    det._pending_sync = true
    await cacheTopoEntityDetail(contratoId, 'poligonal', polId, det)
    return { ok: true, sentido: b.sentido, _offline: true }
  }

  // PUT /poligonales/{id}/amarres
  if (m === 'PUT' && parts[2] === 'amarres') {
    const det = await ensurePoligonalDetail(contratoId, polId)
    det._amarres_offline = b
    det._pending_sync = true
    if (b.estacion && det.poligonal) {
      det.punto_inicial = { ...(det.punto_inicial || {}), ...b.estacion }
    }
    if (b.visado) {
      det.punto_visado = { ...(det.punto_visado || {}), ...b.visado }
    }
    if (b.llegada) {
      det.punto_final = { ...(det.punto_final || {}), ...b.llegada }
    }
    await cacheTopoEntityDetail(contratoId, 'poligonal', polId, det)
    return { ...det, _offline: true }
  }

  return null
}

async function applyOptimisticMutation(contratoId, op) {
  const cid = Number(contratoId)
  const b = op.payload || {}

  if (op.submodule === TOPO_SUBMODULES.biblioteca && op.method === 'POST') {
    const id = op.local_entity_id
    const row = {
      id,
      contrato_id: cid,
      nombre: b.nombre?.trim(),
      norte: b.norte,
      este: b.este,
      cota: b.cota,
      tipo: b.tipo,
      verificado: Boolean(b.verificado),
      _local: true,
      _pending_sync: true,
      created_at: new Date().toISOString(),
    }
    await topoDb.topo_puntos.put(row)
    return row
  }

  if (op.submodule === TOPO_SUBMODULES.biblioteca && op.method === 'PUT') {
    const id = op.server_entity_id || op.local_entity_id
    const existing = await topoDb.topo_puntos.get(id)
    const row = {
      ...(existing || { id, contrato_id: cid }),
      ...b,
      nombre: b.nombre?.trim() ?? existing?.nombre,
      _local: existing?._local || false,
      _pending_sync: true,
      updated_at: new Date().toISOString(),
    }
    await topoDb.topo_puntos.put(row)
    return row
  }

  if (op.submodule === TOPO_SUBMODULES.poligonal && op.method === 'POST' && op.endpoint === '/poligonales') {
    const id = op.local_entity_id
    const row = {
      id,
      contrato_id: cid,
      nombre: b.nombre,
      tipo: b.tipo || 'cerrada',
      estado: 'borrador',
      _local: true,
      _pending_sync: true,
      created_at: new Date().toISOString(),
    }
    await topoDb.topo_poligonales.put(row)
    await topoDb.topo_entity_detail.put({
      key: entityDetailKey(contratoId, 'poligonal', id),
      data: { poligonal: row, estaciones: [], armadas: [], cierre: null },
      updated_at: new Date().toISOString(),
    })
    return { id, ...row }
  }

  // Poligonal: mutaciones anidadas → actualizar entity_detail para captura usable offline
  if (op.submodule === TOPO_SUBMODULES.poligonal) {
    const polOptimistic = await applyPoligonalNestedOptimistic(contratoId, op)
    if (polOptimistic) return polOptimistic
  }

  if (op.submodule === TOPO_SUBMODULES.entrega_dg && op.endpoint.includes('/guardar-cartera')) {
    const entregaId = extractEntityId(op.endpoint)
    const cached = await getCachedTopoEntityDetail(contratoId, 'entrega_dg', entregaId)
    if (cached) {
      cached._pending_sync = true
      cached._offline_cartera = b
      await cacheTopoEntityDetail(contratoId, 'entrega_dg', entregaId, cached)
    }
    return cached || { ok: true, _queued: true, id: entregaId }
  }

  if (op.submodule === TOPO_SUBMODULES.newpoint && (op.method === 'POST' || op.method === 'PUT')) {
    // Ya aplicado en handleOfflineMutation
    return null
  }

  if (op.submodule === TOPO_SUBMODULES.nivelacion && op.method === 'POST' && op.endpoint === '/nivelaciones') {
    const id = op.local_entity_id
    const row = { id, contrato_id: cid, nombre: b.nombre, tipo: b.tipo, estado: 'borrador', _local: true, _pending_sync: true }
    await topoDb.topo_nivelaciones.put(row)
    return row
  }

  if (op.submodule === TOPO_SUBMODULES.tuberia && op.method === 'POST') {
    const id = op.local_entity_id
    const row = { id, contrato_id: cid, ...b, _local: true, _pending_sync: true }
    await topoDb.topo_tuberias.put(row)
    return row
  }

  if (op.submodule === TOPO_SUBMODULES.areas && op.method === 'POST') {
    const id = op.local_entity_id
    const row = { id, contrato_id: cid, ...b, _local: true, _pending_sync: true }
    await topoDb.topo_areas.put(row)
    return row
  }

  if (op.submodule === TOPO_SUBMODULES.equipos && op.method === 'POST' && op.endpoint === '/equipos') {
    const id = op.local_entity_id
    const row = {
      id,
      contrato_id: cid,
      ...b,
      _local: true,
      _pending_sync: true,
      created_at: new Date().toISOString(),
    }
    await topoDb.topo_equipos.put(row)
    return row
  }

  return { ok: true, _queued: true, local_entity_id: op.local_entity_id }
}

async function applyNewpointOffline(contratoId, form, entityId) {
  const cid = Number(contratoId)
  const p1 = await topoDb.topo_puntos.get(form.punto1_id)
  const p2 = await topoDb.topo_puntos.get(form.punto2_id)
  if (!p1 || !p2) throw new Error('Puntos de referencia no disponibles offline.')

  const selladasRow = await topoDb.topo_entity_detail.get(
    entityDetailKey(contratoId, 'meta', 'poligonales_selladas'),
  )
  const pol = (selladasRow?.data || []).find((p) => p.id === form.poligonal_id)
  let vertices = []
  if (pol) {
    const det = await getCachedTopoEntityDetail(contratoId, 'poligonal', form.poligonal_id)
    vertices = (det?.estaciones || [])
      .filter((e) => e.norte != null && e.este != null)
      .map((e) => [e.norte, e.este])
  }

  const calc = newpointPorAnguloDistancias(
    p1.norte, p1.este, Number(form.distancia1),
    p2.norte, p2.este, Number(form.distancia2),
    Number(form.angulo_observado_gms),
    vertices.length ? vertices : null,
  )
  const puntosMap = { [form.punto1_id]: p1, [form.punto2_id]: p2 }
  const row = buildNewpointOfflineResponse(
    { ...form, _localId: entityId },
    puntosMap,
    vertices,
    calc,
  )
  await topoDb.topo_newpoints.put({ ...row, contrato_id: cid, _local: true })
  await cacheTopoEntityDetail(contratoId, 'newpoint', entityId, row)
  return row
}

export async function readTopoOffline(contratoId, path, query = '') {
  const cid = Number(contratoId)
  const fullPath = `${path}${query}`

  if (path === '/puntos' || path.startsWith('/puntos/verificados')) {
    let rows = await topoDb.topo_puntos.where('contrato_id').equals(cid).toArray()
    if (path.includes('verificados') || fullPath.includes('modulo_origen=')) {
      rows = rows.filter((p) => p.verificado)
    }
    return rows.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
  }

  if (path === '/poligonales') {
    return topoDb.topo_poligonales.where('contrato_id').equals(cid).sortBy('created_at')
  }

  if (path === '/poligonales/selladas') {
    const meta = await topoDb.topo_entity_detail.get(
      entityDetailKey(contratoId, 'meta', 'poligonales_selladas'),
    )
    if (meta?.data) return meta.data
    const all = await topoDb.topo_poligonales.where('contrato_id').equals(cid).toArray()
    return all.filter((p) => p.nivel2_estado === 'Aprobado' || p.biblioteca_at)
  }

  if (path.match(/^\/poligonales\/[^/]+\/puntos-biblioteca$/)) {
    const polId = path.split('/')[2]
    const puntos = await topoDb.topo_puntos.where('contrato_id').equals(cid).filter((p) => p.verificado).toArray()
    return puntos.filter((p) => !p.circuito_id || p.circuito_id === polId)
  }

  if (path.match(/^\/poligonales\/[^/]+\/papelera$/)) {
    const id = path.split('/')[2]
    const det = await getCachedTopoEntityDetail(contratoId, 'poligonal', id)
    const armadas = (det?.armadas || []).filter((a) => a.dado_de_baja)
    const estaciones = (det?.estaciones || []).filter((e) => e.dado_de_baja)
    return {
      dias_retencion: 30,
      armadas,
      estaciones,
      total: armadas.length + estaciones.length,
    }
  }

  if (path.match(/^\/poligonales\/[^/]+$/) && !path.includes('/puntos-biblioteca') && !path.includes('/papelera')) {
    const id = path.split('/')[2]?.split('?')[0]
    const det = await getCachedTopoEntityDetail(contratoId, 'poligonal', id)
    if (det) {
      return {
        ...det,
        estaciones: (det.estaciones || []).filter((e) => !e.dado_de_baja),
        armadas: (det.armadas || []).filter((a) => !a.dado_de_baja),
      }
    }
    const pol = await topoDb.topo_poligonales.get(id)
    if (pol) return { poligonal: pol, estaciones: [], armadas: [], cierre: null }
    throw new Error('Poligonal no disponible offline.')
  }

  if (path === '/nivelaciones') {
    return topoDb.topo_nivelaciones.where('contrato_id').equals(cid).sortBy('created_at')
  }

  if (path.match(/^\/nivelaciones\/[^/]+$/)) {
    const id = path.split('/')[2]?.split('?')[0]
    const det = await getCachedTopoEntityDetail(contratoId, 'nivelacion', id)
    if (det) return det
    throw new Error('Nivelación no disponible offline.')
  }

  if (path === '/newpoints') {
    return topoDb.topo_newpoints.where('contrato_id').equals(cid).sortBy('created_at')
  }

  if (path.match(/^\/newpoints\/[^/]+$/)) {
    const id = path.split('/')[2]?.split('?')[0]
    const det = await getCachedTopoEntityDetail(contratoId, 'newpoint', id)
    if (det) return det
    const row = await topoDb.topo_newpoints.get(id)
    if (row) return row
    throw new Error('NewPoint no disponible offline.')
  }

  if (path === '/entrega-dg') {
    const rows = await topoDb.topo_entrega_dg.where('contrato_id').equals(cid).toArray()
    return rows.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  }

  if (path.match(/^\/entrega-dg\/[^/]+$/)) {
    const id = path.split('/')[2]?.split('?')[0]
    const det = await getCachedTopoEntityDetail(contratoId, 'entrega_dg', id)
    if (det) return det
    const row = await topoDb.topo_entrega_dg.get(id)
    if (row) return { entrega: row, lecturas: [], _offline_partial: true }
    throw new Error('Entrega DG no disponible offline. Ábrala una vez con conexión o espere la descarga de referencia.')
  }

  if (path === '/diseno-geometrico/ejes') {
    return topoDb.topo_diseno_ejes.where('contrato_id').equals(cid).sortBy('created_at')
  }

  if (path.match(/^\/diseno-geometrico\/ejes\/[^/]+$/)) {
    const id = path.split('/')[3]?.split('?')[0]
    const det = await getCachedTopoEntityDetail(contratoId, 'diseno_eje', id)
    if (det) return det
    throw new Error('Diseño geométrico no disponible offline.')
  }

  if (path === '/equipos') {
    return topoDb.topo_equipos.where('contrato_id').equals(cid).toArray()
  }

  if (path === '/equipos/alertas') {
    return { total_alertas: 0, _offline: true }
  }

  if (path === '/tuberias') {
    return topoDb.topo_tuberias.where('contrato_id').equals(cid).toArray()
  }

  if (path === '/areas') {
    return topoDb.topo_areas.where('contrato_id').equals(cid).toArray()
  }

  if (path === '/operadores') {
    const puntos = await topoDb.topo_puntos.where('contrato_id').equals(cid).toArray()
    const ops = new Set()
    puntos.forEach((p) => { if (p.operador) ops.add(p.operador) })
    return [...ops].sort().map((nombre) => ({ nombre }))
  }

  if (path.startsWith('/entrega-dg/preview-rango')) {
    return { filas: [], _offline_stub: true, mensaje: 'Vista previa limitada offline.' }
  }

  return undefined
}

export async function handleOfflineMutation(contratoId, path, method, body, options = {}) {
  const m = method.toUpperCase()

  if (path.includes('/equipos/') && path.includes('/verificaciones')) {
    throw new Error('Las verificaciones de equipos requieren conexión a internet.')
  }
  if (path.includes('/validar-nivel') || (path.includes('/validar') && m !== 'GET')) {
    throw new Error('La validación N1/N2 requiere conexión (firma y revisión en línea).')
  }

  if (path === '/puntos' && m === 'POST') {
    const parsed = parseBody(body)
    if (await nombrePuntoColisiona(contratoId, parsed.nombre)) {
      throw new Error(`Ya existe un punto «${parsed.nombre}» en la biblioteca local.`)
    }
  }

  if (path.match(/^\/puntos\/[^/]+$/) && m === 'PUT') {
    const id = path.split('/')[2]
    const parsed = parseBody(body)
    if (await nombrePuntoColisiona(contratoId, parsed.nombre, id)) {
      throw new Error(`Ya existe un punto «${parsed.nombre}» en la biblioteca local.`)
    }
  }

  // NewPoint calc local + encolar
  if (path === '/newpoints' && m === 'POST') {
    const entityId = localId()
    const parsed = parseBody(body)
    const row = await applyNewpointOffline(contratoId, parsed, entityId)
    await enqueueTopoOperation(contratoId, path, method, body, { localEntityId: entityId })
    return row
  }

  if (path.match(/^\/newpoints\/[^/]+$/) && m === 'PUT') {
    const id = path.split('/')[2]
    const parsed = parseBody(body)
    const row = await applyNewpointOffline(contratoId, { ...parsed, id }, id)
    await enqueueTopoOperation(contratoId, path, method, body, { localEntityId: id })
    return row
  }

  // Nivelación calc local preview al guardar lecturas
  if (path.match(/^\/nivelaciones\/[^/]+\/lecturas$/) && m === 'PUT') {
    const nivId = path.split('/')[2]
    const parsed = parseBody(body)
    const puntos = await topoDb.topo_puntos.where('contrato_id').equals(Number(contratoId)).filter((p) => p.verificado).toArray()
    const cotasBib = Object.fromEntries(puntos.filter((p) => p.cota != null).map((p) => [p.nombre, p.cota]))
    const vista = calcularVistaNivelacion(parsed.filas || parsed, parsed.tipo_nivel || 'electronico', cotasBib)
    await cacheTopoEntityDetail(contratoId, 'nivelacion', nivId, {
      ...(await getCachedTopoEntityDetail(contratoId, 'nivelacion', nivId) || {}),
      lecturas: filasToLecturas(parsed.filas || parsed, parsed.tipo_nivel),
      vista_local: vista,
      _pending_sync: true,
    })
    await enqueueTopoOperation(contratoId, path, method, body, { localEntityId: nivId })
    return { ok: true, vista: vista, _offline: true }
  }

  // Encolar operación genérica
  const result = await enqueueTopoOperation(contratoId, path, method, body, options)

  // Respuestas específicas post-encolado
  if (path === '/poligonales' && m === 'POST') {
    return { id: result.local_entity_id, ...result }
  }
  if (path.match(/^\/poligonales\/[^/]+\/calcular$/) && m === 'POST') {
    return { ok: true, mensaje: 'Cálculo encolado. Se aplicará al sincronizar.', _offline: true }
  }
  if (path.match(/^\/poligonales\/[^/]+\/recalcular$/) && m === 'POST') {
    const polId = path.split('/')[2]
    const det = await getCachedTopoEntityDetail(contratoId, 'poligonal', polId)
    if (det?.poligonal) {
      det.poligonal.ajustada_at = null
      det.poligonal._pending_sync = true
      for (const e of det.estaciones || []) {
        e.norte_ajustado = null
        e.este_ajustado = null
        e.cota_ajustada = null
        e.angulo_corregido = null
        e.correccion_norte = null
        e.correccion_este = null
        e.correccion_cota = null
      }
      await cacheTopoEntityDetail(contratoId, 'poligonal', polId, det)
      return { ...det, _offline: true, mensaje: 'Recálculo encolado. Ajuste anterior invalidado localmente.' }
    }
    return { ok: true, mensaje: 'Recálculo encolado. Se aplicará al sincronizar.', _offline: true }
  }
  if (path.match(/^\/poligonales\/[^/]+\/cerrar$/) && m === 'POST') {
    const polId = path.split('/')[2]
    const det = await getCachedTopoEntityDetail(contratoId, 'poligonal', polId)
    if (det?.poligonal) {
      det.poligonal.estado = 'cerrado'
      det.poligonal._pending_sync = true
      await cacheTopoEntityDetail(contratoId, 'poligonal', polId, det)
    }
    return { ok: true, mensaje: 'Cierre encolado para sincronización.', _offline: true }
  }

  if (path.match(/\/guardar-cartera$/) && m === 'POST') {
    const entregaId = path.split('/')[2]
    const cached = await getCachedTopoEntityDetail(contratoId, 'entrega_dg', entregaId)
    return cached || { ok: true, _queued: true }
  }

  return result
}

/** Verifica colisión de nombre en biblioteca (offline create). */
export async function nombrePuntoColisiona(contratoId, nombre, excludeId = null) {
  const cid = Number(contratoId)
  const norm = (nombre || '').trim().toLowerCase()
  const rows = await topoDb.topo_puntos.where('contrato_id').equals(cid).toArray()
  return rows.some((p) => p.id !== excludeId && (p.nombre || '').trim().toLowerCase() === norm)
}

export async function cacheOnlineResponse(contratoId, path, data) {
  if (!data || typeof data !== 'object') return
  const cid = Number(contratoId)

  if (path === '/puntos' || path.startsWith('/puntos/verificados')) {
    if (Array.isArray(data)) {
      await topoDb.topo_puntos.bulkPut(data.map((p) => ({ ...p, contrato_id: cid })))
    }
    return
  }

  if (path === '/poligonales' && Array.isArray(data)) {
    await topoDb.topo_poligonales.bulkPut(data.map((p) => ({ ...p, contrato_id: cid })))
    return
  }

  if (path.match(/^\/poligonales\/[^/]+$/) && data.poligonal) {
    await cacheTopoEntityDetail(contratoId, 'poligonal', data.poligonal.id, data)
    await topoDb.topo_poligonales.put({ ...data.poligonal, contrato_id: cid })
    return
  }

  if (path.match(/^\/entrega-dg\/[^/]+$/) && data.entrega) {
    await cacheTopoEntityDetail(contratoId, 'entrega_dg', data.entrega.id, data)
    return
  }

  if (path === '/entrega-dg' && Array.isArray(data)) {
    await topoDb.topo_entrega_dg.bulkPut(data.map((e) => ({ ...e, contrato_id: cid })))
    return
  }

  if (path === '/nivelaciones' && Array.isArray(data)) {
    await topoDb.topo_nivelaciones.bulkPut(data.map((n) => ({ ...n, contrato_id: cid })))
    return
  }

  if (path.match(/^\/nivelaciones\/[^/]+$/) && data.nivelacion) {
    await cacheTopoEntityDetail(contratoId, 'nivelacion', data.nivelacion.id, data)
    return
  }

  if (path === '/newpoints' && Array.isArray(data)) {
    await topoDb.topo_newpoints.bulkPut(data.map((n) => ({ ...n, contrato_id: cid })))
    return
  }

  if (path.match(/^\/diseno-geometrico\/ejes\/[^/]+$/) && data.eje) {
    await cacheTopoEntityDetail(contratoId, 'diseno_eje', data.eje.id, data)
  }
}
