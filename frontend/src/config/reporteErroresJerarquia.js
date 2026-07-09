/**
 * Jerarquía Módulo → Ubicación → Sector específico para reportes de error.
 * Alineada con el menú lateral y la estructura real de cada módulo en ClaraCore.
 */

export const REPORTE_OTRO_KEY = '__otro__'

/** @typedef {{ label: string, sectores: Record<string, string> }} UbicacionDef */
/** @typedef {{ label: string, ubicaciones: Record<string, UbicacionDef> }} ModuloDef */

/** @type {Record<string, ModuloDef>} */
export const REPORTE_ERRORES_JERARQUIA = {
  inicio: {
    label: 'Inicio',
    ubicaciones: {
      barra_clima: {
        label: "Barra de clima",
        sectores: {
          clima_bogota: 'Panel clima Bogotá / oficina',
          clima_obra: 'Panel clima zona de obra',
          pronostico_5d: 'Pronóstico 5 días',
        },
      },
      panel_saludo: {
        label: 'Panel saludo y contenido del día',
        sectores: {
          tab_cita: 'Pestaña Cita bíblica',
          tab_reflexion: 'Pestaña Reflexión',
          tab_frase: 'Pestaña Frase motivadora',
          tab_dato: 'Pestaña Dato del día',
          predeterminado_refresh: 'Botón predeterminado / refrescar contenido',
        },
      },
      bandeja_novedades: {
        label: 'Bandeja de novedades',
        sectores: {
          listado: 'Listado de novedades (tabla)',
          modal_detalle: 'Modal detalle de novedad',
        },
      },
      carrusel_sicoe: {
        label: 'Carrusel SICOE (Obra en campo)',
        sectores: {
          navegacion: 'Navegación de fotos (anterior / siguiente)',
          visualizacion: 'Visualización de foto y metadatos',
        },
      },
      ficha_contrato: {
        label: 'Ficha del contrato',
        sectores: {
          datos: 'Datos contractuales (número, contratista, interventoría, acta, semana, objeto)',
          expandir_objeto: 'Expandir / contraer objeto',
        },
      },
    },
  },

  dashboard: {
    label: 'Dashboard',
    ubicaciones: {
      barra_superior: {
        label: 'Barra superior del dashboard',
        sectores: {
          selector_vista: 'Selector Presupuesto de Obra / Obra Ejecutada',
          pestanas: 'Pestañas Resumen / Desviaciones / Liquidación',
          actualizar: 'Botón Actualizar / badge de antigüedad de datos',
          selector_contrato: 'Selector de contrato',
        },
      },
      resumen_kpis: {
        label: 'Resumen — KPIs',
        sectores: {
          kpi_sicoe: 'Tarjeta SICOE aprobado',
          kpi_ppto_aprob: 'Tarjeta Ppto. ClaraCore aprobado nivel máx.',
          kpi_ppto_nr: 'Tarjeta Ppto. ClaraCore no revisado nivel máx.',
        },
      },
      resumen_paneles: {
        label: 'Resumen — paneles analíticos',
        sectores: {
          grafico_acta: 'Obra aprobada por acta RPO (gráfico)',
          grafico_capitulo: 'Presupuesto por capítulo (gráfico)',
          tabla_aiu: 'Ppto vs Cobro por capítulo (tabla AIU)',
          tabla_iva: 'Ppto vs Cobro · IVA (tabla)',
          export_excel: 'Exportación Excel por capítulo / informe gerencial',
        },
      },
      resumen_matriz: {
        label: 'Resumen — matriz de validación SICOE',
        sectores: {
          filtro_acta: 'Filtro de acta RPO (vigente / histórico / acta específica)',
          tabla_obra: 'Tabla Obra ejecutada directo sin AIU',
          tabla_ensayos: 'Tabla Ensayos y sondeos directo sin IVA',
          celdas_estado: 'Celdas / filas de estado (Aprobado, Pendiente, No revisado, etc.)',
        },
      },
      drilldown_capitulo: {
        label: 'Drill-down capítulo (popup)',
        sectores: {
          plano_semaforo: 'Plano semáforo mini (modo Presupuesto / Cobro / Ambos)',
          etiquetas_plano: 'Etiquetas del plano (PK / Abscisa / Ambas)',
          tabla_items: 'Tabla ítems del capítulo',
          tabla_pkid: 'Tabla PK_ID del ítem',
          migrar_sicoe: 'Botón Migrar a SICOE Obra',
        },
      },
      tab_analisis: {
        label: 'Desviaciones (tab Análisis)',
        sectores: {
          filtros: 'Filtros (nivel, dirección, rango Δ)',
          plano: 'Plano semáforo de desviaciones',
          kpis: 'KPIs Sobrecobro / Subcobro / Equilibrio',
          top10: 'Top 10 desviaciones',
          tabla_detalle: 'Tabla detalle (sort / paginación)',
          popup_pk: 'Popup detalle PK en mapa',
        },
      },
      tab_liquidacion: {
        label: 'Liquidación (tab)',
        sectores: {
          filtros: 'Filtros (nivel, categoría)',
          plano: 'Plano Cobro vs Recalculado',
          kpis: 'KPIs Supercobro / Por devolución / Por cobrar',
          tabla: 'Tabla liquidación',
          popup_pk: 'Popup PK liquidación',
        },
      },
      modales_globales: {
        label: 'Modales globales del dashboard',
        sectores: {
          popup_pk: 'Popup detalle PK (Ver en AutoCAD, columnas por estado)',
          detalle_poligono: 'Detalle polígono presupuesto (editar dimensiones)',
          export_excel: 'Exportar informe Excel',
          migracion: 'Migración presupuesto → SICOE Obra',
        },
      },
    },
  },

  presupuesto: {
    label: 'Presupuesto',
    ubicaciones: {
      vista_capitulos: {
        label: 'Vista por capítulos (inicio del módulo)',
        sectores: {
          tabla_capitulos: 'Tabla resumen de capítulos',
          panel_validacion: 'Panel negro de validación (depuración / interventoría)',
          toggle_tipo: 'Toggle Presupuesto de Obra / Obra Ejecutada',
        },
      },
      barra_filtros: {
        label: 'Barra de filtros y acciones',
        sectores: {
          modal_filtros: 'Modal Filtros (Ítem, Ubicación, Valores, Validación, Otros)',
          plano_pk: 'Plano · PK (panel lateral mapa)',
          acciones: 'Actualizar / Excel / Tramos / Versiones / Nueva versión',
          dwg: 'Indicador DWG enlazado',
        },
      },
      grilla: {
        label: 'Grilla de registros',
        sectores: {
          tabla: 'Tabla principal (columnas, selección, paginación)',
          semaforos: 'Semáforos Depuración / Revisado',
          fila_acciones: 'Botones por fila (detalle, editar, trazabilidad, comentarios, baja)',
          masivo: 'Edición masiva / Deshacer / Dar de baja',
        },
      },
      papelera: {
        label: 'Papelera',
        sectores: {
          listado: 'Listado de registros dados de baja',
          restaurar: 'Restaurar registro',
        },
      },
      revisor_tramos: {
        label: 'Revisor de tramos',
        sectores: {
          selector_modo: 'Selector Ver por ítem / Revisar por tramo',
          pestanas: 'Pestañas Info Tramo / Nodo Inicio / Nodo Fin / Tramo',
          filtros_estado: 'Filtros por estado de revisión',
          navegacion: 'Navegación entre tramos',
        },
      },
      modales_registro: {
        label: 'Modales — registro y cantidades',
        sectores: {
          agregar_cantidad: 'Agregar cantidad',
          detalle: 'Detalle del registro (lectura / edición)',
          recalculo: 'Confirmar recálculo',
        },
      },
      modales_comentarios: {
        label: 'Modales — comentarios y validación',
        sectores: {
          comentario: 'Comentario de justificación (dimensiones, ítem, validación, reapertura)',
          hilo: 'Hilo de comentarios',
          edicion_masiva: 'Edición masiva (pestañas capítulo, dimensiones, tipo ejecución, validaciones)',
        },
      },
      modales_export: {
        label: 'Modales — exportación e integración',
        sectores: {
          export_excel: 'Export Excel (informe / crudo)',
          sicoe_cad: 'Auditoría SicoeCAD / cola CAD',
          discrepancias: 'Discrepancias listado de precios',
          trazabilidad: 'Trazabilidad del registro',
          versionador: 'Versionador de presupuesto',
        },
      },
    },
  },

  sicoe_obra: {
    label: 'SICOE Obra',
    ubicaciones: {
      encabezado: {
        label: 'Encabezado y acciones globales',
        sectores: {
          nuevo_reporte: 'Nuevo Reporte',
          offline: 'Modo offline (preparar / forzar / sincronizar)',
          semanas: 'Banners de semana (configurar / extender)',
        },
      },
      panel_analisis: {
        label: 'Panel de análisis (negro)',
        sectores: {
          tabla: 'Tabla por capítulos / ítems / acta-semana',
          filtros: 'Aplicar filtros / volver',
          validacion_masiva: 'Validación masiva desde panel (Aprobado / Pendiente / Rechazado)',
        },
      },
      barra_filtros: {
        label: 'Barra de filtros',
        sectores: {
          modal_filtros: 'Modal Filtros (Reporte, Ítem, Ubicación, Valores, Otros)',
          capas: 'Capas de validación (combinar Y/O)',
          acciones: 'Buscar / Limpiar / Actualizar / Excel / Reversión',
          mapa_pk: 'Mapa de filtros (asignación por PK)',
        },
      },
      grilla_reportes: {
        label: 'Grilla de reportes',
        sectores: {
          tabla: 'Tabla de reportes (N° REP., tramo, costado, abscisa, etc.)',
          paginacion: 'Cargar más reportes',
          apertura: 'Apertura de carpeta / edición borrador',
        },
      },
      carpeta_portada: {
        label: 'Carpeta de reporte — Portada',
        sectores: {
          resumen: 'Resumen por estado',
          validacion_masiva: 'Validación masiva (Aprobar / Pendiente / Rechazar todos)',
          mapa: 'Mapa de portada',
          acciones: 'Eliminar reporte / Actualizar',
        },
      },
      carpeta_pestanas: {
        label: 'Carpeta de reporte — pestaña Sin asignar / por ítem',
        sectores: {
          listado: 'Listado de registros por pestaña',
          mover_nuevo: 'Mover registros / Nuevo registro',
        },
      },
      hoja_registro: {
        label: 'Hoja de registro',
        sectores: {
          formulario: 'Formulario dimensiones y cantidad',
          localizacion: 'Localización / mapa / subcontratista',
          foto: 'Foto obra (nueva / galería)',
          grafico: 'Gráfico / plano',
          validacion: 'Panel validación (Aprobado / Pendiente / Rechazado / No objeto de cobro)',
          sub_validacion: 'Validación subcontratista',
          reversion: 'Reversión doble llave',
          comentarios: 'Comentarios de validación / hilo comentarios',
          trazabilidad: 'Trazabilidad',
        },
      },
      modales: {
        label: 'Modales adicionales',
        sectores: {
          nuevo_reporte: 'Nuevo / editar reporte',
          export_excel: 'Export registros a Excel',
          validacion_masiva: 'Validación masiva (confirmación)',
          semanas: 'Configurar / extender semanas',
          mover: 'Mover registros entre reportes',
          galeria: 'Galería de fotos',
          capas: 'Combinar capas de validación',
        },
      },
    },
  },

  informes: {
    label: 'Informes',
    ubicaciones: {
      biblioteca_ccd: {
        label: 'Biblioteca CCD',
        sectores: {
          plantillas: 'Plantillas ClaraCore (CC-SUB, CC-SEM, CC-MES, CC-GER)',
          firmas: 'Slots de firma (Elaboró / Revisó / Aprobó)',
          personalizacion: 'Personalización de colores / vista previa',
          guardar: 'Guardar biblioteca por formato',
        },
      },
      formatos_sub: {
        label: 'Formatos Subcontratista',
        sectores: {
          selectores: 'Selector subcontratista y corte',
          cc_sub_001: 'CC-SUB-001 Informe de corte (PDF / Excel / firma)',
          cc_sub_002: 'CC-SUB-002 Memorias por ítem',
        },
      },
      formatos_sem: {
        label: 'Formatos Semanales',
        sectores: {
          selector_semana: 'Selector de semana',
          cc_sem_001: 'CC-SEM-001 Informe corte semanal',
          cc_sem_002: 'CC-SEM-002 Memorias corte semanal',
        },
      },
      informe_gerencia: {
        label: 'Informe de gerencia',
        sectores: {
          cc_ger_001: 'CC-GER-001 (PDF, firmas, matriz de costos)',
        },
      },
      preacta_mensual: {
        label: 'Preacta mensual (conciliación SICOE)',
        sectores: {
          selector_acta: 'Selector acta RPO',
          cc_mes_001: 'CC-MES-001 Informe ejecución mensual',
          cc_mes_002: 'CC-MES-002 Memorias mensuales',
        },
      },
      entidades_externas: {
        label: 'Formatos Entidades Externas',
        sectores: {
          fo_idu: 'FO-IDU-EO-04-V2 (supervisor, subdirección, acta, orientar fotos)',
          pdf_progresivo: 'Generación PDF progresiva',
        },
      },
      vista_previa: {
        label: 'Vista previa PDF (global)',
        sectores: {
          visor: 'Visor PDF embebido',
          firma: 'Registrar firma desde preview',
        },
      },
    },
  },

  almacen: {
    label: 'Almacén',
    ubicaciones: {
      placeholder: {
        label: 'Pantalla placeholder',
        sectores: {
          proximamente: 'Mensaje «Módulo próximamente»',
        },
      },
    },
  },

  programacion: {
    label: 'Programación',
    ubicaciones: {
      mapa: {
        label: 'Mapa principal',
        sectores: {
          vista: 'Vista Programación / Ejecutado',
          leyenda: 'Leyenda de estado / ejecutado N1',
          seleccion_pk: 'Selección de PK en mapa',
          mapbox: 'Controles Mapbox (navegación, estilo)',
        },
      },
      panel_version: {
        label: 'Panel lateral — gestión de versión',
        sectores: {
          validacion: 'Enviar a validación',
          crear_version: 'Crear programación inicial / Nueva versión',
          historial: 'Historial de versiones (consultar / continuar / comparar)',
          presupuesto: 'Selector versión presupuesto',
          tramo: 'Selector tramo / Programar tramo',
        },
      },
      panel_estado: {
        label: 'Panel lateral — estado y aprobación',
        sectores: {
          borrador: 'Estado borrador / sincronizar con presupuesto',
          desviacion: 'Alerta desviación vs baseline',
          aprobacion: 'Flujo de aprobación (Aprobar / Rechazar)',
          cpm: 'Dependencias globales CPM',
          listado_pk: 'Listado PKs del proyecto / tramo',
        },
      },
      cinta_header: {
        label: 'Cinta de acciones (header)',
        sectores: {
          auto: 'Generar programación automática',
          curva: 'Curva de inversión',
          comparar: 'Comparar tramos vs baseline',
          export: 'Exportar MS Project / Excel / PDF',
          eliminar: 'Eliminar programación del borrador',
        },
      },
      modal_programacion: {
        label: 'Modal Programación de obra (PK / tramo)',
        sectores: {
          pestanas: 'Pestaña Programación / Dependencias',
          sub_pestanas: 'Sub-pestaña Schedule / Comparar vs baseline',
          tabla_wbs: 'Tabla WBS (fechas, días hábiles)',
          gantt: 'Gantt (Overlay / Doble pista)',
          cpm: 'Resultados CPM',
        },
      },
      modales_aux: {
        label: 'Modales auxiliares',
        sectores: {
          nueva_version: 'Nueva versión (Reprogramación / Suspensión)',
          suspension: 'Asistente suspensión contractual',
          auto: 'Asistente programación automática',
          precheck: 'Enviar a validación (pre-check)',
          delta: 'Delta presupuesto vs programación',
          comparacion: 'Comparación global de tramos',
          curva_s: 'Curva S',
          export: 'Alcance de exportación',
          validar: 'Aprobar / Rechazar validación',
          eliminar: 'Eliminar toda la programación',
        },
      },
    },
  },

  topografia: {
    label: 'Topografía',
    ubicaciones: {
      biblioteca_puntos: {
        label: 'Biblioteca de puntos',
        sectores: {
          filtros: 'Filtros (tipo, verificado)',
          tabla: 'Tabla de puntos',
        },
      },
      poligonal: {
        label: 'Poligonal',
        sectores: {
          pestanas: 'Pestañas de poligonales / Nueva poligonal',
          resumen: 'Resumen poligonal (Editar libreta, Ver, PDF)',
          wizard: 'Asistente PoligonalModal (tipo → setup → estaciones)',
          libreta: 'Libreta / tabla de estaciones',
          grafico: 'Gráfico y cálculos',
          validacion: 'Panel validación Contratista / Interventoría',
          comentarios: 'Comentarios de validación',
        },
      },
      newpoint: {
        label: 'NewPoint',
        sectores: {
          pestanas: 'Pestañas de cálculos',
          reseccion: 'Formulario de resección',
          grafico: 'Gráfico NewPoint',
        },
      },
      nivelacion: {
        label: 'Circuito de nivelación',
        sectores: {
          pestanas: 'Pestañas de circuitos',
          paneles: 'Información / lecturas / cierre',
          cierre: 'Ingresar cierre',
          grafico: 'Gráfico de nivelación',
        },
      },
      diseno_geometrico: {
        label: 'Configuración DG (diseño geométrico)',
        sectores: {
          ejes: 'Pestañas de ejes',
          rasante: 'Rasante / estructura',
          import: 'Importar configuración',
          estructura: 'Nueva estructura / tabla de ordenadas',
        },
      },
      entrega_dg: {
        label: 'Entrega DG Obra',
        sectores: {
          pestanas: 'Pestañas de entregas',
          cartera: 'Cartera lecturas / deltas',
          matriz: 'Matriz de verificación',
          guardar: 'Guardar / salir sin guardar',
        },
      },
      tuberia: {
        label: 'Tubería',
        sectores: {
          crear: 'Crear tramo',
          listado: 'Listado de tramos / PDF',
          diario: 'Registro diario',
        },
      },
      areas: {
        label: 'Áreas por coordenadas',
        sectores: {
          formulario: 'Formulario y cálculos de áreas',
        },
      },
      equipos: {
        label: 'Equipos',
        sectores: {
          formulario: 'Formulario de equipos / alertas',
        },
      },
      modales_topo: {
        label: 'Modales transversales topografía',
        sectores: {
          confirm: 'TopoConfirmModal',
          error: 'TopoErrorModal',
        },
      },
    },
  },

  semaforo: {
    label: 'Plano Semáforo',
    ubicaciones: {
      mapa: {
        label: 'Mapa',
        sectores: {
          capas: 'Capas polígonos y etiquetas',
          navegacion: 'Controles de navegación Mapbox',
          detalle: 'Clic en polígono → panel detalle',
        },
      },
      etiquetas: {
        label: 'Controles de etiquetas',
        sectores: {
          pk_abscisa: 'PK / Abscisa / Ambas',
        },
      },
      panel_pk: {
        label: 'Panel detalle PK',
        sectores: {
          datos: '% Cobro, Cobrado, Presupuesto, Estado',
        },
      },
      estados: {
        label: 'Estados del módulo',
        sectores: {
          cargando: 'Cargando plano',
          vacio: 'Sin trazos / sin GeoJSON',
          sin_token: 'Error Mapbox sin token',
          leyenda: 'Leyenda AVANCE COBRO',
        },
      },
    },
  },

  auditor_sst: {
    label: 'Auditor',
    ubicaciones: {
      auditar: {
        label: 'Pestaña Auditar',
        sectores: {
          excel: 'Carga Excel FOAC (nómina)',
          masiva: 'Barra masiva (ejecutar / seleccionar / limpiar)',
          progreso: 'Progreso IA por cédula',
          grilla: 'Grilla de auditoría (Cargar PDF, Analizar, Ver resultados)',
          clasico: 'Modo clásico (individual / lote)',
          autorizacion: 'Autorización desarrollador (límite gasto)',
        },
      },
      importar: {
        label: 'Pestaña Importar',
        sectores: {
          excel: 'Importar filas desde Excel',
        },
      },
      historial: {
        label: 'Pestaña Historial',
        sectores: {
          gasto: 'Gasto acumulado API (Desarrollador)',
          lista: 'Lista de ejecuciones / descarga Excel',
          borrar: 'Borrar historial local',
        },
      },
      modal_resultados: {
        label: 'Modal Ver resultados',
        sectores: {
          resumen: 'Resumen / alertas críticas / detalle por campo',
          acciones: 'Descargar Excel / Reanalizar',
        },
      },
    },
  },
}

export const REPORTE_CRITICIDAD = [
  { key: 1, emoji: '🔥', color: '#DC2626', label: '¡Ya! — Bloqueado, no puedo continuar' },
  { key: 2, emoji: '🌡️', color: '#EA580C', label: 'Muy pronto — Me dificulta trabajar' },
  { key: 3, emoji: '☀️', color: '#CA8A04', label: 'Hoy — Puedo sortearlo con esfuerzo' },
  { key: 4, emoji: '🌤️', color: '#65A30D', label: 'Esta semana — Molestia menor' },
  { key: 5, emoji: '❄️', color: '#0EA5E9', label: 'Cuando puedas — Puedo seguir trabajando' },
]

/** Mapeo ModuloContext → clave del menú lateral (dashboard se publica como cobro). */
export const MODULO_CTX_A_MENU = {
  cobro: 'dashboard',
  inicio: 'inicio',
  presupuesto: 'presupuesto',
  sicoe_obra: 'sicoe_obra',
  informes: 'informes',
  almacen: 'almacen',
  programacion: 'programacion',
  topografia: 'topografia',
  semaforo: 'semaforo',
  auditor_sst: 'auditor_sst',
}

export function getOpcionesUbicacion(moduloKey) {
  const mod = REPORTE_ERRORES_JERARQUIA[moduloKey]
  if (!mod) return []
  return Object.entries(mod.ubicaciones).map(([key, u]) => ({ key, label: u.label }))
}

export function getOpcionesSector(moduloKey, ubicacionKey) {
  const u = REPORTE_ERRORES_JERARQUIA[moduloKey]?.ubicaciones?.[ubicacionKey]
  if (!u) return []
  return Object.entries(u.sectores).map(([key, label]) => ({ key, label }))
}

export function resolverEtiqueta(moduloKey, ubicacionKey, sectorKey, otroModulo, otroUbicacion, otroSector) {
  const mod = REPORTE_ERRORES_JERARQUIA[moduloKey]
  const modLabel = moduloKey === REPORTE_OTRO_KEY ? (otroModulo || 'Otro') : (mod?.label || moduloKey)
  const u = mod?.ubicaciones?.[ubicacionKey]
  const uLabel = ubicacionKey === REPORTE_OTRO_KEY ? (otroUbicacion || 'Otro') : (u?.label || ubicacionKey)
  const sLabel = sectorKey === REPORTE_OTRO_KEY
    ? (otroSector || 'Otro')
    : (u?.sectores?.[sectorKey] || sectorKey)
  return { modLabel, uLabel, sLabel }
}
