/** Opciones del informe «Estado documental de colaboradores». */

export const FILTROS_ESTADO_DOCUMENTAL = Object.freeze([
  {
    id: 'todos',
    label: 'Todos',
    hint: 'Incluye colaboradores aprobados y sin aprobar.',
  },
  {
    id: 'aprobado',
    label: 'Personal aprobado',
    hint: 'Solo colaboradores con validación documental Aprobado.',
  },
  {
    id: 'sin_aprobar',
    label: 'Personal sin aprobar',
    hint: 'Colaboradores cuyo estado de validación no es Aprobado.',
  },
])

export const FORMATOS_ESTADO_DOCUMENTAL = Object.freeze([
  { id: 'xlsx', label: 'Excel (.xlsx)' },
  { id: 'pdf', label: 'PDF' },
])

/** Código de calidad del formato (alineado con backend ESTADO_DOCUMENTAL_FORMATO). */
export const ESTADO_DOCUMENTAL_CODIGO = 'CC-RRHH-DOC-001'
