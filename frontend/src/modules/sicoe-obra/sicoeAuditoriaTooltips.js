/**
 * Tooltips explicativos por hallazgo (datos reales del registro).
 */
import { fmtAbscisaK, parseAbsNum } from './sicoeAuditoriaTraslapos.js'

function txt(v) {
  return String(v ?? '').trim()
}

function fmtMedida(v, unidad = 'm') {
  if (v == null || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return `${v} ${unidad}`
  const s = Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
  return `${s} ${unidad}`
}

/** Texto de ayuda de la columna Medida según tipo. */
export function ayudaMedidaPorTipo(tipo) {
  const t = txt(tipo).toLowerCase()
  if (t === 'traslapo') {
    return 'Longitud o área que se pisa entre registros de reportes distintos (unidad en la celda).'
  }
  if (t === 'vacio') {
    return 'Tamaño del hueco entre tramos reportados del mismo ítem (metros de abscisa).'
  }
  if (t === 'ubicacion_inconsistente' || t === 'costado_inconsistente') {
    return 'Diferencia entre lo digitado y lo real (metros de desviación o tramo afectado).'
  }
  if (t === 'cantidad_mayor_area') {
    return 'Exceso de cantidad cobrada frente al área del dibujo (m²).'
  }
  if (t === 'no_auditable') {
    return 'Sin medida aplicable: faltan datos de ubicación para auditar.'
  }
  return 'Medida del hallazgo con su unidad (m o m² según el tipo).'
}

/** Unidad a mostrar junto a medida_m. */
export function unidadMedidaHallazgo(tipo) {
  const t = txt(tipo).toLowerCase()
  if (t === 'cantidad_mayor_area') return 'm²'
  if (t === 'no_auditable') return ''
  return 'm'
}

function regsLabel(regs) {
  const parts = []
  for (const r of regs || []) {
    const n = r?.numero_registro != null ? r.numero_registro : r?.id
    if (n == null || n === '') continue
    const rep = r?.numero_reporte != null ? ` (Rep. #${r.numero_reporte})` : ''
    parts.push(`Reg. ${n}${rep}`)
  }
  return parts.join(', ')
}

/**
 * Explica la naturaleza del hallazgo y cómo encontrarlo, con datos reales.
 */
export function tooltipTipoHallazgo(h) {
  if (!h) return ''
  const tipo = txt(h.tipo).toLowerCase()
  const texto = txt(h.texto)
  const ubi = txt(h.ubicacion)
  const medida = h.medida_m
  const regs = h.registros_involucrados || []
  const prim = regs[0] || {}
  const a0 = parseAbsNum(prim.abs_inicio)
  const a1 = parseAbsNum(prim.abs_final)
  const digitadas = (a0 != null && a1 != null)
    ? `${fmtAbscisaK(a0)} → ${fmtAbscisaK(a1)}`
    : (a0 != null ? fmtAbscisaK(a0) : '')

  if (tipo === 'traslapo') {
    return [
      'Traslapo: se pisa un tramo ya reportado en otro reporte del mismo ítem.',
      medida != null ? `Tramo pisado: ${fmtMedida(medida, 'm')}.` : null,
      ubi ? `Ubicación: ${ubi}.` : null,
      regs.length ? `Involucrados: ${regsLabel(regs)}.` : null,
      'Revise los dibujos superpuestos y las abscisas de cada registro.',
      texto || null,
    ].filter(Boolean).join(' ')
  }
  if (tipo === 'vacio') {
    return [
      'Vacío: hay un hueco entre tramos reportados del mismo ítem/grupo.',
      medida != null ? `Tamaño del hueco: ${fmtMedida(medida, 'm')}.` : null,
      ubi ? `Entre: ${ubi}.` : null,
      regs.length ? `Registros limítrofes: ${regsLabel(regs)}.` : null,
      'Revise si falta un reporte o si las abscisas dejaron un intervalo sin cubrir.',
      texto || null,
    ].filter(Boolean).join(' ')
  }
  if (tipo === 'ubicacion_inconsistente') {
    return [
      'Ubicación inconsistente: la abscisa o el punto digitado no coincide con donde cae el dibujo o la coordenada real.',
      digitadas ? `Abscisa digitada: ${digitadas}.` : null,
      medida != null ? `Diferencia: ${fmtMedida(medida, 'm')}.` : null,
      ubi ? `Ubicación: ${ubi}.` : null,
      texto || null,
      'Revise coordenadas, abscisas y el dibujo del reporte frente al eje.',
    ].filter(Boolean).join(' ')
  }
  if (tipo === 'costado_inconsistente') {
    const digitado = txt(prim.costado || h.costado)
    return [
      'Costado inconsistente: el costado/margen digitado no coincide con el lado real del dibujo respecto al eje.',
      digitado ? `Costado digitado: ${digitado}.` : null,
      texto || null,
      'Revise calzada/margen del registro y la posición del dibujo (izquierda/derecha/central).',
    ].filter(Boolean).join(' ')
  }
  if (tipo === 'cantidad_mayor_area') {
    return [
      'Cantidad mayor al área: lo cobrado (m²) supera el área del polígono dibujado.',
      medida != null ? `Exceso: ${fmtMedida(medida, 'm²')}.` : null,
      ubi ? `Contexto: ${ubi}.` : null,
      regs.length ? `Registros: ${regsLabel(regs)}.` : null,
      texto || null,
      'Revise cantidades del ítem frente al dibujo del reporte.',
    ].filter(Boolean).join(' ')
  }
  if (tipo === 'no_auditable') {
    return [
      'No auditable: faltan datos de ubicación (abscisas, PK-ID o coordenadas) para comparar.',
      regs.length ? `Registro: ${regsLabel(regs)}.` : null,
      'Complete la localización del registro y vuelva a sincronizar.',
      texto || null,
    ].filter(Boolean).join(' ')
  }
  return texto || `Hallazgo de tipo ${h.tipo || '—'}.`
}

/** Formato compacto Reg. N · Rep. #M */
export function fmtRegistroConReporte(r) {
  if (!r) return ''
  const n = r.numero_registro != null ? r.numero_registro : r.id
  if (n == null || n === '') return ''
  const rep = r.numero_reporte != null ? ` · Rep. #${r.numero_reporte}` : ''
  return `Reg. ${n}${rep}`
}

export function fmtRegistrosHallazgo(h) {
  const parts = []
  for (const r of h?.registros_involucrados || []) {
    const s = fmtRegistroConReporte(r)
    if (s) parts.push(s)
  }
  return parts.length ? parts.join('; ') : '—'
}
