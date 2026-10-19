/** Respuestas Sí/No antes de generar la OC. Ninguna queda marcada sola. */

export function respuestaNotificarCompleta(proveedores, respuestas) {
  const lista = proveedores || []
  if (!lista.length) return false
  return lista.every((p) => respuestas?.[p.key] === true || respuestas?.[p.key] === false)
}

export function notificarProveedoresPayload(proveedores, respuestas) {
  return (proveedores || []).map((p) => {
    const m = String(p?.key || '').match(/^id:(\d+)$/)
    return {
      proveedor_id: m ? Number(m[1]) : null,
      proveedor_nombre: p?.nombre || '',
      notificar: respuestas?.[p.key] === true,
    }
  })
}

export function aplicarRespuestaTodos(proveedores, valor) {
  const next = {}
  for (const p of proveedores || []) next[p.key] = valor === true
  return next
}
