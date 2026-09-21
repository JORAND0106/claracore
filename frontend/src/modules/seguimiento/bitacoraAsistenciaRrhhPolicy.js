/**
 * Política Bitácora ↔ RRHH (espejo de backend/bitacora_asistencia_rrhh_policy.py).
 *
 * Corte: 2026-09-25 00:00:00 America/Bogota.
 * Contrato exento: ID 3 hasta activación manual (Desarrollador).
 */

export const BITACORA_ASISTENCIA_RRHH_CORTE_ISO = '2026-09-25'
export const BITACORA_ASISTENCIA_RRHH_EXENTO_CONTRATO_ID = 3

export const HINT_DOCUMENTACION_NO_APROBADA =
  'Solo colaboradores con documentación Aprobada en RRHH pueden registrarse en la asistencia de Bitácora.'

/** Instantánea Bogotá como Date (para tests pasar `now`). */
export function ahoraBogota(now = new Date()) {
  // Comparación por YYYY-MM-DD en zona Bogotá (mismo criterio que hoyISOBogota).
  return now instanceof Date ? now : new Date(now)
}

export function hoyISOBogotaFrom(now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(ahoraBogota(now))
  } catch {
    return ahoraBogota(now).toISOString().slice(0, 10)
  }
}

/** True a partir del 25-sep-2026 (día inclusive en Bogotá). */
export function cutoverAsistenciaRrhhActivo(now = new Date()) {
  return hoyISOBogotaFrom(now) >= BITACORA_ASISTENCIA_RRHH_CORTE_ISO
}

export function esContratoExentoAsistenciaRrhh(contratoId) {
  const n = Number(contratoId)
  return Number.isFinite(n) && n === BITACORA_ASISTENCIA_RRHH_EXENTO_CONTRATO_ID
}

/**
 * Gate: identificación individual + documentación Aprobada.
 * @param {object} opts
 * @param {number|string} opts.contratoId
 * @param {boolean} [opts.activaEnExento]
 * @param {Date|string|number} [opts.now]
 */
export function requiereAsistenciaRrhhAprobado({
  contratoId,
  activaEnExento = false,
  now = new Date(),
} = {}) {
  if (!cutoverAsistenciaRrhhActivo(now)) return false
  if (esContratoExentoAsistenciaRrhh(contratoId)) return Boolean(activaEnExento)
  return true
}

export function docValidacionEsAprobado(raw) {
  return String(raw || '').trim().toLowerCase() === 'aprobado'
}

export function policySnapshotAsistenciaRrhh({
  contratoId,
  activaEnExento = false,
  now = new Date(),
} = {}) {
  const corteActivo = cutoverAsistenciaRrhhActivo(now)
  const exento = esContratoExentoAsistenciaRrhh(contratoId)
  const gate = requiereAsistenciaRrhhAprobado({ contratoId, activaEnExento, now })
  return {
    corte_iso: BITACORA_ASISTENCIA_RRHH_CORTE_ISO,
    corte_activo: corteActivo,
    contrato_id: Number.isFinite(Number(contratoId)) ? Number(contratoId) : null,
    contrato_exento: exento,
    activa_en_exento: exento ? Boolean(activaEnExento) : false,
    requiere_rrhh_aprobado: gate,
    permite_cargo_cuadrilla: !gate && exento,
  }
}

/** Filtra catálogo RRHH a documentación Aprobada (cuando el gate está activo). */
export function filtrarCatalogoRrhhAprobados(catalogo = [], { aplicar = true } = {}) {
  const list = Array.isArray(catalogo) ? catalogo : []
  if (!aplicar) return list
  return list.filter((t) => docValidacionEsAprobado(t?.doc_validacion_estado))
}
