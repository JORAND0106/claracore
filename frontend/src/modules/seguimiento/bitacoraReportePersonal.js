/**
 * Resumen cruzado Tramo × Empresa (Bitácora Diario):
 * cantidades de personal y maquinaria, sin listado nominal.
 * Empresa de maquinaria = empresa del operador vía catálogo RRHH.
 */

import { labelTramoBitacora, normalizeTramoValue } from './bitacoraTramoHelpers.js'
import {
  EMPRESA_SIN_NOMBRE,
  esEtiquetaAdministrativoExcluida,
  estadoCuentaEnResumen,
  keyEmpresa,
  nombreCompletoRrhh,
  nombreEmpresaAsistencia,
  normalizeEstadoRrhh,
  normalizarCargoNombrePropio,
} from './personalAsistenciaHelpers.js'

/** Empresa del operador de una fila de maquinaria vía catálogo RRHH. */
export function empresaDeOperadorUso(uso, rrhhCatalogo = []) {
  let tid = null
  try {
    tid = uso?.operador_rrhh_id != null && uso.operador_rrhh_id !== ''
      ? Number(uso.operador_rrhh_id)
      : null
    if (!Number.isFinite(tid)) tid = null
  } catch { tid = null }

  const list = Array.isArray(rrhhCatalogo) ? rrhhCatalogo : []
  if (tid != null) {
    const t = list.find((x) => Number(x?.id) === tid)
    if (t) {
      const n = String(t.empresa_nombre || '').trim()
      return n || EMPRESA_SIN_NOMBRE
    }
  }

  const nombre = String(uso?.operador || '').trim().toLowerCase()
  if (nombre) {
    const t = list.find((x) => nombreCompletoRrhh(x).toLowerCase() === nombre)
    if (t) {
      const n = String(t.empresa_nombre || '').trim()
      return n || EMPRESA_SIN_NOMBRE
    }
  }
  return EMPRESA_SIN_NOMBRE
}

/**
 * Mapa empresa_key → logo_url desde opciones RRHH + logo del contratista del contrato.
 */
export function resolveLogosPorEmpresa({ empresasOpciones = [], contrato = {} } = {}) {
  const out = {}
  for (const e of Array.isArray(empresasOpciones) ? empresasOpciones : []) {
    const nombre = String(e?.nombre || '').trim()
    const url = String(e?.logo_url || '').trim()
    if (nombre && url) out[keyEmpresa(nombre)] = url
  }
  const contratista = String(contrato?.contratista || '').trim()
  const logo = String(contrato?.logo_contratista || '').trim()
  if (contratista && logo) {
    const ek = keyEmpresa(contratista)
    if (!out[ek]) out[ek] = logo
  }
  return out
}

function emptyCell() {
  return { personal: 0, maquinaria: 0 }
}

function cantidadMaquinaria(uso) {
  const c = uso?.cantidad
  if (c === '' || c == null) return 1
  const n = Number(c)
  if (!Number.isFinite(n) || n <= 0) return 1
  return n
}

function sortEmpresas(a, b) {
  if (a.key === keyEmpresa(EMPRESA_SIN_NOMBRE)) return 1
  if (b.key === keyEmpresa(EMPRESA_SIN_NOMBRE)) return -1
  return a.nombre.localeCompare(b.nombre, 'es')
}

function sortTramos(a, b) {
  if (a.key === '__sin_tramo__') return 1
  if (b.key === '__sin_tramo__') return -1
  return a.nombre.localeCompare(b.nombre, 'es', { numeric: true })
}

/**
 * Matriz cruzada Tramo × Empresa con cantidades consolidadas.
 *
 * @returns {{
 *   tramos: { key: string, nombre: string }[],
 *   empresas: { key: string, nombre: string, logo_url: string|null }[],
 *   cells: Record<string, Record<string, { personal: number, maquinaria: number }>>,
 *   rowTotals: Record<string, { personal: number, maquinaria: number }>,
 *   colTotals: Record<string, { personal: number, maquinaria: number }>,
 *   grandTotal: { personal: number, maquinaria: number },
 * }}
 */
export function buildResumenTramoEmpresa({
  asistencia = [],
  usos = [],
  rrhhCatalogo = [],
  logosByEmpresaKey = {},
} = {}) {
  /** @type {Map<string, { key: string, nombre: string }>} */
  const tramoMap = new Map()
  /** @type {Map<string, { key: string, nombre: string, logo_url: string|null }>} */
  const empresaMap = new Map()
  /** @type {Map<string, Map<string, { personal: number, maquinaria: number }>>} */
  const cells = new Map()

  const ensureTramo = (raw) => {
    const nombre = labelTramoBitacora(raw)
    const key = normalizeTramoValue(raw) ? String(normalizeTramoValue(raw)) : '__sin_tramo__'
    if (!tramoMap.has(key)) tramoMap.set(key, { key, nombre })
    return key
  }

  const ensureEmpresa = (empresaNombre) => {
    const nombre = String(empresaNombre || '').trim() || EMPRESA_SIN_NOMBRE
    const key = keyEmpresa(nombre)
    if (!empresaMap.has(key)) {
      const logo = logosByEmpresaKey?.[key] || logosByEmpresaKey?.[nombre] || null
      empresaMap.set(key, {
        key,
        nombre,
        logo_url: logo ? String(logo) : null,
      })
    }
    return key
  }

  const bump = (tramoKey, empresaKey, field, delta) => {
    if (!cells.has(tramoKey)) cells.set(tramoKey, new Map())
    const row = cells.get(tramoKey)
    if (!row.has(empresaKey)) row.set(empresaKey, emptyCell())
    row.get(empresaKey)[field] += delta
  }

  for (const r of Array.isArray(asistencia) ? asistencia : []) {
    const nombre = String(r?.nombre || '').trim()
    if (!nombre) continue
    const estado = normalizeEstadoRrhh(r?.estado)
    if (!estadoCuentaEnResumen(estado)) continue
    const cargo = normalizarCargoNombrePropio(r?.cargo || '')
    if (cargo && esEtiquetaAdministrativoExcluida(cargo)) continue
    const tk = ensureTramo(r?.tramo)
    const ek = ensureEmpresa(nombreEmpresaAsistencia(r))
    bump(tk, ek, 'personal', 1)
  }

  for (const u of Array.isArray(usos) ? usos : []) {
    const equipo = String(u?.equipo_nombre || '').trim()
    if (!equipo) continue
    const tk = ensureTramo(u?.tramo)
    const ek = ensureEmpresa(empresaDeOperadorUso(u, rrhhCatalogo))
    bump(tk, ek, 'maquinaria', cantidadMaquinaria(u))
  }

  const tramos = [...tramoMap.values()].sort(sortTramos)
  const empresas = [...empresaMap.values()].sort(sortEmpresas)

  /** @type {Record<string, Record<string, { personal: number, maquinaria: number }>>} */
  const cellObj = {}
  /** @type {Record<string, { personal: number, maquinaria: number }>} */
  const rowTotals = {}
  /** @type {Record<string, { personal: number, maquinaria: number }>} */
  const colTotals = {}
  const grandTotal = emptyCell()

  for (const emp of empresas) colTotals[emp.key] = emptyCell()

  for (const tr of tramos) {
    cellObj[tr.key] = {}
    rowTotals[tr.key] = emptyCell()
    for (const emp of empresas) {
      const c = cells.get(tr.key)?.get(emp.key) || emptyCell()
      const cell = { personal: c.personal, maquinaria: c.maquinaria }
      cellObj[tr.key][emp.key] = cell
      rowTotals[tr.key].personal += cell.personal
      rowTotals[tr.key].maquinaria += cell.maquinaria
      colTotals[emp.key].personal += cell.personal
      colTotals[emp.key].maquinaria += cell.maquinaria
      grandTotal.personal += cell.personal
      grandTotal.maquinaria += cell.maquinaria
    }
  }

  return {
    tramos,
    empresas,
    cells: cellObj,
    rowTotals,
    colTotals,
    grandTotal,
  }
}

/** @deprecated Preferir buildResumenTramoEmpresa. Conservado por compat de imports. */
export function buildReportePersonalPorEmpresa(opts = {}) {
  const resumen = buildResumenTramoEmpresa(opts)
  return resumen.empresas.map((emp) => ({
    empresa: emp.nombre,
    empresa_key: emp.key,
    logo_url: emp.logo_url,
    personal: [],
    maquinaria: [],
    personal_count: resumen.colTotals[emp.key]?.personal || 0,
    maquinaria_count: resumen.colTotals[emp.key]?.maquinaria || 0,
  }))
}

/** Título visible del resumen. */
export function tituloReportePersonal(fecha) {
  const f = String(fecha || '').trim()
  return f
    ? `Resumen por tramo y empresa · ${f}`
    : 'Resumen por tramo y empresa'
}

/** Formatea ISO date a dd/mm/yyyy si aplica. */
export function formatearFechaReportePersonal(fecha) {
  const f = String(fecha || '').trim()
  const m = f.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return f
  return `${m[3]}/${m[2]}/${m[1]}`
}

/** Nombre de archivo PNG sugerido. */
export function nombreArchivoResumenPng(fecha) {
  const f = String(fecha || '').trim().slice(0, 10) || 'dia'
  return `resumen-tramo-empresa-${f}.png`
}

/** Formato compacto de celda: «3p · 1m» o «—» si vacío. */
export function formatoCeldaResumen({ personal = 0, maquinaria = 0 } = {}) {
  const p = Number(personal) || 0
  const m = Number(maquinaria) || 0
  if (p <= 0 && m <= 0) return '—'
  const parts = []
  if (p > 0) parts.push(`${p}p`)
  if (m > 0) parts.push(`${m}m`)
  return parts.join(' · ')
}
