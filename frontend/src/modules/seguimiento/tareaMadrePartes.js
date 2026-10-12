/**
 * Helpers de tarea madre con partes (un solo nivel).
 */

import { calcularAvanceTarea } from './tareaAvance.js'

export function partesDe(item) {
  if (!item) return []
  if (Array.isArray(item.partes)) return item.partes
  return []
}

export function esMadreConPartes(item) {
  if (!item || item.padre_id) return false
  if (item.es_madre_partes) return true
  return partesDe(item).length > 0
}

export function esParte(item) {
  return !!(item && item.padre_id)
}

export function resumenAvancePartes(partes = []) {
  const counts = {
    cumplidas: 0,
    en_curso: 0,
    pendientes: 0,
    vencidas: 0,
    canceladas: 0,
    total: partes.length,
  }
  for (const p of partes) {
    const e = String(p?.estado_gestion || 'abierto').toLowerCase()
    if (e === 'cumplido') counts.cumplidas += 1
    else if (e === 'vencido') counts.vencidas += 1
    else if (e === 'cancelado') counts.canceladas += 1
    else if (['en_progreso', 'parcial', 'reprogramado'].includes(e)) counts.en_curso += 1
    else counts.pendientes += 1
  }
  const avance = calcularAvanceTarea(
    partes.map((p) => ({
      estado_gestion: p.estado_gestion,
      hecho: p.estado_gestion === 'cumplido',
    })),
  )
  return { ...counts, avance_pct: avance.pct, estado_madre: avance.estadoTarea }
}

export function fmtNota(nota) {
  if (nota == null || Number.isNaN(Number(nota))) return null
  return `${Math.round(Number(nota))}%`
}
