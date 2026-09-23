/**
 * Reporte de personal (Bitácora Diario): agrupación por empresa
 * de Personal en obra + Maquinaria (por empresa del operador en RRHH).
 */

import {
  EMPRESA_SIN_NOMBRE,
  keyEmpresa,
  nombreCompletoRrhh,
  nombreEmpresaAsistencia,
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

/**
 * Bloques por empresa para el documento «Reporte de personal».
 * Empresas sin logo quedan con logo_url null (UI muestra placeholder).
 * Operadores sin empresa RRHH → bloque «Sin empresa».
 */
export function buildReportePersonalPorEmpresa({
  asistencia = [],
  usos = [],
  rrhhCatalogo = [],
  logosByEmpresaKey = {},
} = {}) {
  /** @type {Map<string, { empresa: string, empresa_key: string, logo_url: string|null, personal: object[], maquinaria: object[] }>} */
  const map = new Map()

  const ensure = (empresaNombre) => {
    const empresa = String(empresaNombre || '').trim() || EMPRESA_SIN_NOMBRE
    const ek = keyEmpresa(empresa)
    let g = map.get(ek)
    if (!g) {
      const logo = logosByEmpresaKey?.[ek] || logosByEmpresaKey?.[empresa] || null
      g = {
        empresa,
        empresa_key: ek,
        logo_url: logo ? String(logo) : null,
        personal: [],
        maquinaria: [],
      }
      map.set(ek, g)
    }
    return g
  }

  for (const r of Array.isArray(asistencia) ? asistencia : []) {
    const nombre = String(r?.nombre || '').trim()
    if (!nombre) continue
    const empresa = nombreEmpresaAsistencia(r)
    ensure(empresa).personal.push({
      nombre,
      cargo: normalizarCargoNombrePropio(r?.cargo || ''),
    })
  }

  for (const u of Array.isArray(usos) ? usos : []) {
    const equipo = String(u?.equipo_nombre || '').trim()
    if (!equipo) continue
    const empresa = empresaDeOperadorUso(u, rrhhCatalogo)
    const cant = u?.cantidad
    ensure(empresa).maquinaria.push({
      equipo,
      operador: String(u?.operador || '').trim() || '—',
      cantidad: cant === '' || cant == null ? '' : cant,
    })
  }

  return [...map.values()].sort((a, b) => {
    if (a.empresa_key === keyEmpresa(EMPRESA_SIN_NOMBRE)) return 1
    if (b.empresa_key === keyEmpresa(EMPRESA_SIN_NOMBRE)) return -1
    return a.empresa.localeCompare(b.empresa, 'es')
  })
}

/** Título visible: «Reporte de personal · YYYY-MM-DD» (o fecha formateada). */
export function tituloReportePersonal(fecha) {
  const f = String(fecha || '').trim()
  return f ? `Reporte de personal · ${f}` : 'Reporte de personal'
}

/** Formatea ISO date a dd/mm/yyyy si aplica. */
export function formatearFechaReportePersonal(fecha) {
  const f = String(fecha || '').trim()
  const m = f.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return f
  return `${m[3]}/${m[2]}/${m[1]}`
}
