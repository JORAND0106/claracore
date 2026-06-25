/** Catálogo de filtros de presupuesto — reutilizable en SicoeObra. */

export const PPTO_FILTRO_MODULO = 'presupuesto'

/** @typedef {'text'|'select'|'select_multi'|'rango_numerico'|'rango_abscisa'|'boolean'} FiltroTipo */

/**
 * @typedef {Object} FiltroDef
 * @property {string} key
 * @property {string} label
 * @property {FiltroTipo} tipo
 * @property {string} categoria
 * @property {string} [campoFObra] — campo principal en fObra (o lógica especial)
 * @property {string} [campoFObraLista] — array multi-valor en fObra
 * @property {string} [campoFObraHasta] — para rangos
 * @property {string} [opcionesKey] — clave en respuesta GET /presupuesto/{id}/filtros
 */

export const PPTO_FILTRO_CATEGORIAS = [
  { id: 'item', label: 'Ítem' },
  { id: 'ubicacion', label: 'Ubicación' },
  { id: 'valores', label: 'Valores' },
  { id: 'validacion', label: 'Validación' },
  { id: 'otros', label: 'Otros' },
]

/** Semáforo completo — siempre disponible en filtros (aunque no exista aún en BD). */
export const PPTO_ESTADOS_VALIDACION = ['No Revisado', 'Aprobado', 'Pendiente', 'Rechazado']

/** @type {FiltroDef[]} */
export const PPTO_FILTRO_CATALOGO = [
  { key: 'capitulo', label: 'Capítulo', tipo: 'select_multi', categoria: 'item', campoFObra: 'cap', campoFObraLista: 'caps', opcionesKey: 'capitulos' },
  { key: 'item', label: 'Ítem', tipo: 'select_multi', categoria: 'item', campoFObra: 'item', campoFObraLista: 'items', opcionesKey: 'items' },
  { key: 'competencia', label: 'Competencia', tipo: 'select_multi', categoria: 'item', campoFObra: 'competencia', campoFObraLista: 'competencias', opcionesKey: 'competencias' },
  { key: 'und', label: 'Unidad', tipo: 'select_multi', categoria: 'item', campoFObra: 'und', campoFObraLista: 'unds', opcionesKey: 'unds' },
  { key: 'tramo', label: 'Tramo', tipo: 'select_multi', categoria: 'ubicacion', campoFObra: 'tramo', campoFObraLista: 'tramos', opcionesKey: 'tramos' },
  { key: 'calzada', label: 'Calzada', tipo: 'select_multi', categoria: 'ubicacion', campoFObra: 'calzada', campoFObraLista: 'calzadas', opcionesKey: 'calzadas' },
  { key: 'pk_id', label: 'PK', tipo: 'text', categoria: 'ubicacion', campoFObra: 'pkCriterio' },
  { key: 'id_pol', label: 'ID-POL', tipo: 'text', categoria: 'ubicacion', campoFObra: 'idPol' },
  { key: 'no_inicio', label: 'Nodo inicio', tipo: 'text', categoria: 'ubicacion', campoFObra: 'nodoI' },
  { key: 'no_final', label: 'Nodo fin', tipo: 'text', categoria: 'ubicacion', campoFObra: 'nodoF' },
  { key: 'abs_inicio', label: 'Abscisa desde', tipo: 'rango_abscisa', categoria: 'ubicacion', campoFObra: 'absA', campoFObraHasta: 'absB' },
  { key: 'vlr_unitario', label: 'Vlr. unitario', tipo: 'rango_numerico', categoria: 'valores', campoFObra: 'vlrUnitarioMin', campoFObraHasta: 'vlrUnitarioMax' },
  { key: 'cant_total', label: 'Cant. total', tipo: 'rango_numerico', categoria: 'valores', campoFObra: 'cantTotalMin', campoFObraHasta: 'cantTotalMax' },
  { key: 'costo_directo', label: 'Costo directo', tipo: 'rango_numerico', categoria: 'valores', campoFObra: 'costoDirectoMin', campoFObraHasta: 'costoDirectoMax' },
  { key: 'revisado', label: 'Estado interventoría', tipo: 'select', categoria: 'validacion', campoFObra: 'revisado', opcionesKey: 'revisados' },
  { key: 'pre_interv_estado', label: 'Estado depuración', tipo: 'select', categoria: 'validacion', campoFObra: 'preInterv', opcionesKey: 'pre_interv_estados' },
  { key: 'sellado', label: 'Sellado', tipo: 'boolean', categoria: 'validacion', campoFObra: 'sellado' },
  { key: 'texto', label: 'Texto (registro / descripción)', tipo: 'text', categoria: 'otros', campoFObra: 'texto' },
  { key: 'dado_de_baja', label: 'Dado de baja', tipo: 'boolean', categoria: 'otros', campoFObra: 'dadoDeBaja' },
]

const CATALOGO_BY_KEY = Object.fromEntries(PPTO_FILTRO_CATALOGO.map((d) => [d.key, d]))

export function pptoFiltroDef(key) {
  return CATALOGO_BY_KEY[key] || null
}

export function pptoFiltroCatalogoPorCategoria() {
  const out = {}
  for (const cat of PPTO_FILTRO_CATEGORIAS) out[cat.id] = []
  for (const def of PPTO_FILTRO_CATALOGO) {
    if (out[def.categoria]) out[def.categoria].push(def)
  }
  return out
}

/** Estado fObra vacío base (sin tipo_ejecucion). */
export function pptoFObraCamposVacios() {
  return {
    cap: '',
    caps: [],
    item: '',
    items: [],
    idPol: '',
    pkCriterio: '',
    texto: '',
    tramo: '',
    tramos: [],
    calzada: '',
    calzadas: [],
    nodoI: '',
    nodoF: '',
    absA: '',
    absB: '',
    eje: 'interv',
    revisado: '',
    preInterv: '',
    competencia: '',
    competencias: [],
    und: '',
    unds: [],
    sellado: '',
    dadoDeBaja: '',
    vlrUnitarioMin: '',
    vlrUnitarioMax: '',
    cantTotalMin: '',
    cantTotalMax: '',
    costoDirectoMin: '',
    costoDirectoMax: '',
    tipoEjecucion: '',
  }
}

function strVal(v) {
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return String(v).trim()
}

function hasStr(v) {
  return !!strVal(v)
}

function hasRange(min, max) {
  return hasStr(min) || hasStr(max)
}

/** Valores activos de un filtro (lista para multi-select). */
export function pptoFiltroValoresLista(def, f) {
  if (!def || !f) return []
  if (def.tipo === 'select_multi' && def.campoFObraLista) {
    const arr = f[def.campoFObraLista]
    if (Array.isArray(arr) && arr.length) {
      return [...new Set(arr.map((x) => String(x ?? '').trim()).filter(Boolean))]
    }
    const one = strVal(f[def.campoFObra])
    return one ? [one] : []
  }
  if (def.key === 'item') {
    if (Array.isArray(f.items) && f.items.length) return [...new Set(f.items.map(String))]
    return hasStr(f.item) ? [strVal(f.item)] : []
  }
  const v = f[def.campoFObra]
  if (def.tipo === 'boolean') {
    if (v === true || v === 'true' || v === false || v === 'false') return [String(v)]
    return []
  }
  return hasStr(v) ? [strVal(v)] : []
}

/** ¿El filtro del catálogo tiene valor en fObra? */
export function pptoFiltroTieneValor(def, f) {
  if (!def || !f) return false
  if (def.tipo === 'rango_numerico' || def.key === 'abs_inicio') {
    return hasRange(f[def.campoFObra], f[def.campoFObraHasta])
  }
  if (def.tipo === 'select_multi' || def.key === 'item') {
    return pptoFiltroValoresLista(def, f).length > 0
  }
  if (def.tipo === 'boolean') {
    const v = f[def.campoFObra]
    return v === true || v === false || v === 'true' || v === 'false'
  }
  return hasStr(f[def.campoFObra])
}

/** Claves de catálogo con valor o explícitamente activas (sin tipo_ejecucion: va en el toggle). */
export function pptoFiltrosActivosKeys(f, activeKeys = []) {
  const set = new Set((activeKeys || []).filter((k) => k !== 'tipo_ejecucion'))
  for (const def of PPTO_FILTRO_CATALOGO) {
    if (pptoFiltroTieneValor(def, f)) set.add(def.key)
  }
  set.delete('tipo_ejecucion')
  return [...set]
}

/** Parche al aplicar lista multi-valor desde el editor de chip. */
export function pptoFiltroPatchLista(def, valores) {
  if (!def) return {}
  const vals = [...new Set((valores || []).map((x) => String(x ?? '').trim()).filter(Boolean))]
  if (def.tipo === 'select_multi' && def.campoFObraLista) {
    if (!vals.length) return { [def.campoFObra]: '', [def.campoFObraLista]: [] }
    if (vals.length === 1) return { [def.campoFObra]: vals[0], [def.campoFObraLista]: vals }
    return { [def.campoFObra]: '', [def.campoFObraLista]: vals }
  }
  if (def.key === 'item') {
    if (!vals.length) return { item: '', items: [] }
    if (vals.length === 1) return { item: vals[0], items: [] }
    return { item: '', items: vals }
  }
  return { [def.campoFObra]: vals[0] || '' }
}

/** Texto resumido para chip. */
export function pptoFiltroChipResumen(def, f, itemLabels = {}) {
  if (!def || !f) return '—'
  if (def.tipo === 'rango_numerico' || def.key === 'abs_inicio') {
    const a = strVal(f[def.campoFObra])
    const b = strVal(f[def.campoFObraHasta])
    if (a && b) return `${a} – ${b}`
    if (a) return `≥ ${a}`
    if (b) return `≤ ${b}`
    return '…'
  }
  if (def.tipo === 'select_multi' || def.key === 'item') {
    const vals = pptoFiltroValoresLista(def, f)
    if (!vals.length) return '…'
    if (def.key === 'item') {
      return vals.map((v) => itemLabels[v] || v).join(', ')
    }
    if (vals.length > 2) return `${vals.slice(0, 2).join(', ')} +${vals.length - 2}`
    return vals.join(', ')
  }
  if (def.tipo === 'boolean') {
    const v = f[def.campoFObra]
    if (v === true || v === 'true') return 'Sí'
    if (v === false || v === 'false') return 'No'
    return '…'
  }
  return strVal(f[def.campoFObra]) || '…'
}

/** Parches para limpiar un filtro del catálogo. */
export function pptoFiltroPatchLimpiar(def) {
  if (!def) return {}
  if (def.tipo === 'rango_numerico' || def.key === 'abs_inicio') {
    return { [def.campoFObra]: '', [def.campoFObraHasta]: '' }
  }
  if (def.tipo === 'select_multi' && def.campoFObraLista) {
    return { [def.campoFObra]: '', [def.campoFObraLista]: [] }
  }
  if (def.key === 'item') return { item: '', items: [] }
  if (def.key === 'revisado') return { revisado: '', eje: 'interv' }
  if (def.key === 'pre_interv_estado') return { preInterv: '', eje: 'depur' }
  return { [def.campoFObra]: def.tipo === 'boolean' ? '' : '' }
}

/** Parches al activar filtro (eje interv/depur). */
export function pptoFiltroPatchActivar(def) {
  if (def?.key === 'revisado') return { eje: 'interv' }
  if (def?.key === 'pre_interv_estado') return { eje: 'depur' }
  return {}
}

/** Normaliza fObra con drill / panel / toggle antes de validar o buscar. */
export function pptoFiltroNormalizar(f, ctx = {}) {
  const base = { ...pptoFObraCamposVacios(), ...(f || {}) }
  for (const k of ['caps', 'items', 'tramos', 'calzadas', 'competencias', 'unds']) {
    if (Array.isArray(base[k])) base[k] = [...base[k]]
  }
  const drill = ctx.drill || []
  const capDrill = drill.find((d) => d.campo === 'capitulo')?.valor
  const capLista = pptoFiltroValoresLista(pptoFiltroDef('capitulo'), base)
  if (!capLista.length && capDrill) base.cap = String(capDrill)
  if (!capLista.length && !base.cap && ctx.capExpandido) base.cap = String(ctx.capExpandido)
  const te = String(base.tipoEjecucion || ctx.tipoEjecucionDefault || 'Presupuesto de Obra').trim()
  base.tipoEjecucion = te || 'Presupuesto de Obra'
  if (base.revisado && !base.eje) base.eje = 'interv'
  if (base.preInterv && !base.eje) base.eje = 'depur'
  return base
}

/**
 * Unifica fObra con estado legacy (filtroEstado) antes de panel/grilla/export.
 * Evita que la grilla filtre por revisado oculto mientras el panel muestra totales sin ese criterio.
 */
export function pptoFObraParaConsulta(f, legacy = {}) {
  const base = { ...pptoFObraCamposVacios(), ...(f || {}) }
  const legRev = strVal(legacy.filtroEstado)
  if (!strVal(base.revisado) && legRev) {
    base.revisado = legRev
    if (!base.eje || base.eje === 'depur') base.eje = 'interv'
  }
  return base
}

/** ¿Hay filtros chip / panel (capítulo, ítem, tramo, etc.) además del toggle? */
export function pptoTieneFiltrosChip(f, ctx = {}) {
  const n = pptoFiltroNormalizar(f, ctx)
  for (const def of PPTO_FILTRO_CATALOGO) {
    if (pptoFiltroTieneValor(def, n)) return true
  }
  const drill = ctx.drill || []
  if (drill.some((d) => ['capitulo', 'item', 'items'].includes(d.campo))) return true
  return false
}

/** ¿Hay criterio de búsqueda? El toggle Presupuesto de Obra | Obra Ejecutada basta. */
export function pptoCriterioVistaActivo(f, ctx = {}) {
  const n = pptoFiltroNormalizar(f, ctx)
  if (pptoTieneFiltrosChip(n, ctx)) return true
  const te = String(n.tipoEjecucion || ctx.tipoEjecucionDefault || 'Presupuesto de Obra').trim()
  return !!te
}

/** Estado Interventoría de una fila (NULL/vacío = No Revisado), alineado con backend/panel. */
export function pptoEstadoRevisadoFila(row) {
  const v = row?.revisado
  if (v == null || String(v).trim() === '') return 'No Revisado'
  return String(v).trim()
}

/** Estado depuración de una fila (NULL/vacío = legado / No Revisado en UI). */
export function pptoEstadoPreIntervFila(row) {
  const v = row?.pre_interv_estado
  if (v == null || String(v).trim() === '') return 'No Revisado'
  return String(v).trim()
}

export function pptoFilaCoincideRevisado(row, revisado) {
  const f = strVal(revisado)
  if (!f) return true
  const est = pptoEstadoRevisadoFila(row)
  const fl = f.toLowerCase()
  if (fl === 'no revisado' || fl === 'no revisados') return est === 'No Revisado'
  return est === f
}

export function pptoFilaCoincidePreInterv(row, preInterv) {
  const f = strVal(preInterv)
  if (!f) return true
  const fl = f.toLowerCase()
  if (fl === 'no revisado' || fl === '—' || fl === '-') {
    const v = row?.pre_interv_estado
    return v == null || String(v).trim() === ''
  }
  return pptoEstadoPreIntervFila(row) === f
}

export function pptoFilaCoincideSellado(row, sellado) {
  if (sellado === true || sellado === 'true') return row?.sellado === true
  if (sellado === false || sellado === 'false') return row?.sellado !== true
  return true
}

/**
 * Filtros que no pueden derivarse de un volcado más amplio en caché (validación, PK, rangos, etc.).
 * Si están activos, la grilla debe ir al servidor o filtrar fila a fila con la misma semántica.
 */
export function pptoRequiereConsultaServidor(f, ctx = {}) {
  const n = pptoFiltroNormalizar(f, ctx)
  if (pptoFiltroValoresLista(pptoFiltroDef('item'), n).length) return true
  if (pptoFiltroValoresLista(pptoFiltroDef('capitulo'), n).length > 1) return true
  if (strVal(n.revisado) || strVal(n.preInterv)) return true
  if (n.sellado === true || n.sellado === 'true' || n.sellado === false || n.sellado === 'false') return true
  if (strVal(n.idPol) || strVal(n.pkCriterio) || strVal(n.texto)) return true
  if (strVal(n.tramo) || (Array.isArray(n.tramos) && n.tramos.length)) return true
  if (strVal(n.calzada) || (Array.isArray(n.calzadas) && n.calzadas.length)) return true
  if (strVal(n.nodoI) || strVal(n.nodoF) || strVal(n.absA) || strVal(n.absB)) return true
  if (strVal(n.und) || (Array.isArray(n.unds) && n.unds.length)) return true
  if (n.dadoDeBaja === true || n.dadoDeBaja === 'true' || n.dadoDeBaja === false || n.dadoDeBaja === 'false') return true
  if (strVal(n.vlrUnitarioMin) || strVal(n.vlrUnitarioMax)) return true
  if (strVal(n.cantTotalMin) || strVal(n.cantTotalMax)) return true
  if (strVal(n.costoDirectoMin) || strVal(n.costoDirectoMax)) return true
  return false
}

/** ¿La fila cumple cap/ítem/competencia + validación de fObra? (caché derivada y vista grilla). */
export function pptoFilaCoincideFObra(row, f, drillArr = []) {
  if (!row) return false
  const caps = pptoFiltroValoresLista(pptoFiltroDef('capitulo'), f)
  const items = pptoFiltroValoresLista(pptoFiltroDef('item'), f)
  const comps = pptoFiltroValoresLista(pptoFiltroDef('competencia'), f)
  const capDrill = (drillArr || []).find((d) => d.campo === 'capitulo')?.valor
  const itemDrill = (drillArr || []).find((d) => d.campo === 'item')?.valor
  const itemsDrill = (drillArr || []).find((d) => d.campo === 'items')?.valor
  const cap = String(row.capitulo ?? '').trim()
  const item = String(row.item ?? '').trim()
  const comp = String(row.competencia ?? '').trim()
  if (capDrill && cap !== String(capDrill).trim()) return false
  if (caps.length && !caps.includes(cap)) return false
  if (itemDrill && !pptoMatchItemNumero(item, itemDrill)) return false
  if (itemsDrill?.length && !itemsDrill.some((it) => pptoMatchItemNumero(item, it))) return false
  if (items.length && !items.some((it) => pptoMatchItemNumero(item, it))) return false
  if (comps.length && !comps.includes(comp)) return false
  const te = strVal(f?.tipoEjecucion)
  if (te && String(row.tipo_ejecucion ?? '').trim() !== te) return false
  if (!pptoFilaCoincideRevisado(row, f?.revisado)) return false
  if (!pptoFilaCoincidePreInterv(row, f?.preInterv)) return false
  if (!pptoFilaCoincideSellado(row, f?.sellado)) return false
  return true
}

function appendListaParam(p, keySingular, keyPlural, singleVal, listVal) {
  const vals = (() => {
    if (Array.isArray(listVal) && listVal.length) {
      return [...new Set(listVal.map((x) => String(x ?? '').trim()).filter(Boolean))]
    }
    const one = String(singleVal ?? '').trim()
    return one ? [one] : []
  })()
  if (vals.length > 1) {
    for (const v of vals) p.append(keyPlural, v)
  } else if (vals.length === 1) {
    p.set(keySingular, vals[0])
  }
}

/** Añade params de fObra a URLSearchParams para GET /presupuesto. */
export function pptoAppendFObraToSearchParams(p, f) {
  appendListaParam(p, 'capitulo', 'capitulos', f.cap, f.caps)
  appendListaParam(p, 'item', 'items', f.item, f.items)
  appendListaParam(p, 'tramo', 'tramos', f.tramo, f.tramos)
  appendListaParam(p, 'calzada', 'calzadas', f.calzada, f.calzadas)
  appendListaParam(p, 'competencia', 'competencias', f.competencia, f.competencias)
  appendListaParam(p, 'und', 'unds', f.und, f.unds)

  if (f.nodoI) p.set('nodo_inicio', String(f.nodoI).trim())
  if (f.nodoF) p.set('nodo_final', String(f.nodoF).trim())
  if (f.absA) p.set('abs_desde', String(f.absA).replace(',', '.'))
  if (f.absB) p.set('abs_hasta', String(f.absB).replace(',', '.'))
  if (strVal(f.revisado)) p.set('revisado', strVal(f.revisado))
  if (strVal(f.preInterv)) p.set('pre_interv_estado', strVal(f.preInterv))
  if (f.idPol && String(f.idPol).trim()) p.set('id_pol', String(f.idPol).trim())
  if (f.pkCriterio && String(f.pkCriterio).trim()) p.set('pk_criterio', String(f.pkCriterio).trim())
  if (f.texto && String(f.texto).trim()) p.set('texto', String(f.texto).trim())
  if (f.sellado === true || f.sellado === 'true') p.set('sellado', 'true')
  else if (f.sellado === false || f.sellado === 'false') p.set('sellado', 'false')
  if (f.dadoDeBaja === true || f.dadoDeBaja === 'true') p.set('dado_de_baja', 'true')
  else if (f.dadoDeBaja === false || f.dadoDeBaja === 'false') p.set('dado_de_baja', 'false')
  if (f.vlrUnitarioMin) p.set('vlr_unitario_desde', String(f.vlrUnitarioMin).replace(',', '.'))
  if (f.vlrUnitarioMax) p.set('vlr_unitario_hasta', String(f.vlrUnitarioMax).replace(',', '.'))
  if (f.cantTotalMin) p.set('cant_total_desde', String(f.cantTotalMin).replace(',', '.'))
  if (f.cantTotalMax) p.set('cant_total_hasta', String(f.cantTotalMax).replace(',', '.'))
  if (f.costoDirectoMin) p.set('costo_directo_desde', String(f.costoDirectoMin).replace(',', '.'))
  if (f.costoDirectoMax) p.set('costo_directo_hasta', String(f.costoDirectoMax).replace(',', '.'))
  const te = String(f.tipoEjecucion || '').trim()
  if (te) p.set('tipo_ejecucion', te)
}

export function pptoAppendTipoEjecucion(p, f, defaultTipo = 'Presupuesto de Obra') {
  const te = String(f?.tipoEjecucion || defaultTipo).trim() || defaultTipo
  p.set('tipo_ejecucion', te)
}

/** Primer capítulo activo (cap, caps[], drill o panel). */
export function pptoPrimerCapitulo(f, ctx = {}) {
  const n = pptoFiltroNormalizar(f, ctx)
  const caps = pptoFiltroValoresLista(pptoFiltroDef('capitulo'), n)
  if (caps.length) return caps[0]
  const capDrill = (ctx.drill || []).find((d) => d.campo === 'capitulo')?.valor
  if (capDrill) return String(capDrill)
  if (ctx.capExpandido) return String(ctx.capExpandido)
  return ''
}

/**
 * Query params alineados con GET /presupuesto y /conteo.
 * Siempre contra el presupuesto vigente (tabla `presupuesto`); no envía version_id ni snapshots históricos.
 * @param {object} [opts] capituloOverride, itemOverride, verPapelera, tipoEjecucionDefault
 */
export function pptoBuildPresupuestoSearchParams(f, ctx = {}, opts = {}) {
  const n = pptoFiltroNormalizar(pptoFObraParaConsulta(f, opts.legacy || {}), ctx)
  const fQuery = { ...n }
  const capOv = opts.capituloOverride
  if (capOv != null && String(capOv).trim()) {
    fQuery.cap = String(capOv).trim()
    fQuery.caps = []
  }
  const itemOv = opts.itemOverride
  if (itemOv != null && String(itemOv).trim()) {
    fQuery.item = String(itemOv).trim()
    fQuery.items = []
  }
  const p = new URLSearchParams()
  if (opts.verPapelera) p.set('papelera', 'true')
  pptoAppendFObraToSearchParams(p, fQuery)
  pptoAppendTipoEjecucion(p, fQuery, opts.tipoEjecucionDefault || 'Presupuesto de Obra')
  return p
}

/** Convierte fObra + drill al cuerpo POST exportar-informe (mismos filtros que la grilla). */
export function pptoFObraToExportBody(f, ctx = {}) {
  const n = pptoFiltroNormalizar(f, ctx)
  const drill = ctx.drill || []
  const capD = drill.find((d) => d.campo === 'capitulo')
  const itemD = drill.find((d) => d.campo === 'item')
  const itemsD = drill.find((d) => d.campo === 'items')

  let capLista = pptoFiltroValoresLista(pptoFiltroDef('capitulo'), n)
  if (capD?.valor) {
    const cv = String(capD.valor).trim()
    if (cv && !capLista.includes(cv)) capLista = [cv, ...capLista]
  }

  const itemsLista = itemsD?.valor?.length
    ? itemsD.valor.map(String)
    : itemD?.valor
      ? [String(itemD.valor)]
      : pptoFiltroValoresLista(pptoFiltroDef('item'), n)

  const tramoLista = pptoFiltroValoresLista(pptoFiltroDef('tramo'), n)
  const calzadaLista = pptoFiltroValoresLista(pptoFiltroDef('calzada'), n)
  const competenciaLista = pptoFiltroValoresLista(pptoFiltroDef('competencia'), n)
  const undLista = pptoFiltroValoresLista(pptoFiltroDef('und'), n)

  const parseNum = (v) => {
    if (v === '' || v == null) return null
    const x = parseFloat(String(v).replace(',', '.'))
    return Number.isFinite(x) ? x : null
  }

  const splitLista = (lista) => ({
    single: lista.length === 1 ? lista[0] : null,
    multi: lista.length > 1 ? lista : null,
  })
  const cap = splitLista(capLista)
  const it = splitLista(itemsLista)
  const tr = splitLista(tramoLista)
  const cal = splitLista(calzadaLista)
  const comp = splitLista(competenciaLista)
  const und = splitLista(undLista)

  let sellado = null
  if (n.sellado === true || n.sellado === 'true') sellado = true
  else if (n.sellado === false || n.sellado === 'false') sellado = false

  return {
    capitulo: cap.single,
    capitulos: cap.multi,
    item: it.single,
    items: it.multi,
    tramo: tr.single,
    tramos: tr.multi,
    calzada: cal.single,
    calzadas: cal.multi,
    competencia: comp.single,
    competencias: comp.multi,
    und: und.single,
    unds: und.multi,
    nodo_inicio: String(n.nodoI || '').trim() || null,
    nodo_final: String(n.nodoF || '').trim() || null,
    abs_desde: parseNum(n.absA),
    abs_hasta: parseNum(n.absB),
    revisado: strVal(n.revisado) || null,
    pre_interv_estado: strVal(n.preInterv) || null,
    id_pol: String(n.idPol || '').trim() || null,
    pk_criterio: String(n.pkCriterio || '').trim() || null,
    texto: String(n.texto || '').trim() || null,
    sellado,
    vlr_unitario_desde: parseNum(n.vlrUnitarioMin),
    vlr_unitario_hasta: parseNum(n.vlrUnitarioMax),
    cant_total_desde: parseNum(n.cantTotalMin),
    cant_total_hasta: parseNum(n.cantTotalMax),
    costo_directo_desde: parseNum(n.costoDirectoMin),
    costo_directo_hasta: parseNum(n.costoDirectoMax),
    tipo_ejecucion: String(n.tipoEjecucion || ctx.tipoEjecucionDefault || '').trim() || null,
    papelera: !!ctx.verPapelera,
  }
}

/** Query params de conteo alineados con el cuerpo de exportación. */
export function pptoExportBodyToSearchParams(body) {
  const p = new URLSearchParams()
  if (body?.papelera) p.set('papelera', 'true')
  appendListaParam(p, 'capitulo', 'capitulos', body.capitulo, body.capitulos)
  appendListaParam(p, 'item', 'items', body.item, body.items)
  appendListaParam(p, 'tramo', 'tramos', body.tramo, body.tramos)
  appendListaParam(p, 'calzada', 'calzadas', body.calzada, body.calzadas)
  appendListaParam(p, 'competencia', 'competencias', body.competencia, body.competencias)
  appendListaParam(p, 'und', 'unds', body.und, body.unds)
  if (body.nodo_inicio) p.set('nodo_inicio', body.nodo_inicio)
  if (body.nodo_final) p.set('nodo_final', body.nodo_final)
  if (body.abs_desde != null) p.set('abs_desde', String(body.abs_desde))
  if (body.abs_hasta != null) p.set('abs_hasta', String(body.abs_hasta))
  if (body.revisado) p.set('revisado', body.revisado)
  if (body.pre_interv_estado) p.set('pre_interv_estado', body.pre_interv_estado)
  if (body.id_pol) p.set('id_pol', body.id_pol)
  if (body.pk_criterio) p.set('pk_criterio', body.pk_criterio)
  if (body.texto) p.set('texto', body.texto)
  if (body.sellado === true) p.set('sellado', 'true')
  else if (body.sellado === false) p.set('sellado', 'false')
  if (body.vlr_unitario_desde != null) p.set('vlr_unitario_desde', String(body.vlr_unitario_desde))
  if (body.vlr_unitario_hasta != null) p.set('vlr_unitario_hasta', String(body.vlr_unitario_hasta))
  if (body.cant_total_desde != null) p.set('cant_total_desde', String(body.cant_total_desde))
  if (body.cant_total_hasta != null) p.set('cant_total_hasta', String(body.cant_total_hasta))
  if (body.costo_directo_desde != null) p.set('costo_directo_desde', String(body.costo_directo_desde))
  if (body.costo_directo_hasta != null) p.set('costo_directo_hasta', String(body.costo_directo_hasta))
  if (body.tipo_ejecucion) p.set('tipo_ejecucion', body.tipo_ejecucion)
  return p
}

/** Snapshot para plantilla: fObra + claves activas. */
export function pptoFiltroSnapshot(f, activeKeys) {
  const snap = { ...f }
  for (const k of ['caps', 'items', 'tramos', 'calzadas', 'competencias', 'unds']) {
    if (Array.isArray(snap[k])) snap[k] = [...snap[k]]
  }
  return { fObra: snap, activeKeys: (activeKeys || []).filter((k) => k !== 'tipo_ejecucion') }
}

/** Restaura snapshot de plantilla. */
export function pptoFiltroFromSnapshot(snap) {
  if (!snap || typeof snap !== 'object') return { fObra: pptoFObraCamposVacios(), activeKeys: [] }
  if (snap.fObra) {
    const base = pptoFObraCamposVacios()
    const fObra = { ...base, ...snap.fObra }
    for (const k of ['caps', 'items', 'tramos', 'calzadas', 'competencias', 'unds']) {
      fObra[k] = Array.isArray(snap.fObra[k]) ? [...snap.fObra[k]] : base[k]
    }
    return {
      fObra,
      activeKeys: Array.isArray(snap.activeKeys) ? [...snap.activeKeys] : pptoFiltrosActivosKeys(fObra),
    }
  }
  return { fObra: { ...pptoFObraCamposVacios(), ...snap }, activeKeys: pptoFiltrosActivosKeys(snap) }
}

/** Normaliza número de ítem para comparar (2.1 vs 2.1.). */
export function pptoNormItemNumero(s) {
  return String(s ?? '').trim()
}

/** ¿Mismo ítem en presupuesto y listado de precios? */
export function pptoMatchItemNumero(a, b) {
  const ia = pptoNormItemNumero(a)
  const ib = pptoNormItemNumero(b)
  if (ia === ib) return true
  return ia.replace(/\.+$/, '') === ib.replace(/\.+$/, '')
}

/** Orden 1.1, 1.2, 2.1, 2.2, 2.10 (no lexicográfico). */
export function pptoCmpItemNumero(a, b) {
  return pptoNormItemNumero(a).localeCompare(pptoNormItemNumero(b), 'es', { numeric: true })
}

/** Fusiona ítems de API (presupuesto) con listado de precios; conserva clave de presupuesto. */
export function pptoMergeItemsOpciones(fromApi = [], fromLp = []) {
  const merged = new Map()
  for (const o of fromApi) {
    const it = pptoNormItemNumero(o?.item)
    if (!it) continue
    merged.set(it, { item: it, descripcion: String(o?.descripcion ?? '').trim() })
  }
  for (const o of fromLp) {
    const itLp = pptoNormItemNumero(o?.item ?? o?.item_numero)
    const desc = String(o?.descripcion ?? '').trim()
    if (!itLp) continue
    const key = [...merged.keys()].find((k) => pptoMatchItemNumero(k, itLp))
    if (key) {
      const prev = merged.get(key)
      if (desc && !prev.descripcion) merged.set(key, { ...prev, descripcion: desc })
    } else if (desc) {
      merged.set(itLp, { item: itLp, descripcion: desc })
    }
  }
  return [...merged.values()].sort((a, b) => pptoCmpItemNumero(a.item, b.item))
}
