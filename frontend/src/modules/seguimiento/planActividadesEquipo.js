/**
 * Agregados de la Vista Equipo del Plan de actividades.
 * Fechas en calendario Colombia; reutiliza solapes y lógica de «por vencer» (1–3 d).
 */
import {
  expandirOcurrencias,
  intervalosSolapan,
  parseDate,
  toISO,
  addDays,
} from './planActividadesOcurrencias.js'
import { hoyBogotaDate } from './vencimientoLevels.js'

const CERRADOS = new Set(['cumplido', 'cancelado'])
const ABIERTOS = new Set(['abierto', 'en_progreso', 'parcial', 'reprogramado'])

export const EQUIPO_INDICADORES = [
  {
    key: 'abiertas',
    label: 'Abiertas',
    tip: 'Actividades abiertas sin vencimiento próximo',
    color: '#0284C7',
  },
  {
    key: 'porVencer',
    label: 'Por vencer',
    tip: 'Vencen en 1 a 3 días',
    color: '#EA580C',
  },
  {
    key: 'vencidas',
    label: 'Vencidas',
    tip: 'Vencidas (se cuentan siempre)',
    color: '#DC2626',
  },
  {
    key: 'cumplidas',
    label: 'Cumplidas',
    tip: 'Completadas en el período',
    color: '#16A34A',
  },
]

function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/** Lunes–domingo de la semana que contiene `hoy` (Bogotá). */
export function rangoSemanaActual(hoy = hoyBogotaDate()) {
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const dow = d.getDay() // 0=dom … 6=sáb
  const offsetLunes = dow === 0 ? -6 : 1 - dow
  const lunes = addDays(d, offsetLunes)
  const domingo = addDays(lunes, 6)
  return { desde: toISO(lunes), hasta: toISO(domingo) }
}

export function rangoMesActual(hoy = hoyBogotaDate()) {
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)
  return { desde: toISO(desde), hasta: toISO(hasta) }
}

export function resolverPeriodo({ modo = 'semana', desde = null, hasta = null, hoy = hoyBogotaDate() } = {}) {
  if (modo === 'mes') return { modo: 'mes', ...rangoMesActual(hoy) }
  if (modo === 'rango') {
    const a = parseDate(desde) || hoy
    const b = parseDate(hasta) || a
    const lo = a <= b ? a : b
    const hi = a <= b ? b : a
    return { modo: 'rango', desde: toISO(lo), hasta: toISO(hi) }
  }
  return { modo: 'semana', ...rangoSemanaActual(hoy) }
}

export function ocurrenciasDe(it, rango = null) {
  const opts = {
    fechaInicio: it?.fecha_inicio,
    fechaFin: it?.fecha_fin,
    periodicidad: it?.periodicidad,
    periodicidadHasta: it?.periodicidad_hasta,
  }
  if (rango?.desde || rango?.hasta) {
    return expandirOcurrencias({
      ...opts,
      rangoDesde: rango.desde,
      rangoHasta: rango.hasta,
    })
  }
  if (Array.isArray(it?.ocurrencias) && it.ocurrencias.length) return it.ocurrencias
  return expandirOcurrencias(opts)
}

function fechaFinEfectiva(it) {
  const fin = parseDate(it?.fecha_fin) || parseDate(it?.fecha_inicio)
  return fin
}

/** Una actividad cae en un solo cubo: cumplida | vencida | porVencer | abierta | null. */
export function clasificarActividad(it, hoy = hoyBogotaDate()) {
  const est = String(it?.estado_gestion || '').toLowerCase()
  if (est === 'cumplido') return 'cumplidas'
  if (est === 'cancelado') return null
  if (est === 'vencido') return 'vencidas'
  const fin = fechaFinEfectiva(it)
  if (fin) {
    const left = daysBetween(hoy, fin)
    if (left < 0) return 'vencidas'
    if (left >= 1 && left <= 3 && (ABIERTOS.has(est) || !est)) return 'porVencer'
  }
  if (ABIERTOS.has(est) || !est) return 'abiertas'
  return null
}

export function intersectaPeriodo(it, periodo) {
  if (!periodo?.desde || !periodo?.hasta) return true
  const occs = ocurrenciasDe(it, periodo)
  if (occs.length) return true
  const a = parseDate(it?.fecha_inicio)
  const b = parseDate(it?.fecha_fin) || a
  const d0 = parseDate(periodo.desde)
  const d1 = parseDate(periodo.hasta)
  if (!a || !b || !d0 || !d1) return false
  return a <= d1 && b >= d0
}

export function idsAsignados(it) {
  const out = new Set()
  const asigns = Array.isArray(it?.asignaciones) ? it.asignaciones : []
  for (const a of asigns) {
    const id = Number(a?.usuario_id || a?.id || 0)
    if (id > 0) out.add(id)
  }
  const legacy = Number(it?.asignado_a_id || 0)
  if (legacy > 0) out.add(legacy)
  return out
}

/**
 * Detalle de solapes de un colaborador en el período.
 * @returns {{ count: number, pares: { a: string, b: string }[], maxSimultaneas: number, diasOcupados: number, diasPeriodo: number, loadPct: number }}
 */
export function cargaColaborador(actividades, uid, periodo, hoy = hoyBogotaDate()) {
  const spans = []
  for (const it of actividades || []) {
    if (!idsAsignados(it).has(Number(uid))) continue
    if (CERRADOS.has(String(it.estado_gestion || '').toLowerCase())) continue
    const occs = ocurrenciasDe(it, periodo)
    for (const o of occs) {
      spans.push({
        id: Number(it.id),
        titulo: String(it.titulo || `Actividad ${it.id}`),
        a0: o.fecha_inicio,
        a1: o.fecha_fin,
      })
    }
  }

  const pares = []
  const overlapIds = new Set()
  for (let i = 0; i < spans.length; i += 1) {
    for (let j = i + 1; j < spans.length; j += 1) {
      if (spans[i].id === spans[j].id) continue
      if (intervalosSolapan(spans[i].a0, spans[i].a1, spans[j].a0, spans[j].a1)) {
        overlapIds.add(spans[i].id)
        overlapIds.add(spans[j].id)
        pares.push({ a: spans[i].titulo, b: spans[j].titulo })
      }
    }
  }

  const d0 = parseDate(periodo?.desde) || hoy
  const d1 = parseDate(periodo?.hasta) || hoy
  const diasPeriodo = Math.max(1, daysBetween(d0, d1) + 1)
  const ocupados = new Set()
  let maxSim = 0
  let cur = d0
  for (let g = 0; g < 400 && cur <= d1; g += 1) {
    const iso = toISO(cur)
    let n = 0
    for (const s of spans) {
      if (s.a0 <= iso && iso <= s.a1) n += 1
    }
    if (n > 0) ocupados.add(iso)
    if (n > maxSim) maxSim = n
    cur = addDays(cur, 1)
  }

  const loadPct = Math.min(100, Math.round((ocupados.size / diasPeriodo) * 100))
  return {
    count: overlapIds.size,
    pares: pares.slice(0, 8),
    maxSimultaneas: maxSim,
    diasOcupados: ocupados.size,
    diasPeriodo,
    loadPct,
    tieneSolape: overlapIds.size > 0,
  }
}

function emptyCounts() {
  return { abiertas: 0, porVencer: 0, vencidas: 0, cumplidas: 0 }
}

/**
 * Construye tarjetas de colaborador a partir del plan completo (ver_todos).
 * Vencidas siempre; el resto solo si intersecta el período.
 */
export function construirTarjetasEquipo({
  actividades = [],
  usuarios = [],
  periodo,
  hoy = hoyBogotaDate(),
} = {}) {
  const byUser = new Map()
  for (const u of usuarios || []) {
    const id = Number(u.id || 0)
    if (id <= 0) continue
    byUser.set(id, {
      id,
      usuario: u,
      nombre: u.nombre_completo
        || `${u.nombre || ''} ${u.apellidos || ''}`.trim()
        || u.nombre
        || u.email
        || `#${id}`,
      cargo: u.cargo_nombre || u.cargo || '',
      foto: u.foto_perfil_url || u.foto_url || u.avatar_url || '',
      counts: emptyCounts(),
      deptCounts: new Map(),
      items: [],
    })
  }

  for (const it of actividades || []) {
    const bucket = clasificarActividad(it, hoy)
    if (!bucket) continue
    const inPeriod = intersectaPeriodo(it, periodo)
    if (bucket !== 'vencidas' && !inPeriod) continue

    const deps = String(it.grupo_nombre || 'Sin departamento')
    for (const uid of idsAsignados(it)) {
      let card = byUser.get(uid)
      if (!card) {
        card = {
          id: uid,
          usuario: null,
          nombre: `Usuario #${uid}`,
          cargo: '',
          foto: '',
          counts: emptyCounts(),
          deptCounts: new Map(),
          items: [],
        }
        byUser.set(uid, card)
      }
      card.counts[bucket] += 1
      card.deptCounts.set(deps, (card.deptCounts.get(deps) || 0) + 1)
      card.items.push(it)
    }
  }

  const cards = []
  for (const card of byUser.values()) {
    const total = card.counts.abiertas + card.counts.porVencer
      + card.counts.vencidas + card.counts.cumplidas
    if (total <= 0) continue

    let departamento = 'Sin departamento'
    let max = -1
    for (const [dep, n] of card.deptCounts.entries()) {
      if (n > max) {
        max = n
        departamento = dep
      }
    }

    const carga = cargaColaborador(card.items, card.id, periodo, hoy)
    cards.push({
      id: card.id,
      usuario: card.usuario,
      nombre: card.nombre,
      cargo: card.cargo,
      foto: card.foto,
      departamento,
      counts: card.counts,
      total,
      carga,
    })
  }

  cards.sort((a, b) => {
    if (b.counts.vencidas !== a.counts.vencidas) return b.counts.vencidas - a.counts.vencidas
    if (b.total !== a.total) return b.total - a.total
    return String(a.nombre).localeCompare(String(b.nombre), 'es')
  })
  return cards
}

export function filtrarTarjetas(cards, filtroIndicador) {
  if (!filtroIndicador) return cards
  return (cards || []).filter((c) => Number(c.counts?.[filtroIndicador] || 0) > 0)
}

export function agruparPorDepartamento(cards) {
  const map = new Map()
  for (const c of cards || []) {
    const dep = c.departamento || 'Sin departamento'
    if (!map.has(dep)) map.set(dep, [])
    map.get(dep).push(c)
  }
  // Dentro de cada grupo ya vienen ordenados por vencidas (construcción global);
  // reordenar por si el filtro alteró el set.
  for (const list of map.values()) {
    list.sort((a, b) => {
      if (b.counts.vencidas !== a.counts.vencidas) return b.counts.vencidas - a.counts.vencidas
      return String(a.nombre).localeCompare(String(b.nombre), 'es')
    })
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'))
}

export function sumarIndicadores(cards) {
  const out = emptyCounts()
  for (const c of cards || []) {
    out.abiertas += c.counts.abiertas
    out.porVencer += c.counts.porVencer
    out.vencidas += c.counts.vencidas
    out.cumplidas += c.counts.cumplidas
  }
  return out
}

export function tooltipCarga(carga) {
  if (!carga) return 'Carga'
  const base = `Carga ${carga.loadPct}% · ${carga.maxSimultaneas} simultánea${carga.maxSimultaneas === 1 ? '' : 's'}`
  if (!carga.tieneSolape || !carga.pares?.length) return base
  const detail = carga.pares
    .slice(0, 3)
    .map((p) => `${p.a} × ${p.b}`)
    .join('; ')
  return `${base} · Solapes: ${detail}`
}
