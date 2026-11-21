/** Definición de ítems del ribbon de Programación de obra (header). */
export function buildProgObraRibbonItems({
  esBorradorEditable,
  puedeEditar,
  puedeEliminar = false,
  puedeExportar = false,
  workingVersionId,
  versionIdForWork,
  versionBaselineId,
  onAutoSchedule,
  onCurvaS,
  onComparacion,
  onExport,
  onEliminar,
}) {
  const items = [
    {
      key: 'auto',
      icon: '⚡',
      title: 'Automática',
      disabled: !(esBorradorEditable && puedeEditar && workingVersionId),
      onClick: onAutoSchedule,
    },
    {
      key: 'curva',
      lucideIcon: 'TrendingUp',
      title: 'Curva S',
      disabled: !versionIdForWork,
      onClick: onCurvaS,
    },
    {
      key: 'compare',
      icon: '🔍',
      title: 'Comparar',
      disabled: !versionBaselineId,
      onClick: onComparacion,
    },
    {
      key: 'export',
      icon: '📤',
      title: 'Exportar',
      disabled: !versionIdForWork,
      onClick: onExport,
    },
    {
      key: 'delete',
      icon: '🗑',
      title: 'Eliminar',
      disabled: !(esBorradorEditable && puedeEliminar && workingVersionId),
      onClick: onEliminar,
    },
  ]
  return items.filter((it) => {
    if (it.key === 'export') return puedeExportar
    if (it.key === 'auto') return puedeEditar
    if (it.key === 'delete') return puedeEliminar
    return true
  })
}
