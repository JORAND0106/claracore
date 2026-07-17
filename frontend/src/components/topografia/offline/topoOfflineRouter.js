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

export async function enqueueTopoOperation(contratoId, path, method, body, options = {}) {
  const cid = Number(contratoId)
  const parsed = parseBody(body)
  const entityId = options.localEntityId || extractEntityId(path) || localId()
  const op = {
    contrato_id: cid,
    op_type: inferOpType(method, path),
    submodule: inferSubmodule(path, method),
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
    server_updated_at: options.serverUpdatedAt || null,
  }

  const localIdNum = await topoDb.topo_pending_ops.add(op)
  const optimistic = await applyOptimisticMutation(contratoId, op)
  const base = { ...op, local_id: localIdNum, _queued: true, _offline: true }
  if (optimistic && typeof optimistic === 'object' && !Array.isArray(optimistic)) {
    return { ...base, ...optimistic }
  }
  return base
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

  if (path.match(/^\/poligonales\/[^/]+$/) && !path.includes('/puntos-biblioteca')) {
    const id = path.split('/')[2]?.split('?')[0]
    const det = await getCachedTopoEntityDetail(contratoId, 'poligonal', id)
    if (det) return det
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

  if (path.match(/^\/entrega-dg\/[^/]+$/) && !path.includes('/')) {
    const id = path.split('/')[2]?.split('?')[0]
    const det = await getCachedTopoEntityDetail(contratoId, 'entrega_dg', id)
    if (det) return det
    throw new Error('Entrega DG no disponible offline. Ábrala una vez con conexión.')
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
  if (path.match(/^\/poligonales\/[^/]+$/) && m === 'POST' && path.includes('/calcular')) {
    return { ok: true, mensaje: 'Cálculo encolado. Se aplicará al sincronizar.', _offline: true }
  }
  if (path.match(/^\/poligonales\/[^/]+$/) && m === 'POST' && path.includes('/cerrar')) {
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
