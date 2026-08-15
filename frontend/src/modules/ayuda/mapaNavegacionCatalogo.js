/**
 * Catálogo fijo del mapa panorámico de navegación (15 módulos funcionales).
 * Los ids son estables; el contenido educativo (texto + pantallazos) vive fuera
 * del código en /ayuda/mapa-navegacion.json o en el API (blob).
 */

export const MAPA_NAVEGACION_GRUPOS = [
  { id: 'obra', label: 'Obra y seguimiento', orden: 1 },
  { id: 'presupuesto', label: 'Presupuesto e informes', orden: 2 },
  { id: 'logistica', label: 'Logística e insumos', orden: 3 },
  { id: 'gestion', label: 'Gestión contractual', orden: 4 },
  { id: 'sst', label: 'Seguridad y salud', orden: 5 },
]

/** @typedef {{ id: string, nombre: string, icono: string, grupo: string, orden: number }} MapaModuloCatalogo */

/** @type {MapaModuloCatalogo[]} */
export const MAPA_NAVEGACION_MODULOS = [
  { id: 'dashboard', nombre: 'Dashboard', icono: '📊', grupo: 'obra', orden: 1 },
  { id: 'reporte_cantidades', nombre: 'Reporte de Cantidades', icono: '🏗️', grupo: 'obra', orden: 2 },
  { id: 'programacion_obra', nombre: 'Programación de obra', icono: '📅', grupo: 'obra', orden: 3 },
  { id: 'topografia', nombre: 'Topografía', icono: '📐', grupo: 'obra', orden: 4 },
  { id: 'seguimiento', nombre: 'Seguimiento', icono: '📌', grupo: 'obra', orden: 5 },
  { id: 'editar_registros_presupuesto', nombre: 'Editar Registros Presupuesto', icono: '📋', grupo: 'presupuesto', orden: 6 },
  { id: 'listado_precios', nombre: 'Listado de Precios', icono: '💰', grupo: 'presupuesto', orden: 7 },
  { id: 'informes_ccd', nombre: 'Informes CCD', icono: '📄', grupo: 'presupuesto', orden: 8 },
  { id: 'almacen', nombre: 'Almacén', icono: '🏪', grupo: 'logistica', orden: 9 },
  { id: 'catalogo_insumos', nombre: 'Catálogo de insumos', icono: '📦', grupo: 'logistica', orden: 10 },
  { id: 'contratos', nombre: 'Contratos', icono: '📑', grupo: 'gestion', orden: 11 },
  { id: 'actas', nombre: 'Actas', icono: '📝', grupo: 'gestion', orden: 12 },
  { id: 'contabilidad', nombre: 'Contabilidad', icono: '🧾', grupo: 'gestion', orden: 13 },
  { id: 'subcontratistas', nombre: 'Subcontratistas', icono: '🤝', grupo: 'gestion', orden: 14 },
  { id: 'auditor_sst', nombre: 'Auditor SST', icono: '🛡️', grupo: 'sst', orden: 15 },
]

export const MAPA_NAVEGACION_STATIC_URL = '/ayuda/mapa-navegacion.json'
export const MAPA_NAVEGACION_API_URL = '/ayuda/mapa-navegacion'
