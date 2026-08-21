/**
 * Decide qué hacer con el valor tipado al blur del campo Tipo de material.
 * Si no hay match en catálogo, siempre se registra (upsert idempotente).
 * No se omite por igualdad con `value`: con propagación en vivo al tipear,
 * value ya coincide con el draft y eso no implica que esté en catálogo.
 */
export function debeRegistrarTipoMaterialNuevo(q, _value, opts = []) {
  const needle = String(q || '').trim()
  if (!needle) return { action: 'clear' }
  const match = (opts || []).find(
    (o) => String(o.nombre || '').toLowerCase() === needle.toLowerCase(),
  )
  if (match) return { action: 'pick', row: match }
  return { action: 'register', nombre: needle }
}
