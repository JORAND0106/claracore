/**
 * Presentación legible del historial de auditoría (TrazabilidadRegistroModal).
 * Solo transforma visualización; no cambia qué se registra en backend.
 */

import { formatFechaHoraColombia, pareceTimestampIso } from './utils/fechaColombia.js'
export const CAMPO_ETIQUETAS = {
  id: 'ID',
  contrato_id: 'Contrato',
  id_pol: 'ID-POL',
  pk_id: 'PK',
  capitulo: 'Capítulo',
  competencia: 'Competencia',
  item: 'Ítem',
  descripcion: 'Descripción',
  und: 'Unidad',
  calzada: 'Calzada',
  tramo: 'Tramo',
  no_inicio: 'Nodo inicio',
  no_final: 'Nodo fin',
  abs_inicio: 'Abscisa inicio',
  abs_final: 'Abscisa fin',
  area_long_nod: 'Área / longitud',
  ancho: 'Ancho',
  espesor: 'Espesor',
  cant_total: 'Cant. total',
  vlr_unitario: 'Vlr. unitario',
  costo_directo: 'Costo directo',
  revisado: 'Estado interventoría',
  pre_interv_estado: 'Validación Contratista',
  sellado: 'Sellado',
  tipo_ejecucion: 'Tipo ejecución',
  tipo_entidad: 'Tipo entidad',
  dado_de_baja: 'Dado de baja',
  observacion_externa: 'Observación externa',
  calculo_por: 'Calculado por',
  calculo_en: 'Calculado en',
  consecutivo: 'Consecutivo',
  titulo: 'Título',
  estado: 'Estado',
  observaciones: 'Observaciones',
  enviada_at: 'Enviada',
  validada_at: 'Validada',
  validada_by: 'Validada por',
  motivo_rechazo: 'Motivo de rechazo',
  created_by: 'Creado por',
  items_count: 'Ítems',
  numero_entrada: 'N.º entrada',
  codigo: 'Código',
  tipo: 'Tipo',
  numero_documento: 'Remisión / documento',
  fecha_entrada: 'Fecha de entrada',
  costado: 'Costado',
  abscisa_inicial: 'Abscisa inicial',
  abscisa_final: 'Abscisa final',
  proveedor_id: 'Proveedor',
  orden_compra_id: 'Orden de compra',
  placa: 'Placa',
  transportador: 'Transportador',
  entrada_id: 'Entrada',
  entrada_item_id: 'Línea de entrada',
  orden_compra_item_id: 'Línea OC',
  presupuesto_id: 'Presupuesto',
  cantidad_recibida: 'Cantidad recibida',
  valor_recibido: 'Valor recibido',
  lote: 'Lote',
  fecha_vencimiento: 'Vencimiento',
  material_descripcion: 'Insumo / material',
  unidad: 'Unidad',
  numero_salida: 'N.º salida',
  fecha_hora_salida: 'Fecha y hora salida',
  cantidad_salida: 'Cantidad salida',
  cantidad_devuelta: 'Cantidad devuelta',
  cantidad_neta: 'Cantidad neta',
  receptor_usuario_id: 'Receptor',
  numero_oc: 'N.º OC',
  numero_devolucion: 'N.º devolución',
  salida_id: 'Salida',
  cantidad: 'Cantidad',
  longitud: 'Longitud',
  cantidad_total: 'Cant. total',
  cantidad_alerta_anterior: 'Cant. alerta (anterior)',
  cantidad_alerta_actual: 'Cant. alerta (actual)',
  cantidad_alerta_en: 'Cant. alerta (fecha)',
  cantidad_alerta_por: 'Cant. alerta (usuario)',
  cantidad_alerta_nivel_max_previo: 'Cant. alerta (nivel máx. previo)',
  creado_por_reg: 'Creado por (registro)',
  modificado_por_reg: 'Modificado por (registro)',
  nivel1_estado: 'Estado N1',
  nivel2_estado: 'Estado N2',
  nivel3_estado: 'Estado N3',
  nivel4_estado: 'Estado N4',
  nivel5_estado: 'Estado N5',
  nivel6_estado: 'Estado N6',
  bloqueado: 'Bloqueado / sellado',
  item_numero: 'Ítem',
  item_descripcion: 'Descripción ítem',
  observacion: 'Observación',
  nodo_ini: 'Nodo inicio',
  nodo_fin: 'Nodo fin',
  fecha_hora_devolucion: 'Fecha y hora devolución',
  deleted: 'Eliminado',
  estado_validacion: 'Estado validación',
  item_id: 'Ítem',
  insumo_id: 'Insumo',
  motivo: 'Motivo',
  consolidado: 'Consolidado',
  version: 'Versión',
  nombre: 'Nombre',
  cerrado_at: 'Cerrado',
  validado_at: 'Validado',
  // Consolidado planilla tubería (c01…c22)
  c01_planilla_id: 'Planilla ID',
  c02_tipo: 'Tipo',
  c03_pk_id: 'PK',
  c04_nombre: 'Nombre',
  c05_costado: 'Costado',
  c06_abscisa_inicial: 'Abscisa inicial',
  c07_abscisa_final: 'Abscisa final',
  c08_longitud_m: 'Longitud (m)',
  c09_diametro_m: 'Diámetro (m)',
  c10_espesor_m: 'Espesor (m)',
  c11_relacion_atraque: 'Relación atraque',
  c12_ancho_excavacion_m: 'Ancho excavación (m)',
  c13_vol_excavacion_m3: 'Vol. excavación (m³)',
  c14_vol_triturado_m3: 'Vol. triturado (m³)',
  c15_vol_relleno_m3: 'Vol. relleno (m³)',
  c16_area_geotextil_m2: 'Área geotextil (m²)',
  c17_long_tuberia_m: 'Long. tubería (m)',
  c18_norte_ref: 'Norte ref.',
  c19_este_ref: 'Este ref.',
  c20_estado: 'Estado',
  c21_cerrado_at: 'Cerrado en',
  c22_contrato_id: 'Contrato',
  // Planilla tubería — tablas editables (trazabilidad EDITAR)
  cartera: 'Cartera',
  resumen_cantidades: 'Resumen de Cantidades',
  descuentos_especificos: 'Descuentos Específicos',
  terreno_natural: 'Terreno natural',
  cota_fondo_excavacion: 'Cota fondo excavación',
  subrasante_via: 'Subrasante de vía',
  terminado_filtro: 'Terminado filtro',
  cota_lomo: 'Cota lomo',
  abscisa: 'Abscisa',
  long: 'Long',
  descontar_de: 'Descontar de',
  orden: 'Orden',
  norte: 'Norte',
  este: 'Este',
  n_campos_modificados: 'Campos modificados',
  n_filas: 'N.º filas',
  ambito: 'Ámbito',
  EXC: 'Excavación Varias',
  TUB: 'Long Tubería',
  TRI: 'Triturado / Atraque',
  REL: 'Relleno Gran.',
  GEO: 'Geotextil',
  EXC_ROC: 'Excavación Roca',
  DESC_A1: 'Area 1',
  DESC_A2: 'Area 2',
  DESC_TUB_FILT: 'Tubería Filtro',
}

export function etiquetaCampo(key) {
  if (key == null || key === '') return '—'
  const k = String(key)
  if (CAMPO_ETIQUETAS[k]) return CAMPO_ETIQUETAS[k]
  // Cartera: fila_2_abs_10 → "Fila 2 (Abs 10)"
  const fila = k.match(/^fila_(\d+)_abs_(.+)$/i)
  if (fila) {
    const abs = String(fila[2]).replace(/m(?=\d)/g, '-').replace(/_/g, '.')
    return `Fila ${fila[1]} (Abs ${abs})`
  }
  // OTROS_n / DESC_OTROS_n
  const otros = k.match(/^OTROS_(\d+)$/i)
  if (otros) return `Otros (${otros[1]})`
  const descOtros = k.match(/^DESC_OTROS_(\d+)$/i)
  if (descOtros) return `Descuento Otros (${descOtros[1]})`
  if (/^DESC_OTROS$/i.test(k)) return 'Descuento Otros'
  if (/^OTROS$/i.test(k)) return 'Otros'
  // c01_foo_bar → "Foo bar" si no hay etiqueta; si no, humanizar snake_case
  const bare = k.replace(/^c\d+_/, '')
  return bare
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function parseJsonVal(v) {
  if (v == null) return null
  if (typeof v === 'object') return v
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s) return ''
    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
      try {
        return JSON.parse(s)
      } catch {
        return v
      }
    }
    return v
  }
  return v
}

export function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

export function fmtAuditVal(v) {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '—'
  if (pareceTimestampIso(v)) {
    const fmt = formatFechaHoraColombia(v, { fallback: '' })
    if (fmt) return fmt
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return '—'
    if (v.every((x) => x == null || typeof x !== 'object')) {
      return v.map((x) => fmtAuditVal(x)).join(', ')
    }
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  return String(v)
}

export function valoresIguales(a, b) {
  if (a === b) return true
  if (a == null && b == null) return true
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return String(a) === String(b)
  }
}

/** Diff plano Campo / Anterior / Nuevo (incluye anidación con rutas dotted). */
export function camposModificados(valorAnterior, valorNuevo, { maxDepth = 6 } = {}) {
  const va = parseJsonVal(valorAnterior)
  const vn = parseJsonVal(valorNuevo)
  if (va == null && vn == null) return []

  // Si la raíz no es objeto en ningún lado, un solo renglón.
  if (!isPlainObject(va) && !isPlainObject(vn)) {
    if (valoresIguales(va, vn)) return []
    return [{ key: '_valor', label: 'Valor', before: va, after: vn, pathLabel: 'Valor' }]
  }

  const out = []
  const depthOf = (path) => path.split('.').filter(Boolean).length
  const pathLabelOf = (path) =>
    path
      .split('.')
      .filter(Boolean)
      .map(etiquetaCampo)
      .join(' › ')

  const walk = (before, after, path) => {
    if (depthOf(path) > maxDepth) {
      if (!valoresIguales(before, after)) {
        out.push({
          key: path || '_valor',
          label: path ? etiquetaCampo(path.split('.').pop()) : 'Valor',
          before,
          after,
          pathLabel: pathLabelOf(path) || 'Valor',
        })
      }
      return
    }

    const canExpand =
      (isPlainObject(before) || before == null) &&
      (isPlainObject(after) || after == null) &&
      (isPlainObject(before) || isPlainObject(after))

    if (canExpand) {
      const left = isPlainObject(before) ? before : {}
      const right = isPlainObject(after) ? after : {}
      const keys = new Set([...Object.keys(left), ...Object.keys(right)])
      for (const key of keys) {
        walk(left[key], right[key], path ? `${path}.${key}` : key)
      }
      return
    }

    if (valoresIguales(before, after)) return
    const leaf = path.split('.').filter(Boolean).pop() || '_valor'
    out.push({
      key: path || '_valor',
      label: etiquetaCampo(leaf),
      before,
      after,
      pathLabel: pathLabelOf(path) || etiquetaCampo(leaf),
    })
  }

  walk(va, vn, '')
  return out
}

/**
 * Convierte un valor estructurado en una tabla presentable.
 * @returns {{ kind: 'kv'|'grid'|'scalar', title?: string, columns?: string[], rows: any[] }}
 */
export function tablaDesdeValor(value, title) {
  const v = parseJsonVal(value)
  if (v == null || v === '') {
    return { kind: 'scalar', title, rows: [{ label: title || 'Valor', value: '—' }] }
  }
  if (Array.isArray(v)) {
    if (v.length === 0) {
      return { kind: 'kv', title, rows: [{ key: '_empty', label: '(vacío)', value: '—' }] }
    }
    if (v.every(isPlainObject)) {
      const colSet = new Set()
      for (const row of v) Object.keys(row).forEach((k) => colSet.add(k))
      const columns = [...colSet]
      return {
        kind: 'grid',
        title,
        columns,
        columnLabels: columns.map(etiquetaCampo),
        rows: v.map((row, i) => ({
          _i: i + 1,
          ...Object.fromEntries(columns.map((c) => [c, row[c]])),
        })),
      }
    }
    return {
      kind: 'kv',
      title,
      rows: v.map((item, i) => ({
        key: String(i),
        label: `#${i + 1}`,
        value: item,
      })),
    }
  }
  if (isPlainObject(v)) {
    return {
      kind: 'kv',
      title,
      rows: Object.entries(v).map(([key, val]) => ({
        key,
        label: etiquetaCampo(key),
        value: val,
        nested: isPlainObject(val) || (Array.isArray(val) && val.some(isPlainObject)),
      })),
    }
  }
  return {
    kind: 'scalar',
    title,
    rows: [{ label: title || 'Valor', value: v }],
  }
}

/**
 * Parte `detalle` del log en filas escalares + secciones de objeto (sin JSON crudo).
 */
export function presentarDetalle(detalle) {
  const det = parseJsonVal(detalle)
  if (!isPlainObject(det)) {
    if (det == null || det === '') return { scalarRows: [], objectTables: [] }
    return {
      scalarRows: [{ key: '_detalle', label: 'Detalle', value: det }],
      objectTables: [],
    }
  }
  const scalarRows = []
  const objectTables = []
  for (const [key, raw] of Object.entries(det)) {
    const val = parseJsonVal(raw)
    if (isPlainObject(val) || (Array.isArray(val) && (val.length === 0 || val.some((x) => typeof x === 'object')))) {
      const table = tablaDesdeValor(val, etiquetaCampo(key))
      // Si kv tiene objetos anidados, expandir un nivel más como subtablas
      if (table.kind === 'kv') {
        const flat = []
        const nested = []
        for (const row of table.rows) {
          if (row.nested) {
            nested.push(tablaDesdeValor(row.value, `${table.title} › ${row.label}`))
          } else {
            flat.push(row)
          }
        }
        if (flat.length) objectTables.push({ ...table, rows: flat })
        objectTables.push(...nested)
      } else {
        objectTables.push(table)
      }
    } else {
      scalarRows.push({ key, label: etiquetaCampo(key), value: val })
    }
  }
  return { scalarRows, objectTables }
}

export function parseDet(d) {
  return parseJsonVal(d) && isPlainObject(parseJsonVal(d)) ? parseJsonVal(d) : {}
}

/**
 * Modelo de presentación de un evento de log completo.
 */
export function presentarEvento(h, { fmtFecha } = {}) {
  const det = parseDet(h?.detalle)
  const { scalarRows, objectTables } = presentarDetalle(det)
  const cambios = camposModificados(h?.valor_anterior, h?.valor_nuevo)
  const va = parseJsonVal(h?.valor_anterior)
  const vn = parseJsonVal(h?.valor_nuevo)
  const mostrarFallback =
    cambios.length === 0 &&
    ((va != null && (typeof va === 'object' ? Object.keys(va).length : true)) ||
      (vn != null && (typeof vn === 'object' ? Object.keys(vn).length : true)))

  // Si el fallback sería JSON crudo de objetos, convertir a tablas Propiedad/Valor
  let beforeTable = null
  let afterTable = null
  if (mostrarFallback) {
    if (isPlainObject(va) || Array.isArray(va)) beforeTable = tablaDesdeValor(va, 'Valor anterior')
    if (isPlainObject(vn) || Array.isArray(vn)) afterTable = tablaDesdeValor(vn, 'Valor nuevo')
  }

  const fmt = typeof fmtFecha === 'function' ? fmtFecha : formatFechaHoraColombia

  return {
    id: h?.id,
    accion: h?.accion || '—',
    usuario: h?.usuario_nombre || '—',
    modulo: h?.modulo || '—',
    ambito: h?.tipo_entidad || det?.tipo_entidad || '—',
    severidad: h?.severidad || '',
    fecha: fmt(h?.created_at),
    scalarRows,
    objectTables,
    cambios,
    beforeTable,
    afterTable,
    // Solo si el valor no era estructurado
    fallbackAntes:
      mostrarFallback && !beforeTable ? (typeof va === 'string' ? va : va != null ? fmtAuditVal(va) : null) : null,
    fallbackNuevo:
      mostrarFallback && !afterTable ? (typeof vn === 'string' ? vn : vn != null ? fmtAuditVal(vn) : null) : null,
  }
}
