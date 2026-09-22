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

/** Tooltip / validación: operador de maquinaria solo desde asistencia del día. */
export const HINT_OPERADOR_DESDE_ASISTENCIA =
  'El colaborador debe estar registrado primero en Personal en obra (lista de asistencia del día) para poder seleccionarlo aquí como operador.'

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

/** Fila de asistencia a partir de un trabajador RRHH. Conserva tramo vía partial. */
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
    tramo: '',
    ...partial,
  }
}

/**
 * Tras autocompletar desde plantilla: limpia tramo en cada fila
 * para forzar reasignación por fila en el nuevo diario.
 */
export function stripTramoFilasAutocompletar(rows) {
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    ...r,
    tramo: '',
  }))
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
      tramo: String(r?.tramo || '').trim(),
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

/**
 * Filas de asistencia con el cargo indicado (comparación case-insensitive).
 * Opcional: filtrar también por empresa (`opts.empresa`).
 * Devuelve `{ row, index }` para poder actualizar/quitar en el arreglo original.
 */
export function filasAsistenciaPorCargo(rows, cargo, opts = {}) {
  const key = String(cargo || '').trim().toLowerCase()
  if (!key) return []
  const empFiltro = opts.empresa != null && String(opts.empresa).trim() !== ''
    ? keyEmpresa(opts.empresa)
    : null
  const out = []
  ;(rows || []).forEach((row, index) => {
    if (String(row?.cargo || '').trim().toLowerCase() !== key) return
    if (empFiltro != null && keyEmpresa(nombreEmpresaAsistencia(row)) !== empFiltro) return
    out.push({ row, index })
  })
  return out
}

/** Etiqueta de empresa en una fila de asistencia (snapshot). */
export const EMPRESA_SIN_NOMBRE = 'Sin empresa'
export const EMPRESA_REGISTRO_DIRECTO = 'Registro directo'

export function nombreEmpresaAsistencia(row) {
  const n = String(row?.subcontratista_nombre || '').trim()
  return n || EMPRESA_SIN_NOMBRE
}

export function keyEmpresa(nombre) {
  const n = String(nombre || '').trim().toLowerCase()
  return n || 'sin-empresa'
}

export function empresaCoincideRrhh(trab, empresa) {
  const want = String(empresa || '').trim().toLowerCase()
  if (!want || want === keyEmpresa(EMPRESA_SIN_NOMBRE)) {
    const got = String(trab?.empresa_nombre || '').trim()
    return !got
  }
  if (want === keyEmpresa(EMPRESA_REGISTRO_DIRECTO)) return true
  const got = String(trab?.empresa_nombre || '').trim().toLowerCase()
  return got === want
}

/**
 * Agregado {empresa, cargos[]} desde asistencia (sin catálogo).
 * Cada persona cuenta solo en su empresa.
 */
export function personalAgregadoPorEmpresaCargo(rows, opts = {}) {
  const live = opts.liveEstadosByRrhhId ?? null
  const getLive = (id) => {
    if (live == null || id == null) return null
    if (live instanceof Map) return live.get(Number(id)) ?? live.get(id) ?? null
    return live[id] ?? live[String(id)] ?? live[Number(id)] ?? null
  }
  /** @type {Map<string, { empresa: string, counts: Map<string, { cargo: string, cantidad: number }> }>} */
  const byEmp = new Map()
  for (const r of rows || []) {
    const liveEst = getLive(r?.rrhh_trabajador_id)
    const estado = liveEst != null ? normalizeEstadoRrhh(liveEst) : normalizeEstadoRrhh(r?.estado)
    if (!estadoCuentaEnResumen(estado)) continue
    const cargo = String(r?.cargo || '').trim()
    if (!cargo) continue
    const empresa = nombreEmpresaAsistencia(r)
    const ek = keyEmpresa(empresa)
    let g = byEmp.get(ek)
    if (!g) {
      g = { empresa, counts: new Map() }
      byEmp.set(ek, g)
    }
    const ck = cargo.toLowerCase()
    const prev = g.counts.get(ck)
    if (prev) prev.cantidad += 1
    else g.counts.set(ck, { cargo, cantidad: 1 })
  }
  return [...byEmp.entries()]
    .sort((a, b) => a[1].empresa.localeCompare(b[1].empresa, 'es'))
    .map(([empresa_key, g]) => {
      const agregado = [...g.counts.values()]
        .sort((a, b) => a.cargo.localeCompare(b.cargo, 'es'))
      const total = agregado.reduce((s, r) => s + (Number(r.cantidad) || 0), 0)
      return { empresa: g.empresa, empresa_key, agregado, total }
    })
}

/** Empresas únicas desde catálogo RRHH (trabajadores). */
export function empresasDesdeCatalogoRrhh(trabajadores = []) {
  const out = []
  const seen = new Set()
  for (const t of trabajadores || []) {
    const empresa = String(t?.empresa_nombre || '').trim() || EMPRESA_SIN_NOMBRE
    const ek = keyEmpresa(empresa)
    if (seen.has(ek)) continue
    seen.add(ek)
    out.push({ empresa, empresa_key: ek })
  }
  return out.sort((a, b) => a.empresa.localeCompare(b.empresa, 'es'))
}

/** Cantidad de registro directo (sin nombres) asociada a un cargo. */
export function cantidadManualPorCargo(personalManual, cargo) {
  const key = String(cargo || '').trim().toLowerCase()
  if (!key) return 0
  for (const r of personalManual || []) {
    if (String(r?.cargo || '').trim().toLowerCase() === key) {
      const n = Number(r?.cantidad)
      return Number.isFinite(n) && n > 0 ? n : 0
    }
  }
  return 0
}

/**
 * Resumen jerárquico: empresa → cargos (catálogo completo con ceros).
 * Cada colaborador solo cuenta en su empresa.
 */
export function resumenEmpresasCargos({
  catalogoCargos = [],
  rows = [],
  personalManual = [],
  trabajadores = [],
  liveEstadosByRrhhId = null,
} = {}) {
  const porAsistencia = personalAgregadoPorEmpresaCargo(rows, { liveEstadosByRrhhId })
  const byKey = new Map(porAsistencia.map((g) => [g.empresa_key, g]))

  const empresas = new Map()
  for (const e of empresasDesdeCatalogoRrhh(trabajadores)) {
    empresas.set(e.empresa_key, e.empresa)
  }
  for (const g of porAsistencia) {
    empresas.set(g.empresa_key, g.empresa)
  }

  const groups = [...empresas.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'es'))
    .map(([empresa_key, empresa]) => {
      const agg = byKey.get(empresa_key)?.agregado || []
      const cargos = resumenCargosDesdeCatalogo(catalogoCargos, agg)
      const total = cargos.reduce((s, r) => s + (Number(r.cantidad) || 0), 0)
      return {
        empresa,
        empresa_key,
        esRegistroDirecto: false,
        cargos,
        total,
      }
    })

  const manualNorm = normalizarPersonalCantidades(personalManual)
  if (manualNorm.length) {
    const cargos = resumenCargosDesdeCatalogo(catalogoCargos, manualNorm)
    const total = cargos.reduce((s, r) => s + (Number(r.cantidad) || 0), 0)
    groups.push({
      empresa: EMPRESA_REGISTRO_DIRECTO,
      empresa_key: '__registro_directo__',
      esRegistroDirecto: true,
      cargos,
      total,
    })
  }

  return groups
}


/**
 * Opciones de operador para Maquinaria: solo colaboradores ya nominados
 * en la asistencia del día (sin catálogo histórico completo).
 */
export function opcionesOperadorDesdeAsistencia(rows = []) {
  const seen = new Set()
  const out = []
  for (const r of rows || []) {
    const nombre = String(r?.nombre || '').trim()
    if (!nombre) continue
    let tid = null
    try {
      tid = r?.rrhh_trabajador_id != null && r.rrhh_trabajador_id !== ''
        ? Number(r.rrhh_trabajador_id)
        : null
      if (!Number.isFinite(tid)) tid = null
    } catch { tid = null }
    const key = tid != null ? `id:${tid}` : `n:${nombre.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    const cargo = String(r?.cargo || '').trim()
    out.push({
      rrhh_trabajador_id: tid,
      nombre,
      cargo,
      value: key,
      label: cargo ? `${nombre} · ${cargo}` : nombre,
    })
  }
  return out.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/** Valor de <select> para una fila de uso de maquinaria. */
export function operadorSelectValue(uso) {
  let tid = null
  try {
    tid = uso?.operador_rrhh_id != null && uso.operador_rrhh_id !== ''
      ? Number(uso.operador_rrhh_id)
      : null
    if (!Number.isFinite(tid)) tid = null
  } catch { tid = null }
  if (tid != null) return `id:${tid}`
  const nombre = String(uso?.operador || '').trim()
  return nombre ? `n:${nombre}` : ''
}

/** Interpreta el value del selector contra las opciones del día. */
export function parseOperadorSelectValue(value, opciones = []) {
  const v = String(value || '').trim()
  if (!v) return { operador: '', operador_rrhh_id: null }
  const list = Array.isArray(opciones) ? opciones : []
  const byValue = list.find((o) => o.value === v)
  if (byValue) {
    return {
      operador: byValue.nombre,
      operador_rrhh_id: byValue.rrhh_trabajador_id,
    }
  }
  if (v.startsWith('id:')) {
    const tid = Number(v.slice(3))
    if (Number.isFinite(tid)) {
      const found = list.find((o) => o.rrhh_trabajador_id === tid)
      if (found) return { operador: found.nombre, operador_rrhh_id: found.rrhh_trabajador_id }
    }
  }
  if (v.startsWith('n:')) {
    const nombre = v.slice(2).trim()
    const found = list.find((o) => o.nombre.toLowerCase() === nombre.toLowerCase())
    if (found) return { operador: found.nombre, operador_rrhh_id: found.rrhh_trabajador_id }
  }
  return { operador: '', operador_rrhh_id: null }
}

/**
 * True si el uso no tiene operador, o si el operador elegido está en asistencia.
 * Vacío se considera válido (operador opcional).
 */
export function operadorEstaEnAsistencia(uso, asistenciaRows) {
  const tieneOp = String(uso?.operador || '').trim() || uso?.operador_rrhh_id != null
  if (!tieneOp) return true
  const opciones = opcionesOperadorDesdeAsistencia(asistenciaRows)
  const current = operadorSelectValue(uso)
  if (!current) return true
  return opciones.some((o) => o.value === current)
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
    tramo: String(r.tramo || '').trim() || null,
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

/** True si el cargo RRHH del trabajador coincide con el cargo del resumen (case-insensitive). */
export function cargoCoincideRrhh(trab, cargo) {
  const want = String(cargo || '').trim().toLowerCase()
  if (!want) return true
  const got = String(trab?.cargo_aspira || trab?.cargo || '').trim().toLowerCase()
  return got === want
}

/** Subconjunto del catálogo RRHH con el cargo indicado. */
export function filtrarCatalogoPorCargo(catalogo = [], cargo = '') {
  const want = String(cargo || '').trim()
  if (!want) return Array.isArray(catalogo) ? [...catalogo] : []
  return (Array.isArray(catalogo) ? catalogo : []).filter((t) => cargoCoincideRrhh(t, want))
}

/** Filtra por cargo y, si se indica, por empresa contratante. */
export function filtrarCatalogoPorCargoYEmpresa(catalogo = [], cargo = '', empresa = '') {
  const byCargo = filtrarCatalogoPorCargo(catalogo, cargo)
  const emp = String(empresa || '').trim()
  if (!emp || emp === EMPRESA_REGISTRO_DIRECTO) return byCargo
  return byCargo.filter((t) => empresaCoincideRrhh(t, emp))
}

/**
 * Une catálogo de cargos RRHH con conteos del día (asistencia + manual).
 * Incluye cargos del catálogo con cantidad 0 y cargos con conteo fuera del catálogo.
 */
export function resumenCargosDesdeCatalogo(catalogoCargos = [], agregado = []) {
  const byKey = new Map()
  for (const r of agregado || []) {
    const cargo = String(r?.cargo || '').trim()
    if (!cargo) continue
    const key = cargo.toLowerCase()
    const n = Number(r?.cantidad)
    byKey.set(key, {
      cargo: byKey.get(key)?.cargo || cargo,
      cantidad: (byKey.get(key)?.cantidad || 0) + (Number.isFinite(n) ? n : 0),
    })
  }

  const seen = new Set()
  const out = []
  for (const raw of catalogoCargos || []) {
    const cargo = String(raw || '').trim()
    if (!cargo) continue
    const key = cargo.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const hit = byKey.get(key)
    out.push({ cargo, cantidad: hit ? Number(hit.cantidad) || 0 : 0 })
  }
  for (const hit of byKey.values()) {
    const key = String(hit.cargo).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ cargo: hit.cargo, cantidad: Number(hit.cantidad) || 0 })
  }
  return out.sort((a, b) => a.cargo.localeCompare(b.cargo, 'es'))
}

/**
 * Resuelve la lista base de cargos: API RRHH → cargos vistos en trabajadores → fallback.
 */
export function resolverCatalogoCargos({
  catalogoRrhh = [],
  trabajadores = [],
  fallback = [],
} = {}) {
  const dedupe = (list) => {
    const out = []
    const seen = new Set()
    for (const raw of list || []) {
      const cargo = String(raw || '').trim()
      if (!cargo) continue
      const key = cargo.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(cargo)
    }
    return out
  }
  const fromApi = dedupe(catalogoRrhh)
  if (fromApi.length) return fromApi
  const fromTrab = []
  for (const t of trabajadores || []) {
    fromTrab.push(t?.cargo_aspira || t?.cargo || '')
  }
  const derived = dedupe(fromTrab)
  if (derived.length) return derived
  return dedupe(fallback)
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

/**
 * Cargo/cuadrilla sin identificación individual:
 * - Dev + contrato ICCU temporal, o
 * - Contrato exento (ID 3) mientras el gate RRHH no esté activo.
 */
export function puedeUsarCargoCantidadAsistencia({
  esDesarrollador,
  contratoNumero,
  permiteCargoCuadrilla = false,
} = {}) {
  if (permiteCargoCuadrilla) return true
  return puedeUsarCargoCantidadTemporal({ esDesarrollador, contratoNumero })
}
