/**
 * Descargador offline — usa el endpoint /offline-pack que devuelve
 * actas + semanas + precios + reportes + registros en UNA sola petición.
 * El servidor resuelve el acta_id a partir del número RPO: sin lógica
 * de resolución en el frontend, sin múltiples llamadas, sin misterio.
 */
import { db } from './db'
import { API_BASE } from '../apiBase'

export { downloadTilesContrato } from './tileDownloader'

async function apiFetch(path, authToken) {
  const r = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  })
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${path}`)
  return r.json()
}

async function _persistirMapaCache(contratoId, { planoResp, pkIds }) {
  const cid = Number(contratoId)
  await db.transaction('rw', [db.geojson_cache, db.pkids_cache], async () => {
    if (planoResp && typeof planoResp === 'object') {
      await db.geojson_cache.put({
        contrato_id: cid,
        plano_geojson: planoResp.plano_geojson ?? null,
        centro_lat: planoResp.centro_lat ?? null,
        centro_lng: planoResp.centro_lng ?? null,
      })
    }
    await db.pkids_cache.where('contrato_id').equals(cid).delete()
    const rows = Array.isArray(pkIds) ? pkIds : []
    if (rows.length) {
      await db.pkids_cache.bulkPut(rows.map((p) => ({ ...p, contrato_id: cid })))
    }
  })
}

/**
 * Descarga el paquete offline para el contrato/acta indicados.
 *
 * @param {number} contratoId
 * @param {string} authToken
 * @param {object} opts
 * @param {string|number|null} opts.actaRpo  Número RPO del acta (ej: "73" o 73).
 */
export async function downloadContractData(contratoId, authToken, opts = {}) {
  const { actaRpo = null } = opts

  if (!actaRpo) {
    // Sin acta seleccionada → solo datos maestros básicos (sin registros).
    // Capítulos vía /sicoe-obra/.../capitulos (no requiere permiso de precios);
    // /listado-precios puede devolver 403 a empresa=subcontratista.
    const [actas, semanas, preciosRaw, capsPayload, reportes, planoResp, pkIds] = await Promise.all([
      apiFetch(`/actas/${contratoId}/lista`, authToken).catch(() => []),
      apiFetch(`/sicoe-obra/${contratoId}/semanas`, authToken).catch(() => []),
      apiFetch(`/listado-precios/${contratoId}`, authToken).catch(() => []),
      apiFetch(`/sicoe-obra/${contratoId}/capitulos`, authToken).catch(() => []),
      apiFetch(`/sicoe-obra/${contratoId}/reportes`, authToken).catch(() => []),
      apiFetch(`/contratos/${contratoId}/plano-geojson`, authToken).catch(() => null),
      apiFetch(`/sicoe-obra/${contratoId}/pk-ids`, authToken).catch(() => []),
    ])
    const precios = _mergePreciosConCapitulosCatalogo(contratoId, preciosRaw, capsPayload)
    await _persistir(contratoId, { actas, semanas, precios, reportes, registros: [] })
    await _persistirMapaCache(contratoId, { planoResp, pkIds })
    return {
      actas: actas.length,
      semanas: semanas.length,
      precios: precios.length,
      reportes: reportes.length,
      registros: 0,
      pk_ids: Array.isArray(pkIds) ? pkIds.length : 0,
      plano: planoResp?.plano_geojson ? 1 : 0,
    }
  }

  // Con acta → una sola petición al servidor + plano GeoJSON
  const actaRpoNum = parseInt(actaRpo, 10)
  if (isNaN(actaRpoNum)) throw new Error(`actaRpo inválido: ${actaRpo}`)

  const [pack, planoResp] = await Promise.all([
    apiFetch(
      `/sicoe-obra/${contratoId}/offline-pack?acta_rpo=${actaRpoNum}`,
      authToken,
    ),
    apiFetch(`/contratos/${contratoId}/plano-geojson`, authToken).catch(() => null),
  ])

  // Mostrar errores parciales del servidor en consola para diagnóstico
  if (pack.errores && Object.keys(pack.errores).length > 0) {
    console.error('[offline-pack] Errores del servidor:', pack.errores)
  }

  const actas     = Array.isArray(pack.actas)     ? pack.actas     : []
  const semanas   = Array.isArray(pack.semanas)   ? pack.semanas   : []
  const preciosRaw = Array.isArray(pack.precios)   ? pack.precios   : []
  const reportes  = Array.isArray(pack.reportes)  ? pack.reportes  : []
  const registros = Array.isArray(pack.registros) ? pack.registros : []
  const inspectores = Array.isArray(pack.inspectores) ? pack.inspectores : []
  const subcontratistas = Array.isArray(pack.subcontratistas) ? pack.subcontratistas : []
  let pkIds = Array.isArray(pack.pk_ids) ? pack.pk_ids : []
  if (!pkIds.length) {
    pkIds = await apiFetch(`/sicoe-obra/${contratoId}/pk-ids`, authToken).catch(() => [])
  }
  // Si el pack no trajo precios (p. ej. redaction/403 parcial), completar capítulos
  // con el endpoint de catálogo SICOE (solo nombres, sin montos).
  const capsPayload = await apiFetch(`/sicoe-obra/${contratoId}/capitulos`, authToken).catch(() => [])
  const precios = _mergePreciosConCapitulosCatalogo(contratoId, preciosRaw, capsPayload)

  // Validar que el servidor resolvió correctamente el acta
  if (!pack.acta_id) {
    console.warn(`[offline-pack] No se encontró acta_id para acta_rpo=${actaRpoNum}. Revisa los números de acta disponibles.`)
  }

  await _persistir(contratoId, {
    actas,
    semanas,
    precios,
    reportes,
    registros,
    inspectores,
    subcontratistas,
  })
  await _persistirMapaCache(contratoId, { planoResp, pkIds })

  return {
    actas:     actas.length,
    semanas:   semanas.length,
    precios:   precios.length,
    reportes:  reportes.length,
    registros: registros.length,
    inspectores: inspectores.length,
    subcontratistas: subcontratistas.length,
    pk_ids: pkIds.length,
    plano: planoResp?.plano_geojson ? 1 : 0,
  }
}

/**
 * Asegura filas de catálogo por capítulo cuando /listado-precios no está
 * disponible (empresa subcontratista). Stubs sin precio_unitario.
 */
function _mergePreciosConCapitulosCatalogo(contratoId, preciosRaw, capsPayload) {
  const cid = Number(contratoId)
  const precios = Array.isArray(preciosRaw) ? [...preciosRaw] : []
  const have = new Set(
    precios.map((p) => String(p?.capitulo || '').trim()).filter(Boolean),
  )
  const caps = Array.isArray(capsPayload) ? capsPayload : []
  let stubId = -1
  for (const c of caps) {
    const label = String(typeof c === 'string' ? c : c?.capitulo || '').trim()
    if (!label || have.has(label)) continue
    have.add(label)
    precios.push({
      id: stubId,
      contrato_id: cid,
      capitulo: label,
      item_numero: null,
      descripcion: null,
      unidad: null,
      // Sin monto: catálogo para reportar, no listado de cobro.
      precio_unitario: null,
      _capitulo_stub: true,
    })
    stubId -= 1
  }
  return precios
}

async function _persistir(
  contratoId,
  { actas, semanas, precios, reportes, registros, inspectores = [], subcontratistas = [] },
) {
  // contrato_id siempre como número para que Dexie lo indexe consistentemente
  const cid = Number(contratoId)
  await db.transaction('rw', [
    db.actas,
    db.so_semanas,
    db.listado_precios,
    db.so_reportes,
    db.so_registros,
    db.inspectores_cache,
    db.subcontratistas_cache,
  ], async () => {
    if (actas.length)
      await db.actas.bulkPut(actas.map(a => ({ ...a, contrato_id: cid })))

    if (semanas.length)
      await db.so_semanas.bulkPut(semanas.map(s => ({ ...s, contrato_id: cid })))

    if (precios.length)
      await db.listado_precios.bulkPut(precios.map(p => ({ ...p, contrato_id: cid })))

    if (reportes.length)
      await db.so_reportes.bulkPut(reportes.map(r => ({ ...r, contrato_id: cid })))

    if (registros.length)
      await db.so_registros.bulkPut(registros.map(r => ({ ...r, contrato_id: cid })))

    if (inspectores.length)
      await db.inspectores_cache.bulkPut(
        inspectores.map((u) => ({ ...u, contrato_id: cid })),
      )

    if (subcontratistas.length)
      await db.subcontratistas_cache.bulkPut(
        subcontratistas.map((s) => ({ ...s, contrato_id: cid })),
      )
  })
}
