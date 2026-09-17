/**
 * Catálogo fijo del mapa interactivo de funcionalidades.
 * Única fuente para ambos accesos (ícono de inicio + asistente Clara).
 *
 * Jerarquía:
 *   módulo (ícono colapsable) → grupos temáticos (entrada de video futura)
 *
 * Vista inicial: solo los 7 íconos. Al hacer clic se expanden los grupos
 * temáticos de ese módulo. Cada grupo aloja descripción / pantallazos / video.
 */

/** @typedef {{ id: string, label: string, icono: string, orden: number }} MapaModuloIcono */
/** @typedef {{ id: string, nombre: string, icono: string, grupo: string, orden: number, resumen?: string }} MapaGrupoTematico */

/** @type {MapaModuloIcono[]} */
export const MAPA_NAVEGACION_SECCIONES = [
  { id: 'dashboard', label: 'Dashboard', icono: '📊', orden: 1 },
  { id: 'presupuesto', label: 'Presupuesto', icono: '📋', orden: 2 },
  { id: 'sicoe_obra', label: 'SICOE Obra', icono: '🏗️', orden: 3 },
  { id: 'informes', label: 'Informes', icono: '📄', orden: 4 },
  { id: 'almacen', label: 'Almacén', icono: '🏪', orden: 5 },
  { id: 'seguimiento', label: 'Seguimiento', icono: '📌', orden: 6 },
  { id: 'topografia', label: 'Topografía', icono: '📐', orden: 7 },
]

/** @deprecated alias de compatibilidad */
export const MAPA_NAVEGACION_GRUPOS = MAPA_NAVEGACION_SECCIONES

/**
 * Grupos temáticos por módulo (orden de producto).
 * Un grupo = un futuro video que cubre varias funcionalidades afines.
 * @type {MapaGrupoTematico[]}
 */
export const MAPA_NAVEGACION_SUBTEMAS = [
  // ── Dashboard ─────────────────────────────────────────────────────────────
  {
    id: 'dash_leer_indicadores',
    nombre: 'Cómo leer tus indicadores',
    resumen:
      'Obra ejecutada vs. presupuesto, resumen vs. desviaciones, y los dashboards de aprobación con sus indicadores.',
    icono: '📊',
    grupo: 'dashboard',
    orden: 1,
  },

  // ── Presupuesto ───────────────────────────────────────────────────────────
  {
    id: 'ppto_arranca_versiona',
    nombre: 'Arranca y versiona tu presupuesto',
    resumen: 'Crear presupuesto / obra ejecutada y gestionar versiones.',
    icono: '📋',
    grupo: 'presupuesto',
    orden: 2,
  },
  {
    id: 'ppto_analiza_datos',
    nombre: 'Analiza tus datos',
    resumen: 'Análisis de datos, filtros y panel dinámico ClaraCore.',
    icono: '📋',
    grupo: 'presupuesto',
    orden: 3,
  },
  {
    id: 'ppto_edita_consulta',
    nombre: 'Edita y consulta registros',
    resumen: 'Edición individual/masiva y consulta de información de registro.',
    icono: '📋',
    grupo: 'presupuesto',
    orden: 4,
  },
  {
    id: 'ppto_autocad_graficos',
    nombre: 'Conecta AutoCAD y asigna gráficos',
    resumen: 'Conexión AutoCAD–ClaraCore y bibliotecas de gráficos.',
    icono: '📋',
    grupo: 'presupuesto',
    orden: 5,
  },
  {
    id: 'ppto_exporta_cierra',
    nombre: 'Exporta y cierra tu presupuesto',
    resumen: 'Descarga Excel y cierre financiero presupuestal.',
    icono: '📋',
    grupo: 'presupuesto',
    orden: 6,
  },

  // ── SICOE Obra ────────────────────────────────────────────────────────────
  {
    id: 'sicoe_crear_reporte_registros',
    nombre: 'Crea tu reporte de cantidades',
    resumen: 'Asistente de creación: Info General, Plantilla, Localización, Registros y Topografía.',
    icono: '🏗️',
    grupo: 'sicoe_obra',
    orden: 7,
  },
  {
    id: 'sicoe_visualiza_filtra',
    nombre: 'Visualiza y filtra tus registros',
    resumen: 'Vista por Reportes o Cantidades, filtros y panel dinámico SICOE.',
    icono: '🏗️',
    grupo: 'sicoe_obra',
    orden: 8,
  },
  {
    id: 'sicoe_consulta_valida',
    nombre: 'Consulta y valida cantidades',
    resumen: 'Consulta de registros y validación individual o masiva.',
    icono: '🏗️',
    grupo: 'sicoe_obra',
    orden: 9,
  },
  {
    id: 'sicoe_descarga_plantillas',
    nombre: 'Descarga tus plantillas de información',
    resumen: 'Descarga de información y plantillas de exportación.',
    icono: '🏗️',
    grupo: 'sicoe_obra',
    orden: 10,
  },

  // ── Informes ──────────────────────────────────────────────────────────────
  {
    id: 'informes_biblioteca_formatos',
    nombre: 'Tu biblioteca de informes y formatos',
    resumen: 'Biblioteca de informes, tipos de formato y descarga.',
    icono: '📄',
    grupo: 'informes',
    orden: 11,
  },
  {
    id: 'informes_firmas_personalizacion',
    nombre: 'Firmas y personalización de documentos',
    resumen: 'Asignación de firmas, personalización de formatos y firma de documentos.',
    icono: '📄',
    grupo: 'informes',
    orden: 12,
  },

  // ── Almacén ───────────────────────────────────────────────────────────────
  {
    id: 'almacen_catalogo_insumos',
    nombre: 'Crea y carga tu catálogo de insumos',
    resumen: 'Crear insumo y descargar/cargar plantillas.',
    icono: '🏪',
    grupo: 'almacen',
    orden: 13,
  },
  {
    id: 'almacen_solicita_aprueba',
    nombre: 'Solicita y aprueba materiales',
    resumen: 'Nueva solicitud, borrador, aprobación de insumos y generación de OC.',
    icono: '🏪',
    grupo: 'almacen',
    orden: 14,
  },
  {
    id: 'almacen_mueve_obra',
    nombre: 'Mueve materiales en obra',
    resumen: 'Entradas, despachador, devoluciones y salidas.',
    icono: '🏪',
    grupo: 'almacen',
    orden: 15,
  },
  {
    id: 'almacen_consulta_inventario',
    nombre: 'Consulta tu inventario',
    resumen: 'Inventario de materiales en almacén.',
    icono: '🏪',
    grupo: 'almacen',
    orden: 16,
  },

  // ── Seguimiento ───────────────────────────────────────────────────────────
  {
    id: 'seg_tareas_calendario',
    nombre: 'Organiza tareas y calendario',
    resumen: 'Calendario y nueva tarea.',
    icono: '📌',
    grupo: 'seguimiento',
    orden: 17,
  },
  {
    id: 'seg_constancia_digital',
    nombre: 'Deja constancia: actas, bitácora y libro digital',
    resumen: 'Nueva acta, bitácora de obra y libro digital.',
    icono: '📌',
    grupo: 'seguimiento',
    orden: 18,
  },

  // ── Topografía ────────────────────────────────────────────────────────────
  {
    id: 'topo_administra_puntos',
    nombre: 'Administra tus puntos topográficos',
    resumen: 'Biblioteca de puntos y creación de un nuevo punto.',
    icono: '📐',
    grupo: 'topografia',
    orden: 19,
  },
  {
    id: 'topo_poligonales_nivelacion',
    nombre: 'Poligonales y nivelación',
    resumen: 'Crear poligonal y circuito de nivelación.',
    icono: '📐',
    grupo: 'topografia',
    orden: 20,
  },
  {
    id: 'topo_diseno_entrega',
    nombre: 'Del diseño a la entrega',
    resumen: 'Estructura de diseño / diseño geométrico y carteras de vía.',
    icono: '📐',
    grupo: 'topografia',
    orden: 21,
  },
]

/** @deprecated alias: ahora son grupos temáticos */
export const MAPA_NAVEGACION_MODULOS = MAPA_NAVEGACION_SUBTEMAS

/** Grupo temático con capacitación interactiva nativa ya disponible. */
export const MAPA_SUBTEMA_CAPACITACION_RC = 'sicoe_crear_reporte_registros'

/**
 * Migración de ids anteriores (subtemas sueltos o módulos viejos)
 * → grupo temático actual. Conserva contenido publicado en blob/JSON.
 */
export const MAPA_NAVEGACION_ID_LEGACY = {
  // Módulos / ids muy antiguos
  reporte_cantidades: MAPA_SUBTEMA_CAPACITACION_RC,
  dashboard: 'dash_leer_indicadores',
  topografia: 'topo_administra_puntos',
  seguimiento: 'seg_tareas_calendario',
  editar_registros_presupuesto: 'ppto_edita_consulta',
  informes_ccd: 'informes_biblioteca_formatos',
  almacen: 'almacen_consulta_inventario',

  // Subtemas de la versión intermedia (46 ítems) → grupos
  dash_obra_ejecutada_presupuesto: 'dash_leer_indicadores',
  dash_resumen_desviaciones: 'dash_leer_indicadores',
  dash_aprobacion_sicoe_ppto: 'dash_leer_indicadores',
  dash_obra_acta_capitulo_rol: 'dash_leer_indicadores',

  ppto_crear_obra_ejecutada: 'ppto_arranca_versiona',
  ppto_nueva_version_versiones: 'ppto_arranca_versiona',
  ppto_analisis_datos: 'ppto_analiza_datos',
  ppto_filtros: 'ppto_analiza_datos',
  ppto_panel_dinamico: 'ppto_analiza_datos',
  ppto_edicion_individual_masiva: 'ppto_edita_consulta',
  ppto_consulta_registro: 'ppto_edita_consulta',
  ppto_conexion_autocad: 'ppto_autocad_graficos',
  ppto_graficos_bibliotecas: 'ppto_autocad_graficos',
  ppto_descargar_excel: 'ppto_exporta_cierra',
  ppto_cierre_financiero: 'ppto_exporta_cierra',

  sicoe_viz_reportes_cantidades: 'sicoe_visualiza_filtra',
  sicoe_filtros: 'sicoe_visualiza_filtra',
  sicoe_panel_dinamico: 'sicoe_visualiza_filtra',
  sicoe_consulta_registros: 'sicoe_consulta_valida',
  sicoe_validacion_cantidades_masiva: 'sicoe_consulta_valida',

  informes_biblioteca: 'informes_biblioteca_formatos',
  informes_tipos_descarga: 'informes_biblioteca_formatos',
  informes_firmas_formatos: 'informes_firmas_personalizacion',
  informes_firma_documentos: 'informes_firmas_personalizacion',

  almacen_crear_insumo: 'almacen_catalogo_insumos',
  almacen_plantillas: 'almacen_catalogo_insumos',
  almacen_solicitud_borrador_aprobacion: 'almacen_solicita_aprueba',
  almacen_aprobacion_oc: 'almacen_solicita_aprueba',
  almacen_entradas: 'almacen_mueve_obra',
  almacen_despachador: 'almacen_mueve_obra',
  almacen_devoluciones: 'almacen_mueve_obra',
  almacen_salidas: 'almacen_mueve_obra',
  almacen_inventario: 'almacen_consulta_inventario',

  seg_calendario: 'seg_tareas_calendario',
  seg_nueva_tarea: 'seg_tareas_calendario',
  seg_nueva_acta: 'seg_constancia_digital',
  seg_bitacora: 'seg_constancia_digital',
  seg_libro_digital: 'seg_constancia_digital',

  topo_biblioteca_puntos: 'topo_administra_puntos',
  topo_crear_punto: 'topo_administra_puntos',
  topo_crear_poligonal: 'topo_poligonales_nivelacion',
  topo_circuito_nivelacion: 'topo_poligonales_nivelacion',
  topo_estructura_diseno: 'topo_diseno_entrega',
  topo_carteras_via: 'topo_diseno_entrega',
}

export function listarIdsSubtemasMapa() {
  return MAPA_NAVEGACION_SUBTEMAS.map((s) => s.id)
}

export const MAPA_NAVEGACION_STATIC_URL = '/ayuda/mapa-navegacion.json'
export const MAPA_NAVEGACION_API_URL = '/ayuda/mapa-navegacion'
