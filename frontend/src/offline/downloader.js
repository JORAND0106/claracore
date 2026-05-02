/**
 * Descargador offline — usa el endpoint /offline-pack que devuelve
 * actas + semanas + precios + reportes + registros en UNA sola petición.
 * El servidor resuelve el acta_id a partir del número RPO: sin lógica
 * de resolución en el frontend, sin múltiples llamadas, sin misterio.
 */
import { db } from './db'
import { API_BASE } from '../apiBase'

async function apiFetch(path, authToken) {
  const r = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  })
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${path}`)
  return r.json()
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
    // Sin acta seleccionada → solo datos maestros básicos (sin registros)
    const [actas, semanas, precios, reportes] = await Promise.all([
      apiFetch(`/actas/${contratoId}/lista`, authToken).catch(() => []),
      apiFetch(`/sicoe-obra/${contratoId}/semanas`, authToken).catch(() => []),
      apiFetch(`/listado-precios/${contratoId}`, authToken).catch(() => []),
      apiFetch(`/sicoe-obra/${contratoId}/reportes`, authToken).catch(() => []),
    ])
    await _persistir(contratoId, { actas, semanas, precios, reportes, registros: [] })
    return {
      actas: actas.length,
      semanas: semanas.length,
      precios: precios.length,
      reportes: reportes.length,
      registros: 0,
    }
  }

  // Con acta → una sola petición al servidor
  const actaRpoNum = parseInt(actaRpo, 10)
  if (isNaN(actaRpoNum)) throw new Error(`actaRpo inválido: ${actaRpo}`)

  const pack = await apiFetch(
    `/sicoe-obra/${contratoId}/offline-pack?acta_rpo=${actaRpoNum}`,
    authToken
  )

  // Mostrar errores parciales del servidor en consola para diagnóstico
  if (pack.errores && Object.keys(pack.errores).length > 0) {
    console.error('[offline-pack] Errores del servidor:', pack.errores)
  }

  const actas     = Array.isArray(pack.actas)     ? pack.actas     : []
  const semanas   = Array.isArray(pack.semanas)   ? pack.semanas   : []
  const precios   = Array.isArray(pack.precios)   ? pack.precios   : []
  const reportes  = Array.isArray(pack.reportes)  ? pack.reportes  : []
  const registros = Array.isArray(pack.registros) ? pack.registros : []

  // Validar que el servidor resolvió correctamente el acta
  if (!pack.acta_id) {
    console.warn(`[offline-pack] No se encontró acta_id para acta_rpo=${actaRpoNum}. Revisa los números de acta disponibles.`)
  }

  await _persistir(contratoId, { actas, semanas, precios, reportes, registros })

  return {
    actas:     actas.length,
    semanas:   semanas.length,
    precios:   precios.length,
    reportes:  reportes.length,
    registros: registros.length,
  }
}

async function _persistir(contratoId, { actas, semanas, precios, reportes, registros }) {
  // contrato_id siempre como número para que Dexie lo indexe consistentemente
  const cid = Number(contratoId)
  await db.transaction('rw', [
    db.actas, db.so_semanas, db.listado_precios, db.so_reportes, db.so_registros,
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
  })
}
