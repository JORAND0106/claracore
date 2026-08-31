/**
 * Subcontratista / corte mostrados en detalle de registro.
 * Prioridad: campos del registro (p. ej. tras masivo-corte) sobre la cabecera del reporte.
 */

export function sicoeSubcontratistaIdDeRegistro(registro, reporte) {
  const rid = registro?.subcontratista_id
  if (rid != null && String(rid).trim() !== '') return rid
  const hid = reporte?.subcontratista_id
  if (hid != null && String(hid).trim() !== '') return hid
  return null
}

export function sicoeLabelSubcontratista(s) {
  if (!s) return null
  return s.nombre || s.razon_social || (s.id != null ? `Sub #${s.id}` : null)
}

/**
 * Nombre a mostrar junto a RPO/Corte en HojaRegistro.
 * Si el registro tiene subcontratista_id propio, no se usa el nombre del reporte
 * salvo que sea el mismo id (evita mostrar el sub del reporte tras asignación masiva).
 */
export function sicoeNombreSubcontratistaRegistro({
  registro = null,
  reporte = null,
  listaSubs = [],
} = {}) {
  const idReg = registro?.subcontratista_id
  const tieneIdReg = idReg != null && String(idReg).trim() !== ''
  if (tieneIdReg) {
    const found = (listaSubs || []).find((s) => String(s?.id) === String(idReg))
    const label = sicoeLabelSubcontratista(found)
    if (label) return label
    if (
      reporte?.subcontratista_nombre &&
      reporte?.subcontratista_id != null &&
      String(reporte.subcontratista_id) === String(idReg)
    ) {
      return reporte.subcontratista_nombre
    }
    return `Sub #${idReg}`
  }
  const idEff = sicoeSubcontratistaIdDeRegistro(registro, reporte)
  if (idEff != null) {
    const found = (listaSubs || []).find((s) => String(s?.id) === String(idEff))
    const label = sicoeLabelSubcontratista(found)
    if (label) return label
  }
  return reporte?.subcontratista_nombre || null
}

/** Número de corte: prioriza corte_id del registro sobre corte_numero del reporte. */
export function sicoeCorteNumeroDeRegistro({
  registro = null,
  reporte = null,
  listaCortes = [],
} = {}) {
  const cid = registro?.corte_id
  if (cid != null && String(cid).trim() !== '') {
    const found = (listaCortes || []).find((c) => String(c?.id) === String(cid))
    if (found?.consecutivo != null) return found.consecutivo
    return cid
  }
  return reporte?.corte_numero ?? null
}
