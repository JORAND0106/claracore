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

/**
 * Normaliza un valor de celda pegado desde Excel (coma decimal, miles).
 * Devuelve string listo para inputs numéricos de la cartera.
 */
export function normalizarValorCeldaPaste(v) {
  let s = String(v ?? '').trim()
  if (!s) return ''
  // 1.234,56 (es-CO) → 1234.56
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (s.includes(',') && !s.includes('.')) {
    // 10,5 → 10.5
    s = s.replace(',', '.')
  }
  return s
}

/**
 * Interpreta texto del portapapeles (Excel TSV) como una columna de valores.
 * Solo usa la primera columna de cada fila (mejora futura: multi-columna).
 * @param {string} text
 * @returns {string[]}
 */
export function parseClipboardColumn(text) {
  if (text == null || text === '') return []
  const raw = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = raw.split('\n')
  // Excel suele terminar el rango con un salto de línea final
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  if (!lines.length) return []
  return lines.map((line) => normalizarValorCeldaPaste((line.split('\t')[0] ?? '')))
}

/**
 * True si el pegado aporta más de un valor (columna Excel / varias filas).
 * Un solo valor sin saltos se deja al comportamiento nativo del input.
 */
export function esPasteMasivo(text) {
  const vals = parseClipboardColumn(text)
  if (vals.length > 1) return true
  if (vals.length === 1 && /[\n\r\t]/.test(String(text ?? ''))) return true
  return false
}

/**
 * Distribuye valores de una columna en `filas` desde `startIdx`,
 * creando filas vacías si el rango pegado excede las existentes.
 * @param {object[]} filas
 * @param {number} startIdx
 * @param {string} key
 * @param {string[]} values
 * @returns {object[]}
 */
export function aplicarPasteColumna(filas, startIdx, key, values) {
  const start = Math.max(0, Number(startIdx) || 0)
  const vals = Array.isArray(values) ? values : []
  if (!vals.length || !key) return filas || []
  const next = (filas || []).map((f) => ({ ...f }))
  const needed = start + vals.length
  while (next.length < needed) {
    next.push(filaCampoVacia(next.length + 1))
  }
  for (let i = 0; i < vals.length; i += 1) {
    const idx = start + i
    next[idx] = { ...next[idx], orden: idx + 1, [key]: vals[i] }
  }
  return next
}

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


/**
 * Al cambiar ALCANTARILLA ↔ FILTRO, copia el nivel de referencia entre columnas
 * para que no queden cotas huérfanas del tipo anterior.
 */
export function migrarFilasAlCambiarTipo(filas, tipoNuevo) {
  const tipo = String(tipoNuevo || 'ALCANTARILLA').toUpperCase()
  return (filas || []).map((f) => {
    const row = { ...f }
    const sub = row.subrasante_via
    const term = row.terminado_filtro
    if (tipo === 'FILTRO') {
      if ((term === '' || term == null) && sub !== '' && sub != null) {
        row.terminado_filtro = sub
      }
    } else if ((sub === '' || sub == null) && term !== '' && term != null) {
      row.subrasante_via = term
    }
    return row
  })
}

export function payloadFilas(filas, tipo) {
  return (filas || []).map((f, i) => {
    const base = {
      orden: i + 1,
      abscisa: numOrNull(f.abscisa),
      terreno_natural: numOrNull(f.terreno_natural),
      cota_fondo_excavacion: numOrNull(f.cota_fondo_excavacion),
      norte: numOrNull(f.norte),
      este: numOrNull(f.este),
      observacion: f.observacion || null,
      subrasante_via: null,
      terminado_filtro: null,
    }
    if (tipo === 'FILTRO') {
      base.terminado_filtro = numOrNull(f.terminado_filtro)
    } else {
      base.subrasante_via = numOrNull(f.subrasante_via)
    }
    return base
  }).filter((f) => (
    f.abscisa != null || f.terreno_natural != null || f.cota_fondo_excavacion != null
    || f.subrasante_via != null || f.terminado_filtro != null
  ))
}

/** Huella estable de filas de cartera (alineada al backend). */
export function fingerprintFilasCartera(filas) {
  const num = (v) => {
    if (v == null || v === '') return ''
    const n = Number(v)
    if (!Number.isFinite(n)) return String(v).trim()
    const s = n.toFixed(6).replace(/\.?0+$/, '')
    return s === '-0' ? '0' : s
  }
  return (filas || [])
    .map((f) => (
      `${Number(f?.orden) || 0}|${num(f?.abscisa)}|${num(f?.terreno_natural)}|`
      + `${num(f?.cota_fondo_excavacion)}|${num(f?.subrasante_via)}|${num(f?.terminado_filtro)}`
    ))
    .sort()
}

/** Confirma guardado solo si el backend devolvió verified + count (+ huella si viene). */
export function confirmarGuardadoCartera(res, expectedCount, payloadEnviado = null) {
  const expected = Number(expectedCount)
  if (!Number.isFinite(expected) || expected <= 0) {
    return { ok: false, error: 'No hay filas con datos para guardar.', reason: 'empty_payload' }
  }
  if (!res || typeof res !== 'object') {
    return { ok: false, error: 'Sin respuesta del servidor.', reason: 'empty_response' }
  }
  if (!res.verified) {
    return { ok: false, error: 'El servidor no confirmó la persistencia (verified).', reason: 'not_verified' }
  }
  const got = Number(res.count)
  if (!Number.isFinite(got) || got <= 0) {
    return { ok: false, error: 'El servidor no confirmó el guardado (sin conteo de filas).', reason: 'missing_count' }
  }
  if (got !== expected) {
    return {
      ok: false,
      error: `Conteo inconsistente: enviado ${expected}, confirmado ${got}.`,
      reason: 'count_mismatch',
    }
  }
  const echo = Array.isArray(res.filas_campo) ? res.filas_campo : null
  if (echo && echo.length !== expected) {
    return {
      ok: false,
      error: `El servidor devolvió ${echo.length} filas pero se enviaron ${expected}.`,
      reason: 'echo_mismatch',
    }
  }
  if (Array.isArray(res.fingerprint_orden) && res.fingerprint_orden.length && payloadEnviado) {
    const expectedFp = fingerprintFilasCartera(payloadEnviado)
    const gotFp = res.fingerprint_orden.map(String)
    if (expectedFp.join('|') !== gotFp.join('|')) {
      return {
        ok: false,
        error: 'La huella de filas guardadas no coincide con lo enviado.',
        reason: 'fingerprint_mismatch',
      }
    }
  }
  return { ok: true, count: got, version: res.version }
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

/** Claves de georreferenciación en meta_cabecera (bloque B12:G13 del XLSM). */
export const GEO_META_KEYS = [
  'norte_abs_inicial',
  'este_abs_inicial',
  'norte_abs_final',
  'este_abs_final',
]

/**
 * Lee Norte/Este inicio y fin desde planilla + meta_cabecera.
 * Compat: si no hay meta de inicio, usa norte_ref / este_ref.
 */
export function coordsGeoDesdePlanilla(planilla) {
  const p = planilla || {}
  const meta = (p.meta_cabecera && typeof p.meta_cabecera === 'object') ? p.meta_cabecera : {}
  const pick = (metaKey, fallback) => {
    const v = meta[metaKey]
    if (v !== undefined && v !== null && v !== '') return String(v)
    if (fallback !== undefined && fallback !== null && fallback !== '') return String(fallback)
    return ''
  }
  return {
    norte_abs_inicial: pick('norte_abs_inicial', p.norte_ref),
    este_abs_inicial: pick('este_abs_inicial', p.este_ref),
    norte_abs_final: pick('norte_abs_final'),
    este_abs_final: pick('este_abs_final'),
  }
}

/** Número o null para payload API ('' → null). */
export function numOrNull(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Payload de params para georref: meta_cabecera con 4 coords +
 * norte_ref/este_ref = inicio (WGS84 sin cambiar transform).
 */
export function payloadCoordsGeo(params) {
  const nIni = numOrNull(params?.norte_abs_inicial)
  const eIni = numOrNull(params?.este_abs_inicial)
  return {
    norte_ref: nIni,
    este_ref: eIni,
    meta_cabecera: {
      norte_abs_inicial: nIni,
      este_abs_inicial: eIni,
      norte_abs_final: numOrNull(params?.norte_abs_final),
      este_abs_final: numOrNull(params?.este_abs_final),
    },
  }
}

/** Fondo distintivo de columnas calculadas (mismo criterio Excel/PDF). */
export const CALC_CELL_BG = '#F2F2F2'

/**
 * Agrupa avisos de validación en tablas tipo Excel (Abscisa | Diferencia).
 * Evita repetir el mismo párrafo una vez por fila.
 * @param {Array<object>} avisos
 * @returns {Array<{ key: string, msg: string, detalle?: string, prioridad: string, filas: Array<{abscisa: *, diferencia: *}> }>}
 */
export function agruparAlertasValidacion(avisos) {
  const map = new Map()
  for (const a of avisos || []) {
    if (!a) continue
    const key = `${a.prioridad || 'info'}|${a.msg || ''}|${a.campo || ''}`
    if (!map.has(key)) {
      map.set(key, {
        key,
        msg: a.msg || 'Alerta',
        detalle: a.detalle || '',
        prioridad: a.prioridad || 'info',
        campo: a.campo || '',
        filas: [],
      })
    }
    const g = map.get(key)
    const abs = a.abscisa != null ? a.abscisa : null
    const dif = a.diferencia != null ? a.diferencia : null
    if (!g.filas.some((r) => r.abscisa === abs && r.diferencia === dif && r.orden === a.orden)) {
      g.filas.push({ abscisa: abs, diferencia: dif, orden: a.orden })
    }
  }
  return [...map.values()]
}

/** Validación local (espejo liviano del backend) para banner reactivo. */
export function validarFilasCarteraLocal(filas, tipo = 'ALCANTARILLA') {
  const tipoU = String(tipo || 'ALCANTARILLA').toUpperCase()
  const avisos = []
  const num = (v) => {
    if (v === '' || v == null) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  const nivelRef = (f) => {
    const keys = tipoU === 'FILTRO'
      ? ['terminado_filtro', 'nivel_referencia', 'subrasante_via']
      : ['subrasante_via', 'nivel_referencia', 'terminado_filtro']
    for (const k of keys) {
      const v = num(f?.[k])
      if (v != null) return v
    }
    return null
  }
  ;(filas || []).forEach((f, i) => {
    const abscisa = num(f?.abscisa)
    const tn = num(f?.terreno_natural)
    const cfe = num(f?.cota_fondo_excavacion)
    const nivel = nivelRef(f)
    if ([abscisa, tn, cfe, nivel].every((v) => v == null)) return
    const orden = f?.orden ?? i + 1
    if (tn != null && cfe != null && cfe > tn) {
      avisos.push({
        prioridad: 'error', msg: 'CFE > TN', campo: 'cota_fondo_excavacion',
        detalle: 'La cota fondo no puede superar el terreno natural.',
        abscisa, diferencia: Math.round((cfe - tn) * 10000) / 10000, orden,
      })
    }
    if (tn != null && nivel != null && nivel > tn + 0.05) {
      avisos.push({
        prioridad: 'info', msg: 'Nivel sobre TN', campo: 'nivel_referencia',
        detalle: 'El nivel de referencia está >5 cm sobre el terreno natural.',
        abscisa, diferencia: Math.round((nivel - tn) * 10000) / 10000, orden,
      })
    }
    if (nivel != null && cfe != null && nivel < cfe) {
      avisos.push({
        prioridad: 'error', msg: 'Nivel < CFE', campo: 'nivel_referencia',
        detalle: 'El nivel de referencia debe quedar sobre el fondo de excavación.',
        abscisa, diferencia: Math.round((cfe - nivel) * 10000) / 10000, orden,
      })
    }
  })
  return avisos
}

/**
 * Nombre de planilla: obligatorio y único en el contrato (case-insensitive).
 * @param {string} nombre
 * @param {Array<{id?: string, nombre?: string}>} lista
 * @param {string|null} excludeId
 */
export function validarNombrePlanilla(nombre, lista = [], excludeId = null) {
  const nom = String(nombre ?? '').trim()
  if (!nom) {
    return { ok: false, error: 'El nombre de la planilla es obligatorio.' }
  }
  const low = nom.toLocaleLowerCase('es')
  const dup = (lista || []).find((p) => {
    if (!p) return false
    if (excludeId != null && String(p.id) === String(excludeId)) return false
    const other = String(p.nombre ?? '').trim()
    return other && other.toLocaleLowerCase('es') === low
  })
  if (dup) {
    return {
      ok: false,
      error: `Ya existe una planilla con el nombre «${nom}» en este contrato.`,
    }
  }
  return { ok: true, nombre: nom }
}

/** Extremos de abscisa desde cálculo local o filas. */
export function abscisasExtremosPlanilla(calculo, filas = []) {
  const tot = calculo?.cartera?.totales || {}
  let a0 = tot.abscisa_inicial
  let a1 = tot.abscisa_final
  if (a0 != null && a1 != null) return { absInicio: Number(a0), absFinal: Number(a1) }
  const vals = (filas || [])
    .map((f) => Number(f?.abscisa))
    .filter((n) => Number.isFinite(n))
  if (!vals.length) return { absInicio: null, absFinal: null }
  return { absInicio: Math.min(...vals), absFinal: Math.max(...vals) }
}

/**
 * Preview de líneas que se convertirán en so_registros (cantidad ≠ 0).
 * @param {object} calculo
 * @param {{ displayNeto?: Function }} [opts]
 */
export function lineasPlanillaParaReporteSicoe(calculo, opts = {}) {
  const displayNeto = typeof opts.displayNeto === 'function' ? opts.displayNeto : null
  const out = []
  const push = (scope, codigo, nombre, unidad, cantidad) => {
    const n = Number(cantidad)
    if (!Number.isFinite(n) || Math.abs(n) <= 1e-9) return
    out.push({
      scope,
      codigo,
      nombre: nombre || codigo,
      unidad: unidad || '',
      cantidad: Math.round(n * 100) / 100,
    })
  }
  for (const n of calculo?.netos || []) {
    if (!n?.codigo) continue
    const cant = displayNeto ? displayNeto(n) : (n.neto ?? n.cantidad)
    push('cantidades', n.codigo, n.nombre, n.unidad, cant)
  }
  for (const d of calculo?.descuentos || []) {
    if (!d?.nombre || !d?.codigo) continue
    push('descuentos', d.codigo, d.nombre, d.unidad || 'm³', d.cantidad)
  }
  return out
}

/** Links SICOE guardados en meta_cabecera.sicoe_reportes */
export function linksSicoeDesdeMeta(meta) {
  const raw = meta && typeof meta === 'object' ? meta.sicoe_reportes : null
  if (!Array.isArray(raw)) return []
  return raw.filter((x) => x && x.reporte_id != null)
}
