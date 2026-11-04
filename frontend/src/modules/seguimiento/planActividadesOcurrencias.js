/**
 * Cálculo de ocurrencias y solapes del Plan de actividades (espejo del backend).
 */

function parseDate(raw) {
  if (!raw) return null
  const s = String(raw).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toISO(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(d, n) {
  const x = new Date(d.getTime())
  x.setDate(x.getDate() + n)
  return x
}

function addMonthsClamp(d, n) {
  const y = d.getFullYear()
  const m = d.getMonth() + n
  const target = new Date(y, m, 1)
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  const day = Math.min(d.getDate(), last)
  return new Date(target.getFullYear(), target.getMonth(), day)
}

/**
 * @returns {{ fecha_inicio: string, fecha_fin: string }[]}
 */
export function expandirOcurrencias({
  fechaInicio,
  fechaFin,
  periodicidad = 'ninguna',
  periodicidadHasta = null,
  rangoDesde = null,
  rangoHasta = null,
} = {}) {
  let ini = parseDate(fechaInicio) || parseDate(fechaFin)
  let fin = parseDate(fechaFin) || parseDate(fechaInicio)
  if (!ini || !fin) return []
  if (fin < ini) {
    const tmp = ini
    ini = fin
    fin = tmp
  }
  const span = Math.round((fin - ini) / 86400000)
  const per = String(periodicidad || 'ninguna').toLowerCase()
  let occs = []

  if (per === 'ninguna' || !['semanal', 'quincenal', 'mensual'].includes(per)) {
    occs = [{ fecha_inicio: toISO(ini), fecha_fin: toISO(fin) }]
  } else {
    let limite = parseDate(periodicidadHasta) || fin
    if (limite < fin) limite = fin
    const hard = addDays(ini, 365 * 5)
    if (limite > hard) limite = hard
    let curIni = ini
    let curFin = fin
    while (curIni <= limite && occs.length < 520) {
      occs.push({ fecha_inicio: toISO(curIni), fecha_fin: toISO(curFin) })
      let nextIni
      if (per === 'semanal') nextIni = addDays(curIni, 7)
      else if (per === 'quincenal') nextIni = addDays(curIni, 14)
      else nextIni = addMonthsClamp(curIni, 1)
      curIni = nextIni
      curFin = addDays(curIni, span)
    }
  }

  const d0 = parseDate(rangoDesde)
  const d1 = parseDate(rangoHasta)
  if (!d0 && !d1) return occs
  return occs.filter((o) => {
    const a = parseDate(o.fecha_inicio)
    const b = parseDate(o.fecha_fin)
    if (!a || !b) return false
    if (d1 && a > d1) return false
    if (d0 && b < d0) return false
    return true
  })
}

export function intervalosSolapan(a0, a1, b0, b1) {
  const A0 = parseDate(a0)
  const A1 = parseDate(a1)
  const B0 = parseDate(b0)
  const B1 = parseDate(b1)
  if (!A0 || !A1 || !B0 || !B1) return false
  return A0 <= B1 && B0 <= A1
}

/** Marca ids de actividades cuyas barras se cruzan para el mismo asignado. */
export function idsConSolapePorAsignado(actividades = []) {
  const byAsig = new Map()
  for (const it of actividades) {
    const asigns = Array.isArray(it.asignaciones) ? it.asignaciones : []
    const occs = Array.isArray(it.ocurrencias) && it.ocurrencias.length
      ? it.ocurrencias
      : expandirOcurrencias({
        fechaInicio: it.fecha_inicio,
        fechaFin: it.fecha_fin,
        periodicidad: it.periodicidad,
        periodicidadHasta: it.periodicidad_hasta,
      })
    for (const a of asigns) {
      const uid = Number(a.usuario_id || a.id || 0)
      if (!uid) continue
      if (!byAsig.has(uid)) byAsig.set(uid, [])
      for (const o of occs) {
        byAsig.get(uid).push({
          id: Number(it.id),
          a0: o.fecha_inicio,
          a1: o.fecha_fin,
        })
      }
    }
  }
  const out = new Set()
  for (const spans of byAsig.values()) {
    for (let i = 0; i < spans.length; i += 1) {
      for (let j = i + 1; j < spans.length; j += 1) {
        if (spans[i].id === spans[j].id) continue
        if (intervalosSolapan(spans[i].a0, spans[i].a1, spans[j].a0, spans[j].a1)) {
          out.add(spans[i].id)
          out.add(spans[j].id)
        }
      }
    }
  }
  return out
}

export function rangeDaysFromActividades(actividades = [], fallbackDays = 21) {
  let min = null
  let max = null
  for (const it of actividades) {
    const occs = Array.isArray(it.ocurrencias) && it.ocurrencias.length
      ? it.ocurrencias
      : expandirOcurrencias({
        fechaInicio: it.fecha_inicio,
        fechaFin: it.fecha_fin,
        periodicidad: it.periodicidad,
        periodicidadHasta: it.periodicidad_hasta,
      })
    for (const o of occs) {
      const a = parseDate(o.fecha_inicio)
      const b = parseDate(o.fecha_fin)
      if (a && (!min || a < min)) min = a
      if (b && (!max || b > max)) max = b
    }
  }
  if (!min || !max) {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    return {
      desde: toISO(hoy),
      hasta: toISO(addDays(hoy, fallbackDays)),
      days: Array.from({ length: fallbackDays + 1 }, (_, i) => toISO(addDays(hoy, i))),
    }
  }
  const days = []
  let cur = min
  let guard = 0
  while (cur <= max && guard < 366) {
    days.push(toISO(cur))
    cur = addDays(cur, 1)
    guard += 1
  }
  return { desde: toISO(min), hasta: toISO(max), days }
}

export { parseDate, toISO, addDays }
