/** Serializa guardados SICOE por reporte (evita saturar conexiones HTTP al asignar varios ítems seguidos). */
const colas = new Map()

export function sicoeEncolarGuardadoReporte(reporteId, fn) {
  const key = String(reporteId ?? '')
  if (!key) return Promise.resolve().then(fn)

  const prev = colas.get(key) || Promise.resolve()
  const next = prev
    .catch(() => {})
    .then(() => fn())
  colas.set(key, next)
  return next.finally(() => {
    if (colas.get(key) === next) colas.delete(key)
  })
}
