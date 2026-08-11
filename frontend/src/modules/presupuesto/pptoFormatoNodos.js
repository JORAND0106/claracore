/**
 * Concatena Nodo Inicio y Nodo Fin para la grilla de Presupuesto.
 * Formato: "N1 → N2". Si falta un lado, se usa "—" en ese lado.
 * Si ambos estáníos: "—".
 *
 * @param {{ no_inicio?: string|null, no_final?: string|null }|null|undefined} row
 * @returns {string}
 */
export function pptoFormatoNodos(row) {
  const ini = String(row?.no_inicio ?? '').trim()
  const fin = String(row?.no_final ?? '').trim()
  if (!ini && !fin) return '—'
  return `${ini || '—'} → ${fin || '—'}`
}
