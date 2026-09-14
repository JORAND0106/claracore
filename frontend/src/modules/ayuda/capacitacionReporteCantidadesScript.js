/**
 * Guion de la capacitación interactiva del asistente «Nuevo Reporte de Cantidades».
 * Reproduce el ritmo del proyecto de referencia (intro + 5 pestañas + envío)
 * sin acoplarse al modal real de creación.
 */

/** @typedef {'intro' | 'wizard' | 'outro'} CapacitacionFase */
/**
 * @typedef {{
 *   id: string,
 *   fase: CapacitacionFase,
 *   durMs: number,
 *   titulo: string,
 *   narracion: string,
 *   tab?: number | null,
 *   highlight?: string | null,
 *   zoom?: number,
 *   fillDemo?: Record<string, string | boolean>,
 * }} CapacitacionPaso
 */

export const CAPACITACION_RC_TABS = [
  { id: 'info', label: '📋 Info General' },
  { id: 'plantilla', label: '📄 Plantilla' },
  { id: 'localizacion', label: '📍 Localización' },
  { id: 'registros', label: '📝 Registros' },
  { id: 'topografia', label: '📍 Topografía' },
]

/** Demo data shown as the walkthrough “fills” fields (read-only mock). */
export const CAPACITACION_RC_DEMO = {
  descripcion: 'Excavación manual tramo PK 12+400 a 12+650',
  subcontratista: 'ISLAN INGENIERÍA S.A.S.',
  inspector: 'Validador Nivel 1 — Obra',
  capitulo: '01. MOVIMIENTO DE TIERRAS',
  plantilla: 'Excavación — ítems estándar',
  locTipo: 'unica',
  pkId: 'PK-12+450',
  margen: 'Derecho',
  absIni: '12+400',
  absFin: '12+650',
  nodoIni: 'N-120',
  nodoFin: 'N-125',
  registroNombre: 'Excavación en material común',
  longitud: '12.50',
  ancho: '1.20',
  espesor: '0.80',
  observacion: 'Zona con nivel freático bajo',
  topoPunto: 'P1',
  norte: '1.084.520,35',
  este: '872.410,18',
  cota: '1.245,60',
  topoDesc: 'Estación base portada',
}

/**
 * Secuencia alineada a OM_SCENES del HTML de referencia:
 * Assemble → Lockup → Hold → Paso1…Paso7.
 * @type {CapacitacionPaso[]}
 */
export const CAPACITACION_RC_PASOS = [
  {
    id: 'assemble',
    fase: 'intro',
    durMs: 2200,
    titulo: 'Bienvenida',
    narracion: 'Las piezas del isotipo forman el círculo ClaraCore.',
    tab: null,
    highlight: null,
    zoom: 1,
  },
  {
    id: 'lockup',
    fase: 'intro',
    durMs: 1300,
    titulo: 'ClaraCore',
    narracion: 'Aparece el nombre de la plataforma junto al isotipo.',
    tab: null,
    highlight: null,
    zoom: 1,
  },
  {
    id: 'hold',
    fase: 'intro',
    durMs: 1500,
    titulo: 'Capacitación',
    narracion: 'Recorrido guiado del asistente de creación de un Reporte de Cantidades.',
    tab: null,
    highlight: null,
    zoom: 1,
  },
  {
    id: 'paso1-tabs',
    fase: 'wizard',
    durMs: 6000,
    titulo: 'Las 5 pestañas del asistente',
    narracion:
      'El asistente avanza en secuencia: Info General, Plantilla, Localización, Registros y Topografía. No se puede saltar una pestaña sin completar la anterior.',
    tab: 0,
    highlight: 'tabs',
    zoom: 1.04,
  },
  {
    id: 'paso2-descripcion',
    fase: 'wizard',
    durMs: 2500,
    titulo: 'Info General — Descripción',
    narracion: 'Escriba un nombre claro de la actividad medida en obra.',
    tab: 0,
    highlight: 'descripcion',
    zoom: 1.12,
    fillDemo: { descripcion: true },
  },
  {
    id: 'paso2-subcontratista',
    fase: 'wizard',
    durMs: 2500,
    titulo: 'Info General — Subcontratista',
    narracion: 'Busque y seleccione el subcontratista activo del contrato.',
    tab: 0,
    highlight: 'subcontratista',
    zoom: 1.12,
    fillDemo: { descripcion: true, subcontratista: true },
  },
  {
    id: 'paso2-inspector',
    fase: 'wizard',
    durMs: 2500,
    titulo: 'Info General — Inspector',
    narracion: 'Asigne el inspector (validador de nivel 1) responsable.',
    tab: 0,
    highlight: 'inspector',
    zoom: 1.12,
    fillDemo: { descripcion: true, subcontratista: true, inspector: true },
  },
  {
    id: 'paso2-capitulo',
    fase: 'wizard',
    durMs: 2500,
    titulo: 'Info General — Capítulo',
    narracion: 'Elija el capítulo del listado de precios. Con esto se activa «Siguiente».',
    tab: 0,
    highlight: 'capitulo',
    zoom: 1.12,
    fillDemo: {
      descripcion: true,
      subcontratista: true,
      inspector: true,
      capitulo: true,
      siguiente: true,
    },
  },
  {
    id: 'paso3-plantilla',
    fase: 'wizard',
    durMs: 8000,
    titulo: 'Plantilla (opcional)',
    narracion:
      'Puede seleccionar una plantilla del capítulo o crear una nueva. También puede continuar sin plantilla y definir registros después.',
    tab: 1,
    highlight: 'plantilla',
    zoom: 1.1,
    fillDemo: { plantilla: true },
  },
  {
    id: 'paso4-tipo',
    fase: 'wizard',
    durMs: 3000,
    titulo: 'Localización — Tipo',
    narracion: 'Elija localización única (toda la portada) o múltiple (por lote / registro).',
    tab: 2,
    highlight: 'loc-tipo',
    zoom: 1.1,
    fillDemo: { locTipo: true },
  },
  {
    id: 'paso4-pk',
    fase: 'wizard',
    durMs: 3000,
    titulo: 'Localización — PK en el plano',
    narracion: 'Seleccione el PK en el mapa del contrato o escriba el identificador.',
    tab: 2,
    highlight: 'loc-pk',
    zoom: 1.14,
    fillDemo: { locTipo: true, pkId: true },
  },
  {
    id: 'paso4-abscisas',
    fase: 'wizard',
    durMs: 3000,
    titulo: 'Localización — Abscisas y nodos',
    narracion: 'Complete margen, abscisas inicial/final y nodos de referencia.',
    tab: 2,
    highlight: 'loc-abscisas',
    zoom: 1.12,
    fillDemo: {
      locTipo: true,
      pkId: true,
      margen: true,
      absIni: true,
      absFin: true,
      nodoIni: true,
      nodoFin: true,
    },
  },
  {
    id: 'paso5-agregar',
    fase: 'wizard',
    durMs: 3000,
    titulo: 'Registros — Agregar',
    narracion: 'Agregue líneas de cantidad (registros) a la portada del reporte.',
    tab: 3,
    highlight: 'reg-agregar',
    zoom: 1.08,
    fillDemo: { registro: true },
  },
  {
    id: 'paso5-dimensiones',
    fase: 'wizard',
    durMs: 3000,
    titulo: 'Registros — Dimensiones',
    narracion: 'Capture longitud, ancho, espesor u otras dimensiones según la unidad.',
    tab: 3,
    highlight: 'reg-dimensiones',
    zoom: 1.14,
    fillDemo: { registro: true, dimensiones: true },
  },
  {
    id: 'paso5-foto',
    fase: 'wizard',
    durMs: 3000,
    titulo: 'Registros — Observación, foto y gráficos',
    narracion: 'Añada observación, foto de obra y gráficos de soporte por lote.',
    tab: 3,
    highlight: 'reg-foto',
    zoom: 1.12,
    fillDemo: { registro: true, dimensiones: true, foto: true },
  },
  {
    id: 'paso6-topografia',
    fase: 'wizard',
    durMs: 7000,
    titulo: 'Topografía de portada',
    narracion:
      'Registre puntos con Norte, Este, cota y descripción, o impórtelos desde CSV. Relevantes para la validación de Nivel 2.',
    tab: 4,
    highlight: 'topo-tabla',
    zoom: 1.1,
    fillDemo: { topo: true },
  },
  {
    id: 'paso7-enviar',
    fase: 'outro',
    durMs: 6000,
    titulo: 'Guardar y Enviar',
    narracion:
      'Al enviar, el reporte sale de Borrador y entra al circuito de asignación de ítems y validación. ¡Capacitación completada!',
    tab: 4,
    highlight: 'enviar',
    zoom: 1.08,
    fillDemo: { topo: true, enviado: true },
  },
]

export function capacitacionRcPasoPorIndice(i) {
  const idx = Math.max(0, Math.min(CAPACITACION_RC_PASOS.length - 1, Number(i) || 0))
  return CAPACITACION_RC_PASOS[idx]
}

export function capacitacionRcTotalPasos() {
  return CAPACITACION_RC_PASOS.length
}

/** Índices de pestaña del wizard reales (0–4); intro/outro pueden ser null. */
export function capacitacionRcTabActivo(paso) {
  if (!paso || paso.tab == null) return 0
  return Math.max(0, Math.min(CAPACITACION_RC_TABS.length - 1, paso.tab))
}

export function capacitacionRcEsIntro(paso) {
  return paso?.fase === 'intro'
}

export function capacitacionRcEsOutro(paso) {
  return paso?.fase === 'outro'
}
