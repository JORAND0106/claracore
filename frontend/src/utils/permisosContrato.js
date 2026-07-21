/**
 * Resolución de permisos de matriz por contrato activo.
 * Prioridad: fila con contrato_id exacto → fila legacy (contrato_id null) → primera coincidencia.
 */

export function esDesarrolladorUsuario(usuario) {
  const norm = (txt) =>
    String(txt || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
  const cargo = norm(usuario?.cargo_nombre || usuario?.cargo || '')
  const rol = norm(usuario?.rol_nombre || usuario?.rol || '')
  return cargo === 'desarrollador' || rol === 'desarrollador'
}

export function permisoFuncionContrato(usuario, nombreFuncion, contratoId) {
  const want = (nombreFuncion || '').toLowerCase().trim()
  const rows = (usuario?.permisos || []).filter(
    (p) => (p.funcion_nombre || '').toLowerCase().trim() === want,
  )
  if (!rows.length) return null
  const cid = Number(contratoId ?? usuario?.contrato_id)
  if (Number.isFinite(cid)) {
    const exact = rows.find((p) => Number(p.contrato_id) === cid)
    if (exact) return exact
    const legacy = rows.find((p) => p.contrato_id == null || p.contrato_id === '')
    if (legacy) return legacy
  }
  return rows[0]
}

export function tienePermisoAlgunaAccion(p) {
  return !!(p && (p.ver || p.crear || p.editar || p.eliminar || p.validar || p.exportar))
}

export function tienePermisoFlag(usuario, nombreFuncion, flag, contratoId) {
  if (esDesarrolladorUsuario(usuario)) return true
  const p = permisoFuncionContrato(usuario, nombreFuncion, contratoId)
  return !!(p && p[flag])
}

export function tienePermisoVer(usuario, nombreFuncion, contratoId) {
  return tienePermisoFlag(usuario, nombreFuncion, 'ver', contratoId)
}

/** Reporte de Cantidades: nombre exacto o parcial (histórico). */
export function permisoReporteCantidades(usuario, contratoId) {
  const cid = Number(contratoId ?? usuario?.contrato_id)
  const exact = permisoFuncionContrato(usuario, 'Reporte de Cantidades', cid)
    || permisoFuncionContrato(usuario, 'reporte de cantidades', cid)
  if (exact) return exact
  const fuzzy = (usuario?.permisos || []).filter((p) =>
    (p.funcion_nombre || '').toLowerCase().includes('reporte de cantidades'),
  )
  if (!fuzzy.length) return null
  if (Number.isFinite(cid)) {
    const scoped = fuzzy.find((p) => Number(p.contrato_id) === cid)
    if (scoped) return scoped
    const legacy = fuzzy.find((p) => p.contrato_id == null || p.contrato_id === '')
    if (legacy) return legacy
  }
  return fuzzy[0]
}

/** Recordatorio informe periódico: permiso «Reporte de Cantidades» → editar. */
export function usuarioPuedeEditarRegistrosSicoe(usuario, contratoId) {
  if (esDesarrolladorUsuario(usuario)) return true
  const p = permisoReporteCantidades(usuario, contratoId)
  return !!(p?.editar)
}

/** Web Push: editar o validar SICOE, o cargo Administrador/Desarrollador. */
export function usuarioDebeSuscribirsePush(usuario, contratoId) {
  if (esDesarrolladorUsuario(usuario)) return true
  const norm = (txt) =>
    String(txt || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
  const cargo = norm(usuario?.cargo_nombre || usuario?.cargo || '')
  if (cargo === 'administrador') return true
  const p = permisoReporteCantidades(usuario, contratoId)
  return !!(p?.editar || p?.validar)
}
