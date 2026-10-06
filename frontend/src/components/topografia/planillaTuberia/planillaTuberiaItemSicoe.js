/** Ítem de cobro y dimensiones enlazadas (planilla ↔ reporte). Solo la planilla. */

export function padreDeDescuento(codigo, itemCantCodigo) {
  const explicito = String(itemCantCodigo || '').trim().toUpperCase()
  if (explicito) return `cantidades:${explicito}`
  const cod = String(codigo || '').trim().toUpperCase()
  if (cod === 'DESC_A1' || cod === 'DESC_TUB_FILT') return 'cantidades:TRI'
  if (cod === 'DESC_A2') return 'cantidades:REL'
  if (cod.startsWith('DESC_VOL_')) return null
  return 'cantidades:EXC'
}

export function lineasSinItem(lineas, items) {
  const map = items && typeof items === 'object' ? items : {}
  const faltan = []
  for (const l of lineas || []) {
    const codigo = String(l?.codigo || '').toUpperCase()
    const scope = String(l?.scope || 'cantidades').toLowerCase()
    const origen = `${scope}:${codigo}`
    const padre = scope === 'descuentos'
      ? padreDeDescuento(codigo, l?.item_cant_codigo)
      : origen
    const item = padre ? map[padre] : null
    if (!item?.item_numero) {
      faltan.push({ origen, nombre: l?.nombre || codigo })
    }
  }
  return faltan
}

/** Misma regla que `item_capitulo_distinto`: vacío en cualquiera de los dos no es diferencia. */
export function capituloItemDistinto(item, capituloReporte) {
  const capItem = String(item?.capitulo || '').trim()
  const capRep = String(capituloReporte || '').trim()
  if (!capItem || !capRep) return false
  return capItem !== capRep
}

/** Primer ítem de otro capítulo, con el texto que ya mostraba el formulario. */
export function mensajeCapituloDistinto(lineas, items, capituloReporte) {
  const map = items && typeof items === 'object' ? items : {}
  const capRep = String(capituloReporte || '').trim()
  for (const l of lineas || []) {
    const codigo = String(l?.codigo || '').toUpperCase()
    const scope = String(l?.scope || 'cantidades').toLowerCase()
    const origen = `${scope}:${codigo}`
    const padre = scope === 'descuentos'
      ? padreDeDescuento(codigo, l?.item_cant_codigo)
      : origen
    const item = padre ? map[padre] : null
    if (!item || !capituloItemDistinto(item, capRep)) continue
    const numero = item.item_numero
    const cap = item.capitulo
    return `El ítem ${numero} pertenece al capítulo «${cap}» y el reporte usa «${capRep}».`
  }
  return ''
}

export function etiquetaItem(item) {
  if (!item?.item_numero) return ''
  const desc = String(item.descripcion || '').trim()
  return desc ? `${item.item_numero} · ${desc}` : String(item.item_numero)
}

function num(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

function igual(a, b) {
  const aa = num(a)
  const bb = num(b)
  if (aa == null && bb == null) return true
  if (aa == null || bb == null) return false
  return Math.abs(aa - bb) <= 0.001
}

function overrideVigente(ov, natural) {
  if (!ov || typeof ov !== 'object') return false
  const base = ov.base
  if (!base || typeof base !== 'object') return true
  for (const k of ['long', 'ancho', 'espesor', 'cantidad']) {
    if (!Object.prototype.hasOwnProperty.call(base, k)) continue
    if (!igual(base[k], natural?.[k])) return false
  }
  return true
}

function naturalDe(calculo, origen) {
  const [tabla, codigoRaw] = String(origen || '').split(':')
  const codigo = String(codigoRaw || '').toUpperCase()
  if (tabla === 'cantidades') {
    const n = (calculo?.netos || []).find((x) => String(x?.codigo || '').toUpperCase() === codigo)
    if (!n) return {}
    return { long: n.long, ancho: n.ancho, espesor: n.espesor, cantidad: n.bruto }
  }
  const fuentes = [
    ...(calculo?.descuentos || []),
    ...(calculo?.descuentos_volumen_detalle || []),
  ]
  const d = fuentes.find((x) => String(x?.codigo || '').toUpperCase() === codigo)
  if (!d) return {}
  return { long: d.long, ancho: d.ancho, espesor: d.espesor, cantidad: d.cantidad }
}

function aplicarNeto(row, ov) {
  const nuevo = { ...row }
  for (const k of ['long', 'ancho', 'espesor']) {
    if (ov[k] != null && ov[k] !== '') nuevo[k] = num(ov[k])
  }
  if (ov.cantidad == null || ov.cantidad === '') return nuevo
  const nuevoBruto = num(ov.cantidad)
  const viejoBruto = num(row.bruto)
  const viejoNeto = num(row.neto)
  const baseBruto = viejoBruto == null ? (viejoNeto ?? 0) : viejoBruto
  const baseNeto = viejoNeto == null ? baseBruto : viejoNeto
  nuevo.bruto = nuevoBruto
  nuevo.neto = Math.round(((baseNeto || 0) + (nuevoBruto || 0) - (baseBruto || 0)) * 100) / 100
  return nuevo
}

function aplicarDesc(row, ov) {
  const nuevo = { ...row }
  for (const k of ['long', 'ancho', 'espesor']) {
    if (ov[k] != null && ov[k] !== '') nuevo[k] = num(ov[k])
  }
  if (ov.cantidad != null && ov.cantidad !== '') nuevo.cantidad = Math.abs(num(ov.cantidad) || 0)
  return nuevo
}

/** Muestra en la planilla las dimensiones empujadas desde el reporte, si la base no cambió. */
export function aplicarDimsEnlace(calculo, dims) {
  if (!calculo) return calculo
  if (!dims || typeof dims !== 'object' || !Object.keys(dims).length) return calculo
  const netos = (calculo.netos || []).map((n) => {
    const key = `cantidades:${String(n?.codigo || '').toUpperCase()}`
    const ov = dims[key]
    if (ov && overrideVigente(ov, naturalDe(calculo, key))) return aplicarNeto(n, ov)
    return n
  })
  const descuentos = (calculo.descuentos || []).map((d) => {
    const key = `descuentos:${String(d?.codigo || '').toUpperCase()}`
    const ov = dims[key]
    if (ov && overrideVigente(ov, naturalDe(calculo, key))) return aplicarDesc(d, ov)
    return d
  })
  return { ...calculo, netos, descuentos }
}
