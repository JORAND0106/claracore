/**
 * Helpers del popup «Salió material» (material-first + por revisar).
 */
import { foldSearchText, matchesAllTerms } from './entradaRegistroTabletHelpers.js'

export const SALIO_PASO = {
  REGISTRAR_MATERIAL: 'material',
  REGISTRAR_CAPTURA: 'captura',
  REGISTRAR_CONFIRMAR: 'confirmar',
  REGISTRAR_INMEDIATA: 'inmediata',
  HISTORIAL: 'historial',
}

export const MOTIVO_SIN_SECTOR = 'sin_sector'
export const MOTIVO_SIN_RECEPTOR = 'sin_receptor'

const MOTIVO_ETIQUETA = {
  [MOTIVO_SIN_SECTOR]: 'Sin sector',
  [MOTIVO_SIN_RECEPTOR]: 'Sin receptor',
}

export function etiquetaMotivoSalida(codigo) {
  return MOTIVO_ETIQUETA[codigo] || String(codigo || '').trim() || 'Por revisar'
}

export function motivosSalidaPorRevisarPreview({ sinSector, sinReceptor }) {
  const out = []
  if (sinSector) out.push(etiquetaMotivoSalida(MOTIVO_SIN_SECTOR))
  if (sinReceptor) out.push(etiquetaMotivoSalida(MOTIVO_SIN_RECEPTOR))
  return out
}

export function lineaEntradaSearchBlob(row) {
  if (!row) return ''
  return [
    row.material_descripcion,
    row.insumo_codigo,
    row.numero_entrada,
    row.numero_documento,
    row.numero_oc != null ? `OC ${row.numero_oc}` : '',
    row.pk_id,
    row.unidad,
    row.entrada_item_id,
  ].filter(Boolean).join(' ')
}

export function filterLineasDisponibles(lineas, query) {
  const list = Array.isArray(lineas) ? lineas : []
  const q = String(query || '').trim()
  if (!q) return list
  return list.filter((ln) => matchesAllTerms(lineaEntradaSearchBlob(ln), q))
}

/**
 * Consolida líneas con saldo en una tarjeta por material (+ unidad).
 * Guarda `lineas` hijas ordenadas por saldo desc.
 */
export function consolidarMaterialesDisponibles(lineas) {
  const map = new Map()
  for (const ln of Array.isArray(lineas) ? lineas : []) {
    const mat = String(ln.material_descripcion || '—').trim() || '—'
    const und = String(ln.unidad || '').trim()
    const key = `${foldSearchText(mat)}|${foldSearchText(und)}`
    const disp = Number(ln.cantidad_disponible) || 0
    if (disp <= 0) continue
    let card = map.get(key)
    if (!card) {
      card = {
        key,
        material_descripcion: mat,
        unidad: und,
        cantidad_disponible_total: 0,
        lineas: [],
        pk_ids: new Set(),
        numeros_oc: new Set(),
      }
      map.set(key, card)
    }
    card.cantidad_disponible_total += disp
    card.lineas.push(ln)
    if (ln.pk_id) card.pk_ids.add(String(ln.pk_id))
    if (ln.numero_oc != null) card.numeros_oc.add(String(ln.numero_oc))
  }
  const out = [...map.values()].map((c) => {
    c.lineas.sort((a, b) => (Number(b.cantidad_disponible) || 0) - (Number(a.cantidad_disponible) || 0))
    return {
      ...c,
      pk_ids: [...c.pk_ids],
      numeros_oc: [...c.numeros_oc],
      cantidad_disponible_total: Math.round(c.cantidad_disponible_total * 10000) / 10000,
    }
  })
  out.sort((a, b) => a.material_descripcion.localeCompare(b.material_descripcion, 'es'))
  return out
}

export function filterMaterialCards(cards, query) {
  const list = Array.isArray(cards) ? cards : []
  const q = String(query || '').trim()
  if (!q) return list.map((c) => ({ ...c, matchMode: 'all', lineasVisibles: c.lineas }))
  const out = []
  for (const card of list) {
    const cardBlob = [
      card.material_descripcion,
      card.unidad,
      ...(card.numeros_oc || []),
      ...(card.pk_ids || []),
    ].join(' ')
    if (matchesAllTerms(cardBlob, q)) {
      out.push({ ...card, matchMode: 'all', lineasVisibles: card.lineas })
      continue
    }
    const lineasHit = (card.lineas || []).filter((ln) => matchesAllTerms(lineaEntradaSearchBlob(ln), q))
    if (lineasHit.length) {
      out.push({ ...card, matchMode: 'lineas', lineasVisibles: lineasHit })
    }
  }
  return out
}

/** Elige la línea con más saldo (o la única filtrada). */
export function pickLineaPreferida(lineas) {
  const list = Array.isArray(lineas) ? lineas : []
  if (!list.length) return null
  return [...list].sort(
    (a, b) => (Number(b.cantidad_disponible) || 0) - (Number(a.cantidad_disponible) || 0),
  )[0]
}
