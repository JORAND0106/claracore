/** Textos del aviso interno al generar la orden de compra. Sin cifras en dinero. */

export function etiquetasInicialesOc(sol, ocs) {
  const tags = []
  if (sol?.consecutivo != null) tags.push(`Solicitud #${sol.consecutivo}`)
  for (const oc of ocs || []) {
    const n = oc?.numero_oc != null ? `OC #${oc.numero_oc}` : 'OC'
    tags.push(oc?.proveedor_nombre ? `${n} · ${oc.proveedor_nombre}` : n)
  }
  return tags
}

export function asuntoInicialOc(sol, ocs) {
  const nums = (ocs || []).map((o) => o?.numero_oc).filter((n) => n != null)
  const lista = nums.map((n) => `N.° ${n}`).join(', ')
  const solTxt = sol?.consecutivo != null ? `solicitud #${sol.consecutivo}` : 'la solicitud'
  return lista
    ? `Orden de compra generada (${lista}) — ${solTxt}`
    : `Orden de compra generada — ${solTxt}`
}

export function mensajeInicialOc(sol, ocs) {
  const lineas = (ocs || []).map((o) => {
    const n = o?.numero_oc != null ? `OC #${o.numero_oc}` : 'una orden de compra'
    return o?.proveedor_nombre ? `${n} para ${o.proveedor_nombre}` : n
  })
  const cuales = lineas.length ? lineas.join('; ') : 'la orden de compra'
  const solTxt = sol?.consecutivo != null ? `la solicitud #${sol.consecutivo}` : 'la solicitud'
  return `Se generó ${cuales} de ${solTxt}. Ya está disponible en Almacén.`
}

export function avisosDocumentoSistemaOc(envios) {
  return (envios || [])
    .filter((e) => e && e.resultado === 'sistema')
    .map((e) => {
      const n = e.numero_oc != null ? `OC #${e.numero_oc}` : 'La orden de compra'
      const quien = e.proveedor_nombre ? ` de ${e.proveedor_nombre}` : ''
      return `${n}${quien} quedó como documento de sistema. No se envió correo al proveedor.`
    })
}

export function avisosEnvioEnProceso(envios) {
  return (envios || [])
    .filter((e) => e && e.resultado === 'en_proceso')
    .map((e) => {
      const n = e.numero_oc != null ? `OC #${e.numero_oc}` : 'La orden de compra'
      return `${n}: el PDF y el correo al proveedor se envían en segundo plano.`
    })
}

export function avisosEnvioOc(envios) {
  return (envios || [])
    .filter((e) => e && e.resultado !== 'enviado' && e.resultado !== 'sistema' && e.resultado !== 'en_proceso')
    .map((e) => {
      const n = e.numero_oc != null ? `OC #${e.numero_oc}` : 'La orden de compra'
      const detalle = e.detalle || 'No se pudo enviar el correo al proveedor.'
      const base = `${n} quedó pendiente de envío. ${detalle}`
      if (e.persistido === false) {
        return `${base} El registro de envío no quedó guardado en la base de datos.`
      }
      return base
    })
}

/** Fila de la grilla a partir de la solicitud que acaba de quedar con OC, sin esperar el listado. */
export function filaSolicitudTrasOc(sol, ocsExtra) {
  if (!sol?.id) return null
  const propias = Array.isArray(sol.ordenes_compra) ? sol.ordenes_compra.filter((o) => o?.id) : []
  const extra = (ocsExtra || []).filter((o) => o?.id && String(o.solicitud_id || sol.id) === String(sol.id))
  const ordenes = propias.length ? propias : extra
  const items = Array.isArray(sol.items) ? sol.items : []
  return {
    ...sol,
    items: [],
    items_count: sol.items_count ?? (items.length || undefined),
    ordenes_compra: ordenes,
    orden_compra: ordenes[0] || sol.orden_compra || null,
    tiene_orden_compra: ordenes.length > 0 || Boolean(sol.tiene_orden_compra),
  }
}

/** OCs devueltas por aprobar la solicitud (una por proveedor, o la que recibió líneas). */
export function ordenesDeRespuestaAprobar(r) {
  if (Array.isArray(r?.ordenes_compra_generadas) && r.ordenes_compra_generadas.length) {
    return r.ordenes_compra_generadas.filter((o) => o?.id)
  }
  const one = r?.orden_compra_generada || r?.orden_compra
  return one?.id ? [one] : []
}
