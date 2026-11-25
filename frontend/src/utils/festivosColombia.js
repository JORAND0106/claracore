/**
 * Domingos y festivos oficiales de Colombia (cualquier año).
 *
 * Base legal: Ley 51 de 1983 (Ley Emiliani) — ciertos festivos se trasladan
 * al lunes siguiente cuando no caen en lunes. Semana Santa y festivos
 * eclesiásticos derivados se calculan desde la Pascua (algoritmo de Meeus).
 *
 * Reutilizable por cualquier módulo (calendarios, reportes, etc.).
 */

/** @typedef {{ iso: string, nombre: string, tipo: 'fijo'|'emiliani'|'pascua' }} FestivoColombia */

/**
 * Pascua occidental (domingo) para el año dado — algoritmo de Meeus/Jones/Butcher.
 * @param {number} year
 * @returns {{ y: number, m: number, d: number }}
 */
export function pascuaOccidental(year) {
  const y = Number(year)
  const a = y % 19
  const b = Math.floor(y / 100)
  const c = y % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) // 3=marzo, 4=abril
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return { y, m: month, d: day }
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

/** @param {number} y @param {number} m 1-12 @param {number} d */
export function toIsoDate(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`
}

/** Parse YYYY-MM-DD → partes (UTC noon). */
export function parseIsoDate(iso) {
  const s = String(iso || '').slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]), iso: s }
}

/** Día de la semana 0=domingo … 6=sábado (calendario gregoriano civil). */
export function weekdayIso(iso) {
  const p = parseIsoDate(iso)
  if (!p) return null
  // UTC noon evita corrimientos de huso
  return new Date(Date.UTC(p.y, p.m - 1, p.d, 12, 0, 0)).getUTCDay()
}

export function isDomingoIso(iso) {
  return weekdayIso(iso) === 0
}

/** Suma días a una fecha ISO (UTC). */
export function addDaysIso(iso, days) {
  const p = parseIsoDate(iso)
  if (!p) return ''
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d, 12, 0, 0))
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0))
  return toIsoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

/**
 * Ley Emiliani: si no es lunes, traslada al lunes siguiente.
 * @param {string} iso
 */
export function trasladarAlLunes(iso) {
  const wd = weekdayIso(iso)
  if (wd == null) return iso
  if (wd === 1) return iso // ya es lunes
  // 0 domingo → +1; 2..6 → 8-wd
  const delta = wd === 0 ? 1 : (8 - wd)
  return addDaysIso(iso, delta)
}

/**
 * Festivos oficiales de Colombia para un año civil.
 * Si un festivo cae en domingo, se conserva como festivo (no se oculta).
 * @param {number} year
 * @returns {FestivoColombia[]}
 */
export function festivosColombiaAnio(year) {
  const y = Number(year)
  if (!Number.isFinite(y) || y < 1900 || y > 2200) return []

  const pascua = pascuaOccidental(y)
  const pascuaIso = toIsoDate(pascua.y, pascua.m, pascua.d)

  /** @type {FestivoColombia[]} */
  const out = []

  const pushFijo = (m, d, nombre) => {
    out.push({ iso: toIsoDate(y, m, d), nombre, tipo: 'fijo' })
  }
  const pushEmiliani = (m, d, nombre) => {
    const base = toIsoDate(y, m, d)
    out.push({ iso: trasladarAlLunes(base), nombre, tipo: 'emiliani' })
  }

  // Fijos (no se trasladan)
  pushFijo(1, 1, 'Año Nuevo')
  pushFijo(5, 1, 'Día del Trabajo')
  pushFijo(7, 20, 'Independencia de Colombia')
  pushFijo(8, 7, 'Batalla de Boyacá')
  pushFijo(12, 8, 'Inmaculada Concepción')
  pushFijo(12, 25, 'Navidad')

  // Emiliani (traslado al lunes)
  pushEmiliani(1, 6, 'Día de los Reyes Magos')
  pushEmiliani(3, 19, 'Día de San José')
  pushEmiliani(6, 29, 'San Pedro y San Pablo')
  pushEmiliani(8, 15, 'Asunción de la Virgen')
  pushEmiliani(10, 12, 'Día de la Raza')
  pushEmiliani(11, 1, 'Todos los Santos')
  pushEmiliani(11, 11, 'Independencia de Cartagena')

  // Relativos a Pascua
  out.push({
    iso: addDaysIso(pascuaIso, -3),
    nombre: 'Jueves Santo',
    tipo: 'pascua',
  })
  out.push({
    iso: addDaysIso(pascuaIso, -2),
    nombre: 'Viernes Santo',
    tipo: 'pascua',
  })
  // Ascensión (+39), Corpus (+60), Sagrado Corazón (+68) — también Emiliani
  out.push({
    iso: trasladarAlLunes(addDaysIso(pascuaIso, 39)),
    nombre: 'Ascensión del Señor',
    tipo: 'pascua',
  })
  out.push({
    iso: trasladarAlLunes(addDaysIso(pascuaIso, 60)),
    nombre: 'Corpus Christi',
    tipo: 'pascua',
  })
  out.push({
    iso: trasladarAlLunes(addDaysIso(pascuaIso, 68)),
    nombre: 'Sagrado Corazón de Jesús',
    tipo: 'pascua',
  })

  // Deduplicar por ISO (p. ej. coincidencia San Pedro + Sagrado Corazón)
  const byIso = new Map()
  for (const f of out) {
    const prev = byIso.get(f.iso)
    if (!prev) {
      byIso.set(f.iso, f)
      continue
    }
    // Conservar ambos nombres si coinciden en la misma fecha
    byIso.set(f.iso, {
      ...prev,
      nombre: prev.nombre === f.nombre ? prev.nombre : `${prev.nombre} / ${f.nombre}`,
    })
  }
  return [...byIso.values()].sort((a, b) => a.iso.localeCompare(b.iso))
}

/** Mapa iso → festivo para un año (caché liviana). */
const _cacheAnio = new Map()

export function mapaFestivosAnio(year) {
  const y = Number(year)
  let m = _cacheAnio.get(y)
  if (!m) {
    m = new Map(festivosColombiaAnio(y).map((f) => [f.iso, f]))
    _cacheAnio.set(y, m)
    if (_cacheAnio.size > 32) {
      const first = _cacheAnio.keys().next().value
      _cacheAnio.delete(first)
    }
  }
  return m
}

/**
 * @param {string} iso YYYY-MM-DD
 * @returns {FestivoColombia | null}
 */
export function festivoEnFecha(iso) {
  const p = parseIsoDate(iso)
  if (!p) return null
  return mapaFestivosAnio(p.y).get(p.iso) || null
}

/**
 * Marca informativa de calendario: festivo (prioridad) o domingo.
 * @param {string} iso
 * @returns {{ tipo: 'festivo'|'domingo', label: string, tooltip: string } | null}
 */
export function marcaCalendarioFecha(iso) {
  const p = parseIsoDate(iso)
  if (!p) return null
  const fest = mapaFestivosAnio(p.y).get(p.iso)
  if (fest) {
    return {
      tipo: 'festivo',
      label: fest.nombre,
      tooltip: `Festivo: ${fest.nombre}`,
    }
  }
  if (isDomingoIso(p.iso)) {
    return {
      tipo: 'domingo',
      label: 'Domingo',
      tooltip: 'Domingo',
    }
  }
  return null
}

/** Convención visual compartida (leyenda de calendarios). */
export const CALENDARIO_FESTIVO_LEGEND = {
  id: 'festivo_domingo',
  label: 'Domingo / festivo',
  color: '#ea580c',
  tooltip: 'Domingo o festivo oficial de Colombia (solo informativo)',
}
