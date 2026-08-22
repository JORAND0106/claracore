/**
 * Reglas de expansión del segundo nivel (checklist) en el popup de Tarea.
 */
export function debeMostrarChecklist({
  mode = 'view',
  expanded = false,
  checklistLength = 0,
  checklistDisabled = false,
}) {
  const hasItems = Number(checklistLength) > 0
  const canExpand = mode === 'create' || hasItems || !checklistDisabled
  return !!(expanded && canExpand)
}

export function puedeExpandirChecklist({
  mode = 'view',
  checklistLength = 0,
  checklistDisabled = false,
}) {
  const hasItems = Number(checklistLength) > 0
  return mode === 'create' || hasItems || !checklistDisabled
}
