-- Guía pública: Presupuesto (manual de usuario; imágenes se añaden después en bloques tipo imagen).
-- Ejecutar en Supabase después de create_guias.sql.
-- Idempotente: actualiza contenido si el slug ya existe.

INSERT INTO guias (
    contrato_id,
    titulo,
    slug,
    modulo,
    descripcion_corta,
    bloques,
    roles_visibles,
    publicado,
    orden
) VALUES (
    NULL,
    'Presupuesto',
    'presupuesto',
    'Presupuesto',
    'Filtros, panel de validación, edición masiva, versiones, plano PK y exportación Excel del presupuesto vigente.',
    $json$[
  {"tipo": "texto", "contenido": "Esta guía explica el módulo Presupuesto de ClaraCore: cómo buscar y filtrar registros, validar por depuración e interventoría, editar en bloque, usar el plano PK, versiones y exportar a Excel. Los datos que ve aquí son siempre el presupuesto vigente en edición (no mezcla versiones históricas del panel Versiones)."},
  {"tipo": "subtitulo", "contenido": "¿Para qué sirve?"},
  {"tipo": "texto", "contenido": "Presupuesto concentra las cantidades del contrato: medición, validación en dos capas (depuración del contratista e interventoría), reclasificación entre obra contractual y obra ejecutada, y exportación de informes.\n\nLa carga masiva inicial suele venir desde SicoeCAD (AutoCAD). Desde la web puede filtrar, validar, editar en bloque, agregar cantidad, dar de baja, exportar Excel, guardar plantillas de filtros y administrar versiones — según sus permisos en el contrato."},
  {"tipo": "subtitulo", "contenido": "Pantalla principal"},
  {"tipo": "texto", "contenido": "Menú lateral → Presupuesto.\n\n• Barra superior fija: «🔍 Filtros», resumen «Criterios: …», botón 🗺️ (plano PK), botones «Presupuesto de Obra» | «Obra Ejecutada», Actualizar, 📥 Excel, Tramos y Versiones (estas dos últimas solo en ciertas condiciones).\n• Panel de validación Interventoría: bloque entre la barra y la tabla; recogido por defecto (▼ para expandir).\n• Tabla de registros con checkbox para selección múltiple.\n• Barra de selección (si tiene permiso): «✏️ Edición masiva», «↩ Deshacer» y «Dar de baja»."},
  {"tipo": "subtitulo", "contenido": "Modal «🔍 Filtros» — dos pestañas"},
  {"tipo": "texto", "contenido": "Todo el filtrado va en el modal amplio. Ya no existe la barra antigua de «+ Filtro» ni chips sueltos en pantalla.\n\nPESTAÑA «Filtros libres» — grupos colapsables:\n• ÍTEM: Capítulo, Ítem (buscador predictivo), Competencia, Unidad.\n• UBICACIÓN: Tramo, Calzada, PK, ID-POL, Nodo inicio/fin, Abscisa desde–hasta.\n• VALORES: Vlr. unitario, Cant. total, Costo directo (rangos numéricos).\n• VALIDACIÓN: Estado interventoría, Estado depuración, Sellado.\n• OTROS: Texto (registro/descripción), Dado de baja.\n\nÁrea, longitud y nodo NO se filtran aquí (vienen del plano CAD).\n\nAl agregar un criterio debe verse una etiqueta con el valor. Pulse «Buscar» (abajo a la derecha) para cargar la grilla y cerrar el modal. «Cancelar» cierra sin buscar. «Limpiar todo» borra criterios y vacía la tabla."},
  {"tipo": "subtitulo", "contenido": "Plantillas de filtros"},
  {"tipo": "texto", "contenido": "CREAR: Filtros libres → definir criterios con etiquetas visibles → (opcional Buscar) → pestaña Plantillas → nombre → «Guardar plantilla».\n\nUSAR: Plantillas → clic en el nombre → vuelve a Filtros libres con criterios cargados → Buscar.\n\nBORRAR: × junto al nombre.\n\nLa última búsqueda se recuerda al volver al contrato en la misma sesión del navegador; al cerrar sesión ClaraCore se pierde."},
  {"tipo": "subtitulo", "contenido": "Vista «Presupuesto de Obra» | «Obra Ejecutada»"},
  {"tipo": "texto", "contenido": "Botones en la barra superior (control segmentado). Cambian qué tipo de cantidades ve: contractual vs obra ya ejecutada. No es una etiqueta de filtro del modal.\n\nAl cambiar la vista se recarga la tabla. Las opciones de versiones solo aparecen en «Presupuesto de Obra» (no en Obra Ejecutada ni papelera).\n\nSi cambia el tipo de ejecución de filas y deja de verlas, alterne estos botones superiores."},
  {"tipo": "subtitulo", "contenido": "Panel de validación Interventoría"},
  {"tipo": "texto", "contenido": "Sustituye el antiguo «Resumen de validación». Sirve para ver por dónde falta validar sin abrir cada fila.\n\n1. Expanda el panel (▼) si está recogido.\n2. Vista capítulos: filas ordenadas por menor % avance (más pendientes arriba). Anillo = % ya revisado.\n3. Clic en nombre del capítulo → pasa a ítems de ese capítulo.\n4. Clic en celda de un estado (ej. Pendientes «10 reg. | $ …») → carga la grilla solo con esos registros y baja el scroll a la tabla.\n5. «← Atrás»: vuelve a capítulos (misma búsqueda).\n6. «🔍 Buscar» en el panel = mismo Buscar del modal.\n7. Checkboxes + «Aplicar filtros»: acota la grilla por capítulos/ítems marcados.\n\nBuscar sin capítulo en Filtros: trae todo el contrato vigente; el panel lista todos los capítulos."},
  {"tipo": "subtitulo", "contenido": "Validación en dos capas"},
  {"tipo": "texto", "contenido": "a) Depuración (contratista): columna «Dep.» o pestaña «Validación por depuración» en edición masiva. Estados: No Revisado, Rechazado, Pendiente, Aprobado.\n\nb) Interventoría: columna de semáforo principal o pestaña «Validación por Interventoría». Aprobado puede sellar el registro (candado).\n\nRegla clave: Interventoría NO puede validar hasta que la depuración esté en «Aprobado» (salvo registros legados sin depuración). Los semáforos de Interventoría quedan bloqueados si depuración no está aprobada."},
  {"tipo": "subtitulo", "contenido": "Edición masiva"},
  {"tipo": "texto", "contenido": "Ya no aparece en la barra: desplegable Capítulo, Recalcular ni Tipo en línea. Todo está en «✏️ Edición masiva».\n\n1. Marque filas con checkbox (no las selladas).\n2. Pulse «✏️ Edición masiva» → ventana con pestañas según su rol:\n   · Capítulo / Ítem\n   · Dimensiones (solo Ancho y Espesor; recalcula cantidad y costo)\n   · Tipo de ejecución\n   · Validación por depuración (contratista + permiso validar)\n   · Validación por Interventoría (solo filas con depuración Aprobado)\n3. Opcional: «Actualizar observación» (sale en Excel).\n4. Revise resumen → «Editar masivamente».\n\n«↩ Deshacer: …» revierte solo la ÚLTIMA acción guardada (no es historial completo).\n\nÁrea, longitud y nodo NO se editan en masa (plano SicoeCAD / ClaraLink)."},
  {"tipo": "subtitulo", "contenido": "Plano PK"},
  {"tipo": "texto", "contenido": "Botón 🗺️ en la barra superior abre panel lateral derecho (~480 px). Ya no es un mapa fijo debajo de los filtros.\n\n• Clic en un PK → aplica filtro PK y ejecuta Buscar. Segundo clic en el mismo PK lo quita.\n• Con capítulo activo en filtros, resalta solo los PK de la tabla filtrada.\n\nNo confundir con el «Plano semáforo» del Dashboard (ese compara presupuesto vs cobro)."},
  {"tipo": "subtitulo", "contenido": "Versiones del presupuesto"},
  {"tipo": "texto", "contenido": "Solo en vista «Presupuesto de Obra» → botón «Versiones» (panel lateral derecho).\n\n• Crear versión: nombre obligatorio; justificación técnica (obligatoria salvo la primera).\n• Comparar: marque hasta 3 versiones → «Comparar seleccionadas».\n• Restaurar: cambia cuál es la referencia vigente en el historial.\n• Eliminar: solo versiones no vigentes; descarga respaldo Excel automático.\n\nImportante: «Buscar» y el panel de validación usan el presupuesto vigente en edición, NO snapshots del historial de versiones."},
  {"tipo": "subtitulo", "contenido": "Exportar Excel"},
  {"tipo": "texto", "contenido": "Botón 📥 Excel → ventana «Exportar informe Excel».\n\nRequisitos: haber ejecutado Buscar con filtros activos. Los datos respetan filtros y la vista activa.\n\nPara exportar solo aprobados por interventoría: filtre antes «Estado interventoría = Aprobado».\n\nCon muchos registros (400+ sin cap/ítem) conviene filtrar por capítulo antes."},
  {"tipo": "subtitulo", "contenido": "Pasos frecuentes (orden recomendado)"},
  {"tipo": "texto", "contenido": "1. Filtrar capítulo y tramo: 🔍 Filtros → Filtros libres → ÍTEM + UBICACIÓN → Buscar.\n2. Guardar búsqueda: mismos criterios → Plantillas → nombre → Guardar plantilla.\n3. Validar depuración en bloque: filtrar → marcar filas → Edición masiva → depuración → Editar masivamente.\n4. Validar interventoría: solo filas con depuración Aprobado → masivo → pestaña Interventoría.\n5. Cambiar ítem en bloque: masivo → Capítulo/Ítem.\n6. Cambiar ancho/espesor: masivo → Dimensiones.\n7. Cambiar tipo contractual/ejecutada: masivo → Tipo de ejecución.\n8. Corregir error recién guardado: ↩ Deshacer de inmediato.\n9. Exportar: 📥 Excel después de Buscar.\n10. Ver pendientes de un capítulo: Buscar → panel → clic celda «Pendientes» → grilla."},
  {"tipo": "subtitulo", "contenido": "Problemas frecuentes"},
  {"tipo": "texto", "contenido": "Buscar no trae nada → Pulse Buscar; añada capítulo/tramo/PK; revise vista Presupuesto vs Obra Ejecutada.\n\nPanel vacío → Expanda (▼) y pulse «🔍 Buscar».\n\n«+» no agrega filtro → Debe verse etiqueta; recargue F5 si ve interfaz antigua.\n\nNo ve Edición masiva → Necesita permiso editar o validar en matriz «editar registros presupuesto».\n\nBotón gris → Marque filas con checkbox.\n\nInterventoría bloqueada → Depuración Aprobado primero.\n\nDesaparecieron filas → Cambió tipo distinto a la vista activa.\n\n¿Resumen de validación? → Ahora es el panel fijo Interventoría (expandir con ▼).\n\nCriterios desaparecieron → Cerró sesión ClaraCore; la memoria es por sesión del navegador.\n\nSi su duda no está aquí, contacte al administrador del contrato o pregunte a Clara (asistente flotante)."}
]$json$::jsonb,
    '{}'::integer[],
    true,
    5
)
ON CONFLICT (slug) DO UPDATE SET
    titulo = EXCLUDED.titulo,
    modulo = EXCLUDED.modulo,
    descripcion_corta = EXCLUDED.descripcion_corta,
    bloques = EXCLUDED.bloques,
    publicado = EXCLUDED.publicado,
    orden = EXCLUDED.orden,
    updated_at = NOW();
