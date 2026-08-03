import { API_BASE } from '../../apiBase'
import { sicoeItemsSugerenciasParams } from './sicoeFiltroItemHelpers'

export { sicoeItemPickerPuedeBuscar, sicoeItemsSugerenciasParams } from './sicoeFiltroItemHelpers'

const API = API_BASE

function fmtFechaCorta(iso) {
  if (!iso) return ''
  try {
    return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return String(iso).slice(0, 10)
  }
}

function periodoRango(ini, fin) {
  const a = fmtFechaCorta(ini)
  const b = fmtFechaCorta(fin)
  if (a && b) return `${a} | ${b}`
  return a || b || ''
}

/** Opción autocomplete semana: número + periodo (inicio | fin). */
export function sicoeOpcionSemana(s) {
  const n = s?.numero_semana ?? s
  const value = String(n ?? '').trim()
  if (!value) return null
  const periodo = periodoRango(s?.fecha_inicio, s?.fecha_fin)
  return {
    value,
    label: `Semana ${value}`,
    descripcion: periodo,
  }
}

/** Opción autocomplete acta RPO: número + periodo (inicio | fin). */
export function sicoeOpcionActa(a) {
  const n = a?.numero_rpo ?? a
  const value = String(n ?? '').trim()
  if (!value) return null
  const periodo = periodoRango(a?.fecha_inicio, a?.fecha_fin)
  return {
    value,
    label: `RPO #${value}`,
    descripcion: periodo,
  }
}

function authHeaders(token) {
  const t = token || (typeof localStorage !== 'undefined' && localStorage.getItem('cc_token')) || ''
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
}

export async function fetchSicoeFiltrosOpciones(contratoId, token, ctx = {}) {
  const hdrs = authHeaders(token)
  const pCap = new URLSearchParams()
  if (ctx.acta_rpo) pCap.set('acta_rpo', ctx.acta_rpo)
  if (ctx.semana) pCap.set('semana', ctx.semana)
  if (ctx.subcontratista_id) pCap.set('subcontratista_id', ctx.subcontratista_id)

  const [caps, tc, actas, subc, semanas, actasFiltro] = await Promise.all([
    fetch(`${API}/sicoe-obra/${contratoId}/filtros/capitulos?${pCap}`, { headers: hdrs })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []),
    fetch(`${API}/sicoe-obra/${contratoId}/filtros/tramoscostados`, { headers: hdrs })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({})),
    fetch(`${API}/actas/${contratoId}/lista`, { headers: hdrs })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []),
    ctx.omitSubcontratistas
      ? Promise.resolve([])
      : fetch(`${API}/sicoe-obra/${contratoId}/subcontratistas-activos`, { headers: hdrs })
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []),
    fetch(`${API}/sicoe-obra/${contratoId}/filtros/semanas`, { headers: hdrs })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []),
    fetch(`${API}/sicoe-obra/${contratoId}/filtros/actas`, { headers: hdrs })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []),
  ])

  // Prefetch acotado (capítulo/acta/semana). La búsqueda libre de ítem sin capítulo
  // la hace SicoeItemPickerInline vía fetchSicoeItemsSugerencias(?q=...).
  let items = []
  const capSingle = ctx.capitulo || (Array.isArray(ctx.caps) && ctx.caps.length === 1 ? ctx.caps[0] : '')
  if (capSingle || ctx.acta_rpo || ctx.semana) {
    const pIt = new URLSearchParams(pCap)
    if (capSingle) pIt.set('capitulo', capSingle)
    items = await fetch(`${API}/sicoe-obra/${contratoId}/filtros/items?${pIt}`, { headers: hdrs })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
  }

  const actasRpo = Array.isArray(actasFiltro) && actasFiltro.length
    ? actasFiltro.filter((a) => a?.numero_rpo != null)
    : Array.isArray(actas)
      ? actas
          .filter((a) => a.numero_rpo != null)
          .map((a) => ({
            id: a.id,
            numero_rpo: a.numero_rpo,
            fecha_inicio: a.fecha_inicio,
            fecha_fin: a.fecha_fin,
          }))
      : []

  return {
    capitulos: Array.isArray(caps) ? caps : [],
    tramos: tc?.tramos || [],
    costados: tc?.costados || [],
    semanas: Array.isArray(semanas) ? semanas : [],
    actas: actasRpo,
    subcontratistas: Array.isArray(subc) ? subc : [],
    items_opciones: Array.isArray(items)
      ? items.map((s) => ({
          item: s.item_numero ?? s.item,
          descripcion: s.item_descripcion ?? s.descripcion ?? '',
        }))
      : [],
  }
}

export async function fetchSicoeItemsSugerencias(contratoId, token, { q, capitulo, acta_rpo, semana } = {}) {
  const params = sicoeItemsSugerenciasParams({ q, capitulo, acta_rpo, semana })
  const r = await fetch(`${API}/sicoe-obra/${contratoId}/filtros/items?${params}`, {
    headers: authHeaders(token),
  })
  if (!r.ok) return []
  const data = await r.json()
  return Array.isArray(data) ? data : []
}
