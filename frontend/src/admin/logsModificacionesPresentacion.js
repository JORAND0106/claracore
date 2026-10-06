/** Presentación del log de modificaciones. No decide qué se registra. */

export const MODULOS_LOG = [
  'SICOE',
  'Presupuesto',
  'Programación de obra',
  'Almacén',
  'Recursos humanos',
  'Seguimiento',
  'Bitácora',
  'Subcontratistas',
  'Catálogo de insumos',
  'Contabilidad',
  'Contratos',
  'Usuarios',
  'Cargos y permisos',
  'Precios',
  'Cobro',
  'Actas',
  'Informes',
  'Notificaciones',
  'Topografía',
  'ClaraCAD',
  'Inicio',
  'Otros',
]

export const ACCIONES_LOG = [
  { value: 'CREAR', label: 'Creación' },
  { value: 'EDITAR', label: 'Edición' },
  { value: 'ELIMINAR', label: 'Eliminación' },
  { value: 'CARGA_MASIVA', label: 'Carga masiva' },
]

const OPS = {
  CREAR: 'Creación',
  EDITAR: 'Edición',
  ELIMINAR: 'Eliminación',
}

export function detalleDe(log) {
  const d = log?.detalle
  if (!d) return {}
  if (typeof d === 'string') {
    try {
      const parsed = JSON.parse(d)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }
  return typeof d === 'object' ? d : {}
}

export function accionLegible(log) {
  const det = detalleDe(log)
  const accion = log?.accion || ''
  if (accion === 'CARGA_MASIVA') {
    const op = OPS[det.operacion] || ''
    return op ? `Carga masiva · ${op}` : 'Carga masiva'
  }
  return OPS[accion] || accion || '—'
}

export function camposDeLog(log) {
  const det = detalleDe(log)
  const campos = Array.isArray(det.campos) ? det.campos : []
  return campos.map((c) => ({
    etiqueta: c?.etiqueta || c?.campo || 'Campo',
    anterior: c?.anterior == null || c.anterior === '' ? '—' : String(c.anterior),
    nuevo: c?.nuevo == null || c.nuevo === '' ? '—' : String(c.nuevo),
  }))
}

export function registroDeLog(log) {
  const det = detalleDe(log)
  return det.registro || log?.registro_etiqueta || (
    log?.entidad_tipo ? `${log.entidad_tipo}${log.entidad_id ? ` · ${log.entidad_id}` : ''}` : '—'
  )
}

export function cargaDeLog(log) {
  const det = detalleDe(log)
  const id = det.carga_id || log?.carga_id || ''
  if (!id) return null
  const texto = String(id)
  return {
    id: texto,
    corto: texto.length > 8 ? texto.slice(0, 8) : texto,
  }
}

export function tonoAccion(accion) {
  if (accion === 'CREAR') return '#15803D'
  if (accion === 'ELIMINAR') return '#B91C1C'
  if (accion === 'CARGA_MASIVA') return '#0F766E'
  return '#B45309'
}
