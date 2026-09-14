/**
 * Catálogo fijo del mapa interactivo de funcionalidades.
 * Única fuente de estructura para ambos accesos (ícono de inicio + asistente Clara).
 *
 * Jerarquía:
 *   sección (grupo) → subtemas (entradas individuales de capacitación futura)
 *
 * Los ids de subtema son estables; el contenido educativo (texto, pantallazos,
 * video futuro) vive en /ayuda/mapa-navegacion.json o en el API (blob).
 */

/** @typedef {{ id: string, label: string, icono: string, orden: number }} MapaSeccionCatalogo */
/** @typedef {{ id: string, nombre: string, icono: string, grupo: string, orden: number }} MapaSubtemaCatalogo */

/** Alias histórico: los consumidores antiguos importaban MODULOS/GRUPOS. */
/** @typedef {MapaSubtemaCatalogo} MapaModuloCatalogo */

/** @type {MapaSeccionCatalogo[]} */
export const MAPA_NAVEGACION_SECCIONES = [
  { id: 'dashboard', label: 'Dashboard', icono: '📊', orden: 1 },
  { id: 'presupuesto', label: 'Presupuesto', icono: '📋', orden: 2 },
  { id: 'sicoe_obra', label: 'SICOE Obra', icono: '🏗️', orden: 3 },
  { id: 'informes', label: 'Informes', icono: '📄', orden: 4 },
  { id: 'almacen', label: 'Almacén', icono: '🏪', orden: 5 },
  { id: 'seguimiento', label: 'Seguimiento', icono: '📌', orden: 6 },
  { id: 'topografia', label: 'Topografía', icono: '📐', orden: 7 },
]

/** @deprecated usar MAPA_NAVEGACION_SECCIONES */
export const MAPA_NAVEGACION_GRUPOS = MAPA_NAVEGACION_SECCIONES

/**
 * Subtemas exactos por sección (orden de producto).
 * Cada uno es punto de entrada individual para capacitación futura.
 * @type {MapaSubtemaCatalogo[]}
 */
export const MAPA_NAVEGACION_SUBTEMAS = [
  // ── 1. Dashboard ──────────────────────────────────────────────────────────
  {
    id: 'dash_obra_ejecutada_presupuesto',
    nombre: 'Qué es obra ejecutada y qué es presupuesto de obra',
    icono: '📊',
    grupo: 'dashboard',
    orden: 1,
  },
  {
    id: 'dash_resumen_desviaciones',
    nombre: 'Qué se muestra en Resumen y qué en Desviaciones',
    icono: '📊',
    grupo: 'dashboard',
    orden: 2,
  },
  {
    id: 'dash_aprobacion_sicoe_ppto',
    nombre:
      'Dashboard Aprobación: SICOE Máx Aprobado | PPTO ClaraCore Aprobado Nivel Máx | PPTO ClaraCore No Revisado Nivel Máx',
    icono: '📊',
    grupo: 'dashboard',
    orden: 3,
  },
  {
    id: 'dash_obra_acta_capitulo_rol',
    nombre:
      'Dashboard: Obra Aprobada por Acta RPO | Presupuesto por Capítulo | Ppto vs Cobro por Capítulo | Validación por Rol · SICOE Obra',
    icono: '📊',
    grupo: 'dashboard',
    orden: 4,
  },

  // ── 2. Presupuesto ────────────────────────────────────────────────────────
  {
    id: 'ppto_crear_obra_ejecutada',
    nombre: 'Crear el presupuesto / Obra Ejecutada',
    icono: '📋',
    grupo: 'presupuesto',
    orden: 5,
  },
  {
    id: 'ppto_nueva_version_versiones',
    nombre: 'Nueva versión - Versiones',
    icono: '📋',
    grupo: 'presupuesto',
    orden: 6,
  },
  {
    id: 'ppto_descargar_excel',
    nombre: 'Descargar Excel',
    icono: '📋',
    grupo: 'presupuesto',
    orden: 7,
  },
  {
    id: 'ppto_analisis_datos',
    nombre: 'Análisis de datos',
    icono: '📋',
    grupo: 'presupuesto',
    orden: 8,
  },
  {
    id: 'ppto_filtros',
    nombre: 'Filtros',
    icono: '📋',
    grupo: 'presupuesto',
    orden: 9,
  },
  {
    id: 'ppto_panel_dinamico',
    nombre: 'Panel dinámico ClaraCore',
    icono: '📋',
    grupo: 'presupuesto',
    orden: 10,
  },
  {
    id: 'ppto_edicion_individual_masiva',
    nombre: 'Edición individual y edición masiva',
    icono: '📋',
    grupo: 'presupuesto',
    orden: 11,
  },
  {
    id: 'ppto_consulta_registro',
    nombre: 'Consulta de información de registro',
    icono: '📋',
    grupo: 'presupuesto',
    orden: 12,
  },
  {
    id: 'ppto_conexion_autocad',
    nombre: 'Conexión AutoCAD - ClaraCore Presupuesto',
    icono: '📋',
    grupo: 'presupuesto',
    orden: 13,
  },
  {
    id: 'ppto_graficos_bibliotecas',
    nombre: 'Asignación de gráficos y bibliotecas de gráficos',
    icono: '📋',
    grupo: 'presupuesto',
    orden: 14,
  },
  {
    id: 'ppto_cierre_financiero',
    nombre: 'Cierre financiero presupuestal',
    icono: '📋',
    grupo: 'presupuesto',
    orden: 15,
  },

  // ── 3. SICOE Obra ─────────────────────────────────────────────────────────
  {
    id: 'sicoe_viz_reportes_cantidades',
    nombre: 'Visualización de registros por Reportes o por Cantidades',
    icono: '🏗️',
    grupo: 'sicoe_obra',
    orden: 16,
  },
  {
    id: 'sicoe_filtros',
    nombre: 'Filtros',
    icono: '🏗️',
    grupo: 'sicoe_obra',
    orden: 17,
  },
  {
    id: 'sicoe_panel_dinamico',
    nombre: 'Panel dinámico SICOE',
    icono: '🏗️',
    grupo: 'sicoe_obra',
    orden: 18,
  },
  {
    id: 'sicoe_crear_reporte_registros',
    nombre: 'Crear Reporte - Registros',
    icono: '🏗️',
    grupo: 'sicoe_obra',
    orden: 19,
  },
  {
    id: 'sicoe_consulta_registros',
    nombre: 'Consulta de información de registros',
    icono: '🏗️',
    grupo: 'sicoe_obra',
    orden: 20,
  },
  {
    id: 'sicoe_validacion_cantidades_masiva',
    nombre: 'Validación de cantidades - Validación masiva',
    icono: '🏗️',
    grupo: 'sicoe_obra',
    orden: 21,
  },
  {
    id: 'sicoe_descarga_plantillas',
    nombre: 'Descarga de información (plantillas de información)',
    icono: '🏗️',
    grupo: 'sicoe_obra',
    orden: 22,
  },

  // ── 4. Informes ───────────────────────────────────────────────────────────
  {
    id: 'informes_biblioteca',
    nombre: 'Biblioteca de informes',
    icono: '📄',
    grupo: 'informes',
    orden: 23,
  },
  {
    id: 'informes_firmas_formatos',
    nombre: 'Asignación de firmas y personalización de formatos',
    icono: '📄',
    grupo: 'informes',
    orden: 24,
  },
  {
    id: 'informes_tipos_descarga',
    nombre: 'Tipo de formatos y descarga de información',
    icono: '📄',
    grupo: 'informes',
    orden: 25,
  },
  {
    id: 'informes_firma_documentos',
    nombre: 'Firma de documentos',
    icono: '📄',
    grupo: 'informes',
    orden: 26,
  },

  // ── 5. Almacén ────────────────────────────────────────────────────────────
  {
    id: 'almacen_crear_insumo',
    nombre: 'Crear insumo',
    icono: '🏪',
    grupo: 'almacen',
    orden: 27,
  },
  {
    id: 'almacen_plantillas',
    nombre: 'Descargar y cargar plantillas',
    icono: '🏪',
    grupo: 'almacen',
    orden: 28,
  },
  {
    id: 'almacen_solicitud_borrador_aprobacion',
    nombre: 'Nueva solicitud | Guardar borrador | Solicitud de aprobación',
    icono: '🏪',
    grupo: 'almacen',
    orden: 29,
  },
  {
    id: 'almacen_aprobacion_oc',
    nombre: 'Aprobación de insumos y OC - Generación de OC',
    icono: '🏪',
    grupo: 'almacen',
    orden: 30,
  },
  {
    id: 'almacen_entradas',
    nombre: 'Entradas',
    icono: '🏪',
    grupo: 'almacen',
    orden: 31,
  },
  {
    id: 'almacen_despachador',
    nombre: 'Despachador: recibo de materiales | disposición de materiales',
    icono: '🏪',
    grupo: 'almacen',
    orden: 32,
  },
  {
    id: 'almacen_devoluciones',
    nombre: 'Devoluciones de materiales',
    icono: '🏪',
    grupo: 'almacen',
    orden: 33,
  },
  {
    id: 'almacen_salidas',
    nombre: 'Salidas',
    icono: '🏪',
    grupo: 'almacen',
    orden: 34,
  },
  {
    id: 'almacen_inventario',
    nombre: 'Inventario',
    icono: '🏪',
    grupo: 'almacen',
    orden: 35,
  },

  // ── 6. Seguimiento ────────────────────────────────────────────────────────
  {
    id: 'seg_calendario',
    nombre: 'Calendario',
    icono: '📌',
    grupo: 'seguimiento',
    orden: 36,
  },
  {
    id: 'seg_nueva_tarea',
    nombre: 'Nueva tarea',
    icono: '📌',
    grupo: 'seguimiento',
    orden: 37,
  },
  {
    id: 'seg_nueva_acta',
    nombre: 'Nueva acta',
    icono: '📌',
    grupo: 'seguimiento',
    orden: 38,
  },
  {
    id: 'seg_bitacora',
    nombre: 'Bitácora de obra',
    icono: '📌',
    grupo: 'seguimiento',
    orden: 39,
  },
  {
    id: 'seg_libro_digital',
    nombre: 'Libro digital',
    icono: '📌',
    grupo: 'seguimiento',
    orden: 40,
  },

  // ── 7. Topografía ─────────────────────────────────────────────────────────
  {
    id: 'topo_biblioteca_puntos',
    nombre: 'Biblioteca de puntos',
    icono: '📐',
    grupo: 'topografia',
    orden: 41,
  },
  {
    id: 'topo_crear_poligonal',
    nombre: 'Crear poligonal',
    icono: '📐',
    grupo: 'topografia',
    orden: 42,
  },
  {
    id: 'topo_crear_punto',
    nombre: 'Crear un nuevo punto',
    icono: '📐',
    grupo: 'topografia',
    orden: 43,
  },
  {
    id: 'topo_circuito_nivelacion',
    nombre: 'Circuito de nivelación',
    icono: '📐',
    grupo: 'topografia',
    orden: 44,
  },
  {
    id: 'topo_estructura_diseno',
    nombre: 'Crear estructura de diseño - cargar diseño geométrico',
    icono: '📐',
    grupo: 'topografia',
    orden: 45,
  },
  {
    id: 'topo_carteras_via',
    nombre: 'Carteras de topografía que entregan estructura de vía',
    icono: '📐',
    grupo: 'topografia',
    orden: 46,
  },
]

/** @deprecated usar MAPA_NAVEGACION_SUBTEMAS */
export const MAPA_NAVEGACION_MODULOS = MAPA_NAVEGACION_SUBTEMAS

/** Subtema con capacitación interactiva nativa ya disponible. */
export const MAPA_SUBTEMA_CAPACITACION_RC = 'sicoe_crear_reporte_registros'

/**
 * Migración de ids del catálogo anterior → subtema actual.
 * Conserva contenido publicado si el blob aún usa claves viejas.
 */
export const MAPA_NAVEGACION_ID_LEGACY = {
  reporte_cantidades: MAPA_SUBTEMA_CAPACITACION_RC,
  dashboard: 'dash_obra_ejecutada_presupuesto',
  topografia: 'topo_biblioteca_puntos',
  seguimiento: 'seg_calendario',
  editar_registros_presupuesto: 'ppto_edicion_individual_masiva',
  informes_ccd: 'informes_biblioteca',
  almacen: 'almacen_inventario',
}

export function listarIdsSubtemasMapa() {
  return MAPA_NAVEGACION_SUBTEMAS.map((s) => s.id)
}

export const MAPA_NAVEGACION_STATIC_URL = '/ayuda/mapa-navegacion.json'
export const MAPA_NAVEGACION_API_URL = '/ayuda/mapa-navegacion'
