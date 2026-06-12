/** Normaliza token PK para comparar plano ↔ maestro. */
export function normalizarPkToken(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, '')
}

/**
 * Resuelve fila del maestro pk_ids a partir del valor del polígono (Layer, PK_ID, etc.).
 */
export function buscarPkMaestroPorValorPlano(pkVal, pkList) {
  const v = String(pkVal || '').trim()
  if (!v || !Array.isArray(pkList) || !pkList.length) return null
  const vn = normalizarPkToken(v)

  const exact = pkList.find(
    (p) => normalizarPkToken(p.pk_id) === vn || normalizarPkToken(p.civ) === vn,
  )
  if (exact) return exact

  if (/^\d+$/.test(v)) {
    const byId = pkList.find((p) => p.id != null && String(p.id) === v)
    if (byId) return byId
  }

  const digits = v.replace(/\D/g, '')
  if (digits.length >= 4) {
    const byDigits = pkList.find((p) => {
      const pid = String(p.pk_id || '').replace(/\D/g, '')
      return pid && (pid === digits || pid.endsWith(digits) || digits.endsWith(pid))
    })
    if (byDigits) return byDigits
  }

  return null
}
