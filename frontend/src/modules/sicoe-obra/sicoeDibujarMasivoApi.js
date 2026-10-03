/**
 * Helpers del dibujo masivo de huellas (Desarrollador).
 */
export function resumenDibujoVacio() {
  return {
    precisos: 0,
    aproximados: 0,
    no_dibujados: 0,
    con_inconsistencia: 0,
    hallazgos: 0,
    procesados: 0,
    omitidos_ya_dibujados: 0,
  }
}

export function mergeResumenDibujo(a = {}, b = {}) {
  const keys = new Set([
    ...Object.keys(resumenDibujoVacio()),
    ...Object.keys(a || {}),
    ...Object.keys(b || {}),
  ])
  const out = {}
  for (const k of keys) out[k] = Number(a?.[k] || 0) + Number(b?.[k] || 0)
  return out
}

export function progresoDibujoPct({ procesados = 0, total = 0 } = {}) {
  if (!total || total <= 0) return procesados > 0 ? 100 : 0
  return Math.min(100, Math.round((Number(procesados) / Number(total)) * 100))
}

/**
 * Ejecuta el dibujo masivo por lotes contra el API.
 * El backend siempre toma el siguiente lote pendiente (offset ignorado).
 * onProgreso({ procesados, total, resumen, done, pct })
 */
export async function ejecutarDibujoMasivoHuellas({
  API_URL,
  contratoId,
  token,
  batchSize = 40,
  onProgreso = null,
  signal = null,
}) {
  let total = null
  let resumen = resumenDibujoVacio()
  let done = false
  let guard = 0
  while (!done && guard < 5000) {
    guard += 1
    if (signal?.aborted) {
      const err = new Error('cancelado')
      err.code = 'ABORT'
      throw err
    }
    const res = await fetch(
      `${API_URL}/sicoe-obra/${contratoId}/huellas/dibujar-masivo`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ offset: 0, limit: batchSize }),
        signal,
      },
    )
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || `Error dibujar masivo: ${res.status}`)
    }
    const data = await res.json()
    if (total == null) total = Number(data.total_pendientes ?? 0)
    resumen = mergeResumenDibujo(resumen, data.resumen_batch || {})
    done = !!data.done || Number(data.lote || 0) === 0
    const procesados = Number(resumen.procesados || 0)
    onProgreso?.({
      procesados,
      total: total || 0,
      resumen,
      done,
      pct: progresoDibujoPct({ procesados, total: total || 0 }),
      batch: data.resumen_batch,
    })
  }
  return { resumen, total: total || 0 }
}
