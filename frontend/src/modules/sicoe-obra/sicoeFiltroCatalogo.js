/** Catálogo de filtros SicoeObra — modal, plantillas y query API. */

export const SICOE_FILTRO_MODULO = 'sicoe_obra'

/** Valor enviado a la API como filtro virtual (no es estado de cabecera so_reportes). */
export const SICOE_ESTADO_REPORTE_REVERSION = 'Reversión'

const ESTADOS_REPORTE_CONTRATISTA = [
  'Borrador',
  'Sin Asignar Ítem',
  'No Revisados',
  'No Objeto de Cobro',
  'En Papelera',
  SICOE_ESTADO_REPORTE_REVERSION,
]

/** Operativo / Interventoría / Interventoría Gerencial: solo cola de reversión (primera llave pendiente). */
export function sicoeFiltroSoloReversionInterventoria(usuario) {
  const rol = String(usuario?.rol_nombre || usuario?.rol || '')
    .toLowerCase()
    .trim()
    .replace(/í/g, 'i')
  if (rol === 'operativo interventoria' || rol === 'interventoria') return true
  if (rol.includes('gerencial') && rol.includes('intervent')) return true
  return false
}

export function sicoeEstadosReporteFiltro(usuario, nivelInfo) {
  if (sicoeFiltroSoloReversionInterventoria(usuario) || nivelInfo?.esInterventoria) {
    return [SICOE_ESTADO_REPORTE_REVERSION]
  }
  return ESTADOS_REPORTE_CONTRATISTA
}

export const SICOE_FILTRO_CATEGORIAS = [
  { id: 'fechas', label: 'Fechas y usuario' },
  { id: 'reporte', label: 'Reporte' },
  { id: 'item', label: 'Ítem' },
  { id: 'ubicacion', label: 'Ubicación' },
  { id: 'valores', label: 'Valores' },
  { id: 'validacion', label: 'Validación' },
  { id: 'otros', label: 'Otros' },
]

/** @type {import('../presupuesto/pptoFiltroCatalogo').FiltroDef[]} */
export const SICOE_FILTRO_CATALOGO = [
  { key: 'numero_reporte', label: 'N° reporte', tipo: 'text', categoria: 'reporte', campoFObra: 'numero_reporte' },
  { key: 'numero_registro', label: 'N° registro', tipo: 'text', categoria: 'reporte', campoFObra: 'numero_registro' },
  { key: 'semana', label: 'Semana', tipo: 'autocomplete', categoria: 'reporte', campoFObra: 'semana', opcionesKey: 'semanas_opts' },
  { key: 'acta_rpo', label: 'Acta RPO', tipo: 'autocomplete', categoria: 'reporte', campoFObra: 'acta_rpo', opcionesKey: 'actas_opts' },
  { key: 'subcontratista_id', label: 'Subcontratista', tipo: 'select', categoria: 'reporte', campoFObra: 'subcontratista_id', opcionesKey: 'subcontratistas_opts' },
  { key: 'estado', label: 'Estado del reporte', tipo: 'select', categoria: 'reporte', campoFObra: 'estado', opcionesKey: 'estados_reporte' },
  { key: 'capitulo', label: 'Capítulo', tipo: 'select', categoria: 'item', campoFObra: 'capitulo', opcionesKey: 'capitulos' },
  { key: 'item', label: 'Ítem', tipo: 'select_multi', categoria: 'item', campoFObra: 'item', campoFObraLista: 'items', opcionesKey: 'items_opciones' },
  { key: 'etiqueta_validacion', label: 'Etiqueta validación', tipo: 'select', categoria: 'item', campoFObra: 'etiqueta_validacion', opcionesKey: 'etiquetas_validacion' },
  { key: 'tramo', label: 'Tramo', tipo: 'select', categoria: 'ubicacion', campoFObra: 'tramo', opcionesKey: 'tramos' },
  { key: 'costado', label: 'Calzada', tipo: 'select', categoria: 'ubicacion', campoFObra: 'costado', opcionesKey: 'costados' },
  { key: 'abs_inicio', label: 'Abscisa', tipo: 'rango_abscisa', categoria: 'ubicacion', campoFObra: 'absIni', campoFObraHasta: 'absFin' },
  { key: 'cantidad', label: 'Cantidad (línea)', tipo: 'rango_numerico', categoria: 'valores', campoFObra: 'cantidadMin', campoFObraHasta: 'cantidadMax' },
  { key: 'costo_directo', label: 'Costo directo (línea)', tipo: 'rango_numerico', categoria: 'valores', campoFObra: 'costoDirectoMin', campoFObraHasta: 'costoDirectoMax' },
  { key: 'q_observacion', label: 'Observación', tipo: 'text', categoria: 'otros', campoFObra: 'q_observacion' },
  { key: 'q_nodo', label: 'Nodo inicio / fin', tipo: 'text', categoria: 'otros', campoFObra: 'q_nodo' },
  { key: 'estado_registro', label: 'Estado registro', tipo: 'text', categoria: 'otros', campoFObra: 'estado_registro' },
  { key: 'cargo', label: 'Cargo', tipo: 'text', categoria: 'otros', campoFObra: 'cargo' },
]

const CATALOGO_BY_KEY = Object.fromEntries(SICOE_FILTRO_CATALOGO.map((d) => [d.key, d]))

export function sicoeFiltroDef(key) {
  return CATALOGO_BY_KEY[key] || null
}

export function sicoeFiltroCatalogoPorCategoria() {
  const out = {}
  for (const cat of SICOE_FILTRO_CATEGORIAS) out[cat.id] = []
  for (const def of SICOE_FILTRO_CATALOGO) {
    if (out[def.categoria]) out[def.categoria].push(def)
  }
  return out
}

export function sicoeFSicoeVacios() {
  return {
    numero_reporte: '',
    numero_registro: '',
    semana: '',
    acta_rpo: '',
    subcontratista_id: '',
    capitulo: '',
    item: '',
    items: [],
    itemsOp: 'and',
    tramo: '',
    costado: '',
    pk_id_id: '',
    pk_label: '',
    absIni: '',
    absFin: '',
    estado: '',
    etiqueta_validacion: '',
    estado_registro: '',
    cargo: '',
    cantidadMin: '',
    cantidadMax: '',
    costoDirectoMin: '',
    costoDirectoMax: '',
    q_observacion: '',
    q_nodo: '',
    ambitoFecha: 'reporte',
    tipoFecha: 'creacion',
    fechaDesde: '',
    fechaHasta: '',
    usuario_id: '',
    usuarioLabel: '',
    usuarioAccion: 'creo',
  }
}

function strVal(v) {
  if (v == null) return ''
  return String(v).trim()
}

function hasStr(v) {
  return !!strVal(v)
}

function hasRange(min, max) {
  return hasStr(min) || hasStr(max)
}

export function sicoeFiltroValoresLista(def, f) {
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
  return hasStr(f[def.campoFObra]) ? [strVal(f[def.campoFObra])] : []
}

export function sicoeFiltroTieneValor(def, f) {
  if (!def || !f) return false
  if (def.tipo === 'rango_numerico' || def.key === 'abs_inicio') {
    return hasRange(f[def.campoFObra], f[def.campoFObraHasta])
  }
  if (def.tipo === 'select_multi' || def.key === 'item') {
    return sicoeFiltroValoresLista(def, f).length > 0
  }
  return hasStr(f[def.campoFObra])
}

export function sicoeTieneFiltroFechasUsuario(f) {
  if (!f) return false
  if (hasStr(f.fechaDesde) || hasStr(f.fechaHasta)) return true
  if (hasStr(f.usuario_id)) return true
  return false
}

export function sicoeTienePkSeleccionado(f) {
  return hasStr(f?.pk_id_id)
}

export function sicoeFiltrosActivosKeys(f, extra = {}) {
  const set = new Set()
  for (const def of SICOE_FILTRO_CATALOGO) {
    if (sicoeFiltroTieneValor(def, f)) set.add(def.key)
  }
  if (sicoeTienePkSeleccionado(f)) set.add('pk_mapa')
  if (sicoeTieneFiltroFechasUsuario(f)) set.add('_fechas_usuario')
  if (extra.capasValidacion?.length) set.add('_capas')
  return [...set]
}

/** Criterios elegidos en el modal (sin capas por defecto de rol). */
export function sicoeBundleTieneCriteriosUsuario(bundle) {
  const b = bundle || {}
  const f = b.fSicoe || {}
  const catalogoKeys = sicoeFiltrosActivosKeys(f, {}).filter((k) => !k.startsWith('_'))
  const tieneCatalogo = catalogoKeys.length > 0
  const tienePk = sicoeTienePkSeleccionado(f)
  const tieneFechas = sicoeTieneFiltroFechasUsuario(f)
  const tieneChips = Array.isArray(b.itemsChips) && b.itemsChips.some((x) => String(x || '').trim())
  const tieneRefinar = !!(strVal(b.q_observacion) || strVal(b.q_nodo))
  const tieneValores =
    !!(String(f.cantidadMin ?? '').trim() || String(f.cantidadMax ?? '').trim()) ||
    !!(String(f.costoDirectoMin ?? '').trim() || String(f.costoDirectoMax ?? '').trim())
  const tieneCapas = Array.isArray(b.capasValidacion) && b.capasValidacion.length > 0
  return tieneCatalogo || tienePk || tieneFechas || tieneChips || tieneRefinar || tieneValores || tieneCapas
}

export function sicoeFiltroPatchLista(def, valores) {
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

export function sicoeFiltroChipResumen(def, f, itemLabels = {}) {
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
    const vals = sicoeFiltroValoresLista(def, f)
    if (!vals.length) return '…'
    if (def.key === 'item') {
      return vals.map((v) => itemLabels[v] || v).join(', ')
    }
    if (vals.length > 2) return `${vals.slice(0, 2).join(', ')} +${vals.length - 2}`
    return vals.join(', ')
  }
  if (def.key === 'subcontratista_id' && f._subcLabel) return f._subcLabel
  return strVal(f[def.campoFObra]) || '…'
}

export function sicoeFiltroPatchLimpiar(def) {
  if (!def) return {}
  if (def.tipo === 'rango_numerico' || def.key === 'abs_inicio') {
    return { [def.campoFObra]: '', [def.campoFObraHasta]: '' }
  }
  if (def.tipo === 'select_multi' && def.campoFObraLista) {
    return { [def.campoFObra]: '', [def.campoFObraLista]: [] }
  }
  if (def.key === 'item') return { item: '', items: [] }
  return { [def.campoFObra]: '' }
}

export function sicoeFiltroPatchActivar() {
  return {}
}

/** Estado `filtros` de App.jsx → fSicoe del modal. */
export function sicoeFiltrosToFSicoe(filtros = {}, extras = {}) {
  const base = sicoeFSicoeVacios()
  const f = filtros || {}
  const chips = extras.itemsChips || []
  const items = chips.length ? [...chips] : (f.item ? [String(f.item).trim()] : [])
  return {
    ...base,
    numero_reporte: strVal(f.numero_reporte),
    numero_registro: strVal(f.numero_registro),
    semana: strVal(f.semana),
    acta_rpo: strVal(f.acta_rpo),
    subcontratista_id: strVal(f.subcontratista_id),
    capitulo: strVal(f.capitulo),
    item: items.length === 1 && !chips.length ? items[0] : '',
    items: chips.length ? items : (items.length > 1 ? items : []),
    itemsOp: extras.itemsOp === 'or' ? 'or' : 'and',
    tramo: strVal(f.tramo),
    costado: strVal(f.costado),
    pk_id_id: strVal(f.pk_id || f.pk_id_id),
    pk_label: strVal(f.pk_label),
    absIni: strVal(f.abs_inicio),
    absFin: strVal(f.abs_final),
    estado: strVal(f.estado),
    etiqueta_validacion: strVal(f.etiqueta_validacion),
    estado_registro: strVal(f.estado_registro),
    cargo: strVal(f.cargo),
    q_observacion: strVal(extras.q_observacion),
    q_nodo: strVal(extras.q_nodo),
    _subcLabel: extras._subcLabel || '',
    ambitoFecha: f.ambitoFecha === 'registro' ? 'registro' : 'reporte',
    tipoFecha: f.tipoFecha === 'modificacion' ? 'modificacion' : 'creacion',
    fechaDesde: strVal(f.fechaDesde),
    fechaHasta: strVal(f.fechaHasta),
    usuario_id: strVal(f.usuario_id),
    usuarioLabel: strVal(f.usuarioLabel),
    usuarioAccion: ['creo', 'edito', 'valido'].includes(f.usuarioAccion) ? f.usuarioAccion : 'creo',
  }
}

/** fSicoe → objeto `filtros` para la grilla (sin ítems multi: van en chips). */
export function sicoeFSicoeToFiltros(fSicoe = {}) {
  const f = { ...fSicoe }
  const itemsLista = sicoeFiltroValoresLista(sicoeFiltroDef('item'), f)
  return {
    numero_reporte: strVal(f.numero_reporte),
    numero_registro: strVal(f.numero_registro),
    semana: strVal(f.semana),
    acta_rpo: strVal(f.acta_rpo),
    subcontratista_id: strVal(f.subcontratista_id),
    capitulo: strVal(f.capitulo),
    item: itemsLista.length === 1 && !(f.items?.length) ? itemsLista[0] : '',
    tramo: strVal(f.tramo),
    costado: strVal(f.costado),
    pk_id: strVal(f.pk_id_id),
    abs_inicio: strVal(f.absIni),
    abs_final: strVal(f.absFin),
    estado: strVal(f.estado),
    cargo: strVal(f.cargo),
    estado_registro: strVal(f.estado_registro),
    etiqueta_validacion: strVal(f.etiqueta_validacion),
    pendiente_item: false,
  }
}

export function sicoeItemsChipsFromFSicoe(fSicoe = {}) {
  const lista = sicoeFiltroValoresLista(sicoeFiltroDef('item'), fSicoe)
  if (fSicoe.items?.length) return [...fSicoe.items]
  return lista
}

function parseNum(v) {
  if (v === '' || v == null) return null
  const x = parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(x) ? x : null
}

/** Añade parámetros de fSicoe a URLSearchParams (grilla + panel). */
export function sicoeAppendFSicoeToSearchParams(p, fSicoe, ctx = {}) {
  const f = sicoeFSicoeToFiltros(fSicoe)
  Object.entries(f).forEach(([k, v]) => {
    if (k === 'pendiente_item' || k.startsWith('cantidad') || k.startsWith('costo')) return
    if (v === '' || v == null || v === false) return
    p.append(k, v)
  })
  const itemsChips = ctx.itemsChips ?? sicoeItemsChipsFromFSicoe(fSicoe)
  const itemsOp = ctx.itemsOp ?? fSicoe.itemsOp
  if (itemsChips?.length) {
    if (itemsChips.length === 1 && !fSicoe.items?.length) {
      p.set('item', itemsChips[0])
    } else {
      p.set('items_filtro', JSON.stringify(itemsChips))
      if (itemsChips.length > 1) p.set('items_filtro_op', itemsOp === 'or' ? 'or' : 'and')
    }
  }
  const cd = parseNum(fSicoe.cantidadMin)
  const ch = parseNum(fSicoe.cantidadMax)
  const cdd = parseNum(fSicoe.costoDirectoMin)
  const cdh = parseNum(fSicoe.costoDirectoMax)
  if (cd != null) p.set('cantidad_desde', String(cd))
  if (ch != null) p.set('cantidad_hasta', String(ch))
  if (cdd != null) p.set('costo_directo_desde', String(cdd))
  if (cdh != null) p.set('costo_directo_hasta', String(cdh))
  const oObs = strVal(ctx.q_observacion ?? fSicoe.q_observacion)
  const oNod = strVal(ctx.q_nodo ?? fSicoe.q_nodo)
  if (oObs) p.set('q_observacion', oObs)
  if (oNod) p.set('q_nodo', oNod)
  if (hasStr(fSicoe.fechaDesde)) p.set('fecha_desde', strVal(fSicoe.fechaDesde))
  if (hasStr(fSicoe.fechaHasta)) p.set('fecha_hasta', strVal(fSicoe.fechaHasta))
  if (fSicoe.ambitoFecha === 'registro') p.set('ambito_fecha', 'registro')
  if (fSicoe.tipoFecha === 'modificacion') p.set('tipo_fecha', 'modificacion')
  if (hasStr(fSicoe.usuario_id)) {
    p.set('usuario_id', strVal(fSicoe.usuario_id))
    const acc = ['creo', 'edito', 'valido'].includes(fSicoe.usuarioAccion) ? fSicoe.usuarioAccion : 'creo'
    p.set('usuario_accion', acc)
  }
  sicoeAppendPanelChecksToSearchParams(p, ctx.panelBundle)
}

/** Multi-selección del panel dinámico (capítulos / actas RPO). */
export function sicoeAppendPanelChecksToSearchParams(p, panelBundle) {
  if (!p || !panelBundle) return
  const caps = Array.isArray(panelBundle.panelCapitulos)
    ? panelBundle.panelCapitulos.map((x) => strVal(x)).filter(Boolean)
    : []
  const actas = Array.isArray(panelBundle.panelActasRpo)
    ? panelBundle.panelActasRpo.map((x) => parseInt(String(x), 10)).filter((n) => Number.isFinite(n))
    : []
  if (caps.length > 1) {
    p.set('capitulos_filtro', JSON.stringify(caps))
    p.delete('capitulo')
  } else if (caps.length === 1) {
    p.set('capitulo', caps[0])
    p.delete('capitulos_filtro')
  }
  if (actas.length > 1) {
    p.set('actas_filtro', JSON.stringify(actas))
    p.delete('acta_rpo')
  } else if (actas.length === 1) {
    p.set('acta_rpo', String(actas[0]))
    p.delete('actas_filtro')
  }
}

export function sicoeFiltroSnapshot(bundle) {
  const b = bundle || {}
  const fSicoe = { ...sicoeFSicoeVacios(), ...(b.fSicoe || {}) }
  if (Array.isArray(fSicoe.items)) fSicoe.items = [...fSicoe.items]
  return {
    fSicoe,
    itemsChips: Array.isArray(b.itemsChips) ? [...b.itemsChips] : sicoeItemsChipsFromFSicoe(fSicoe),
    itemsOp: b.itemsOp === 'or' ? 'or' : 'and',
    capasValidacion: Array.isArray(b.capasValidacion) ? [...b.capasValidacion] : [],
    capasValidacionOp: b.capasValidacionOp === 'or' ? 'or' : 'and',
    q_observacion: strVal(b.q_observacion ?? fSicoe.q_observacion),
    q_nodo: strVal(b.q_nodo ?? fSicoe.q_nodo),
    panelCapitulos: Array.isArray(b.panelCapitulos) ? [...b.panelCapitulos] : [],
    panelActasRpo: Array.isArray(b.panelActasRpo) ? [...b.panelActasRpo] : [],
  }
}

export function sicoeFiltroFromSnapshot(snap) {
  if (!snap || typeof snap !== 'object') {
    return {
      fSicoe: sicoeFSicoeVacios(),
      itemsChips: [],
      itemsOp: 'and',
      capasValidacion: [],
      capasValidacionOp: 'and',
      q_observacion: '',
      q_nodo: '',
      panelCapitulos: [],
      panelActasRpo: [],
    }
  }
  if (snap.fSicoe) {
    const base = sicoeFSicoeVacios()
    const fSicoe = { ...base, ...snap.fSicoe }
    fSicoe.items = Array.isArray(snap.fSicoe.items) ? [...snap.fSicoe.items] : []
    return {
      fSicoe,
      itemsChips: Array.isArray(snap.itemsChips) ? [...snap.itemsChips] : sicoeItemsChipsFromFSicoe(fSicoe),
      itemsOp: snap.itemsOp === 'or' ? 'or' : 'and',
      capasValidacion: Array.isArray(snap.capasValidacion) ? [...snap.capasValidacion] : [],
      capasValidacionOp: snap.capasValidacionOp === 'or' ? 'or' : 'and',
      q_observacion: strVal(snap.q_observacion ?? fSicoe.q_observacion),
      q_nodo: strVal(snap.q_nodo ?? fSicoe.q_nodo),
      panelCapitulos: Array.isArray(snap.panelCapitulos) ? [...snap.panelCapitulos] : [],
      panelActasRpo: Array.isArray(snap.panelActasRpo) ? [...snap.panelActasRpo] : [],
    }
  }
  return sicoeFiltroFromSnapshot({ fSicoe: { ...sicoeFSicoeVacios(), ...snap } })
}

export function sicoeBundleFromAppState({
  filtros,
  itemsChips,
  itemsOp,
  sicoeFiltroObs,
  sicoeFiltroNodo,
  capasValidacion,
  capasValidacionOp,
  subcLabel,
  fSicoeOverride,
  panelCapitulos,
  panelActasRpo,
}) {
  const fSicoe = fSicoeOverride
    ? { ...sicoeFSicoeVacios(), ...fSicoeOverride }
    : sicoeFiltrosToFSicoe(filtros, {
        itemsChips,
        itemsOp,
        q_observacion: sicoeFiltroObs,
        q_nodo: sicoeFiltroNodo,
        _subcLabel: subcLabel,
      })
  return sicoeFiltroSnapshot({
    fSicoe,
    itemsChips,
    itemsOp,
    capasValidacion,
    capasValidacionOp,
    q_observacion: sicoeFiltroObs,
    q_nodo: sicoeFiltroNodo,
    panelCapitulos: panelCapitulos || [],
    panelActasRpo: panelActasRpo || [],
  })
}

/** Extrae número RPO de etiqueta del panel (p. ej. "RPO 12"). */
export function sicoePanelLabelToRpo(label) {
  const m = String(label || '').match(/(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

export function sicoeResumenFiltros(bundle, itemLabels = {}, encCapas = {}) {
  const { fSicoe, capasValidacion } = bundle || {}
  const keys = sicoeFiltrosActivosKeys(fSicoe, { capasValidacion })
  const partes = []
  if (sicoeTieneFiltroFechasUsuario(fSicoe)) {
    const amb = fSicoe.ambitoFecha === 'registro' ? 'registro' : 'reporte'
    const tip = fSicoe.tipoFecha === 'modificacion' ? 'modificación' : 'creación'
    const fd = strVal(fSicoe.fechaDesde)
    const fh = strVal(fSicoe.fechaHasta)
    let fe = ''
    if (fd && fh) fe = `${fd} – ${fh}`
    else if (fd) fe = `desde ${fd}`
    else if (fh) fe = `hasta ${fh}`
    const accLab = { creo: 'creó', edito: 'editó', valido: 'validó' }[fSicoe.usuarioAccion] || 'creó'
    const usr = strVal(fSicoe.usuarioLabel) || (fSicoe.usuario_id ? `usuario ${fSicoe.usuario_id}` : '')
    if (fe) partes.push(`Fecha (${amb}, ${tip}): ${fe}`)
    if (usr) partes.push(`Usuario (${accLab}): ${usr}`)
  }
  if (sicoeTienePkSeleccionado(fSicoe)) {
    partes.push(`PK: ${strVal(fSicoe.pk_label) || fSicoe.pk_id_id}`)
  }
  keys
    .filter((k) => k !== '_capas' && k !== '_fechas_usuario' && k !== 'pk_mapa')
    .slice(0, 4)
    .forEach((key) => {
      const def = sicoeFiltroDef(key)
      if (!def) return
      partes.push(`${def.label}: ${sicoeFiltroChipResumen(def, fSicoe, itemLabels)}`)
    })
  if (capasValidacion?.length) {
    const capTxt = capasValidacion
      .map((c) => `${encCapas[c.nivel] || `N${c.nivel}`}: ${c.estado}`)
      .join(', ')
    partes.unshift(`Validación: ${capTxt}`)
  }
  if (!partes.length) return 'Sin criterios de búsqueda'
  const extra = keys.filter((k) => !['_capas', '_fechas_usuario', 'pk_mapa'].includes(k)).length > 4 ? ` +${keys.length - 4}` : ''
  return partes.join(' · ') + extra
}
