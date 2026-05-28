-- Guía pública: Programación de Obra (manual de usuario en módulo Guías).
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
    'Programación de Obra',
    'programacion-de-obra',
    'Programación de Obra',
    'Cronograma de ejecución por PK en el mapa: agrupadores WBS, versiones, dependencias, CPM, validación y sellado.',
    $json$[
  {"tipo": "texto", "contenido": "Esta guía explica paso a paso el módulo Programación de Obra de ClaraCore: cómo armar el cronograma de ejecución haciendo clic sobre los polígonos del mapa (PK), qué significan los colores, cómo crear versiones baseline y reprogramaciones, y qué hacer cuando aparece una alerta."},
  {"tipo": "subtitulo", "contenido": "¿Para qué sirve?"},
  {"tipo": "texto", "contenido": "Programación de Obra permite crear y gestionar el cronograma de ejecución de un contrato de obra vial, integrado con el plano georreferenciado del contrato. Usted programa haciendo clic sobre los polígonos del mapa (sectores PK), no ítem por ítem suelto en una tabla."},
  {"tipo": "subtitulo", "contenido": "Pantalla principal"},
  {"tipo": "texto", "contenido": "Menú lateral → Programación de Obra.\n\n• Mapa central: polígonos PK del contrato; el color indica el avance de la programación.\n• Panel lateral derecho: versión activa, resumen del PK seleccionado, botón «+ Nueva versión», historial de versiones, envío a validación y vista Gantt.\n• Modal «Abrir programación»: al trabajar fechas, dependencias y análisis de ruta crítica (CPM) por PK."},
  {"tipo": "subtitulo", "contenido": "Conceptos clave"},
  {"tipo": "texto", "contenido": "PK (polígono): cada sector del proyecto es un polígono en el mapa con ítems de presupuesto asociados. Gris oscuro = tiene cantidades pero aún sin programar.\n\nAgrupador WBS: agrupa varios ítems bajo un nombre de actividad (ej. «Capas Granulares» = ítems 2.1, 2.2, 2.3). La programación se hace por agrupador, no ítem a ítem. Se crean en Panel de Administración → Listado de Precios → vista «Programación WBS». Sin agrupador, el ítem muestra alerta ⚠ y el PK no puede quedar completo al 100%.\n\nVersión del cronograma: todo cronograma vive en una versión numerada. Tipos: baseline (primera oficial), reprogramación (ajuste posterior), suspensión. Estados: borrador, en validación, sellada (inmutable), archivada. El selector muestra, por ejemplo: «nº1 · baseline · borrador».\n\nDependencias: relaciones entre agrupadores que definen el orden de ejecución. Tipos: FS (Fin a Inicio — lo más común), SS (Inicio a Inicio), FF (Fin a Fin), SF (Inicio a Fin). Días de lag = espera entre fin del origen e inicio del destino (0 = empieza de inmediato).\n\nCPM (ruta crítica): análisis que indica qué actividades no pueden retrasarse sin afectar la fecha de entrega. Holgura 0 = ruta crítica (⚠). Si es la última actividad de la cadena = actividad final del tramo (🏁). Barras rojas en el Gantt = ruta crítica.\n\nDías hábiles: días de trabajo real; excluye sábados, domingos y festivos colombianos. Al escribir duración en días hábiles, la fecha fin se calcula sola.\n\nBaseline: primera versión sellada y aprobada; referencia oficial que no cambia. Las reprogramaciones se comparan contra el baseline (bordes naranjas en mapa, pestaña «Comparar vs baseline» en el modal)."},
  {"tipo": "subtitulo", "contenido": "Paso 1 — Configurar agrupadores WBS (obligatorio)"},
  {"tipo": "texto", "contenido": "Antes de programar, todos los ítems deben tener agrupador WBS.\n\n1. Panel de Administración (⚙ en barra superior) → Listado de Precios.\n2. Cambiar a vista «Programación WBS».\n3. Por cada capítulo: «+ Agrupador» → nombre (ej. «Capas Granulares») → marcar ítems → «Crear».\n4. Repetir hasta que no queden ítems con alerta ⚠ sin agrupador."},
  {"tipo": "subtitulo", "contenido": "Paso 2 — Crear versión baseline"},
  {"tipo": "texto", "contenido": "1. Menú lateral → Programación de Obra.\n2. Panel derecho → «+ Nueva versión».\n3. Se crea automáticamente como baseline (primera versión).\n4. El selector muestra «nº1 · baseline · borrador»."},
  {"tipo": "subtitulo", "contenido": "Paso 3 — Programar un sector (PK)"},
  {"tipo": "texto", "contenido": "1. Clic en polígono gris oscuro en el mapa (tiene cantidades, sin programar).\n2. Panel derecho: resumen del PK → «Abrir programación».\n3. En el modal, por cada agrupador: fecha inicio (dd/mm/aaaa), días hábiles de duración; la fecha fin se calcula automáticamente.\n4. «Guardar cambios».\n5. Color del polígono: amarillo = parcialmente programado; azul = completamente programado.\n\nConsejo: con el modal abierto puede usar «+ Agregar PK (clic en el mapa)» para programar varios PK a la vez."},
  {"tipo": "subtitulo", "contenido": "Paso 4 — Definir dependencias (opcional, recomendado)"},
  {"tipo": "texto", "contenido": "1. En el modal → pestaña «Dependencias».\n2. «Dependencias por Agrupador»: Agrupador Origen → Tipo (generalmente FS) → Días lag → Agrupador Destino.\n3. «+ Agregar»; repetir para toda la cadena de actividades."},
  {"tipo": "subtitulo", "contenido": "Paso 5 — Calcular CPM"},
  {"tipo": "texto", "contenido": "1. Pestaña «Dependencias» → «Calcular CPM».\n2. Tabla: Agrupador, Inicio temprano, Fin temprano, Holgura, Estado.\n3. ⚠ = ruta crítica; 🏁 = actividad final del tramo.\n4. Gantt: barras rojas = ruta crítica.\n\nSi aparece «CPM desactualizado», vuelva a pulsar «Calcular CPM»."},
  {"tipo": "subtitulo", "contenido": "Paso 6 — Enviar a validación"},
  {"tipo": "texto", "contenido": "Prerequisitos: presupuesto completamente aprobado por interventoría; PKs con fechas donde corresponda.\n\n1. Panel lateral → ícono enviar a validación.\n2. El sistema verifica PKs sin fecha y presupuesto aprobado.\n3. Si todo está correcto → estado «en validación».\n4. Los niveles del contrato aprueban secuencialmente.\n5. Al aprobar el último nivel → versión «sellada» (inmutable)."},
  {"tipo": "subtitulo", "contenido": "Paso 7 — Reprogramar"},
  {"tipo": "texto", "contenido": "Cuando hay cambios después de una versión sellada:\n\n1. Historial de versiones → «+ Nueva versión».\n2. Tipo «Reprogramación» + motivo obligatorio.\n3. Clona la versión anterior; modifique solo lo que cambió.\n4. Mismo flujo de validación; al sellarse reemplaza la anterior como vigente."},
  {"tipo": "subtitulo", "contenido": "Colores del mapa"},
  {"tipo": "texto", "contenido": "• Gris tenue: sin cantidades en presupuesto.\n• Gris oscuro: tiene cantidades pero sin programar.\n• Amarillo: parcialmente programado.\n• Azul: completamente programado.\n• Borde rojo pulsante: ruta crítica activa.\n• Borde naranja: desviación vs baseline."},
  {"tipo": "subtitulo", "contenido": "Alertas comunes"},
  {"tipo": "texto", "contenido": "«Este tramo tiene X ítems sin agrupador WBS» → Admin → Listado de Precios → Programación WBS → crear agrupadores.\n\n«CPM desactualizado» → Modal → Dependencias → «Calcular CPM».\n\n«El presupuesto tiene X ítems pendientes de aprobación» → Interventoría debe aprobar todo el presupuesto antes de enviar a validación.\n\n«Borrador en progreso — X% programado» → Normal; el porcentaje = ítems con fecha asignada.\n\nPolígono no cambia de color tras guardar → Verificar agrupadores WBS en todos los ítems del PK; sin ellos nunca llega a «completo»."},
  {"tipo": "subtitulo", "contenido": "Preguntas frecuentes"},
  {"tipo": "texto", "contenido": "¿Programar sin dependencias? Sí; son opcionales. Sin dependencias el CPM no calcula pero las fechas funcionan.\n\n¿Error en una fecha? En borrador: abra el modal del PK, corrija y guarde.\n\n¿Varios PK a la vez? Sí: modal abierto → «+ Agregar PK (clic en el mapa)».\n\n¿Ver cronogramas anteriores? Panel lateral → «Historial de versiones» (solo lectura).\n\n¿Cómo sé si voy bien o mal vs plan original? Bordes naranjas en mapa; pestaña «Comparar vs baseline» en el modal.\n\n¿Versión de programación vs versión de presupuesto? Son módulos distintos; no los confunda."},
  {"tipo": "subtitulo", "contenido": "Relación con otros módulos"},
  {"tipo": "texto", "contenido": "• Presupuesto: cantidades y aprobación de interventoría deben estar listas antes de sellar el cronograma.\n• Listado de precios (Admin): único lugar para crear agrupadores WBS.\n• Dashboard / Plano semáforo: otros mapas; no confundir con el mapa de Programación de Obra.\n\nSi su duda no está cubierta aquí, contacte al administrador del contrato o al equipo de soporte ClaraCore."}
]$json$::jsonb,
    '{}'::integer[],
    true,
    10
)
ON CONFLICT (slug) DO UPDATE SET
    titulo = EXCLUDED.titulo,
    modulo = EXCLUDED.modulo,
    descripcion_corta = EXCLUDED.descripcion_corta,
    bloques = EXCLUDED.bloques,
    publicado = EXCLUDED.publicado,
    orden = EXCLUDED.orden,
    updated_at = NOW();
