/** Definición de ítems del ribbon de Programación de obra (header). */
export function buildProgObraRibbonItems({
  esBorradorEditable,
  puedeEditar,
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
      title: 'Generar programación automática',
      disabled: !(esBorradorEditable && puedeEditar && workingVersionId),
      onClick: onAutoSchedule,
    },
    {
      key: 'curva',
      lucideIcon: 'TrendingUp',
      title: 'Ver curva de inversión',
      disabled: !versionIdForWork,
      onClick: onCurvaS,
    },
    {
      key: 'compare',
      icon: '🔍',
      title: 'Comparar todos los tramos vs baseline',
      disabled: !versionBaselineId,
      onClick: onComparacion,
    },
    {
      key: 'export',
      icon: '📤',
      title: 'Exportar a MS Project, Excel o PDF',
      disabled: !versionIdForWork,
      onClick: onExport,
    },
    {
      key: 'delete',
      icon: '🗑',
      title: 'Eliminar toda la programación del borrador',
      disabled: !(esBorradorEditable && puedeEditar && workingVersionId),
      onClick: onEliminar,
    },
  ]
  return items.filter((it) => {
    if (it.key === 'export') return puedeExportar
    if (it.key === 'auto' || it.key === 'delete') return puedeEditar
    return true
  })
}
