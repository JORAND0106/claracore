# Prompt para elaborar el Manual de Usuario — Módulo SICOE Obra (ClaraCore)

Copia todo el bloque siguiente y pégalo en Claude (u otro modelo) para que genere el documento final en Word/PDF/HTML.

---

## INSTRUCCIÓN PRINCIPAL

Eres un redactor técnico especializado en obras civiles e interventoría. Debes elaborar un **manual de procedimiento operativo** del módulo **SICOE Obra** de la plataforma web **ClaraCore** (no confundir con el plugin AutoCAD «ClaraCAD», que es un módulo distinto de levantamiento en CAD).

**Audiencia:** inspectores de obra, residentes de costos, directores de obra, personal de interventoría, supervisores de entidad, subcontratistas y administradores de contrato.

**Tono:** instructivo, paso a paso, en español (Colombia). Usa segunda persona («usted») o imperativo («Seleccione…», «Pulse…»).

**Formato de salida:**
- Documento estructurado con numeración jerárquica (1, 1.1, 1.1.1).
- Tablas cuando compare estados, niveles o permisos.
- Listas de verificación al final de cada capítulo grande.
- **En cada paso visual importante**, inserta un contenedor de captura con este formato exacto:

```
┌─────────────────────────────────────────────────────────────┐
│  [INSERTAR CAPTURA DE PANTALLA]                             │
│  Figura X — Descripción breve de lo que debe verse          │
│  Ruta sugerida: Módulo SICOE Obra > … > …                  │
└─────────────────────────────────────────────────────────────┘
```

- No inventes pantallas que no existan; si un detalle no está descrito abajo, indica «[Verificar en despliegue]».

---

## CONTEXTO DEL SISTEMA

**SICOE Obra** es el módulo de **reporte y validación de cantidades ejecutadas** en obra. El flujo general es:

1. **Creación** del reporte de cantidades (campo / subcontratista).
2. **Envío** → deja de ser borrador y entra al circuito de asignación de ítems.
3. **Asignación** de capítulo, competencia e ítem del listado de precios (residente de costos u otros con permiso editar).
4. **Validación** en cadena por niveles 1 a 6 (contratista e interventoría, según contrato).
5. **Bloqueo** del registro al aprobar el último nivel activo del contrato.
6. **Consulta** vía grilla, filtros y panel dinámico.
7. **Informes** (memorias semanales, mensuales y formatos de entidad) una vez validadas las cantidades.

**Permisos:** La matriz de accesos define la función **«Reporte de Cantidades»** con flags: ver, crear, editar, eliminar, validar, exportar. Los permisos aplican **por contrato**.

---

## CAPÍTULO 1 — CONCEPTOS FUNDAMENTALES

### 1.1 ¿Qué es un **Reporte**?

Un **reporte** (reporte de cantidades) es la **carpeta o cabecera** que agrupa un conjunto de mediciones de una actividad en obra. Equivale conceptualmente a un «expediente» con:

- Número consecutivo de reporte (por contrato).
- Descripción de la actividad.
- Subcontratista, inspector de obra, capítulo de obra.
- Localización (PK, tramo, calzada, abscisas, nodos, coordenadas GPS según tipo única o múltiple).
- Puntos topográficos de portada (opcional pero relevante para validación Nivel 2).
- Enlaces de soporte (fotos, documentos).
- **Estado de cabecera** del reporte: Borrador, Sin Asignar Ítem, No Revisados, No Objeto de Cobro, En Papelera.
- Lista de **registros** (líneas de cantidad).

Documentar con diagrama: `Reporte #N` → contiene → `Registro #1, #2, … #n`.

### 1.2 ¿Qué es un **Registro**?

Un **registro** es cada **línea de cantidad** dentro del reporte. Contiene:

- Número consecutivo de registro (por contrato).
- Dimensiones: longitud, ancho, espesor, cantidad (al menos una obligatoria).
- Cantidad total calculada y costo directo (tras asignar ítem).
- Capítulo, competencia, ítem, descripción, unidad, valor unitario (tras asignación).
- Localización por registro (si el reporte es tipo localización **múltiple**).
- Foto y gráfico de soporte.
- Observación.
- Estados de validación por nivel (1–6) y validación subcontratista.
- Comentarios de validación.
- Indicador de **bloqueado** cuando el último nivel activo quedó Aprobado.

### 1.3 Relación Reporte ↔ Registro ↔ Ítem

- Un reporte puede tener **varios registros**.
- Cada registro debe tener **un ítem** del listado de precios para entrar al circuito de validación avanzada.
- El reporte pasa a **«Sin Asignar Ítem»** si queda al menos un registro sin ítem; pasa a **«No Revisados»** cuando todos tienen ítem.

---

## CAPÍTULO 2 — CREACIÓN DEL REPORTE (NUEVO REPORTE)

### 2.1 ¿Quién puede crear?

Usuarios con permiso **«Reporte de Cantidades» → crear** en el contrato activo (típicamente subcontratista u operativo de campo). El botón **«+ Nuevo Reporte»** solo aparece si tiene ese permiso.

Documentar matriz de permisos mínima para creación.

### 2.2 Acceso al asistente

Ruta: **Módulo SICOE Obra** → botón **«+ Nuevo Reporte»** → asistente modal con pestañas secuenciales (no se puede saltar hacia adelante sin completar la anterior).

Estados iniciales: el reporte se guarda como **Borrador** hasta envío final.

### 2.3 Pestaña 0 — **Info General**

Campos obligatorios a documentar:

| Campo | Descripción |
|-------|-------------|
| Descripción actividad | Nombre claro de la actividad medida |
| Subcontratista | Búsqueda en listado de subcontratistas activos del contrato |
| Inspector de obra | Usuario inspector asignado |
| Capítulo | Capítulo del listado de precios del contrato |

Incluir captura del tab y validaciones de error.

### 2.4 Pestaña 1 — **Plantilla**

- Permite elegir una **plantilla** predefinida de ítems para precargar registros.
- Opción de crear plantilla nueva (nombre + ítems).
- Si no usa plantilla, puede definir registros manualmente en pestaña Registros.

### 2.5 Pestaña 2 — **Localización**

- **Tipo de localización:** Única (toda la portada comparte PK/abscisas) o **Múltiple** (cada registro puede tener PK/abscisas distintas).
- Campos: PK_ID, margen, abscisa inicio/fin, nodo inicio/fin, coordenadas en mapa (clic en plano GeoJSON del contrato).
- En modo múltiple: concepto de **lotes de localización** y botón para nuevo lote.

### 2.6 Pestaña 3 — **Registros**

- Alta de líneas en blanco antes del envío (observación, dimensiones preliminares).
- Asociación a lote de localización en modo múltiple.
- Galería de gráficos por lote (opcional).
- Los ítems **no** se asignan aquí en la mayoría de flujos; eso ocurre después del envío por personal con permiso **editar**.

### 2.7 Pestaña 4 — **Topografía**

- Tabla de puntos: Punto, Norte, Este, Cota, Descripción.
- Enlace de soporte topográfico (URL).
- Importancia: coordenadas de portada requeridas para **aprobar Nivel 2** (residente/interventoría según reglas).

### 2.8 Guardar borrador y **Enviar reporte**

- **Guardar borrador:** persiste sin salir del circuito de edición.
- **Enviar / Finalizar:** cambia estado del reporte; deja de ser Borrador; notifica al flujo de asignación.
- Documentar mensajes de error de red y buenas prácticas (Wi‑Fi, no cerrar ventana durante guardado).

Incluir checklist post-envío.

---

## CAPÍTULO 3 — CARPETA DEL REPORTE (VISTA POST-ENVÍO)

### 3.1 Apertura desde la grilla

Al hacer clic en un reporte de la grilla se abre la **Carpeta** (modal de detalle) con:

- Cabecera: número, descripción, capítulo, subcontratista, fechas, estado.
- Pestañas internas dinámicas.

### 3.2 Pestañas de la carpeta

Documentar cada una:

| Pestaña | Contenido |
|---------|-----------|
| **Portada** | Resumen por estado de validación del nivel del usuario; edición de cabecera; mapa; puntos topográficos; validación masiva desde portada (perfiles autorizados); enlaces de soporte |
| **Sin Asignar Ítem** | Registros sin `item_numero`; aquí o en hoja expandida se asigna ítem |
| **Una pestaña por ítem** | Agrupa registros ya asignados al mismo código de ítem |
| **Soportes / edición** | Según permisos |

### 3.3 Hoja de registro (expandida)

Al expandir un registro, documentar campos editables:

- Capítulo → Competencia → Ítem (búsqueda en listado de precios).
- Longitud, ancho, espesor, cantidad (al menos una).
- Observación.
- Localización (si aplica).
- Foto / gráfico.
- Botones de validación según nivel del usuario.
- Botón **Trazabilidad** (📜).
- Botón **Comentarios** (💬).
- Eliminar registro (solo permiso eliminar o desarrollador).

---

## CAPÍTULO 4 — ASIGNACIÓN DE ÍTEM

### 4.1 Perfil responsable

Usuarios con permiso **«Reporte de Cantidades» → editar** (p. ej. residente de costos). El subcontratista que creó el reporte **no** asigna ítem si no tiene permiso editar.

### 4.2 Procedimiento paso a paso

1. Abrir carpeta del reporte en estado **Sin Asignar Ítem** o pestaña del registro sin ítem.
2. Expandir registro.
3. Seleccionar **Capítulo** (si difiere del reporte).
4. Seleccionar **Competencia** (IDU, EAB, subcontratista, etc.).
5. Buscar y seleccionar **Ítem** del listado (autocompletado).
6. Completar dimensiones si faltan.
7. Pulsar **Guardar** / asignar.

### 4.3 Efectos al guardar

- El sistema asocia acta RPO vigente, semana activa y corte del subcontratista cuando aplica.
- Calcula cantidad total y costo directo.
- Actualiza estado del reporte (Sin Asignar Ítem ↔ No Revisados).
- El registro queda listo para validación Nivel 1.

Documentar restricción: no reasignar ítem si el registro está **aprobado en el último nivel activo**.

---

## CAPÍTULO 5 — VALIDACIÓN POR NIVELES

### 5.1 Estados posibles por nivel

| Estado | Significado operativo |
|--------|----------------------|
| **No Revisado** | Aún no actuó el validador de ese nivel |
| **Aprobado** | Cantidad aceptada en ese nivel |
| **Pendiente** | Observación que requiere corrección sin rechazar definitivamente |
| **Rechazado** | No aceptado; requiere corrección o re-medición |
| **No Objeto de Cobro** | Variante en nivel subcontratista / N2 según reglas |

### 5.2 Cadena de niveles (referencia ClaraCore)

Los niveles activos se configuran **por contrato** (típicamente 1–3 o hasta 6). Encabezados estándar:

| Nivel | Rol típico |
|-------|------------|
| **N1** | Nivel 1 · Operativo contratista (Inspector de obra) |
| **N2** | Nivel 2 · Contratista (Residente de obra / costos) |
| **N3** | Nivel 3 · Director de obra |
| **N4** | Nivel 4 · Residente de interventoría |
| **N5** | Nivel 5 · Director de interventoría |
| **N6** | Nivel 6 · Supervisor entidad |

**Regla de cadena:** para validar en nivel N, el nivel N−1 debe estar **Aprobado** (salvo perfiles con elevación de permisos: desarrollador / administrador del contrato).

### 5.3 Procedimiento de validación (un registro)

1. El validador abre el registro en su nivel.
2. Revisa dimensiones, ítem, soportes, topografía (N2).
3. Elige: Aprobado / Pendiente / Rechazado (botones de acción).
4. Si elige **Pendiente** o **Rechazado** → **comentario obligatorio** (popup de validación).
5. El comentario queda en el hilo del registro y en auditoría.
6. Perfiles solo-comentarista (operativo interventoría) pueden comentar sin cambiar estado.

### 5.4 Validación masiva

Desde **Portada** o **grilla** (panel de validación masiva): seleccionar varios registros elegibles y aplicar mismo estado. Documentar prerequisitos (ítem asignado, nivel previo aprobado, topografía en N2 si aplica).

### 5.5 Reversión (doble llave)

Documentar flujo de **solicitud de reversión** en niveles superiores (N3/N4) cuando un registro ya aprobado debe corregirse: doble autorización, comentarios obligatorios, filtro «Reversión» en grilla para interventoría.

---

## CAPÍTULO 6 — BLOQUEO DEL REGISTRO

Cuando el registro recibe **Aprobado** en el **último nivel de validación activo** del contrato:

- El registro queda **sellado / bloqueado**.
- No se pueden editar dimensiones, ítem, foto ni localización (salvo excepciones de reversión autorizada).
- Puede seguir siendo visible en consultas e informes.

Documentar cómo el usuario identifica visualmente un registro bloqueado en la hoja.

---

## CAPÍTULO 7 — TRAZABILIDAD Y LOGS

### 7.1 Botón Trazabilidad (📜)

En cada fila de registro → abre modal con historial de auditoría:

- Acciones: crear, editar, asignar ítem, validar, eliminar, comentarios.
- Usuario, fecha, valores anterior/nuevo.
- Severidad y alertas cuando aplica.

### 7.2 Comentarios (💬)

Hilo de conversación por registro; visible según destinatarios y rol. Relacionar con validación Pendiente/Rechazado.

### 7.3 Logs de plataforma

Mencionar que administrador/desarrollador puede consultar logs centralizados; el usuario de obra usa trazabilidad por registro.

---

## CAPÍTULO 8 — INFORMES Y MEMORIAS (MÓDULO INFORMES)

**Prerrequisito:** cantidades con validación suficiente según cada formato (registros aprobados en niveles requeridos, acta RPO / semana / corte según corresponda).

### 8.1 Memorias por **corte de subcontratista** (CC-SUB-002)

Ruta: **Informes** → Formatos Subcontratista → CC-SUB-002.

1. Seleccionar contrato y **corte** del subcontratista.
2. Vista previa por ítem o **todos los ítems**.
3. Generar PDF o Excel.
4. Configurar firmas Elaboró / Revisó.

### 8.2 Memorias **semanales** (CC-SEM-002)

Ruta: **Informes** → Formatos Semanales.

1. Seleccionar **semana** de obra.
2. Listado de ítems con cantidades validadas en esa semana.
3. Generar memoria por ítem o consolidada.
4. Mismo patrón de vista previa y descarga PDF/Excel.

### 8.3 Memorias **mensuales** / preacta (CC-MES-002)

Ruta: **Informes** → Formatos Mensuales (acta RPO).

1. Seleccionar **acta RPO** del período.
2. Generar memorias por ítem o todas.
3. Relación con cierre de mes / facturación.

### 8.4 Formatos **entidad externa** (ej. IDU FO-EO-04)

Ruta: **Informes** → Formatos Entidad / FO-EO-04.

1. Seleccionar acta RPO y subsistema (vial, etc.).
2. Supervisor de entidad.
3. Generación progresiva de PDF con fotos del acta.
4. Orientación de imágenes si aplica.
5. Sello / firma digital según configuración.

Documentar cada flujo con capturas y tiempos de espera en generación.

---

## CAPÍTULO 9 — CONSULTA: FILTROS Y PANEL DINÁMICO

### 9.1 Modal de **Filtros**

Acceso: barra de SICOE Obra → **Filtros** → modal con categorías:

| Categoría | Criterios principales |
|-----------|----------------------|
| Fechas y usuario | Rango fechas creación/modificación; usuario que creó/modificó |
| Reporte | N° reporte, N° registro, semana, acta RPO, subcontratista, estado reporte |
| Ítem | Capítulo, ítem (multi con AND/OR), etiqueta validación |
| Ubicación | Tramo, calzada, abscisa, PK en mapa |
| Valores | Rango cantidad y costo directo por línea |
| Validación | Capas: nivel + estado (No revisado, Pendiente, Rechazado); operador AND/OR |
| Otros | Observación, nodo, cargo |

**Plantillas de filtro:** guardar, cargar y eliminar combinaciones frecuentes.

Procedimiento consulta:

1. Abrir filtros.
2. Definir criterios (mínimo uno).
3. Pulsar **Buscar**.
4. La **grilla** muestra reportes coincidentes (paginación «Cargar 50 más»).
5. El **panel dinámico** se actualiza con los mismos criterios.

### 9.2 **Panel dinámico** (KPI / análisis)

Ubicación: lateral o inferior según diseño; muestra agregados según filtros activos.

Modos de navegación documentar:

- **General:** totales por capítulo o acta.
- **Capítulo → ítems:** drill-down al elegir capítulo.
- **Detalle ítem:** cantidades y costos del ítem filtrado.
- **Acta / semana:** vista por período RPO.

Interacción:

- Clic en barra o fila del panel **aplica** ese criterio a la grilla (sin borrar otros filtros salvo navegación «Volver»).
- Casillas de selección múltiple en panel para filtrar varios capítulos/actas.
- Botón **Volver** deshace un nivel de drill-down.

### 9.3 Apertura de reporte desde consulta

- Clic en fila de grilla → carpeta del reporte.
- Si filtró por N° registro y hay un solo resultado → apertura automática resaltando el registro.
- Indicador «vista filtrada» cuando la carpeta muestra solo líneas que coinciden con filtros.

### 9.4 Exportar registros

Documentar exportación Excel desde grilla con filtros activos.

---

## CAPÍTULO 10 — ESTADOS DEL REPORTE (RESUMEN)

Tabla resumen estado cabecera vs qué puede hacer el usuario.

| Estado | Significado |
|--------|-------------|
| Borrador | Solo creador; edición en asistente nuevo reporte |
| Sin Asignar Ítem | Falta asignar ítem en al menos un registro |
| No Revisados | Todos con ítem; en cola de validación |
| No Objeto de Cobro | Reporte excluido de cobro |
| En Papelera | Eliminación lógica |

---

## CAPÍTULO 11 — ANEXOS

- Glosario (PK_ID, abscisa, competencia, acta RPO, corte, semana de obra).
- Preguntas frecuentes (Failed to fetch, registro no visible, no puedo aprobar N2 sin topografía).
- Matriz rol → nivel de validación (referencia).
- Lista de chequeo diaria para residente de costos.
- Lista de chequeo semanal para interventoría.

---

## ENTREGABLES QUE DEBES PRODUCIR

1. Manual completo (40–80 páginas equivalentes) con figuras placeholder.
2. Índice navegable.
3. Una página de «Inicio rápido» (1 página) con los 10 pasos más comunes.
4. Versión corta «Tarjeta de bolsillo» (2 páginas) para subcontratistas.

**No omitas ningún capítulo numerado arriba.** Expande cada subsección con procedimiento paso a paso, advertencias, errores comunes y referencias cruzadas entre creación → asignación → validación → informes → consulta.
