/**
 * Confirmación estricta del PUT de lecturas de nivelación.
 * Nunca asume éxito por el tamaño del payload local.
 */

import { borradorTieneLectura } from './topografia_nivelacion.js'

/**
 * @param {object|null} res respuesta del API / offline
 * @param {Array} payloadLecturas lecturas enviadas
 * @returns {{ ok: boolean, error?: string, count: number, offline: boolean, lecturas: Array, reason?: string }}
 */
export function confirmarRespuestaGuardadoLecturas(res, payloadLecturas) {
  const expected = Array.isArray(payloadLecturas) ? payloadLecturas.length : 0
  if (!expected) {
    return { ok: false, error: 'No hay lecturas para guardar.', count: 0, offline: false, lecturas: [], reason: 'empty_payload' }
  }
  if (!res || typeof res !== 'object') {
    return {
      ok: false,
      error: 'El servidor no confirmó el guardado (respuesta vacía).',
      count: 0,
      offline: false,
      lecturas: [],
      reason: 'empty_response',
    }
  }
  const offline = Boolean(res._offline || res.offline || res.pending)
  const lecturas = Array.isArray(res.lecturas) ? res.lecturas : []
  const countRaw = res.count
  const count = Number.isFinite(Number(countRaw))
    ? Number(countRaw)
    : (lecturas.length > 0 ? lecturas.length : null)

  // Nunca usar payload.length como confirmación de éxito.
  if (count == null || count <= 0) {
    return {
      ok: false,
      error: 'El servidor no confirmó el guardado (sin conteo de lecturas).',
      count: 0,
      offline,
      lecturas,
      reason: 'missing_count',
    }
  }
  if (count !== expected) {
    return {
      ok: false,
      error: `Conteo inconsistente al guardar: enviadas ${expected}, confirmadas ${count}.`,
      count,
      offline,
      lecturas,
      reason: 'count_mismatch',
      expected,
      got: count,
    }
  }
  if (lecturas.length > 0 && lecturas.length !== expected) {
    return {
      ok: false,
      error: `El servidor devolvió ${lecturas.length} lecturas pero se enviaron ${expected}.`,
      count,
      offline,
      lecturas,
      reason: 'lecturas_mismatch',
      expected,
      got: lecturas.length,
    }
  }

  if (Array.isArray(res.fingerprint_orden) && res.fingerprint_orden.length) {
    const expectedFp = fingerprintLecturasOrden(payloadLecturas)
    const gotFp = res.fingerprint_orden.map(String)
    if (expectedFp.join('|') !== gotFp.join('|')) {
      return {
        ok: false,
        error: 'La huella de lecturas guardadas no coincide con lo enviado.',
        count,
        offline,
        lecturas,
        reason: 'fingerprint_mismatch',
      }
    }
  }

  return {
    ok: true,
    count,
    offline,
    lecturas: lecturas.length ? lecturas : payloadLecturas,
  }
}

/** Huella estable: orden|tipo|nombre */
export function fingerprintLecturasOrden(lecturas) {
  return (lecturas || [])
    .map((l) => `${Number(l?.orden) || 0}|${l?.tipo_lectura || ''}|${(l?.nombre_punto || '').trim()}`)
    .sort()
}

/**
 * Tras guardar online, el GET de detalle debe devolver al menos las mismas lecturas.
 * @param {object} detalle
 * @param {number} expectedCount
 * @param {string[]} [expectedFp]
 * @returns {{ ok: boolean, error?: string, reason?: string, got?: number }}
 */
export function verificarDetalleTrasGuardado(detalle, expectedCount, expectedFp = null) {
  const n = Array.isArray(detalle?.lecturas) ? detalle.lecturas.length : 0
  if (n < expectedCount) {
    return {
      ok: false,
      error: `Guardado no verificado al reabrir: el servidor tiene ${n} lectura(s) y se esperaban ${expectedCount}.`,
      reason: 'count_short',
      got: n,
    }
  }
  if (Array.isArray(expectedFp) && expectedFp.length && Array.isArray(detalle?.lecturas)) {
    const gotFp = fingerprintLecturasOrden(detalle.lecturas)
    if (gotFp.join('|') !== expectedFp.join('|')) {
      return {
        ok: false,
        error: 'Guardado no verificado: la huella de lecturas del detalle no coincide.',
        reason: 'fingerprint_mismatch',
        got: n,
      }
    }
  }
  return { ok: true, got: n }
}

/**
 * ¿El panel de captura tiene datos que aún no están en la cartera?
 * (lectura usable o metadatos parciales que el usuario podría creer guardados)
 */
export function borradorPendienteDeAgregar(borrador, tipoNivel = 'electronico') {
  if (!borrador) return false
  if (borradorTieneLectura(borrador, tipoNivel)) return true

  const b = borrador
  const tieneHilosParciales = ['vplus', 'vi', 'vminus'].some((k) => {
    const bl = b[k]
    if (!bl) return false
    return [bl.hS, bl.hM, bl.hI, bl.lectura].some((v) => v !== '' && v != null)
  })
  const tieneDist = (b.dist_vplus_m !== '' && b.dist_vplus_m != null)
    || (b.dist_vminus_m !== '' && b.dist_vminus_m != null)
  if (tieneHilosParciales || tieneDist) return true

  const nombre = String(borrador.nombre_punto || '').trim()
  const desc = String(borrador.descripcion_punto || '').trim()
  const abs = String(borrador.abscisa || borrador.abscisa_inicial || borrador.ubicacion_pk || '').trim()
  const tipo = String(borrador.tipo_punto || '').trim()

  // Semilla automática del BM inicial (sin lecturas): no bloquear «Guardar cartera».
  const esSemillaBm = tipo === 'BM'
    && (!desc || desc === 'BM inicial')
    && !abs
    && !borrador.ubicacion_pk_id
  if (esSemillaBm) return false

  return Boolean(nombre || desc || abs || tipo || borrador.ubicacion_pk_id)
}
