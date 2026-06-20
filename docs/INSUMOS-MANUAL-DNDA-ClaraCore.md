# Insumos técnicos para manual de usuario ClaraCore (base registro DNDA)

**Documento:** referencia técnica y funcional de la plataforma ClaraCore.  
**Alcance:** descripción fiel a la arquitectura y código del repositorio analizado (frontend `frontend/`, API `backend/main.py`, módulos auxiliares `backend/*.py`, scripts SQL `backend/sql/`).  
**Nota metodológica:** la aplicación no usa React Router; la navegación entre módulos es por estado (`moduloActivo` en `App.jsx`). Las tablas y políticas exactas de Supabase/Postgres se documentan según uso en código; el despliegue puede incluir scripts SQL adicionales no versionados.

---

## 1. Inventario de módulos y funcionalidades

### 1.1 Autenticación y gestión de sesión

**Propósito:** identificar al usuario, emitir y renovar tokens de acceso, cerrar sesión y soportar recuperación de contraseña con gobierno administrativo.

**Funcionalidades**

- Inicio de sesión (`POST /auth/login`): autenticación contra backend; registro de eventos en el sistema de logs; protección por umbral de intentos fallidos (alerta de sistema tras múltiples fallos en ventana temporal).
- Renovación de token (`POST /auth/refresh`): continuidad de sesión sin nuevo login completo.
- Cierre de sesión (`POST /auth/logout`): invalidación del lado servidor según implementación actual.
- Flujo de restablecimiento: solicitud (`POST /auth/solicitar-reset`), comprobación de autorización (`GET /auth/reset-autorizado`), cambio con contraseña temporal (`POST /auth/cambiar-password-temporal`); bandeja administrativa de solicitudes (`GET /admin/reset-requests`, `PUT /admin/reset-requests/{id}/autorizar`).
- Aceptación de políticas de confidencialidad (`POST /usuarios/me/politicas-aceptar`) con versión cacheable en servidor (`POLITICAS_VERSION`, `POLITICAS_CACHE_TTL_SECONDS`).
- Modo mantenimiento: lectura y activación controlada (`GET/POST /mantenimiento`) con secreto de mantenimiento.

**Flujos y estados**

- Usuario **pendiente de aprobación** → administración aprueba o rechaza (`/admin/usuarios/...`).
- Sesión **activa** (JWT) → **refresh** → posible **logout** o **expiración**.
- Recuperación: **solicitud** → (opcional) **autorización admin** → **cambio de password**.

**Reglas de negocio**

- Tokens firmados con clave de aplicación (`SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`).
- Eventos de login fallido pueden generar alertas en log de sistema (categoría distinta de auditoría de usuario).

**Integraciones**

- Todos los módulos consumen la misma sesión (cabecera `Authorization`).
- Panel de administración y logs correlacionan acciones con `usuario_id` del token.

---

### 1.2 Gestión de usuarios, roles y cargos

**Propósito:** gobierno de identidades, asignación a contratos, matriz de permisos por **función** y **cargo**, y perfiles operativos (foto, firma, datos personales).

**Funcionalidades**

- Registro público controlado (`POST /usuarios/registro`) y aprobación/rechazo administrativo.
- Perfil del usuario autenticado: lectura (`GET /usuarios/me`), actualización (`PUT /usuarios/me`), foto de perfil y firma (subida/eliminación en almacenamiento Supabase/Cloudinary según rutas implementadas).
- Listados administrativos: usuarios pendientes, todos los usuarios, asignación usuario–contrato (`/admin/usuario-contratos`), edición de usuario.
- Catálogos: `GET /cargos`, `GET /roles`, `GET /categorias`, `GET /funciones`.
- Matriz de permisos: `GET /admin/permisos/{cargo_id}`, `POST /admin/permisos`; creación/eliminación de cargos (`POST/DELETE /admin/cargos`).
- Verificación de inactividad (`POST /admin/verificar-inactividad`) con registro en auditoría.

**Flujos y estados**

- Usuario nuevo → **pendiente** → **aprobado** / **rechazado**.
- Cargo con conjunto de permisos **ver / crear / editar / eliminar / validar / exportar** por cada **función** del sistema (ver matriz en Admin).

**Reglas de negocio**

- **Desarrollador** y **Administrador** tienen reglas especiales en código (por nombre de cargo en minúsculas): p. ej. auditoría de logs amplia para ambos; solo **Desarrollador** para rutas marcadas `require_solo_desarrollador`; **Administrador** puede tener elevación de validación SICOE N1–N3 limitada a su contrato (lógica en `determinarNivelValidacion` en `App.jsx`).
- Acceso a contrato: comprobación central `_require_contract_access` en API.

**Integraciones**

- Permisos condicionan SICOE Web, Presupuesto, Programación de obra, Informes, etc.
- Programación de obra usa función con nombre canónico **«programación de obra»** (coincidencia insensible a mayúsculas) en tabla `funciones` y columnas booleanas en `permisos`.

---

### 1.3 Módulo de Presupuesto (incl. integración SicoeCAD)

**Propósito:** gestión del presupuesto por contrato (ítems, capítulos, PK, cantidades, estados, análisis y operaciones masivas), visualización cartográfica por PK y trazabilidad con herramientas CAD externas.

**Funcionalidades principales (API representativa)**

- Carga y consulta: `GET /presupuesto/{contrato_id}`, conteos, filtros, resumen, capítulos, maestro ubicación PK, lista de ítems, detalle `GET /presupuesto/item/{item_id}`.
- Edición de ítem: `PUT /presupuesto/item/{item_id}`, baja y restauración.
- Cantidades agregadas y masivos: `POST .../agregar-cantidad`, `POST .../bulk`, `POST .../bulk-validar`, `PUT .../bulk-recalcular`, `PUT .../bulk-estado`, `PUT .../bulk-pre-interv`.
- Análisis liquidación y reportes de exportación asíncronos (`/exportar/estado`, `/exportar/descargar`).
- Comentarios por lote y resúmenes de validación por capítulo.
- **SicoeCAD:** sincronización masiva con cabecera `X-SicoeCAD-Enviados`; auditoría `GET/POST .../sincro-sicoe-cad-auditoria` y confirmación `ack`.
- **Cola CAD:** `POST /cad-queue/{contrato_id}/heartbeat`, consultas `estado`, `pendientes`, `debug`, resaltado y zoom por PK (`highlight-registro`, `zoom-pkid`), cierre `PUT .../procesado`.

**Reglas de negocio**

- Tipo de ejecución **«Presupuesto de Obra»** (`PRESUPUESTO_TIPO_POLIGONO`) es el criterio para alinear polígonos de presupuesto con programación de obra y validaciones de cantidad por segmento.
- Operaciones masivas y validaciones generan entradas en el sistema de **logs** (`registrar_log`).

**Flujos**

- Importación/ajuste masivo → validación/recálculo → estados consolidados.
- Operador en SicoeCAD envía lotes → API registra auditoría → UI puede reconocer y ack.

**Integraciones**

- **ClaraLink** (esquemas URI `claralink://insertar`, `claralink://highlight`, `claralink://zoom`): comunicación desde el navegador hacia el entorno CAD para insertar bloques de validación, resaltar y acercar vista a `pk_id`.
- **Mapa PK** en presupuesto (`PptoFiltroMapaPk.jsx`): Mapbox + datos de contrato; caché GeoJSON (`contratoPlanoGeojsonCache.js`) y saneamiento (`geoPlanoSanitize.js`).
- **Listado de precios** del contrato (`/listado-precios/...`) como insumo de precios unitarios.

---

### 1.4 Módulo SICOE Web — Registro y validación de obra ejecutada

**Propósito:** registro fotográfico y documental de obra (reportes, registros, semanas, actas RPO), validación multinivel configurable por contrato, comentarios, reversiones controladas y modo offline.

**Funcionalidades (superficie API bajo `/sicoe-obra/{contrato_id}/...`)**

- Catálogo y datos de apoyo: reportes, registros en bulk, pack offline, PK IDs, subcontratistas activos, inspectores, capítulos, nodos, cargos de validación, filtros (semanas, actas, capítulos, ítems, tramos costados), búsqueda de reportes.
- CRUD de reportes y registros; movimiento entre reportes; reemplazo masivo de registros; puntos topográficos.
- Carga de medios: fotos y gráficos (endpoints `next-foto`, `upload-foto`, análogos para gráficos, galería).
- Dimensiones y asignación de ítems desde listado de precios; integración con acta RPO vigente.
- **Validación por niveles** 1–6 (endpoints dedicados por nivel), validación subcontratista, validación masiva con preview y confirmación.
- **Dashboard** operativo: resumen, matriz de validación, drill-down, tabla por PK, export por capítulo, detalle PK.
- **Reversión N3 doble llave:** endpoint dedicado; UI con dos autorizaciones (N2 y N3) vía comentarios con destinatarios.
- Comentarios en hilo sobre registros.
- Análisis agregado de registros; reconciliación histórica acta RPO.
- Reportes masivos con delta de dashboard (preview + confirmar).

**Flujos y estados (validación)**

- Estados por nivel en columnas de `so_registros` (p. ej. campos de estado N1… según configuración); matriz de «capas» de validación por cargo.
- Secuencia de niveles activos del contrato (`contrato_niveles_validacion` / `niveles_activos`); prerequisitos: nivel anterior aprobado antes de validar el siguiente (lógica cliente + verificación servidor en rutas de validación).
- Estados semánticos en UI incluyen: Aprobado, Pendiente, Rechazado, No Objeto de Cobro, Mensaje, Comentario, ReversionN3 (paleta `COLOR_ESTADO` en `App.jsx`).
- **Sellado** conceptual: registro con máximo nivel activo aprobado según función `sicoeRegistroSelladoMaxActivo`.

**Reglas de negocio**

- Validación masiva condicionada a capas compatibles (`sicoeCapasPermitenValidacionMasiva`, serialización de capas).
- Cobro vs liquidación: agregaciones sobre `so_registros` y tablas de cobro en análisis de presupuesto/liquidación.

**Integraciones**

- **ClaraLink** `claralink://zoom` desde registros para sincronía con DWG.
- **Offline:** `GET .../offline-pack`, `POST .../reportes-offline`, motor IndexedDB (Dexie) en frontend, contexto `OfflineProvider`.
- **Notificaciones** al rechazar programación u otros eventos (ver módulo buzón).
- **Informes** y **Dashboard** global leen los mismos agregados SICOE.

---

### 1.5 Módulo de Cobro

**Propósito:** vincular ejecución validada con actas de cobro (RPO), movilizar registros entre actas y mantener consistencia con precios aprobados.

**Funcionalidades**

- Actas de tipo cobro (`es_cobro` en tipos de acta): creación/edición; traslado de `so_registros` entre actas cumpliendo reglas de aprobación N3.
- Tabla `cobro` y recálculo: endpoint de recálculo de cobros ligado a aprobación de precio (`recalcular_cobros_precio`).
- KPIs en dashboard principal: cantidades y costos cobrados vs presupuesto/liquidación (consultas sobre `so_registros`).

**Estados**

- Precio de ítem en cobro: p. ej. **Pendiente** → **Aprobado** tras condiciones de negocio.

**Integraciones**

- SICOE Web (registros y actas), Presupuesto (análisis liquidación), Dashboard.

---

### 1.6 Dashboard de análisis

**Propósito:** vista ejecutiva dentro de `App.jsx` con KPIs, gráficos (Recharts) y enlaces a profundidad SICOE/PK.

**Funcionalidades**

- Métricas de avance de validación, cobro, balances y uso de endpoints agregados `/sicoe-obra/.../dashboard-*`.
- Matriz «Validación por rol» con encabezados dinámicos desde `GET .../niveles-validacion`.
- Tamaños de fuente accesibles (variables CSS tipo `--cc-*` compartidas con tema).

**Integraciones**

- SICOE Web, Cobro, Presupuesto, Plan de semáforos (contexto visual de PK).

---

### 1.7 Plan de semáforos

**Propósito:** visualizar sobre el plano GeoJSON del contrato el estado de validación/ejecución por PK (capas Mapbox en `App.jsx` — componente `ModuloPlanoSemaforo` embebido).

**Funcionalidades**

- Mapa interactivo con colores por estado de registro agregado a nivel PK.
- Correlación con datos SICOE y geometría del contrato.

**Integraciones**

- SICOE Web, contrato (`GET /contratos/{id}/plano-geojson`), Dashboard.

---

### 1.8 Módulo de Programación de Obra (Fase 1 implementada)

**Propósito:** planificar por **versión** las actividades de obra alineadas al presupuesto por PK y capítulo/ítem; validación multinivel **por contrato**; sellado que define la **versión vigente** del cronograma; visualización cartográfica con semántica de avance por PK.

#### 1.8.1 Interfaz (Mapbox + panel 420px)

- **Mapa Mapbox GL** a pantalla completa del módulo con **panel lateral fijo de 420px** (`width: 420`, `maxWidth: 420` en contenedores internos).
- **Bearing inicial 270°** (`MAP_INITIAL_BEARING = 270`): orienta el plano físico con **norte a la izquierda**; el usuario puede rotar después con controles nativos.
- **Estilos de mapa** (conmutador top-right personalizado):
  - **Plano:** `mapbox://styles/mapbox/light-v11` o `dark-v11` según tema UI.
  - **Topo:** `mapbox://styles/mapbox/outdoors-v12`.
  - **Satélite:** `mapbox://styles/mapbox/satellite-streets-v12` + **terreno DEM** Mapbox (`mapbox-terrain-dem-v1`, exageración 1.5). En modos no satélite se retira el terreno para evitar conflictos.
- **Plano del contrato:** GeoJSON obtenido con caché (`getContratoPlanoGeojson`) y **sanitizado** (`sanitizePlanoFeatureCollection`) antes de pintar.
- **Polígonos de programación:** capas `prog-fill` y `prog-line` sobre fuente GeoJSON enriquecida con propiedades `prog_fill`, `prog_op`, `prog_line` derivadas del estado por PK.
- **Colores por estado** (`prog_pk_estado` / función `colorForEstado`) — modo **Programación**:
  - `sin_cantidad`: relleno `#94a3b8`, borde `#64748b`, opacidad baja (PK sin ítems activos de presupuesto poligonal).
  - `sin_iniciar`: `#888780`.
  - `en_progreso`: `#EF9F27`.
  - `completa`: `#2563EB` (azul).
  - Desviación vs baseline: borde naranja (`#f97316`) cuando aplica reprogramación.
- **Modo Ejecutado** (toggle mapa): capa semáforo por `% ejecutado` vs presupuesto PK (`colorForEjecutadoPct`): rojo 0–25 %, naranja 25–50 %, amarillo 50–75 %, cyan 75–90 %, verde >90 %; fondo tenue del estado de programación.
- **Panel KPI ejecución** (N1 SICOE): presupuesto alcance, ejecutado, % global; refresh vía `GET/POST .../ejecucion/*` y cache `prog_pk_ejecutado`.
- **Leyenda** dinámica según modo (`MAPA_LEYENDA_ESTADOS` / `MAPA_LEYENDA_EJECUTADO`).
- **Interacción:** clic en polígono selecciona PK; cursor puntero en hover; enlaces de atribución Mapbox abren en nueva pestaña.
- **Props de permiso:** `puedeEditar`, `puedeCrear`, `puedeValidar` desde matriz de cargo (ver `prog_obra_permissions.py`).

#### 1.8.2 Versiones y estados de versión

- Tipos de versión: **baseline**, **reprogramacion**, **suspension** (tipos normalizados a minúsculas en servidor).
- **Baseline:** solo una baseline **no archivada/rechazada** a la vez por contrato.
- **Motivo:** obligatorio si el tipo no es `baseline`.
- Estados de fila `prog_versiones`: **borrador**, **en_validacion**, **sellada**, **rechazada**, **archivada** (según uso en servicio; borrador y sellada explícitos en código de sellado).
- **Numeración** autoincremental por contrato (`numero_version`).
- **Versión vigente:** al sellar, se actualiza `contratos.prog_version_vigente_id`.
- **Borrador activo:** última versión en estado borrador expuesta en meta del endpoint de mapa.

#### 1.8.3 Actividades, capítulos y calendario

- Entidades: `prog_actividades_capitulo` (fecha sugerida, duración en **días hábiles**, flag `aplica_herencia`), `prog_actividades` (ítem, segmento, fechas, cantidad programada, unidad, costo unitario, distribución **lineal** o **manual**, flags `heredado_de_capitulo`, `override_manual`).
- Cálculo de **fecha fin** con librería `holidays` (CO) y tabla `prog_calendario_no_habiles` (por contrato y globales `contrato_id` NULL) + utilidad `add_dias_habiles`.
- **Herencia de capítulo:** propaga fecha/durión a ítems del capítulo en PK que aún no tienen fecha o no están marcados como override manual; cuenta ítems afectados.
- **Validación de segmentos:** suma de `cantidad_programada` por segmentos debe igualar cantidad total de presupuesto poligonal para capítulo/ítem/PK; error de negocio explícito si no cuadra.

#### 1.8.4 Validación multinivel (programación)

- Niveles activos por contrato en `contrato_niveles_validacion.niveles_activos` (enteros **2–12**; por defecto `[2,3]` si no hay dato).
- Al **enviar a validación:** versión pasa a `en_validacion`; se regeneran filas en `prog_validaciones` con orden y estado `pendiente`.
- Al **aprobar:** exige niveles previos aprobados en orden; la última aprobación dispara **sellado** (`sellado_en`, `sellado_por`) y fija versión vigente.
- Al **rechazar:** observación obligatoria; validación marcada rechazada; versión vuelve a **borrador**; notificación al creador (tabla `notificaciones`, tipo `validacion`, módulo `programacion_obra`).
- Quién puede validar nivel N: usuario cuyo **nivel de validación SICOE** en BD coincide con N, o desarrollador (función `_prog_nivel_usuario_puede`).

#### 1.8.5 API (`/prog-obra/...`)

- `GET .../mapa` — filas RPC `prog_mapa_pk_estados` enriquecidas con ejecutado + meta vigente/borrador.
- `GET .../ejecucion/resumen`, `POST .../ejecucion/refresh` — KPI y recálculo cache `prog_pk_ejecutado`.
- `GET/POST/DELETE .../versiones`, `GET .../versiones/{id}/validaciones`, `POST .../enviar-validacion`, `POST .../validar`.
- `GET .../actividades`, `POST .../capitulo`, `POST .../actividad`, `POST .../herencia`, `POST .../actividades/{id}/recalcular-fin`, `POST .../validar-segmentos`.
- `GET .../calcular-fin` — utilidad de fecha fin desde inicio + días hábiles.
- Mantenimiento: `POST /prog-obra/mantenimiento/seed-calendario-colombia` (solo desarrollador).

#### 1.8.6 Reglas de negocio resumidas

- No editar versiones **selladas**.
- Solo **borrador** admite cambios de cronograma; en validación debe **rechazarse** o completarse el flujo para volver a borrador o sellar.
- Estados de PK en mapa derivan de presupuesto poligonal + fechas en actividades (`upsert_prog_pk_estado`).

**Integraciones**

- Presupuesto (`presupuesto`, `pk_ids`), contratos (`prog_version_vigente_id`), permisos (`funciones`/`permisos`), validación SICOE (nivel de usuario), notificaciones, logs (`PROG_*`), RPC `prog_mapa_pk_estados`.

---

### 1.9 Buzón de notificaciones

**Propósito:** mensajería interna con hilo, lectura/no leídas y difusiones administrativas.

**Funcionalidades**

- Bandeja en UI principal (`BuzonNotificaciones` en `App.jsx`).
- API: creación simple y broadcast (`POST /notificaciones`), listas recibidas/enviadas, conteo no leídas, hilo con marcado leído, `PUT .../leida`, destinatarios para redacción.
- Tipos de mensaje usados en flujos (p. ej. `validacion`, `modulo` = `programacion_obra`).

**Integraciones**

- Programación de obra (rechazo), administración, otros módulos que inserten filas vía API.

---

### 1.10 Sistema de logs y auditoría

**Propósito:** trazabilidad centralizada de acciones de usuario y eventos técnicos.

**Funcionalidades**

- Función `registrar_log(usuario, accion, modulo, ...)` con campos extendidos: entidad, detalle JSON, resultado, valores anterior/nuevo, IP, severidad, categoría (`auditoria` vs `sistema`), endpoint, método HTTP, duración, alerta.
- `registrar_log_sistema` para errores HTTP 500 repetidos, alertas de login, etc., sin usuario.
- Consultas: `GET /logs`, alertas, export CSV, lista de usuarios para filtros, detalle por entidad.
- Permiso de consulta amplia: cargos **desarrollador** y **administrador** (`_cargo_puede_auditar_logs`).

**Integraciones**

- Transversal a Presupuesto, SICOE, actas, subcontratistas, notificaciones, programación, autenticación.

---

### 1.11 Panel de administración

**Propósito:** operación de plataforma, contenidos, accesos, diagnóstico y salud del sistema.

**Funcionalidades (desde `AdminPanel.jsx`)**

- Gestión de usuarios, cargos, permisos, contratos, novedades de inicio (tipos e iconografía), políticas.
- Vista de logs con formato hora **America/Bogota** y exportaciones.
- Diagnóstico para soporte (JSON estructurado para portapapeles).
- Comprobación de conectividad Supabase/Mapbox; vista previa GeoJSON de contrato en mapa.
- Pestaña **ModuloNube** (integración nube documentada en componente homónimo).
- Matriz de acciones estándar `ver, crear, editar, eliminar, validar, exportar` alineada con backend.

**Integraciones**

- Todas las áreas vía API admin y catálogos.

---

### 1.12 Integración SicoeCAD y ClaraLink

**SicoeCAD**

- Sesión de DWG por usuario/contrato en memoria servidor; heartbeats y cola de pendientes.
- Cabecera `X-SicoeCAD-Enviados` en importaciones masivas de presupuesto para trazabilidad de paquetes CAD.
- Auditoría persistente consultable y confirmación (`sincro-sicoe-cad-auditoria`).

**ClaraLink**

- Esquemas URI personalizados para insertar metadatos de validación, resaltar entidades y zoom a PK desde ClaraCore hacia el entorno de diseño asistido.
- Uso coordinado entre `ModuloPresupuesto.jsx` y `App.jsx` (SICOE).

---

### 1.13 Módulos adicionales presentes en la barra lateral

| Clave `moduloActivo` | Componente        | Notas breves |
|----------------------|--------------------|--------------|
| `inicio`             | `ModuloInicio.jsx` | Novedades y accesos. |
| `informes`           | `ModuloInformes.jsx` | Informes contractuales, CCD, Excel/PDF, datos vía `/informes` y API principal. |
| `guias`              | `ModuloGuias.jsx` | Guías editoriales (CRUD admin + lectura). |
| `sst`                | `ModuloSST.jsx` | Seguridad y salud en el trabajo. |
| `ensayos`            | `ModuloEnsayos.jsx` | Registro de ensayos. |
| `auditor_sst`        | `ModuloAuditorSST.jsx` | Auditoría SST con export Excel; rutas experimentales OAuth/Google/Microsoft y Anthropic en backend. |
| `almacén`            | Placeholder        | «Próximamente» en UI. |

---

## 2. Arquitectura técnica

### 2.1 Stack tecnológico (versiones declaradas en repositorio)

**Frontend (`frontend/package.json`)**

| Paquete | Versión declarada |
|---------|-------------------|
| React / React DOM | ^19.2.0 |
| Vite | ^7.3.1 |
| @vitejs/plugin-react | ^5.1.1 |
| mapbox-gl | ^3.20.0 |
| @supabase/supabase-js | ^2.105.4 |
| recharts | ^3.8.0 |
| dexie | ^4.4.2 |
| exceljs | ^4.4.0 |
| xlsx | ^0.18.5 |
| uuid | ^14.0.0 |
| @turf/helpers, @turf/unkink-polygon | ^7.3.5 |
| ESLint 9 + plugins | ver `devDependencies` |

**Backend (`backend/requirements.txt`)**

| Componente | Versión / nota |
|--------------|----------------|
| FastAPI | sin pin (instalación resuelve última compatible al momento de `pip install`) |
| Uvicorn, Gunicorn | gunicorn>=21.2.0 |
| supabase (cliente Python) | sin pin |
| passlib | 1.7.4 |
| bcrypt | 3.2.2 |
| python-jose[cryptography] | sin pin |
| pydantic, python-dotenv, httpx>=0.27 | sin pin |
| openpyxl, requests, cloudinary, python-multipart | sin pin |
| xhtml2pdf, pypdf>=4.0 | sin pin |
| anthropic>=0.25.0 | sin pin |
| pdf2image>=1.16.0 | sin pin |
| holidays>=0.45 | usado en programación de obra |
| pytest>=8.0 | pruebas |

**Infraestructura y servicios externos**

- **Supabase (Postgres + Auth storage + Storage buckets)** según variables `SUPABASE_*`, buckets de perfiles, inicio, guías.
- **Cloudinary** para imágenes (`CLOUDINARY_*`).
- **Mapbox** tokens públicos en frontend (`VITE_MAPBOX_TOKEN`).
- **Despliegue:** flujo GitHub Actions → Azure Static Web Apps (carpeta `.github/workflows` en repo).

### 2.2 Modelo de datos (tablas principales y relaciones — según uso en código)

- **usuarios** → **cargos** (`cargo_id`); relación N:N con **contratos** vía tablas de asignación administradas por `/admin/usuario-contratos`.
- **roles**, **categorias**, **funciones**, **permisos** (`permisos.cargo_id` + `funcion_id` + flags de acción).
- **contratos** — campos operativos incl. `prog_version_vigente_id` (programación vigente).
- **presupuesto** — por `contrato_id`, `pk_id`, capítulo/ítem, `tipo_ejecucion`, `dado_de_baja`, cantidades y valores.
- **pk_ids** — catálogo de PK por contrato.
- **listado_precios** — ítems de precio contractuales.
- **so_registros** — núcleo de SICOE Web (vinculación a `reporte_id`, estados de validación multinivel, cantidades, costos, acta RPO, etc.).
- **reportes**, **semanas**, **actas** / tipos de acta, **cobro**.
- **prog_versiones**, **prog_actividades**, **prog_actividades_capitulo**, **prog_validaciones**, **prog_pk_estado**, **prog_calendario_no_habiles**.
- **contrato_niveles_validacion** — configuración `niveles_activos` JSON/array para SICOE y referenciado también en programación.
- **notificaciones** — mensajes y metadatos (`tipo`, `modulo`, `entidad_tipo`, `entidad_id`, hilos).
- **logs** — auditoría y sistema (columnas extensibles; inserción tolerante a esquema).
- **guias** — contenido editorial.
- **RPC** `prog_mapa_pk_estados(p_contrato_id)` — agregación servidor para el mapa de programación.

*Relación lógica:* Contrato → PK / Presupuesto / Versiones de programación / Registros SICOE / Actas de cobro / Notificaciones / Logs.

### 2.3 Sistema de permisos: funciones, cargos, roles

- **Cargo** posee filas en **permisos** por cada **función** activa.
- Acciones por función: **ver, crear, editar, eliminar, validar, exportar** (booleanos en tabla `permisos`).
- **Rol** y **categoría** complementan datos de usuario según endpoints `/roles`, `/categorias`.
- **Programación de obra:** función con nombre exacto en catálogo **«Programación de obra»** (comparación en minúsculas en `prog_obra_permissions.py`).
- **Superpoderes:** cargo nombre **desarrollador** / **administrador** para auditoría de logs y excepciones SICOE/validación descritas en código.

### 2.4 Mecanismos de inmutabilidad y sellado

- **Programación:** versión **sellada** no admite mutación; sellado finaliza cadena de `prog_validaciones`; timestamp y usuario en `sellado_en` / `sellado_por`; contrato apunta a versión vigente.
- **SICOE:** sellado lógico por aprobación del máximo nivel activo; reversión N3 con **doble llave** y comentarios obligatorios (flujo de desbloqueo controlado).
- **Presupuesto:** baja lógica (`dar-baja` / `restaurar`) y estados de validación masiva; comentarios y auditoría de sincronización CAD.

### 2.5 Sistema de auditoría centralizada

- Tabla única **logs** con categorías **auditoria** y **sistema**; severidad por defecto según acción/módulo.
- Export CSV para análisis externo.
- Correlación opcional con `endpoint`, `metodo_http`, `duracion_ms`, `stack_trace` en errores.
- Inserción defensiva ante evolución de esquema (omisión de columnas desconocidas registrada en warning).

---

## 3. Elementos visuales y de interfaz

### 3.1 Pantallas principales

- **Shell único:** cabecera con contrato activo, usuario, tema (claro / oscuro / descanso), acceso a perfil, políticas, buzón, administración (según rol).
- **Inicio:** novedades y atajos.
- **Dashboard:** tarjetas KPI, Recharts, tabla/matriz de validación.
- **Presupuesto:** grillas, filtros, mapa PK, acciones masivas y comentarios.
- **SICOE Web:** grillas de reportes/registros, modales de validación, fotos, mapas embebidos, modo offline.
- **Informes:** selección de informe contractual, previsualización, generación Excel/PDF.
- **Programación de obra:** mapa + panel 420px (versiones, PK, actividades, validación).
- **Semáforo:** mapa de plano con codificación por estado.
- **SST / Ensayos / Auditor SST / Guías:** flujos específicos de cada JSX.
- **Admin:** modal de pestañas con alta densidad de controles y tablas.

### 3.2 Navegación

- **Barra lateral** con iconos y etiquetas; cambio de `moduloActivo` en estado React (sin rutas URL por módulo en el diseño actual).
- **Modales:** perfil, políticas, trazabilidad de registro SICOE, picker de emoji, validación y reversión N3.

### 3.3 Sistema de colores y semáforos

- Estados SICOE en validación: paleta centralizada (`COLOR_ESTADO` — verdes, ámbar, rojos, púrpura para ReversionN3, etc.).
- Programación de obra en mapa (modo Programación): gris claro (sin cantidad), gris (sin iniciar), ámbar (en progreso), azul (completa); borde naranja = desviación baseline. Modo Ejecutado: semáforo rojo→verde por % SICOE N1.
- Temas **light / dark / rest** con tokens coherentes (`AdminPanel` documenta alineación con `App.jsx`).

### 3.4 Mapas interactivos

- **Mapbox GL** en programación, semáforo, presupuesto (filtro PK), admin (vista previa).
- **Controles:** navegación, escala, conmutador de estilo en programación, terreno en satélite, `fitBounds` al GeoJSON del contrato.
- **Utilidades:** Turf (`unkink-polygon`, helpers) para geometría; caché de GeoJSON por contrato.

---

## 4. Flujos de validación

### 4.1 Flujo SICOE Web (completo — nivel conceptual)

1. **Planeación:** creación de reporte/semana; asignación de inspectores/capitulos según contrato.
2. **Registro:** alta de líneas en `so_registros` con medios y datos de campo; asignación de ítem de precio; dimensiones donde aplique.
3. **Prevalidación cliente:** comprobación de prerequisitos de nivel (`sicoeNivelPrevioAprobado`, niveles activos normalizados).
4. **Validación N1…N6** según configuración del contrato (endpoints específicos o masivos con preview).
5. **Subcontratista / interventoría:** rutas `validar-sub` y capas combinadas en consultas.
6. **Comentarios / mensajes:** hilo con posibilidad de respuestas.
7. **Rechazo o No objeto:** bloquea flujo hacia cobro; colores y KPIs lo reflejan.
8. **Reversión N3:** doble autorización documentada en UI; endpoint `reversion-n3-doble-llave`; vuelta a estado revisable.
9. **Sellado lógico:** aprobación del último nivel activo; uso en dashboards y cobro.
10. **Offline:** descarga de pack, trabajo sin red, sincronización posteriores vía endpoints dedicados.

### 4.2 Flujo de programación de obra

1. Usuario con permiso **crear** abre nueva **versión** (baseline primera vez; reprogramación/suspension con motivo).
2. Sistema inicializa/actualiza `prog_pk_estado` para todos los PK del contrato.
3. Usuario con **editar** carga capítulos y actividades en **borrador**; opcionalmente **herencia** desde capítulo; valida segmentos vs presupuesto.
4. **Enviar a validación:** estado `en_validacion`, cola `prog_validaciones` en pendiente por cada nivel configurado (≥2).
5. Validadores con permiso **validar** y nivel SICOE coincidente aprueban en orden; la última aprobación **sellada** versión y fija vigente en contrato.
6. **Rechazo:** observación obligatoria → vuelve a **borrador** + notificación al creador.
7. **Mapa:** toggle Programación/Ejecutado; RPC + GeoJSON con estados del borrador activo (o vigente si no hay borrador); capa ejecutado desde cache `prog_pk_ejecutado`; Curva S e informes PDF/Excel con % ejecución por capítulo.

### 4.3 Flujo de presupuesto

1. Importación o edición de ítems (individual o bulk desde Excel/bridge CAD).
2. Ajuste de cantidades y estados de ítem; opcional pre-interventoría.
3. **Validación masiva** (`bulk-validar`) con registro en logs.
4. **Recálculo masivo** tras cambios de cantidad.
5. **Análisis liquidación** y exportaciones para trazabilidad externa.
6. Integración CAD: envío → auditoría → ack; uso de ClaraLink para navegación en DWG.

---

## 5. Diferenciadores técnicos

1. **Plataforma integral obra pública/contratos:** presupuesto poligonal, ejecución SICOE con validación multinivel configurable, programación por PK alineada al mismo presupuesto, cobro y dashboards en un solo front SPA.
2. **Sincronía bidireccional con ecosistema de diseño:** SicoeCAD + ClaraLink + cola de sesión DWG con heartbeat y comandos de zoom/resaltado por PK.
3. **Offline-first para obra en campo:** pack offline, Dexie, routers y motor de sync en `frontend/src/offline/`.
4. **Gobernanza:** matriz granular de permisos por función/cargo; logs centralizados con export y alertas de sistema; doble llave de reversión N3.
5. **Programación Fase 1:** validación multinivel reutilizando niveles de contrato, sellado con versión vigente, calendario hábil Colombia, validación matemática segmentos vs presupuesto, mapa con semántica de avance por PK y estilos Mapbox profesionales (incl. terreno DEM).
6. **Modularidad experimental** (SST/ensayos/auditor AI) conectada a servicios externos (Anthropic, OAuth) sin mezclar el núcleo presupuesto/SICOE.

---

## Anexos para el expediente DNDA

### A. Variables de entorno relevantes (nombres)

- Frontend: `VITE_API_URL`, `VITE_MAPBOX_TOKEN`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TEST_MODE`, `VITE_DEBUG_API`, `VITE_SICOE_CONTRATOS_SIN_NODOS_REPORTE_GPS`.
- Backend: JWT, Supabase, Cloudinary, CORS, mantenimiento, políticas, timeouts Supabase, análisis SICOE (paginación, workers), SMTP CCD (`CCD_NOTIFY_*`), claves OAuth y Anthropic para módulos experimentales, etc. (listado completo en exploración del código `main.py` y `mail_smtp.py`).

### B. Ficheros clave citables en el expediente

- Navegación y SICOE UI: `frontend/src/App.jsx`.
- Programación obra UI: `frontend/src/ModuloProgramacionObra.jsx`.
- API principal: `backend/main.py`.
- Programación obra API/lógica: `backend/prog_obra_routes.py`, `backend/prog_obra_service.py`, `backend/prog_obra_permissions.py`, `backend/prog_obra_calendar.py`.
- Admin: `frontend/src/AdminPanel.jsx`.
- Presupuesto: `frontend/src/modules/presupuesto/ModuloPresupuesto.jsx`, `PptoFiltroMapaPk.jsx`.
- SQL operativo: `backend/sql/*.sql`.

### C. Limitaciones declaradas para el manual de usuario

- Versiones de paquetes Python sin pin pueden variar con el tiempo; conviene congelar `pip freeze` en el entorno de producción para el anexo de versiones del registro.
- Políticas RLS y esquema completo Postgres deben documentarse desde el proyecto Supabase activo si difieren del código analizado.

---

*Documento generado como insumo técnico para complementar el manual de usuario y soporte de registro de obra software ante la DNDA (Colombia). Debe revisarse jurídicamente y completarse con capturas de pantalla y glosario de usuario final.*
