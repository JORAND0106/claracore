/** Respuestas Sí/No antes de generar la OC. Ninguna queda marcada sola. */

export function respuestaNotificarCompleta(proveedores, respuestas) {
  const lista = proveedores || []
  if (!lista.length) return false
  return lista.every((p) => respuestas?.[p.key] === true || respuestas?.[p.key] === false)
}

export function notificarProveedoresPayload(proveedores, respuestas, redirects = {}) {
  return (proveedores || []).map((p) => {
    const m = String(p?.key || '').match(/^id:(\d+)$/)
    const row = {
      proveedor_id: m ? Number(m[1]) : null,
      proveedor_nombre: p?.nombre || '',
      notificar: respuestas?.[p.key] === true,
    }
    const override = String(redirects?.[p.key] || '').trim()
    if (row.notificar && override) row.correo_override = override
    return row
  })
}

export function aplicarRespuestaTodos(proveedores, valor) {
  const next = {}
  for (const p of proveedores || []) next[p.key] = valor === true
  return next
}

/** Une el correo resuelto del backend a los grupos del selector. */
export function enriquecerProveedoresConCorreo(proveedores, desdeApi) {
  const byKey = new Map()
  for (const row of desdeApi || []) {
    if (row?.key) byKey.set(String(row.key), row)
  }
  return (proveedores || []).map((p) => {
    const info = byKey.get(String(p.key)) || {}
    return {
      ...p,
      correo: info.correo || null,
      correos: Array.isArray(info.correos) ? info.correos : (info.correo ? [info.correo] : []),
      sin_correo: Boolean(info.sin_correo) || !info.correo,
    }
  })
}
