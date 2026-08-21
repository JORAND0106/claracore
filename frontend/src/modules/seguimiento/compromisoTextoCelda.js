/** Texto de compromiso para celda compacta (1–2 líneas) + tooltip completo. */
export function textoCompromisoCelda(row, maxChars = 110) {
  const raw = String(row?.descripcion || row?.titulo || row?.redaccion || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!raw) return { short: '—', full: '' }
  if (raw.length <= maxChars) return { short: raw, full: raw }
  return { short: `${raw.slice(0, Math.max(1, maxChars - 1)).trim()}…`, full: raw }
}
