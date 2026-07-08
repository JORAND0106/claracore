

### Contexto de esta revisión

Ya elaboraste el documento **`Procedimiento_ClaraCore_v2.0.docx`**. Debes **corregir y reescribir** ese mismo documento aplicando **todas** las observaciones de esta revisión. No generes un documento nuevo desde cero ignorando la estructura existente: **conserva la numeración y capítulos que ya funcionan**, pero amplía, depura y completa según lo indicado abajo.

**Organización destinataria del procedimiento:** **Infinite Ingeniería SAS** (contratista). El documento es un **procedimiento estándar** de la plataforma ClaraCore, aplicable a **cualquier contrato** donde se use el sistema.

---

### REGLA CRÍTICA — Prohibición de referencias contractuales

**NO puede aparecer en ninguna parte del documento** (salvo la excepción única del numeral 7.6.2 indicada más abajo):

- Nombres o códigos de contratos específicos (ejemplos prohibidos: IDU-1551-2017, ICCU-1614-2025, IDU, ICCU, ni variantes).
- Números de contrato, actas nombradas por proyecto, tramos nombrados por obra concreta, ni ejemplos que identifiquen un contrato real.
- Frases del tipo «en el contrato X», «para el proyecto Y», «según el contrato ICCU…».

**Sustituye** cualquier mención así por redacción genérica:

- «el contrato activo en ClaraCore»
- «el contrato seleccionado por el usuario»
- «según la configuración del contrato en administración»
- «el listado de precios del contrato vigente»

Revisa **todo el documento** (portada, pies de página, ejemplos, tablas, glosario, anexos) y elimina rastros contractuales específicos.

---

### REGLA ESPECÍFICA — Niveles de validación (numeral 7.6.2 únicamente)

En **todo el documento**, cuando hables de validación:

- Explica el **concepto genérico** de niveles 1 a 6 como capacidad de la plataforma.
- Indica que **cuántos niveles aplican** y **quién valida en cada uno** se define por **configuración del contrato** en ClaraCore (Administración → niveles de validación), **sin citar contratos concretos**.

**Única excepción permitida:** en el numeral **7.6.2** (y solo ahí) debes referenciar el documento técnico interno:

> **CTO-ICCU-1614-2025**

en el sentido de: *«Para la implementación objeto de este procedimiento, el CTO-ICCU1614-2025 establece que los niveles activos son: 1, 2, 3 y 4»* (no activos 5 ni 6).

En 7.6.2 incluye una **tabla** con los cuatro niveles activos y el rol típico de cada uno (sin nombrar contratos):

| Nivel activo | Denominación en ClaraCore | Rol validador (genérico) |
|--------------|-------------------------|---------------------------|
| 1 | Nivel 1 · Operativo contratista | Inspector de obra / operativo contratista |
| 2 | Nivel 2 · Contratista | Residente de obra / residente de costos |
| 3 | Nivel 3 · Director de obra | Director de obra |
| 4 | Nivel 4 · Residente de interventoría | Residente de interventoría |

Fuera de 7.6.2, **no vuelvas a mencionar** CTO-ICCU1614-2025 ni listes niveles 5 o 6 como activos.

---

### REGLA TRANSVERSAL — Informes y último nivel de validación

En **cada capítulo o submódulo** donde se mencione generación de informes, memorias, PDF, Excel o exportaciones (SICOE Obra, Informes, Dashboard, etc.), debes incluir de forma visible un **recuadro de advertencia** con este sentido (redacta con tus palabras, repetido donde corresponda):

> **Prerrequisito:** La elaboración y descarga de informes y memorias solo incluye cantidades cuyos registros tienen **Aprobado** en el **último nivel de validación activo** configurado para el contrato. Registros pendientes, rechazados o sin validar el último nivel **no** deben figurar en informes oficiales.

Esto aplica a:


- Memorias semanales (CC-SEM-002).
- Memorias mensuales / preacta (CC-MES-002).
- Formatos de entidad contratante (formatos externos configurados).
- Cualquier otro informe del módulo Informes.

---

### REGLA DE DETALLE — Procedimiento paso a paso

El documento debe ser **mucho más detallado** que la versión v2.0 actual. Para **cada** procedimiento:

1. **Objetivo** del procedimiento (1 párrafo).
2. **Perfil / permiso** requerido (ver, crear, editar, validar, exportar).
3. **Prerrequisitos** (sesión iniciada, contrato seleccionado, permisos, datos maestros cargados).
4. **Secuencia numerada** con verbos en imperativo: «Ingrese», «Seleccione», «Pulse», «Verifique», «Espere», «Confirme».
5. **Resultado esperado** al terminar el paso.
6. **Errores frecuentes** y qué hacer (1–3 bullets).
7. **Figura** (contenedor de captura) **como mínimo** al inicio del acceso al módulo y **al menos una** por subproceso importante.

No resumas pasos en un solo párrafo: un paso = una acción concreta del usuario.

---

### REGLA DE IMÁGENES — Contenedores obligatorios

Usa **siempre** este formato para cada espacio de captura (numeración global de figuras):

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [INSERTAR CAPTURA DE PANTALLA — Figura XX]                              │
│  Título: …                                                               │
│  Qué debe verse: … (elementos UI concretos: botones, columnas, tabs)     │
│  Ruta de navegación: ClaraCore > … > …                                   │
│  Notas para quien toma la captura: resolución, contrato de prueba, rol   │
└──────────────────────────────────────────────────────────────────────────┘
```

**Mínimos obligatorios de figuras:**

| Área | Figuras mínimas |
|------|-----------------|
| Acceso general ClaraCore | Login; selección de contrato; menú principal |
| SICOE Obra — acceso | Entrada al módulo desde menú |
| Nuevo Reporte | Cada tab (0–4) + botón enviar |
| Carpeta reporte | Portada, Sin asignar ítem, registro expandido |
| Asignación ítem | Búsqueda ítem + guardar |
| Validación | Botones Aprobado/Pendiente/Rechazado + popup comentario obligatorio |
| Trazabilidad | Modal 📜 |
| Filtros | Modal completo + capas validación |
| Panel dinámico | Vista con grilla + panel vinculado |
| **Módulo Informes — acceso** | **Menú Informes, pantalla principal, biblioteca de formatos** |
| CC-SUB (corte) | Selección corte, vista previa, descarga PDF |
| CC-SEM (semanal) | Selección semana, listado ítems, PDF |
| CC-MES (mensual) | Selección acta RPO, generación |
| Formatos entidad externa | Tarjeta formatos entidad, parámetros, progreso PDF |
| Otros submódulos citados en v2.0 | Al menos 1 figura de acceso + 1 de operación por submódulo |

---

### AMPLIACIÓN OBLIGATORIA — Capítulo / sección de INFORMES

Reescribe y **expande sustancialmente** la parte de generación de informes. Debe quedar como uno de los capítulos más largos del documento. Incluir:

#### A. Acceso al módulo Informes

Paso a paso desde login hasta la pantalla principal del módulo, con figura de:

- Ítem de menú «Informes» (o equivalente en ClaraCore).
- Selector de contrato si aplica.
- Vista general con tarjetas o secciones (Formatos Subcontratista, Semanales, Mensuales, Entidad, etc.).

#### B. Concepto general de informes en ClaraCore

- Qué es un «formato» / plantilla CCD.
- Diferencia entre vista previa, PDF, Excel.
- Firmas Elaboró / Revisó cuando aplique.
- **Prerrequisito de validación último nivel** (recuadro advertencia).

#### C. Informes por corte de subcontratista (memorias CC-SUB-002)

Procedimiento detallado:

1. Expandir tarjeta «Formatos Subcontratista».
2. Seleccionar contrato y **corte** del subcontratista (explicar qué es un corte sin nombrar contratos).
3. Listado de ítems con cantidades elegibles (solo último nivel aprobado).
4. Vista previa por ítem.
5. Generar PDF un ítem / todos los ítems.
6. Exportar Excel si existe.
7. Figuras en cada subpaso.

#### D. Memorias semanales (CC-SEM-002)

Misma profundidad:

1. Acceso tarjeta Formatos Semanales.
2. Selección de **semana de obra**.
3. Criterio de inclusión de registros (validación último nivel + semana).
4. Vista previa y descarga por ítem / consolidado.
5. Figuras.

#### E. Memorias mensuales / preacta (CC-MES-002)

1. Acceso Formatos Mensuales.
2. Selección **acta RPO** del período (concepto genérico de acta, sin contrato nombrado).
3. Generación por ítem y consolidado.
4. Relación con cierre de período.
5. Figuras.

#### F. Formatos de entidad contratante (externos)

1. Acceso sección formatos entidad / contratante.
2. Parámetros: acta, subsistema, supervisor, etc. (genérico).
3. Generación progresiva de PDF, barra de progreso, orientación de fotos si aplica.
4. Sello / firma según configuración.
5. **No nombrar** IDU ni contratos; hablar de «entidad contratante» y «formato configurado».
6. Figuras abundantes.

#### G. Tabla resumen de informes

| Formato | Periodicidad | Parámetro clave | Salidas | Prerrequisito validación |
|---------|--------------|-----------------|---------|--------------------------|
| CC-SEM-002 | Semanal | Semana obra | PDF, Excel | Ídem |
| CC-MES-002 | Mensual | Acta RPO período | PDF, Excel | Ídem |
| Entidad externa | Según acta | Acta + parámetros formato | PDF | Ídem |

---

### AMPLIACIÓN — Resto de módulos y submódulos

Para **cada** submódulo que ya exista en v2.0 (SICOE Obra, Presupuesto si aplica, Topografía, Programación, Dashboard, Administración, etc.):

1. Añadir subsección **«Acceso al módulo»** con pasos y figura.
2. Añadir subsección **«Funcionalidades principales»** con un procedimiento por función.
3. Al menos **2 figuras** por submódulo (acceso + operación representativa).

Si v2.0 mezcla ClaraCAD (AutoCAD) con ClaraCore web, mantén la separación clara:

- **ClaraCore web:** SICOE Obra, Informes, consultas, validación.
- **ClaraCAD:** plugin AutoCAD (si el procedimiento lo incluye para Infinite Ingeniería SAS).

---

### Portada y metadatos del documento

Actualizar portada / control de documento con:

- **Título:** Procedimiento de uso — Plataforma ClaraCore (estándar)
- **Organización:** Infinite Ingeniería SAS
- **Versión:** 2.1 (o la que corresponda tras esta revisión)
- **Alcance:** Procedimiento estándar aplicable a cualquier contrato implementado en ClaraCore
- **Sin** nombres de contratos en portada ni encabezados/pies de página

---

### Checklist de entrega (debes cumplir antes de finalizar)

- [ ] Cero referencias a IDU-1551-2017, ICCU-1614-2025 u otros contratos (excepto CTO en 7.6.2).
- [ ] 7.6.2 cita CTO-ICCU1614-2025 y niveles activos **1, 2, 3, 4** solamente.
- [ ] Infinite Ingeniería SAS como organización destinataria.
- [ ] Capítulo Informes ampliado (mínimo 2× longitud actual estimada).
- [ ] Recuadro prerrequisito «último nivel aprobado» en todos los informes.
- [ ] Figura de acceso al módulo Informes + figuras por tipo de memoria.
- [ ] Todos los submódulos con figuras de acceso y operación.
- [ ] Procedimientos paso a paso con imperativos, sin párrafos únicos que agrupen muchos pasos.
- [ ] Numeración de figuras coherente en todo el documento.
- [ ] Entregar documento corregido en **Word (.docx)** listo para que Infinite Ingeniería SAS inserte las capturas reales.

---

### Formato de salida

Genera el **documento Word corregido completo** (`Procedimiento_ClaraCore_v2.1.docx` o actualiza v2.0) manteniendo estilos profesionales: títulos, numeración, tablas, recuadros de advertencia y contenedores de figura claramente visibles.

Al terminar, incluye un **resumen de cambios** (lista bullet) de lo que corregiste respecto a v2.0.

---

## FIN DEL MENSAJE PARA CLAUDE

---

## Notas para el equipo Infinite Ingeniería SAS

1. Adjunta `Procedimiento_ClaraCore_v2.0.docx` en el mismo chat de Claude.
2. Pega el bloque «MENSAJE PARA CLAUDE» completo.
3. Tras recibir v2.1, recorre el checklist y toma las capturas en un **contrato de capacitación** (sin nombrarlo en el documento).
4. El único documento externo citado en el procedimiento será **CTO-ICCU1614-2025** en el numeral **7.6.2**.
