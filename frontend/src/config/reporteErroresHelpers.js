import { permisoFuncionContrato } from '../utils/permisosContrato'
import { permisosProgramacionObra } from '../progObraPermisos'
import {
  MODULO_CTX_A_MENU,
  REPORTE_ERRORES_JERARQUIA,
  REPORTE_OTRO_KEY,
} from './reporteErroresJerarquia'

/** Visible si el usuario tiene permiso de crear o editar en al menos una función (o es Desarrollador). */
export function usuarioPuedeReportarErrores(usuario) {
  const cargo = (usuario?.cargo_nombre || '').trim().toLowerCase()
  if (cargo === 'desarrollador') return true
  return (usuario?.permisos || []).some((p) => p.crear || p.editar)
}

/** Misma visibilidad que el menú lateral del Dashboard. */
export function getModulosVisiblesReporte(usuario) {
  const cargo = (usuario?.cargo_nombre || '').trim().toLowerCase()
  const esDeveloper = cargo === 'desarrollador'
  const esAdminCargo = cargo === 'administrador'

  const _permisoVerFuncion = (nombreLower) =>
    esDeveloper ||
    (usuario?.permisos || []).some(
      (p) => (p.funcion_nombre || '').toLowerCase() === nombreLower && p.ver,
    )

  const permisoMatrizEditarPpto = permisoFuncionContrato(
    usuario,
    'editar registros presupuesto',
    usuario?.contrato_id,
  )
  const progPermisos = permisosProgramacionObra(usuario, usuario?.contrato_id)

  const visibles = [
    { key: 'inicio', label: 'Inicio', visible: true },
    {
      key: 'dashboard',
      label: 'Dashboard',
      visible: esDeveloper || (usuario?.permisos || []).some((p) => p.funcion_nombre === 'Dashboard' && p.ver),
    },
    {
      key: 'presupuesto',
      label: 'Presupuesto',
      visible: esDeveloper || !!permisoMatrizEditarPpto?.ver,
    },
    {
      key: 'sicoe_obra',
      label: 'SICOE Obra',
      visible: esDeveloper || (usuario?.permisos || []).some((p) => p.funcion_nombre === 'Reporte de Cantidades' && p.ver),
    },
    {
      key: 'informes',
      label: 'Informes',
      visible:
        esDeveloper ||
        esAdminCargo ||
        (usuario?.permisos || []).some(
          (p) => (p.funcion_nombre || '').toLowerCase() === 'informes ccd' && p.ver,
        ),
    },
    { key: 'almacen', label: 'Almacén', visible: true },
    {
      key: 'programacion',
      label: 'Programación',
      visible: progPermisos.ver,
    },
    {
      key: 'topografia',
      label: 'Topografía',
      visible: _permisoVerFuncion('topografía') || _permisoVerFuncion('topografia'),
    },
    { key: 'semaforo', label: 'Plano Semáforo', visible: true },
    {
      key: 'sst',
      label: 'SST',
      visible: _permisoVerFuncion('sst documental'),
    },
    {
      key: 'ensayos',
      label: 'Ensayos',
      visible: _permisoVerFuncion('ensayos pip'),
    },
    {
      key: 'auditor_sst',
      label: 'Auditor SST',
      visible: _permisoVerFuncion('auditor sst (ia)'),
    },
  ]

  return visibles.filter((m) => m.visible && REPORTE_ERRORES_JERARQUIA[m.key])
}

/** Prefill del módulo a partir de ModuloContext (cobro → dashboard; admin → null). */
export function moduloDesdeContexto(moduloActivoCtx) {
  if (!moduloActivoCtx || moduloActivoCtx === 'admin' || moduloActivoCtx === 'general') return null
  return MODULO_CTX_A_MENU[moduloActivoCtx] || moduloActivoCtx
}

export function construirMensajeError({
  modLabel,
  uLabel,
  sLabel,
  descripcion,
  criticidadLabel,
  imagenAdjunta,
}) {
  const lineas = [
    '── Reporte de error ──',
    `Módulo: ${modLabel}`,
    `Ubicación: ${uLabel}`,
    `Sector: ${sLabel}`,
    `Criticidad: ${criticidadLabel}`,
    `Imagen adjunta: ${imagenAdjunta ? 'Sí (captura enviada por el usuario)' : 'No'}`,
    '',
    'Descripción:',
    descripcion.trim(),
  ]
  return lineas.join('\n')
}

export function construirMensajeMejora(texto) {
  return ['── Sugerencia de mejora ──', '', texto.trim()].join('\n')
}