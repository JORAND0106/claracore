const KEY = 'cc_caja_menor_deep'

export function parseCajaMenorDeepLink(search) {
  const params = new URLSearchParams(search || '')
  if (params.get('modulo') !== 'caja_menor') return null
  const caja = Number(params.get('caja'))
  if (!Number.isFinite(caja) || caja <= 0) return null
  const contrato = Number(params.get('contrato'))
  const gasto = Number(params.get('gasto'))
  return {
    cajaId: caja,
    contratoId: Number.isFinite(contrato) && contrato > 0 ? contrato : null,
    gastoId: Number.isFinite(gasto) && gasto > 0 ? gasto : null,
  }
}

export function capturarCajaMenorDeepLink(search, storage) {
  const parsed = parseCajaMenorDeepLink(search)
  if (parsed) {
    try { storage?.setItem(KEY, JSON.stringify(parsed)) } catch { /* ignore */ }
    return parsed
  }
  try {
    const raw = storage?.getItem(KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    return data?.cajaId ? data : null
  } catch {
    return null
  }
}

export function limpiarCajaMenorDeepLink(storage) {
  try { storage?.removeItem(KEY) } catch { /* ignore */ }
}
