/** Helpers de asistencia de colaboradores (Reporte Diario) — catálogo RRHH. */

import { BITACORA_CARGO_CANTIDAD_TEMP_CONTRATO_NUMERO } from './bitacoraConstants.js'

export const DOCUMENTO_TIPOS = ['CC', 'CE', 'TI', 'PA', 'NIT', 'OTRO']

/** Estados legados / snapshot (Bitácora + RRHH). RRHH: activo|inactivo|retirado. */
export const ESTADOS_COLABORADOR = [
  { value: 'activo', label: 'Activo' },
  { value: 'incapacitado', label: 'Incapacitado' },
  { value: 'inactivo', label: 'Inactivo' },
  { value: 'retirado', label: 'Retirado' },
]

export const HORA_SALIDA_DEFAULT = '16:30'

/** Solo «activo» (RRHH) aporta al Resumen por cargo. */
export const ESTADOS_CUENTAN_RESUMEN = new Set(['activo'])

export const HINT_REGISTRAR_EN_RRHH =
  'No hay coincidencias en RRHH. Registre el colaborador primero en el módulo de Recursos Humanos.'

export function capitalizarNombrePropio(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length > 1 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toUpperCase()))
    .join(' ')
}

export function soloDigitosDocumento(raw) {
  return String(raw || '').replace(/\D+/g, '')
}

/** Normaliza a YYYY-MM-DD o ''. */
export function parseFechaISO(raw) {
  if (raw == null || raw === '') return ''
  const s = String(raw).trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return ''
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function normalizeEstadoRrhh(estado) {
  const s = String(estado || '').trim().toLowerCase()
  if (['activo', 'inactivo', 'retirado', 'incapacitado'].includes(s)) return s
  return 'activo'
}

export function estadoCuentaEnResumen(estado) {
  return ESTADOS_CUENTAN_RESUMEN.has(normalizeEstadoRrhh(estado))
}

export function nombreCompletoRrhh(trab) {
  if (!trab || typeof trab !== 'object') return ''
  if (trab.nombre) return capitalizarNombrePropio(trab.nombre)
  return capitalizarNombrePropio(
    `${trab.nombres || ''} ${trab.apellidos || ''}`.trim(),
  )
}

/** Fila de asistencia a partir de un trabajador RRHH. */
export function asistenciaRowFromRrhh(trab, partial = {}) {
  const nombre = nombreCompletoRrhh(trab)
  const tid = trab?.id != null ? Number(trab.id) : null
  return emptyAsistenciaRow({
    rrhh_trabajador_id: Number.isFinite(tid) ? tid : null,
    colaborador_id: null,
    nombre,
    documento_tipo: String(trab?.tipo_documento || 'CC').toUpperCase(),
    documento_numero: soloDigitosDocumento(trab?.numero_documento),
    cargo: String(trab?.cargo_aspira || trab?.cargo || '').trim(),
    subcontratista_id: trab?.empresa_subcontratista_id ?? null,
    subcontratista_nombre: String(trab?.empresa_nombre || '').trim(),
    estado: normalizeEstadoRrhh(trab?.estado),
    origen: 'rrhh',
    ...partial,
  })
}

export function emptyAsistenciaRow(partial = {}) {
  return {
    rrhh_trabajador_id: null,
    colaborador_id: null,
    nombre: '',
    documento_tipo: 'CC',
    documento_numero: '',
    cargo: '',
    subcontratista_id: null,
    subcontratista_nombre: '',
    estado: 'activo',
    hora_ingreso: '',
    hora_salida: HORA_SALIDA_DEFAULT,
    fecha_ingreso: '',
    fecha_retiro: '',
    observacion: '',
    origen: 'rrhh',
    ...partial,
  }
}

export function asistenciaFromEntrada(entradaOrList) {
  const list = Array.isArray(entradaOrList)
    ? entradaOrList
    : (entradaOrList && typeof entradaOrList === 'object'
      ? entradaOrList.asistencia_colaboradores
      : null)
  if (!Array.isArray(list)) return []
  return list.map((r) => {
    let tid = null
    try {
      tid = r?.rrhh_trabajador_id != null && r.rrhh_trabajador_id !== ''
        ? Number(r.rrhh_trabajador_id)
        : null
      if (!Number.isFinite(tid)) tid = null
    } catch { tid = null }
    return emptyAsistenciaRow({
      rrhh_trabajador_id: tid,
      colaborador_id: r?.colaborador_id ?? null,
      nombre: capitalizarNombrePropio(r?.nombre || ''),
      documento_tipo: String(r?.documento_tipo || 'CC').toUpperCase(),
      documento_numero: soloDigitosDocumento(r?.documento_numero),
      cargo: String(r?.cargo || '').trim(),
      subcontratista_id: r?.subcontratista_id ?? null,
      subcontratista_nombre: String(r?.subcontratista_nombre || '').trim(),
      estado: normalizeEstadoRrhh(r?.estado),
      hora_ingreso: String(r?.hora_ingreso || '').slice(0, 5),
      hora_salida: String(r?.hora_salida || HORA_SALIDA_DEFAULT).slice(0, 5) || HORA_SALIDA_DEFAULT,
      fecha_ingreso: parseFechaISO(r?.fecha_ingreso),
      fecha_retiro: parseFechaISO(r?.fecha_retiro),
      observacion: String(r?.observacion || r?.observaciones || '').trim(),
      origen: r?.origen || (tid != null ? 'rrhh' : 'legado'),
    })
  }).filter((r) => r.nombre)
}

/**
 * Resumen por cargo.
 * @param {object[]} rows
 * @param {{ liveEstadosByRrhhId?: Map<number,string>|Record<string,string>|null }} [opts]
 *   Si `liveEstadosByRrhhId` está presente (reporte abierto), usa el estado actual de RRHH.
 *   Si es null/undefined (reporte cerrado), usa el snapshot guardado en la fila.
 */
export function personalAgregadoDesdeAsistencia(rows, opts = {}) {
  const live = opts.liveEstadosByRrhhId ?? null
  const getLive = (id) => {
    if (live == null || id == null) return null
    if (live instanceof Map) return live.get(Number(id)) ?? live.get(id) ?? null
    return live[id] ?? live[String(id)] ?? live[Number(id)] ?? null
  }
  const counts = new Map()
  for (const r of rows || []) {
    const liveEst = getLive(r?.rrhh_trabajador_id)
    const estado = liveEst != null ? normalizeEstadoRrhh(liveEst) : normalizeEstadoRrhh(r?.estado)
    if (!estadoCuentaEnResumen(estado)) continue
    const cargo = String(r?.cargo || '').trim()
    if (!cargo) continue
    counts.set(cargo, (counts.get(cargo) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'es'))
    .map(([cargo, cantidad]) => ({ cargo, cantidad }))
}

export function asistenciaParaPayload(rows) {
  return asistenciaFromEntrada(rows).map((r) => ({
    rrhh_trabajador_id: r.rrhh_trabajador_id,
    colaborador_id: r.colaborador_id,
    nombre: r.nombre,
    documento_tipo: r.documento_tipo,
    documento_numero: r.documento_numero,
    cargo: r.cargo,
    subcontratista_id: r.subcontratista_id,
    subcontratista_nombre: r.subcontratista_nombre,
    estado: r.estado,
    hora_ingreso: r.hora_ingreso || null,
    hora_salida: r.hora_salida || HORA_SALIDA_DEFAULT,
    fecha_ingreso: r.fecha_ingreso || null,
    fecha_retiro: r.fecha_retiro || null,
    observacion: r.observacion,
    origen: r.origen || 'rrhh',
  }))
}

export function labelEstadoColaborador(estado) {
  const found = ESTADOS_COLABORADOR.find((e) => e.value === normalizeEstadoRrhh(estado))
  return found?.label || 'Activo'
}

export function formatHorarioAsistencia(row) {
  const ini = String(row?.hora_ingreso || '').slice(0, 5)
  const fin = String(row?.hora_salida || '').slice(0, 5)
  if (ini && fin) return `${ini} – ${fin}`
  if (ini) return `Desde ${ini}`
  if (fin) return `Hasta ${fin}`
  return '—'
}

/** Filtra catálogo RRHH por texto (nombre / documento / cargo / empresa). */
export function filtrarTrabajadoresRrhh(catalogo = [], query = '', excludeIds = []) {
  const needle = String(query || '').trim().toLowerCase()
  const excl = new Set((excludeIds || []).map((x) => Number(x)).filter((n) => Number.isFinite(n)))
  const list = Array.isArray(catalogo) ? catalogo : []
  return list.filter((t) => {
    const id = Number(t?.id)
    if (Number.isFinite(id) && excl.has(id)) return false
    if (!needle) return true
    const nombre = nombreCompletoRrhh(t).toLowerCase()
    const doc = String(t?.numero_documento || '').toLowerCase()
    const cargo = String(t?.cargo_aspira || t?.cargo || '').toLowerCase()
    const emp = String(t?.empresa_nombre || '').toLowerCase()
    return nombre.includes(needle) || doc.includes(needle) || cargo.includes(needle) || emp.includes(needle)
  })
}

/** Mapa id → estado desde catálogo RRHH. */
export function mapaEstadosRrhh(catalogo = []) {
  const map = new Map()
  for (const t of catalogo || []) {
    const id = Number(t?.id)
    if (!Number.isFinite(id)) continue
    map.set(id, normalizeEstadoRrhh(t?.estado))
  }
  return map
}

/** Normaliza lista {cargo, cantidad, cargo_otro?} sumando por cargo. */
export function normalizarPersonalCantidades(rows = []) {
  const counts = new Map()
  const otroByKey = new Map()
  for (const r of rows || []) {
    let cargo = String(r?.cargo || '').trim()
    if (!cargo) continue
    const otro = String(r?.cargo_otro || '').trim()
    if (cargo.toLowerCase().startsWith('otro') && otro) cargo = otro
    let n = Number(r?.cantidad)
    if (!Number.isFinite(n) || n < 0) n = 0
    if (n === 0) continue
    const key = cargo.toLowerCase()
    counts.set(key, (counts.get(key) || 0) + n)
    if (!otroByKey.has(key)) otroByKey.set(key, cargo)
  }
  return [...counts.entries()]
    .sort((a, b) => otroByKey.get(a[0]).localeCompare(otroByKey.get(b[0]), 'es'))
    .map(([k, cantidad]) => ({ cargo: otroByKey.get(k), cantidad }))
}

/** Suma varias listas de {cargo, cantidad} por cargo. */
export function mergePersonalCantidades(...lists) {
  const flat = []
  for (const list of lists) {
    if (Array.isArray(list)) flat.push(...list)
  }
  return normalizarPersonalCantidades(flat)
}

/**
 * Recupera el aporte «manual» (cargo/cantidad) como diferencia
 * personal_guardado − agregado_RRHH (snapshot en asistencia).
 */
export function recoverPersonalManual(personalGuardado, asistenciaRows, opts = {}) {
  const merged = normalizarPersonalCantidades(personalGuardado)
  const rrhh = personalAgregadoDesdeAsistencia(asistenciaRows, opts)
  const rrhhMap = new Map(rrhh.map((r) => [String(r.cargo).toLowerCase(), Number(r.cantidad) || 0]))
  const out = []
  for (const row of merged) {
    const key = String(row.cargo).toLowerCase()
    const diff = (Number(row.cantidad) || 0) - (rrhhMap.get(key) || 0)
    if (diff > 0) out.push({ cargo: row.cargo, cantidad: diff })
  }
  return out
}

export function puedeUsarCargoCantidadTemporal({ esDesarrollador, contratoNumero } = {}) {
  if (!esDesarrollador) return false
  const num = String(contratoNumero || '').trim().toUpperCase()
  return num === String(BITACORA_CARGO_CANTIDAD_TEMP_CONTRATO_NUMERO).toUpperCase()
}
