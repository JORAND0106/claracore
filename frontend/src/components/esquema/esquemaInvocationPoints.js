/**
 * Inventario de puntos de invocación de la herramienta de esquema.
 * Fuente de verdad para la regla de paridad (C-TX-08): todos usan el mismo
 * EsquemaEditorModal y las mismas funciones del contrato, salvo lo propio
 * de un módulo (huellaMode / SicoeObra).
 *
 * Al agregar un punto nuevo: registrar aquí + cubrir en
 * esquemaParidadInvocacion.scenario.test.js.
 */

/** Grupos de funciones exigidos en todos los puntos (salvo sicoeOnly). */
export const ESQUEMA_PARITY_FEATURE_GROUPS = Object.freeze([
  '2d',
  'coords',
  '3d',
  'calculo',
  'despiece',
  'borrador_png',
])

/**
 * @typedef {object} EsquemaInvocationPoint
 * @property {string} id
 * @property {string} module
 * @property {string} screen
 * @property {string} action
 * @property {string} file  ruta relativa a frontend/src/
 * @property {boolean} [sicoeOnly]  refs / sync portada / color ítem / huellaMode
 * @property {boolean} [topoTramoCoords]  planilla tubería: sync Inicio/Fin ↔ tabla
 * @property {string[]} featureGroups
 */

/** @type {EsquemaInvocationPoint[]} */
export const ESQUEMA_INVOCATION_POINTS = Object.freeze([
  {
    id: 'bitacora-adjuntos',
    module: 'Bitácora',
    screen: 'Entrada / adjuntos',
    action: 'Esquema',
    file: 'modules/seguimiento/BitacoraAdjuntos.jsx',
    featureGroups: [...ESQUEMA_PARITY_FEATURE_GROUPS],
  },
  {
    id: 'acta-idea',
    module: 'Actas',
    screen: 'Editor de acta · idea',
    action: 'Esquema',
    file: 'modules/seguimiento/ActaEditor.jsx',
    featureGroups: [...ESQUEMA_PARITY_FEATURE_GROUPS],
  },
  {
    id: 'acta-compromiso-abiertos',
    module: 'Actas',
    screen: 'Compromisos abiertos',
    action: 'Esquema · evidencia',
    file: 'modules/seguimiento/ActaCompromisosAbiertosTable.jsx',
    featureGroups: [...ESQUEMA_PARITY_FEATURE_GROUPS],
  },
  {
    id: 'acta-compromiso-detalle',
    module: 'Actas',
    screen: 'Detalle de compromiso',
    action: 'Esquema · evidencia',
    file: 'modules/seguimiento/ItemDetalleModal.jsx',
    featureGroups: [...ESQUEMA_PARITY_FEATURE_GROUPS],
  },
  {
    id: 'tarea-checklist',
    module: 'Seguimiento',
    screen: 'Tarea · checklist',
    action: 'Esquema · sub-ítem',
    file: 'modules/seguimiento/TareaChecklistEditor.jsx',
    featureGroups: [...ESQUEMA_PARITY_FEATURE_GROUPS],
  },
  {
    id: 'tarea-partes',
    module: 'Seguimiento',
    screen: 'Tarea · partes',
    action: 'Esquema · parte',
    file: 'modules/seguimiento/TareaPartesFormEditor.jsx',
    featureGroups: [...ESQUEMA_PARITY_FEATURE_GROUPS],
  },
  {
    id: 'sicoe-registro-grafico',
    module: 'SicoeObra',
    screen: 'Registro · gráfico',
    action: 'Crear / editar esquema',
    file: 'App.jsx',
    featureGroups: [...ESQUEMA_PARITY_FEATURE_GROUPS],
  },
  {
    id: 'sicoe-wizard-lote',
    module: 'SicoeObra',
    screen: 'Asistente de gráficos (lote)',
    action: 'Crear / editar esquema',
    file: 'modules/sicoe-obra/SicoeGraficosWizardPanel.jsx',
    featureGroups: [...ESQUEMA_PARITY_FEATURE_GROUPS],
  },
  {
    id: 'sicoe-dibujo-reporte',
    module: 'SicoeObra',
    screen: 'Dibujo del reporte (huella)',
    action: 'Dibujar / editar dibujo',
    file: 'modules/sicoe-obra/SicoeDibujoReporteEditor.jsx',
    sicoeOnly: true,
    featureGroups: [...ESQUEMA_PARITY_FEATURE_GROUPS],
  },
  {
    id: 'ppto-graficos-grupo-nuevo',
    module: 'Presupuesto',
    screen: 'Grupo de gráfico (nuevo)',
    action: 'Dibujar esquema',
    file: 'modules/presupuesto/PptoGraficosModal.jsx',
    featureGroups: [...ESQUEMA_PARITY_FEATURE_GROUPS],
  },
  {
    id: 'ppto-graficos-grupo-reemplazo',
    module: 'Presupuesto',
    screen: 'Grupo de gráfico (editar)',
    action: 'Dibujar esquema · reemplazar',
    file: 'modules/presupuesto/PptoGruposGraficosModal.jsx',
    featureGroups: [...ESQUEMA_PARITY_FEATURE_GROUPS],
  },
  {
    id: 'ppto-sincro-lote',
    module: 'Presupuesto',
    screen: 'Sincronización lote SicoeCAD',
    action: 'Dibujar esquema',
    file: 'modules/presupuesto/PptoSincroSicoeLoteModal.jsx',
    featureGroups: [...ESQUEMA_PARITY_FEATURE_GROUPS],
  },
  {
    id: 'topo-planilla-crear-reporte',
    module: 'Topografía',
    screen: 'Planilla de tubería · Crear reporte SICOE',
    action: 'Generar esquema del tramo',
    file: 'components/topografia/planillaTuberia/PlanillaTuberiaCrearReporteModal.jsx',
    topoTramoCoords: true,
    featureGroups: [...ESQUEMA_PARITY_FEATURE_GROUPS],
  },
  {
    id: 'topo-planilla-asociar-reporte',
    module: 'Topografía',
    screen: 'Planilla de tubería · Asociar a reporte',
    action: 'Generar esquema del tramo',
    file: 'components/topografia/planillaTuberia/PlanillaTuberiaAsociarReporteModal.jsx',
    topoTramoCoords: true,
    featureGroups: [...ESQUEMA_PARITY_FEATURE_GROUPS],
  },
])

/** Ruta canónica del modal (única implementación). */
export const ESQUEMA_EDITOR_CANONICAL = 'components/esquema/EsquemaEditorModal.jsx'

/**
 * Marcadores de código que el modal debe exponer para cada grupo de paridad.
 * Usados por la prueba automática (sin DOM).
 */
export const ESQUEMA_PARITY_MARKERS = Object.freeze({
  '2d': [
    /Zoom extendido|zoom-extendido|fitViewToScene/,
    /zoom-ventana|Zoom ventana/,
    /IconInsertarMapa|activateMap/,
    /lineStyle|LINE_STYLE/,
    /createHatchRegionFromClick|hatch/,
    /createCota|acot/,
  ],
  coords: [
    /DibujoTipoCompactPanel|sicoe-dibujo-tipo-bar/,
    /esquema-coords-tool-block|CoordsPanel|esquema-coords-panel/,
    /CursorCoordsPanel|esquema-cursor-coords/,
    /pickNodoFromMap|esquema-coords-pick-from-map/,
    /BibliotecaPanel|beginInsertLibraryItem/,
  ],
  '3d': [
    /mode3d|setMode3d/,
    /Extruir|applyExtrude|extrude/,
    /Solevar|confirmSolevar/,
    /applyUnite3d|Unir/,
    /applySubtract3d|Sustraer/,
    /beginCut3d|Cortar/,
    /orbitFree|Giro libre/,
  ],
  calculo: [
    /volumeCalcs|CalcPanel|cálculo de volúmenes/i,
    /composeCalcMemoriaPng|memoria-calculo|buildCalcAdjuntos/,
  ],
  despiece: [
    /despieceSchedules|EsquemaDespiecePanel|Cuadro de despiece/,
    /buildDespieceAdjuntos|despiece-acero/,
    /allowDibujarParrilla|Dibujar parrilla/,
  ],
  borrador_png: [
    /esquemaDraftSave|buildEsquemaDraftSnapshot/,
    /composeEsquemaExport|isEsquemaPngDataUrl/,
    /lossless|C-OUT-07|PNG/,
  ],
})
