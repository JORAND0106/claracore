/**
 * Elección de acta RPO al revalidar un registro reversado.
 * Si hay acta_rpo_id_pre_reversion distinta de la vigente → preguntar.
 */

export function sicoeActaLabel(acta) {
  if (!acta) return 'Acta'
  const num = acta.numero_rpo
  const fi = String(acta.fecha_inicio || '').slice(0, 10)
  const ff = String(acta.fecha_fin || '').slice(0, 10)
  const periodo = fi || ff ? `${fi || '…'} → ${ff || '…'}` : ''
  if (num != null && periodo) return `Acta RPO ${num} (${periodo})`
  if (num != null) return `Acta RPO ${num}`
  if (periodo) return `Acta (${periodo})`
  return 'Acta'
}

/**
 * @returns {{ requerida: boolean, original: object|null, vigente: object|null }}
 */
export function sicoeActaEleccionAlRevalidar({
  registro,
  actasList = [],
  actaVigente = null,
} = {}) {
  const preId = registro?.acta_rpo_id_pre_reversion
  if (preId == null || preId === '') {
    return { requerida: false, original: null, vigente: null }
  }
  const list = Array.isArray(actasList) ? actasList : []
  const original =
    list.find((a) => String(a?.id) === String(preId)) ||
    list.find((a) => String(a?.id) === String(registro?.acta_rpo_id)) ||
    (registro?.acta_rpo_id != null || preId != null
      ? {
          id: preId,
          numero_rpo: registro?.acta_rpo_numero ?? null,
          fecha_inicio: null,
          fecha_fin: null,
        }
      : null)

  let vigente = actaVigente || null
  if (!vigente && list.length) {
    const today = new Date().toISOString().slice(0, 10)
    vigente =
      list.find((a) => {
        const fi = String(a?.fecha_inicio || '').slice(0, 10)
        const ff = String(a?.fecha_fin || '').slice(0, 10)
        return fi && ff && fi <= today && today <= ff
      }) || null
  }
  if (!vigente) {
    return { requerida: false, original, vigente: null }
  }
  if (String(preId) === String(vigente.id)) {
    return { requerida: false, original, vigente }
  }
  return { requerida: true, original, vigente }
}

/** Niveles que asignan/realinean acta RPO al aprobar (N2+). */
export function sicoeNivelAsignaActaRpo(nivel) {
  const n = Number(nivel)
  return Number.isFinite(n) && n >= 2
}
