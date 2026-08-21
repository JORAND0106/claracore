/** Estados que salen de la vista activa (bandeja / tablas) salvo «Incluir cumplidos». */
export function esEstadoTerminalCompromiso(estado) {
  const e = String(estado || '').toLowerCase()
  return e === 'cumplido' || e === 'cancelado'
}
