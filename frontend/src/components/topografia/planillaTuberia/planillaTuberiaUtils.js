/**
 * Helpers de presentación — Planillas de Tubería (solo UI; sin recálculo).
 */

/** Filas mínimas al crear planilla / plantilla vacía (alineado al backend). */
export const FILAS_INICIALES_CARTERA = 2

/** Escalas de altura vs. sheet base (td 32px / cellInp 28px / gráfico 220px). */
export const CARTERA_ROW_SCALE = 0.7
export const RESUMEN_ROW_SCALE = 0.5
export const SECCION_GRAFICO_SCALE = 1.6
export const CARTERA_ROW_HEIGHT = Math.round(32 * CARTERA_ROW_SCALE) // 22
export const CARTERA_INPUT_HEIGHT = Math.round(28 * CARTERA_ROW_SCALE) // 20
export const RESUMEN_ROW_HEIGHT = Math.round(32 * RESUMEN_ROW_SCALE) // 16
export const SECCION_MAX_HEIGHT = Math.round(220 * SECCION_GRAFICO_SCALE) // 352

export const TIPOS_PLANILLA = [
  { value: 'ALCANTARILLA', label: 'PLANILLA DE INSTALACIÓN DE TUBERÍA ALCANTARILLAS' },
  { value: 'FILTRO', label: 'PLANILLA DE INSTALACIÓN DE FILTROS' },
]

export const CODIGO_DOCUMENTO = 'INF-ING - TOP - 001 - V0'

export const RELACIONES_ATRAQUE = ['1:1', '1:2', '1:3', '1:4', '1:6']

export function fmtN(v, dec = 3) {
  if (v == null || v === '' || Number.isNaN(Number(v))) return ''
  return Number(v).toFixed(dec)
}

export function fmtNDash(v, dec = 3) {
  const s = fmtN(v, dec)
  return s === '' ? '—' : s
}

export { fmtNDash as fmtNOrDash }

/** Enter avanza como Tab dentro de un contenedor tabular. */
export function handleEnterAsTab(e, rootEl) {
  if (e.key !== 'Enter' || e.defaultPrevented) return
  if (e.ctrlKey || e.metaKey || e.altKey) return
  const target = e.target
  if (!target || !rootEl?.contains?.(target)) return
  const tag = String(target.tagName || '').toUpperCase()
  if (tag === 'BUTTON' || tag === 'A') return
  const typ = String(target.type || '').toLowerCase()
  if (['button', 'submit', 'reset', 'checkbox', 'radio'].includes(typ)) return
  e.preventDefault()
  const sel = 'input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled])'
  const nodes = [...rootEl.querySelectorAll(sel)].filter((el) => el.offsetParent != null || el.getClientRects?.().length)
  const idx = nodes.indexOf(target)
  if (idx < 0) return
  const next = e.shiftKey ? nodes[idx - 1] : nodes[idx + 1]
  if (!next) return
  next.focus()
  if (typeof next.select === 'function' && String(next.tagName).toUpperCase() === 'INPUT') {
    try { next.select() } catch { /* ignore */ }
  }
}

export function filaCampoVacia(orden) {
  return {
    orden,
    abscisa: '',
    terreno_natural: '',
    subrasante_via: '',
    terminado_filtro: '',
    cota_fondo_excavacion: '',
    norte: '',
    este: '',
    observacion: '',
  }
}

export function filasDesdeApi(filasApi, tipo, minRows = FILAS_INICIALES_CARTERA) {
  const mapped = (filasApi || []).map((f, i) => ({
    orden: f.orden ?? i + 1,
    abscisa: f.abscisa ?? '',
    terreno_natural: f.terreno_natural ?? '',
    subrasante_via: f.subrasante_via ?? '',
    terminado_filtro: f.terminado_filtro ?? '',
    cota_fondo_excavacion: f.cota_fondo_excavacion ?? '',
    norte: f.norte ?? '',
    este: f.este ?? '',
    observacion: f.observacion ?? '',
  }))
  while (mapped.length < minRows) mapped.push(filaCampoVacia(mapped.length + 1))
  return mapped
}

export function payloadFilas(filas, tipo) {
  return (filas || []).map((f, i) => {
    const base = {
      orden: i + 1,
      abscisa: f.abscisa === '' ? null : Number(f.abscisa),
      terreno_natural: f.terreno_natural === '' ? null : Number(f.terreno_natural),
      cota_fondo_excavacion: f.cota_fondo_excavacion === '' ? null : Number(f.cota_fondo_excavacion),
      norte: f.norte === '' ? null : Number(f.norte),
      este: f.este === '' ? null : Number(f.este),
      observacion: f.observacion || null,
      subrasante_via: null,
      terminado_filtro: null,
    }
    if (tipo === 'FILTRO') {
      base.terminado_filtro = f.terminado_filtro === '' ? null : Number(f.terminado_filtro)
    } else {
      base.subrasante_via = f.subrasante_via === '' ? null : Number(f.subrasante_via)
    }
    return base
  }).filter((f) => (
    f.abscisa != null || f.terreno_natural != null || f.cota_fondo_excavacion != null
    || f.subrasante_via != null || f.terminado_filtro != null
  ))
}

/** True si hay al menos un dato de campo diligenciado (exportable). */
export function tieneDatosExportables(filas, detalle) {
  for (const f of filas || []) {
    if ([f.abscisa, f.terreno_natural, f.subrasante_via, f.terminado_filtro, f.cota_fondo_excavacion]
      .some((v) => v !== '' && v != null)) {
      return true
    }
  }
  const calcFilas = (detalle?.calculo?.cartera?.filas) || []
  for (const f of calcFilas) {
    if (!f?.vacio) return true
  }
  for (const f of detalle?.filas_campo || []) {
    if ([f.abscisa, f.terreno_natural, f.subrasante_via, f.terminado_filtro, f.cota_fondo_excavacion]
      .some((v) => v != null)) {
      return true
    }
  }
  return false
}

/** Fondo distintivo de columnas calculadas (mismo criterio Excel/PDF). */
export const CALC_CELL_BG = '#F2F2F2'

/** Confirma guardado solo si el backend devolvió verified + count. */
export function confirmarGuardadoCartera(res, expectedCount) {
  if (!res || typeof res !== 'object') {
    return { ok: false, error: 'Sin respuesta del servidor.' }
  }
  if (!res.verified) {
    return { ok: false, error: 'El servidor no confirmó la persistencia (verified).' }
  }
  const got = Number(res.count)
  if (!Number.isFinite(got) || got !== expectedCount) {
    return { ok: false, error: `Conteo inconsistente: enviado ${expectedCount}, confirmado ${got}.` }
  }
  return { ok: true, count: got, version: res.version }
}
