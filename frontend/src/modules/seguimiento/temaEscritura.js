/**
 * Política de escritura por tema (actas nuevas: flujo v>=2).
 * Actas anteriores: solo elaborador (comportamiento histórico).
 */

export function actaUsaEscrituraExpositor(flujoTabs) {
  const f = flujoTabs && typeof flujoTabs === 'object' ? flujoTabs : {}
  if (f.temas_escritura_expositor) return true
  const v = Number(f.v)
  return Number.isFinite(v) && v >= 2
}

export function puedeEditarTema({
  idea,
  usuarioId,
  elaboradorId,
  flujoTabs,
  esDesarrollador = false,
  // Legacy: si no hay política nueva, quien ya puede editar el acta (elaborador) edita temas.
  puedeEditarActa = false,
}) {
  if (esDesarrollador) return true
  if (!actaUsaEscrituraExpositor(flujoTabs)) {
    return !!puedeEditarActa
  }
  const uid = Number(usuarioId)
  const elab = Number(elaboradorId)
  if (Number.isFinite(elab) && elab > 0 && elab === uid) return true
  const exp = Number(idea?.expositor_usuario_id ?? idea?.expositor_id)
  if (Number.isFinite(exp) && exp > 0 && exp === uid) return true
  return false
}

export function puedeGuardarAlgunTema({
  ideas = [],
  usuarioId,
  elaboradorId,
  flujoTabs,
  esDesarrollador = false,
  puedeEditarActa = false,
}) {
  if (esDesarrollador) return true
  if (!actaUsaEscrituraExpositor(flujoTabs)) return !!puedeEditarActa
  const elab = Number(elaboradorId)
  const uid = Number(usuarioId)
  if (Number.isFinite(elab) && elab > 0 && elab === uid) return true
  return (Array.isArray(ideas) ? ideas : []).some((idea) =>
    puedeEditarTema({
      idea,
      usuarioId,
      elaboradorId,
      flujoTabs,
      esDesarrollador: false,
      puedeEditarActa: false,
    }),
  )
}
