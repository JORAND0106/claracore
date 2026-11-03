/**
 * Empresa del usuario (Gestión de usuarios) y aislamiento por subcontratista.
 * Independiente del cargo/rol: si la empresa es un subcontratista, aísla.
 */

export function normalizarEmpresaTipo(tipo) {
  const t = String(tipo || '').trim().toLowerCase().replace(/í/g, 'i')
  if (!t) return null
  if (t === 'consorcio' || t === 'contratista') return 'contratista'
  if (t === 'interventoria') return 'interventoria'
  if (t === 'subcontratista') return 'subcontratista'
  return null
}

export function parseSubcontratistaId(raw) {
  if (raw == null || raw === false) return null
  if (typeof raw === 'boolean') return null
  const s = String(raw).trim().toLowerCase()
  if (!s || s === 'none' || s === 'null' || s === 'undefined' || s === 'nan') return null
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Clave del selector: contratista | interventoria | sub:{id} */
export function empresaKeyFromUsuario(u) {
  const tipo = normalizarEmpresaTipo(u?.empresa_tipo)
  const sid = parseSubcontratistaId(u?.subcontratista_id ?? u?.sub_id)
  if (tipo === 'contratista') return 'contratista'
  if (tipo === 'interventoria') return 'interventoria'
  if (sid != null) return `sub:${sid}`
  if (tipo === 'subcontratista') return ''
  return ''
}

export function empresaFromKey(key) {
  const k = String(key || '').trim()
  if (!k) return { empresa_tipo: null, subcontratista_id: null }
  const low = k.toLowerCase().replace(/í/g, 'i')
  if (low === 'contratista' || low === 'consorcio') {
    return { empresa_tipo: 'contratista', subcontratista_id: null }
  }
  if (low === 'interventoria') {
    return { empresa_tipo: 'interventoria', subcontratista_id: null }
  }
  if (low.startsWith('sub:')) {
    return { empresa_tipo: 'subcontratista', subcontratista_id: parseSubcontratistaId(low.slice(4)) }
  }
  const sid = parseSubcontratistaId(k)
  if (sid != null) return { empresa_tipo: 'subcontratista', subcontratista_id: sid }
  return { empresa_tipo: null, subcontratista_id: null }
}

/**
 * (restricted, forcedId) — espejo de scope_subcontratista del backend.
 */
export function scopeEmpresaSubcontratista(usuario) {
  const cargo = String(usuario?.cargo_nombre || usuario?.cargo || '').trim().toLowerCase()
  const tipo = normalizarEmpresaTipo(usuario?.empresa_tipo)
  if (tipo === 'contratista' || tipo === 'interventoria') {
    return { restricted: false, forcedId: null }
  }
  const sid = parseSubcontratistaId(usuario?.subcontratista_id ?? usuario?.sub_id)
  if (sid != null) return { restricted: true, forcedId: sid }
  if (tipo === 'subcontratista' || cargo === 'subcontratista') {
    return { restricted: true, forcedId: null }
  }
  return { restricted: false, forcedId: null }
}

/** True si el usuario está aislado por empresa subcontratista. */
export function usuarioAisladoPorEmpresaSub(usuario) {
  return scopeEmpresaSubcontratista(usuario).restricted
}

/**
 * ¿Debe tratarse como «vista subcontratista» (economía propia, filtro de datos)?
 * Incluye rol legacy «subcontratista».
 */
export function esVistaSubcontratista(usuario) {
  const rol = String(usuario?.rol_nombre || usuario?.rol || '')
    .trim()
    .toLowerCase()
    .replace(/í/g, 'i')
  if (rol === 'subcontratista') return true
  return usuarioAisladoPorEmpresaSub(usuario)
}
