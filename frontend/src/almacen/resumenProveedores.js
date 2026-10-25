/** Vista por proveedor. No mueve líneas: solo las clasifica. */

export function cubetaLinea(linea) {
  const estado = String(linea?.estado_validacion || linea?.cubeta || 'pendiente').toLowerCase()
  if (estado === 'rechazado') return 'rechazado'
  if (estado === 'aprobado') return 'aprobado'
  return 'enviado'
}

export function claveProveedor(linea) {
  const id = linea?.proveedor_id
  if (id != null && id !== '') return `id:${id}`
  const nombre = String(linea?.proveedor_nombre || '').trim()
  if (nombre) return `nom:${nombre.toLocaleLowerCase('es')}`
  return 'sin-proveedor'
}

/** Quien pidió la línea. Si el sello está vacío, la solicitud que él creó. */
export function esMiPedido(linea, userId) {
  if (userId == null || userId === '') return false
  const mio = String(userId)
  if (linea?.solicitado_por != null && linea.solicitado_por !== '' && String(linea.solicitado_por) === mio) {
    return true
  }
  const sinSello = linea?.solicitado_por == null || linea.solicitado_por === ''
  return sinSello && linea?.solicitud_created_by != null && String(linea.solicitud_created_by) === mio
}

function textoLinea(linea) {
  return [
    linea?.proveedor_nombre,
    linea?.consecutivo,
    linea?.titulo,
    linea?.capitulo,
    linea?.item,
    linea?.insumo_codigo,
    linea?.material_descripcion,
    linea?.observacion,
    linea?.justificacion,
    linea?.solicitado_por_nombre,
    linea?.numero_oc,
    linea?.motivo_rechazo,
  ].filter((v) => v != null && String(v).trim() !== '').join(' ').toLocaleLowerCase('es')
}

export function filtrarLineas(lineas, { q = '', misPedidos = false, userId = null } = {}) {
  const texto = String(q || '').trim().toLocaleLowerCase('es')
  return (lineas || []).filter((linea) => {
    if (misPedidos && !esMiPedido(linea, userId)) return false
    if (!texto) return true
    return textoLinea(linea).includes(texto)
  })
}

function sumarContador(lineas, verEconomicos) {
  const vacio = () => ({ lineas: 0, valor: verEconomicos ? 0 : null })
  const out = { enviado: vacio(), aprobado: vacio(), rechazado: vacio() }
  for (const linea of lineas || []) {
    const cubeta = cubetaLinea(linea)
    out[cubeta].lineas += 1
    if (verEconomicos && linea?.valor != null && Number.isFinite(Number(linea.valor))) {
      out[cubeta].valor += Number(linea.valor)
    }
  }
  return out
}

export function agruparAprobadasPorOc(lineas) {
  const grupos = new Map()
  for (const linea of lineas || []) {
    const tiene = linea?.numero_oc != null && linea.numero_oc !== ''
    const key = tiene ? `oc:${linea.numero_oc}` : 'sin-oc'
    if (!grupos.has(key)) {
      grupos.set(key, {
        key,
        numero_oc: tiene ? linea.numero_oc : null,
        titulo: tiene ? `OC #${linea.numero_oc}` : 'Aprobadas sin OC',
        lineas: [],
      })
    }
    grupos.get(key).lineas.push(linea)
  }
  return [...grupos.values()].sort((a, b) => {
    if (a.numero_oc == null) return 1
    if (b.numero_oc == null) return -1
    return Number(a.numero_oc) - Number(b.numero_oc)
  })
}

export function armarTarjetas(lineas, directorio, opciones = {}) {
  const { q, misPedidos, userId, verEconomicos = false } = opciones
  const porId = new Map()
  for (const prov of directorio || []) {
    if (prov?.proveedor_id != null) porId.set(String(prov.proveedor_id), prov)
  }
  const grupos = new Map()
  for (const linea of filtrarLineas(lineas, { q, misPedidos, userId })) {
    const key = claveProveedor(linea)
    if (!grupos.has(key)) {
      const dir = linea?.proveedor_id != null ? porId.get(String(linea.proveedor_id)) : null
      grupos.set(key, {
        key,
        proveedorId: linea?.proveedor_id ?? null,
        nombre: dir?.nombre || linea?.proveedor_nombre || 'Sin proveedor',
        nit: dir?.nit || '',
        contacto_nombre: dir?.contacto_nombre || '',
        contacto_email: dir?.contacto_email || '',
        contacto_telefono: dir?.contacto_telefono || '',
        lineas: [],
      })
    }
    grupos.get(key).lineas.push(linea)
  }
  return [...grupos.values()].map((card) => {
    const enviados = card.lineas.filter((l) => cubetaLinea(l) === 'enviado')
    const aprobados = card.lineas.filter((l) => cubetaLinea(l) === 'aprobado')
    const rechazados = card.lineas.filter((l) => cubetaLinea(l) === 'rechazado')
    return {
      ...card,
      contadores: sumarContador(card.lineas, verEconomicos),
      enviados,
      aprobados: agruparAprobadasPorOc(aprobados),
      rechazados,
    }
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export function lineasSeleccionadasPorSolicitud(lineas, ids) {
  const elegidos = new Set((ids || []).map((id) => String(id)))
  const porSolicitud = new Map()
  for (const linea of lineas || []) {
    if (!elegidos.has(String(linea.id))) continue
    const sid = linea.solicitud_id
    if (!porSolicitud.has(sid)) porSolicitud.set(sid, [])
    porSolicitud.get(sid).push(linea.id)
  }
  return [...porSolicitud.entries()].map(([solicitudId, itemIds]) => ({ solicitudId, itemIds }))
}
