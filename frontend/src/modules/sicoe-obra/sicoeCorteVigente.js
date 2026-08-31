/**
 * Selecciona el corte vigente (abierto) de una lista de cortes de subcontratista.
 * Misma ventana que backend: fecha_inicio <= hoy <= fecha_fin; mayor consecutivo gana.
 */
export function sicoeElegirCorteVigente(cortes, refDate = new Date()) {
  const list = Array.isArray(cortes) ? cortes : []
  if (!list.length) return null
  const y = refDate.getFullYear()
  const m = String(refDate.getMonth() + 1).padStart(2, '0')
  const d = String(refDate.getDate()).padStart(2, '0')
  const today = `${y}-${m}-${d}`
  const vigentes = list.filter((c) => {
    const fi = String(c?.fecha_inicio || '').slice(0, 10)
    const ff = String(c?.fecha_fin || '').slice(0, 10)
    if (!fi || !ff) return false
    return fi <= today && ff >= today
  })
  if (!vigentes.length) return null
  return [...vigentes].sort((a, b) => Number(b?.consecutivo || 0) - Number(a?.consecutivo || 0))[0]
}

/** Solo el corte vigente (array de 0|1 elementos) para selects de UI. */
export function sicoeCortesSoloVigente(cortes, refDate = new Date()) {
  const v = sicoeElegirCorteVigente(cortes, refDate)
  return v ? [v] : []
}
