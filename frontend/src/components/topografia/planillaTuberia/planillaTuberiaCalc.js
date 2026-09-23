/**
 * Motor de cálculo client-side — Planillas de Tubería.
 * Espejo fiel de backend/topografia_planilla_tuberia.py (fuente de verdad al guardar).
 * Usado solo para preview reactivo en UI; el guardado sigue recalculando en el backend.
 */

export const TIPOS_PLANILLA = ['ALCANTARILLA', 'FILTRO']
export const RELACIONES_ATRAQUE = ['1:1', '1:2', '1:3', '1:4', '1:6']
export const ESPESOR_ROCA_M = 0.05

/** TRI: codigo estable (vínculo descuentos); etiqueta visible según tipo. */
export const NOMBRE_TRI_ALCANTARILLA = 'Atraque mat. filtrante'
export const NOMBRE_TRI_FILTRO = 'Mat. Granular Filtrante'

export function nombreTrituradoPorTipo(tipo) {
  const tipoU = String(tipo || 'ALCANTARILLA').trim().toUpperCase()
  return tipoU === 'FILTRO' ? NOMBRE_TRI_FILTRO : NOMBRE_TRI_ALCANTARILLA
}

export const ITEMS_CANTIDADES = [
  { codigo: 'EXC', nombre: 'Excavación Varias', unidad: 'm³' },
  { codigo: 'TUB', nombre: 'Long Tubería', unidad: 'ml' },
  { codigo: 'TRI', nombre: NOMBRE_TRI_ALCANTARILLA, unidad: 'm³' },
  { codigo: 'REL', nombre: 'Relleno Gran.', unidad: 'm³' },
  { codigo: 'GEO', nombre: 'Geotextil', unidad: 'm²' },
  { codigo: 'EXC_ROC', nombre: 'Excavación Roca', unidad: 'm³', editable_dims: true },
  { codigo: 'OTROS', nombre: 'Otros: ____', unidad: 'm³', editable_dims: true, editable_nombre: true },
]

export const ITEMS_DESCUENTOS_ALCANTARILLA = [
  { codigo: 'DESC_A1', nombre: 'Area 1', unidad: 'm³', item_cant_codigo: 'TRI' },
  { codigo: 'DESC_A2', nombre: 'Area 2', unidad: 'm³', item_cant_codigo: 'REL' },
  {
    codigo: 'DESC_OTROS',
    nombre: 'Otros: ____',
    unidad: 'm³',
    item_cant_codigo: 'EXC',
    editable_dims: true,
    editable_nombre: true,
  },
]

export const ITEMS_DESCUENTOS_FILTRO = [
  { codigo: 'DESC_TUB_FILT', nombre: 'Tubería Filtro', unidad: 'm³', item_cant_codigo: 'TRI' },
  {
    codigo: 'DESC_OTROS',
    nombre: 'Otros: ____',
    unidad: 'm³',
    item_cant_codigo: 'EXC',
    editable_dims: true,
    editable_nombre: true,
  },
]

export const CAMPOS_DESCUENTO_ALTURA = [
  { key: 'prom_altura_excavacion', label: 'Altura Excavación' },
  { key: 'prom_altura_triturado', label: 'Altura Triturado' },
  { key: 'prom_altura_relleno', label: 'Altura Relleno' },
]

const ALIAS_ALC = { DESC_TUB: 'DESC_A2', DESC_POZO: 'DESC_OTROS' }
const ALIAS_FIL = { DESC_TUB: 'DESC_TUB_FILT', DESC_FILT: 'DESC_OTROS' }
const CAMPOS_DESC_SET = new Set(CAMPOS_DESCUENTO_ALTURA.map((c) => c.key))

export function esCodigoOtros(codigo) {
  const cod = String(codigo || '').trim().toUpperCase()
  return cod === 'OTROS' || cod.startsWith('OTROS_')
}

export function esCodigoDescOtros(codigo) {
  const cod = String(codigo || '').trim().toUpperCase()
  return cod === 'DESC_OTROS' || cod.startsWith('DESC_OTROS_')
}

export function esCodigoCantidadEditable(codigo) {
  const cod = String(codigo || '').trim().toUpperCase()
  return cod === 'EXC_ROC' || esCodigoOtros(cod)
}

const CAMPOS_DESC_LABEL = Object.fromEntries(CAMPOS_DESCUENTO_ALTURA.map((c) => [c.key, c.label]))

function nombreActividadDescuentoAltura(codigo, nombre) {
  const cod = String(codigo || '').trim().toUpperCase()
  let raw = String(nombre || '').trim()
  if (esCodigoOtros(cod)) {
    if (raw.toLowerCase().startsWith('otros:')) raw = raw.slice(6).trim()
    else if (raw.toLowerCase().startsWith('otros')) raw = raw.slice(5).replace(/^:/, '').trim()
    return raw || 'Otros'
  }
  if (cod === 'EXC_ROC') return raw || 'Excavación Roca'
  return raw || cod || '—'
}

/** Nota breve de descuento de altura para FE / Excel. */
export function formatearNotaDescuentoAltura({
  actividad, campoLabel, alturaOriginal, valorDescontado, alturaFinal,
}) {
  const act = String(actividad || '').trim() || '—'
  const lbl = String(campoLabel || '').trim() || 'Altura'
  const fmt = (v) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return '—'
    return (Math.round(n * 1000) / 1000).toString()
  }
  return `${act}: ${lbl} ${fmt(alturaOriginal)} − ${fmt(valorDescontado)} = ${fmt(alturaFinal)} m`
}

function construirDescuentosAlturaDetalle(overridesList, L, B, alturasOrig, alturasFinal) {
  const out = []
  for (const ov of overridesList || []) {
    const campo = ov.descontar_de
    if (!CAMPOS_DESC_SET.has(campo) || ov.espesor == null) continue
    const esp = Number(ov.espesor)
    if (!Number.isFinite(esp) || Math.abs(esp) < 1e-12) continue
    const codigo = String(ov.codigo || '').trim().toUpperCase()
    if (!codigo) continue
    const actividad = nombreActividadDescuentoAltura(codigo, ov.nombre)
    const label = CAMPOS_DESC_LABEL[campo] || campo
    const hOrig = Number(alturasOrig[campo] || 0)
    const hFin = Number(alturasFinal[campo] || 0)
    const vol = r2(product([L, B, esp])) || 0
    const nota = formatearNotaDescuentoAltura({
      actividad,
      campoLabel: label,
      alturaOriginal: hOrig,
      valorDescontado: esp,
      alturaFinal: hFin,
    })
    out.push({
      codigo: `DESC_ALT_${codigo}`,
      origen_codigo: codigo,
      nombre: `Desc. altura (${actividad})`,
      actividad,
      campo,
      campo_label: label,
      altura_original: r4(hOrig),
      valor_descontado: r4(esp),
      altura_final: r4(hFin),
      long: r4(L),
      ancho: r4(B),
      espesor: r4(esp),
      cantidad: Math.round(vol * 100) / 100,
      unidad: 'm³',
      nota,
    })
  }
  return out
}

function f(v) {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

function r2(v) { return v == null ? null : Math.round(v * 100) / 100 }
function r3(v) { return v == null ? null : Math.round(v * 1000) / 1000 }
function r4(v) { return v == null ? null : Math.round(v * 10000) / 10000 }

function avg(vals) {
  const xs = vals.filter((v) => v != null)
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

function product(vals) {
  const xs = vals.filter((v) => v != null).map(Number)
  if (!xs.length) return null
  return xs.reduce((a, b) => a * b, 1)
}

export function parseDenominadorRelacion(relacion) {
  const rel = String(relacion || '').trim()
  if (!RELACIONES_ATRAQUE.includes(rel)) throw new Error(`Relación inválida: ${relacion}`)
  return Number(rel.split(':')[1])
}

export function diametroExternoM(theta, esp) { return Number(theta) + 2 * Number(esp) }
export function radioExternoM(theta, esp) { return Number(theta) / 2 + Number(esp) }

export function areaTuberiaM2(theta, esp) {
  const r = radioExternoM(theta, esp)
  return r3(Math.PI * r * r)
}

export function alturaRellenoAtraqueM(theta, esp, relacion) {
  const den = parseDenominadorRelacion(relacion)
  return r3(2 * radioExternoM(theta, esp) / den)
}

export function area1M2(theta, esp, _ancho, relacion = '1:3', alturaRelleno = null) {
  const r = radioExternoM(theta, esp)
  let h = alturaRelleno != null ? Number(alturaRelleno) : alturaRellenoAtraqueM(theta, esp, relacion)
  if (r <= 0 || h <= 0) return 0
  if (h >= 2 * r) return areaTuberiaM2(theta, esp)
  h = Math.min(h, 2 * r)
  const arg = Math.max(-1, Math.min(1, (r - h) / r))
  const seg = r * r * Math.acos(arg) - (r - h) * Math.sqrt(Math.max(0, 2 * r * h - h * h))
  return Math.max(0, r3(seg))
}

export function area2M2(theta, esp, relacion = '1:3', area1 = null) {
  const aTub = areaTuberiaM2(theta, esp)
  const a1 = area1 != null ? Number(area1) : area1M2(theta, esp, 0, relacion)
  return Math.max(0, r3(aTub - a1))
}

export function calcularSeccion({
  tipo,
  diametro_m: diametroM,
  espesor_m: espesorM,
  ancho_excavacion_m: anchoExcavacionM,
  relacion_atraque: relacionAtraque,
  cama_triturado_m: camaTrituradoM = 0,
}) {
  const tipoU = String(tipo || 'ALCANTARILLA').toUpperCase()
  if (!TIPOS_PLANILLA.includes(tipoU)) throw new Error(`Tipo inválido: ${tipo}`)
  const theta = Number(diametroM)
  const esp = Number(espesorM)
  const b = Number(anchoExcavacionM)
  const cama = Number(camaTrituradoM || 0)
  if (!(theta > 0) || esp < 0 || !(b > 0)) {
    throw new Error('Diámetro > 0, espesor ≥ 0 y ancho excavación > 0.')
  }
  const h = alturaRellenoAtraqueM(theta, esp, relacionAtraque)
  const aTub = areaTuberiaM2(theta, esp)
  const a1 = area1M2(theta, esp, b, relacionAtraque, h)
  const a2 = area2M2(theta, esp, relacionAtraque, a1)
  return {
    tipo: tipoU,
    diametro_m: theta,
    espesor_m: esp,
    diametro_externo_m: diametroExternoM(theta, esp),
    radio_externo_m: r4(radioExternoM(theta, esp)) ?? radioExternoM(theta, esp),
    ancho_excavacion_m: b,
    relacion_atraque: relacionAtraque,
    denominador_atraque: parseDenominadorRelacion(relacionAtraque),
    altura_relleno_m: h,
    cama_triturado_m: tipoU === 'ALCANTARILLA' ? r4(cama) : 0,
    area_tuberia_m2: aTub,
    area_1_m2: a1,
    area_2_m2: a2,
  }
}

function nivelRef(fila, tipo) {
  const keys = tipo === 'FILTRO'
    ? ['terminado_filtro', 'nivel_referencia', 'subrasante_via']
    : ['subrasante_via', 'nivel_referencia', 'terminado_filtro']
  for (const key of keys) {
    const v = fila?.[key]
    if (v != null && v !== '') return f(v)
  }
  return null
}

function cotaLomoOTerminado(fila, tipo) {
  if (tipo === 'FILTRO') return nivelRef(fila, tipo)
  let v = fila?.cota_lomo
  if (v == null || v === '') v = fila?.terminado_filtro
  return f(v)
}

export function calcularFilaCartera(filaCampo, seccion, hTritPrev = null) {
  const tipo = seccion.tipo
  const abscisa = f(filaCampo?.abscisa)
  const tn = f(filaCampo?.terreno_natural)
  const cfe = f(filaCampo?.cota_fondo_excavacion)
  const sub = tipo === 'ALCANTARILLA' ? f(filaCampo?.subrasante_via) : null
  const term = cotaLomoOTerminado(filaCampo, tipo)
  const nivel = nivelRef(filaCampo, tipo)
  const hAtr = Number(seccion.altura_relleno_m)
  const cama = Number(seccion.cama_triturado_m || 0)
  const b = Number(seccion.ancho_excavacion_m)
  const vacio = [abscisa, tn, cfe, nivel, term, sub].every((v) => v == null)

  let hExc = null
  if (abscisa != null && abscisa !== 0 && tn != null && cfe != null) hExc = tn - cfe
  else if (tn != null && cfe != null && abscisa == null) hExc = tn - cfe

  let hTrit = null
  let hRel = null
  let anchoGeo = null
  if (hExc != null) {
    if (tipo === 'ALCANTARILLA') {
      hTrit = hAtr + cama
      hRel = hExc - (hAtr + cama)
    } else {
      if (term != null && cfe != null) hTrit = term - cfe
      hRel = 0
      if (hTrit != null) {
        anchoGeo = hTritPrev != null
          ? ((hTritPrev + hTrit) / 2) * 2 + b * 2
          : null
      }
    }
  }

  return {
    orden: Number(filaCampo?.orden) || 0,
    abscisa,
    terreno_natural: tn,
    nivel_referencia: nivel,
    subrasante_via: sub,
    terminado_filtro: tipo === 'FILTRO' ? term : null,
    cota_lomo: tipo === 'ALCANTARILLA' ? term : null,
    cota_fondo_excavacion: cfe,
    altura_excavacion: r4(hExc),
    altura_triturado: r4(hTrit),
    altura_relleno: r4(hRel),
    ancho_geotextil: r4(anchoGeo),
    vacio,
  }
}

export function calcularCartera(filasCampo, seccion) {
  const filas = []
  let hPrev = null
  for (const fila of filasCampo || []) {
    const row = calcularFilaCartera(fila, seccion, hPrev)
    filas.push(row)
    if (row.altura_triturado != null && !row.vacio) hPrev = row.altura_triturado
  }
  const activas = filas.filter((x) => !x.vacio)
  const absVals = activas.map((x) => x.abscisa).filter((v) => v != null)
  const longitud = absVals.length >= 2 ? Math.abs(Math.max(...absVals) - Math.min(...absVals)) : null
  return {
    filas,
    totales: {
      n_filas: activas.length,
      longitud_m: r4(longitud),
      prom_altura_excavacion: r4(avg(activas.map((x) => x.altura_excavacion))),
      prom_altura_triturado: r4(avg(activas.map((x) => x.altura_triturado))),
      prom_altura_relleno: r4(avg(activas.map((x) => x.altura_relleno))),
      prom_ancho_geotextil: r4(avg(activas.map((x) => x.ancho_geotextil))),
      abscisa_inicial: absVals.length ? Math.min(...absVals) : null,
      abscisa_final: absVals.length ? Math.max(...absVals) : null,
    },
  }
}

function cantidadDesdeDims(long, ancho, espesor, cantidadFallback = null) {
  const dims = [long, ancho, espesor].map((v) => f(v)).filter((v) => v != null)
  if (dims.length) {
    const prod = dims.reduce((a, b) => a * b, 1)
    return r2(prod) ?? 0
  }
  const fb = f(cantidadFallback)
  return fb != null ? fb : 0
}

function labelDescOtros(nombre) {
  const raw = String(nombre || '').trim()
  if (!raw) return 'Otros: ____'
  if (raw.toLowerCase().startsWith('otros')) return raw
  return `Otros: ${raw}`
}

function normalizeDescuentosOtrosManuales(descuentosManuales) {
  const out = []
  const seen = new Set()
  for (const d of descuentosManuales || []) {
    if (!d || typeof d !== 'object') continue
    let cod = String(d.codigo || '').trim().toUpperCase()
    if (!esCodigoDescOtros(cod)) continue
    if (cod === 'DESC_OTROS') cod = 'DESC_OTROS_1'
    if (seen.has(cod)) continue
    seen.add(cod)
    const entry = { codigo: cod }
    for (const key of ['long', 'ancho', 'espesor']) {
      if (d[key] != null && d[key] !== '') entry[key] = f(d[key])
    }
    if ('nombre' in d) entry.nombre = String(d.nombre || '').trim()
    else if (d.nota != null && d.nota !== '') entry.nombre = String(d.nota || '').trim()
    entry.cantidad = cantidadDesdeDims(entry.long, entry.ancho, entry.espesor, d.cantidad)
    out.push(entry)
  }
  if (!out.some((x) => esCodigoDescOtros(x.codigo))) {
    out.push({ codigo: 'DESC_OTROS_1', cantidad: 0 })
  }
  out.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)))
  return out
}

function normalizeManualDescuentos(tipo, descuentosManuales) {
  const alias = tipo === 'FILTRO' ? ALIAS_FIL : ALIAS_ALC
  const out = {}
  for (const d of descuentosManuales || []) {
    let cod = String(d?.codigo || '')
    cod = alias[cod] || cod
    if (esCodigoDescOtros(cod)) continue
    const cant = f(d?.cantidad)
    if (cod && cant != null) out[cod] = cant
  }
  return out
}

function metaItemDescuento(codigo, tipo) {
  const catalogo = tipo === 'FILTRO' ? ITEMS_DESCUENTOS_FILTRO : ITEMS_DESCUENTOS_ALCANTARILLA
  if (esCodigoDescOtros(codigo)) {
    const base = catalogo.find((it) => it.codigo === 'DESC_OTROS')
    return { ...base, codigo }
  }
  const found = catalogo.find((it) => it.codigo === codigo)
  return found ? { ...found } : { codigo, nombre: codigo, unidad: 'm³', item_cant_codigo: 'EXC' }
}

function normalizeCantidadesManuales(cantidadesManuales) {
  const out = []
  const seen = new Set()
  for (const d of cantidadesManuales || []) {
    if (!d || typeof d !== 'object') continue
    let cod = String(d.codigo || '').trim().toUpperCase()
    if (!esCodigoCantidadEditable(cod)) continue
    if (cod === 'OTROS') cod = 'OTROS_1'
    if (seen.has(cod)) continue
    seen.add(cod)
    const entry = { codigo: cod }
    for (const key of ['long', 'ancho', 'espesor']) {
      if (d[key] != null && d[key] !== '') entry[key] = f(d[key])
    }
    if (esCodigoOtros(cod) && 'nombre' in d) entry.nombre = String(d.nombre || '').trim()
    if (CAMPOS_DESC_SET.has(d.descontar_de)) entry.descontar_de = d.descontar_de
    out.push(entry)
  }
  if (!out.some((x) => esCodigoOtros(x.codigo))) out.push({ codigo: 'OTROS_1' })
  if (!out.some((x) => x.codigo === 'EXC_ROC')) out.unshift({ codigo: 'EXC_ROC' })
  else out.sort((a, b) => (a.codigo === 'EXC_ROC' ? 0 : 1) - (b.codigo === 'EXC_ROC' ? 0 : 1) || String(a.codigo).localeCompare(b.codigo))
  return out
}

function metaItemCantidad(codigo, tipo = null) {
  if (codigo === 'EXC_ROC') return { ...ITEMS_CANTIDADES.find((it) => it.codigo === 'EXC_ROC') }
  if (esCodigoOtros(codigo)) {
    const base = ITEMS_CANTIDADES.find((it) => it.codigo === 'OTROS')
    return { ...base, codigo }
  }
  const meta = { ...ITEMS_CANTIDADES.find((it) => it.codigo === codigo) }
  if (codigo === 'TRI') meta.nombre = nombreTrituradoPorTipo(tipo)
  return meta
}

export function calcularCantidadesYDescuentos(seccion, cartera, {
  descuentos_manuales: descuentosManuales = null,
  cantidades_manuales: cantidadesManuales = null,
} = {}) {
  const tipo = seccion.tipo
  const tot = cartera.totales || {}
  const L = Number(tot.longitud_m || 0)
  const B = Number(seccion.ancho_excavacion_m)
  const a1 = Number(seccion.area_1_m2)
  const a2 = Number(seccion.area_2_m2)
  const aTub = Number(seccion.area_tuberia_m2)
  let hExc = Number(tot.prom_altura_excavacion || 0)
  let hTrit = Number(tot.prom_altura_triturado || 0)
  let hRel = Number(tot.prom_altura_relleno || 0)
  const anchoGeo = Number(tot.prom_ancho_geotextil || 0)

  const overridesList = normalizeCantidadesManuales(cantidadesManuales)
  const restas = {
    prom_altura_excavacion: 0,
    prom_altura_triturado: 0,
    prom_altura_relleno: 0,
  }
  const hExcOrig = hExc
  const hTritOrig = hTrit
  const hRelOrig = hRel
  for (const ov of overridesList) {
    if (ov.descontar_de && ov.espesor != null && restas[ov.descontar_de] != null) {
      restas[ov.descontar_de] += Number(ov.espesor) || 0
    }
  }
  hExc = Math.max(0, hExc - restas.prom_altura_excavacion)
  hTrit = Math.max(0, hTrit - restas.prom_altura_triturado)
  hRel = Math.max(0, hRel - restas.prom_altura_relleno)
  const alturasOrig = {
    prom_altura_excavacion: hExcOrig,
    prom_altura_triturado: hTritOrig,
    prom_altura_relleno: hRelOrig,
  }
  const alturasFinal = {
    prom_altura_excavacion: hExc,
    prom_altura_triturado: hTrit,
    prom_altura_relleno: hRel,
  }
  const descuentosAlturaDetalle = construirDescuentosAlturaDetalle(
    overridesList, L, B, alturasOrig, alturasFinal,
  )
  const notasDescuentoAltura = descuentosAlturaDetalle.map((d) => d.nota).filter(Boolean)

  let descA1 = 0
  let descA2 = 0
  let descTubFilt = 0
  let descTri = 0
  let descRel = 0
  if (tipo === 'ALCANTARILLA') {
    descA1 = r2(product([L, a1])) || 0
    descA2 = r2(product([L, a2])) || 0
    descTri = descA1
    descRel = descA2
  } else {
    descTubFilt = r2(product([L, aTub])) || 0
    descTri = descTubFilt
  }

  const manual = normalizeManualDescuentos(tipo, descuentosManuales)
  const otrosDesc = normalizeDescuentosOtrosManuales(descuentosManuales)
  const descOtros = Math.round(
    otrosDesc.reduce((s, o) => s + Number(o.cantidad || 0), 0) * 100,
  ) / 100

  function row(codigo, long, ancho, espesor, desc = 0, restarDesc = false, nombre = null, descontarDe = null) {
    const meta = metaItemCantidad(codigo, tipo)
    const prod = product([long, ancho, espesor])
    const bruto = prod != null ? (r2(prod) ?? 0) : 0
    const cant = restarDesc ? Math.round((bruto - desc) * 100) / 100 : bruto
    const out = {
      ...meta,
      long: r4(long),
      ancho: r4(ancho),
      espesor: r4(espesor),
      desc: Math.round(desc * 100) / 100,
      cantidad: Math.round(cant * 100) / 100,
      bruto: Math.round(bruto * 100) / 100,
    }
    if (nombre != null) out.nombre = nombre
    if (descontarDe) out.descontar_de = descontarDe
    return out
  }

  const ovByCod = Object.fromEntries(overridesList.map((o) => [o.codigo, o]))
  const ovRoc = ovByCod.EXC_ROC || {}
  const rocLong = 'long' in ovRoc ? ovRoc.long : L
  const rocAncho = 'ancho' in ovRoc ? ovRoc.ancho : B
  const rocEsp = 'espesor' in ovRoc ? ovRoc.espesor : ESPESOR_ROCA_M

  const cantidades = [
    row('EXC', L, B, hExc),
    row('TUB', L, null, null),
    row('TRI', L, B, hTrit, descTri, true),
    row('REL', L, B, hRel, descRel, false),
    row('GEO', L, anchoGeo || null, null),
    row('EXC_ROC', rocLong, rocAncho, rocEsp, 0, false, null, ovRoc.descontar_de || null),
  ]

  for (const ov of overridesList) {
    if (!esCodigoOtros(ov.codigo)) continue
    let otrLabel = 'Otros: ____'
    if (ov.nombre) {
      otrLabel = ov.nombre.toLowerCase().startsWith('otros')
        ? ov.nombre
        : `Otros: ${ov.nombre}`
    }
    cantidades.push(row(
      ov.codigo,
      ov.long ?? null,
      ov.ancho ?? null,
      ov.espesor ?? null,
      0,
      false,
      otrLabel,
      ov.descontar_de || null,
    ))
  }

  const catalogo = tipo === 'FILTRO' ? ITEMS_DESCUENTOS_FILTRO : ITEMS_DESCUENTOS_ALCANTARILLA
  const descuentos = []
  for (const it of catalogo) {
    if (esCodigoDescOtros(it.codigo)) continue
    let cant = 0
    let long = null
    let ancho = null
    let esp = null
    if (it.codigo === 'DESC_A1') { cant = descA1; long = L; esp = a1 }
    else if (it.codigo === 'DESC_A2') { cant = descA2; long = L; esp = a2 }
    else if (it.codigo === 'DESC_TUB_FILT') { cant = descTubFilt; long = L; esp = aTub }
    else { cant = Number(manual[it.codigo] || 0) }
    descuentos.push({
      ...it,
      long: r4(long),
      ancho: r4(ancho),
      espesor: r4(esp),
      cantidad: Math.round(Number(cant) * 100) / 100,
    })
  }
  for (const ov of otrosDesc) {
    const meta = metaItemDescuento(ov.codigo, tipo)
    descuentos.push({
      ...meta,
      nombre: labelDescOtros(ov.nombre),
      long: r4(ov.long ?? null),
      ancho: r4(ov.ancho ?? null),
      espesor: r4(ov.espesor ?? null),
      cantidad: Math.round(Number(ov.cantidad || 0) * 100) / 100,
      editable_dims: true,
      editable_nombre: true,
    })
  }

  const netos = cantidades.map((c) => {
    let descuento = 0
    let bruto = c.cantidad
    let neto = c.cantidad
    if (c.codigo === 'TRI') {
      descuento = c.desc
      bruto = c.bruto
      neto = c.cantidad
    } else if (c.codigo === 'REL') {
      descuento = c.desc
    } else if (c.codigo === 'EXC') {
      descuento = descOtros
      neto = Math.round((bruto - descuento) * 100) / 100
    }
    return {
      codigo: c.codigo,
      nombre: c.nombre,
      unidad: c.unidad,
      long: c.long,
      ancho: c.ancho,
      espesor: c.espesor,
      bruto,
      descuentos: Math.round(descuento * 100) / 100,
      neto: Math.round(neto * 100) / 100,
      editable_dims: Boolean(c.editable_dims),
      editable_nombre: Boolean(c.editable_nombre),
      descontar_de: c.descontar_de || null,
    }
  })

  return {
    cantidades,
    descuentos,
    netos,
    descuentos_altura: Object.fromEntries(
      Object.entries(restas).filter(([, v]) => v).map(([k, v]) => [k, Math.round(v * 10000) / 10000]),
    ),
    descuentos_altura_detalle: descuentosAlturaDetalle,
    notas_descuento_altura: notasDescuentoAltura,
  }
}

export function perfilLongitudinal(cartera, seccion) {
  const tipo = seccion.tipo
  const serie = {
    abscisas: [],
    terreno_natural: [],
    nivel_referencia: [],
    cota_fondo_excavacion: [],
    etiqueta_nivel: tipo === 'FILTRO' ? 'Terminado Filtro' : 'Cota Lomo',
    titulo_grafico: 'Perfil Longitudinal de Tubería',
  }
  if (tipo === 'ALCANTARILLA') {
    serie.subrasante_via = []
    serie.cota_lomo = []
    serie.etiqueta_subrasante = 'Subrasante de Vía'
  }
  for (const fila of cartera.filas || []) {
    if (fila.vacio) continue
    serie.abscisas.push(fila.abscisa)
    serie.terreno_natural.push(fila.terreno_natural)
    if (tipo === 'FILTRO') {
      serie.nivel_referencia.push(fila.terminado_filtro || fila.nivel_referencia)
    } else {
      const sub = fila.subrasante_via || fila.nivel_referencia
      const cl = fila.cota_lomo
      serie.subrasante_via.push(sub)
      serie.cota_lomo.push(cl)
      serie.nivel_referencia.push(cl != null ? cl : sub)
    }
    serie.cota_fondo_excavacion.push(fila.cota_fondo_excavacion)
  }
  return serie
}

export function seccionTipicaParams(seccion, cartera) {
  const tot = cartera.totales || {}
  return {
    tipo: seccion.tipo,
    diametro_externo_m: seccion.diametro_externo_m,
    ancho_excavacion_m: seccion.ancho_excavacion_m,
    altura_relleno_m: seccion.altura_relleno_m,
    cama_triturado_m: seccion.cama_triturado_m,
    area_tuberia_m2: seccion.area_tuberia_m2,
    area_1_m2: seccion.area_1_m2,
    area_2_m2: seccion.area_2_m2,
    prom_altura_excavacion: tot.prom_altura_excavacion,
    prom_altura_triturado: tot.prom_altura_triturado,
    prom_altura_relleno: tot.prom_altura_relleno,
    prom_ancho_geotextil: tot.prom_ancho_geotextil,
    relacion_atraque: seccion.relacion_atraque,
    titulo_panel: 'GRAFICO',
  }
}

/**
 * Preview local. Devuelve null si faltan diámetro/ancho (no se puede calcular sección).
 */
export function calcularPlanillaLocal({
  tipo,
  diametro_m: diametroM,
  espesor_m: espesorM = 0,
  ancho_excavacion_m: anchoExcavacionM,
  relacion_atraque: relacionAtraque = '1:3',
  filas_campo: filasCampo = [],
  descuentos_manuales: descuentosManuales = [],
  cantidades_manuales: cantidadesManuales = [],
  cama_triturado_m: camaTrituradoM = 0,
}) {
  const diam = f(diametroM)
  const ancho = f(anchoExcavacionM)
  if (diam == null || diam <= 0 || ancho == null || ancho <= 0) return null
  try {
    const seccion = calcularSeccion({
      tipo,
      diametro_m: diam,
      espesor_m: f(espesorM) ?? 0,
      ancho_excavacion_m: ancho,
      relacion_atraque: relacionAtraque || '1:3',
      cama_triturado_m: f(camaTrituradoM) ?? 0,
    })
    const cartera = calcularCartera(filasCampo, seccion)
    const cant = calcularCantidadesYDescuentos(seccion, cartera, {
      descuentos_manuales: descuentosManuales,
      cantidades_manuales: cantidadesManuales,
    })
    return {
      seccion,
      cartera,
      cantidades: cant.cantidades,
      descuentos: cant.descuentos,
      netos: cant.netos,
      descuentos_altura: cant.descuentos_altura || {},
      descuentos_altura_detalle: cant.descuentos_altura_detalle || [],
      notas_descuento_altura: cant.notas_descuento_altura || [],
      perfil: perfilLongitudinal(cartera, seccion),
      seccion_tipica: seccionTipicaParams(seccion, cartera),
    }
  } catch {
    return null
  }
}
