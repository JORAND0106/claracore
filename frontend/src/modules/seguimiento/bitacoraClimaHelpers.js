/** Helpers de clima histórico / en vivo para Bitácora (testables sin JSX). */
import { hoyISOBogota, labelClima } from './bitacoraConstants.js'

export function esFechaPasadaBitacora(fechaISO, hoyISO = hoyISOBogota()) {
  const f = String(fechaISO || '').slice(0, 10)
  const h = String(hoyISO || '').slice(0, 10)
  return Boolean(f && h && f < h)
}

/** Elige el slot horario más cercano a preferHour (0–23) desde respuesta hourly. */
export function pickHourlyClima(hourly, preferHour = 12) {
  const times = hourly?.time || []
  const temps = hourly?.temperature_2m || []
  const codes = hourly?.weather_code || []
  if (!times.length) return null
  let bestIdx = 0
  let bestDist = 99
  const prefer = Math.max(0, Math.min(23, Number(preferHour) || 12))
  for (let i = 0; i < times.length; i += 1) {
    let hh = 12
    try {
      hh = Number(String(times[i]).slice(11, 13))
    } catch { /* ignore */ }
    if (!Number.isFinite(hh)) continue
    const dist = Math.abs(hh - prefer)
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = i
    }
  }
  const code = codes[bestIdx]
  const temp = temps[bestIdx]
  let codeI = null
  let tempF = null
  try {
    codeI = code != null && code !== '' ? Number(code) : null
    if (!Number.isFinite(codeI)) codeI = null
  } catch { codeI = null }
  try {
    tempF = temp != null && temp !== '' ? Number(temp) : null
    if (!Number.isFinite(tempF)) tempF = null
  } catch { tempF = null }
  return {
    clima_codigo: codeI,
    clima_temp_c: tempF,
    clima_descripcion: labelClima(codeI),
  }
}
