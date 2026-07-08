# Prompt complementario — Firma digital de informes (ClaraCore)

**Uso:** En la **misma conversación** donde ya tienes el procedimiento editado (`Procedimiento_ClaraCore_v2.x.docx`), **adjunta el Word actual** y pega **solo** el bloque «MENSAJE PARA CLAUDE» de abajo.

**Importante:** Este mensaje pide **añadir** contenido nuevo **sin modificar** el texto que el usuario ya cerró.

---

## MENSAJE PARA CLAUDE (copiar desde aquí)

---

### Instrucción de alcance — SOLO COMPLEMENTAR, NO REESCRIBIR

Adjunto el procedimiento **`Procedimiento_ClaraCore_v2.x.docx`** que **ya está editado y aprobado por el usuario**.

Tu tarea es **únicamente**:

1. **Insertar** un capítulo / sección(es) nueva(s) sobre **firma digital de documentos e informes** en ClaraCore.
2. **No alterar, eliminar, renumerar ni reescribir** párrafos, tablas, figuras ni redacción existente fuera de lo estrictamente necesario para encajar la numeración del inserto.
3. Si necesitas renumerar figuras posteriores al inserto, **solo** ajusta la numeración de figuras nuevas y de las que vengan después; **no cambies títulos ni contenido** de figuras ya existentes.
4. Mantén **todas** las reglas ya acordadas en revisiones anteriores:
   - Organización: **Infinite Ingeniería SAS**.
   - Procedimiento **estándar** (sin nombres de contratos específicos).
   - **Prohibido** mencionar IDU-1551-2017, ICCU-1614-2025 u otros contratos, salvo **CTO-ICCU1614-2025** únicamente en el numeral **7.6.2** (si ya existe; no lo toques).
   - Prerrequisito de informes: cantidades con **último nivel de validación activo = Aprobado**.

Al finalizar, entrega el **mismo documento Word** con el inserto y un **resumen breve** (5–10 bullets) de **qué se añadió y dónde**, sin listar cambios al resto del documento.

---

### Dónde insertar el contenido nuevo

Inserta el bloque **después del capítulo o sección de Informes / generación de memorias** (donde ya se describe CC-SUB, CC-SEM, CC-MES y formatos de entidad), **o** como subcapítulo final de ese capítulo si la numeración lo permite.

Sugerencia de numeración (adaptar a la del documento adjunto sin reordenar otros capítulos):

- **«X.Y Firma digital de informes y documentos CCD»** (X = número del capítulo Informes)
  - X.Y.1 Concepto general de firma en ClaraCore
  - X.Y.2 Carga de la imagen de firma en el perfil de usuario
  - X.Y.3 Configuración de firmantes en la biblioteca CCD (Elaboró / Revisó / Aprobó)
  - X.Y.4 Registro de firma sobre un informe
  - X.Y.5 Descarga del PDF con sello de autenticidad
  - X.Y.6 Procedimientos por tipo de informe (corte, semana, acta RPO, entidad)
  - X.Y.7 Errores frecuentes y solución
  - X.Y.8 Lista de chequeo — firma de informes

Si el documento no tiene capítulo Informes aún numerado así, crea un **Anexo** o **Capítulo dedicado** al final, antes de glosario/anexos, con la misma estructura interna.

---

### Contenido técnico que debes documentar (basado en ClaraCore)

#### A. Concepto general

Explicar en lenguaje operativo:

- ClaraCore **no** es un firmador electrónico tipo DocuSign; la «firma» en informes CCD combina:
  1. **Imagen de firma** cargada en el **perfil del usuario** (PNG/JPG recomendado fondo transparente).
  2. **Configuración de firmantes** por formato en el módulo **Informes** (quién es Elaboró, Revisó, Aprobó; en algunos formatos también Elaboró 2 / Revisó 2).
  3. **Registro de firma**: acción del usuario autorizado que **asocia** su imagen de perfil a un slot (Elaboró o Revisó) para un **documento concreto** (corte, semana o acta RPO).
  4. **PDF con sello**: descarga que agrega una **página de sello** con imagen de firma, fecha, datos del contrato activo y **huella SHA-256** del documento (integridad).

Incluir recuadro de advertencia:

> Solo pueden firmarse informes cuyos datos provienen de registros con **Aprobado** en el **último nivel de validación activo** del contrato. La firma no sustituye la validación de cantidades.

#### B. Procedimiento — Cargar firma en el perfil (TODOS los que vayan a firmar)

Pasos imperativos detallados:

1. Iniciar sesión en ClaraCore.
2. Abrir menú de usuario / avatar → **«Editar perfil»** (modal «Tu perfil»).
3. Bajar a la sección **«Imagen de firma»**.
4. Pulsar **«Subir firma»** → elegir archivo de imagen.
5. Verificar vista previa de la firma en el recuadro.
6. Opcional: **«Quitar firma»** si debe reemplazarse.
7. Pulsar **«Guardar datos»** si también se editó nombre u otros campos.
8. **Resultado esperado:** la firma queda en `firma_imagen_url` del perfil y estará disponible al **Registrar firma** en Informes.

**Figura obligatoria:** modal «Tu perfil» con sección Imagen de firma visible.

**Errores frecuentes:**
- Intentar registrar firma en Informes sin haber subido imagen → mensaje «Configura la imagen de firma en tu perfil».
- Imagen ilegible o con fondo que tapa el PDF → recomendar PNG transparente.

#### C. Procedimiento — Configurar firmantes en biblioteca CCD (perfil con permiso)

**Permiso:** matriz **«Informes CCD»** → acción **Validar** (o administrador/desarrollador).

**Ruta:** Módulo **Informes** → expandir formato (CC-SUB-001, CC-SUB-002, CC-SEM-001, CC-SEM-002, CC-MES-001, CC-MES-002, formatos entidad, etc.) → bloque **«Firmas — Elaboró · Revisó · Aprobó»**.

Pasos:

1. Ingresar al módulo Informes con contrato activo seleccionado.
2. Expandir la tarjeta del formato deseado.
3. En cada slot (**Elaboró**, **Revisó**, **Aprobó**; en FO-EO-04-V2 puede haber **Elaboró 1/2**, **Revisó 1/2**):
   - Elegir **usuario del catálogo del contrato** en el desplegable (no solo escribir texto).
   - Verificar nombre y cargo (editables).
   - Guardar configuración del formato.
4. Slot **Subcontratista / Aprobó**: en formatos CC-SUB puede completarse **automáticamente** con empresa y representante del subcontratista seleccionado al generar el informe (documentar que no se registra igual que Elaboró/Revisó del perfil).

**Figura obligatoria:** panel de slots Elaboró/Revisó con desplegable de usuarios.

#### D. Procedimiento — Registrar firma (acción del firmante)

**Permiso:** **Informes CCD → Validar**.

**Quién puede:** el usuario cuya cuenta coincide con **Elaboró** o **Revisó** configurado en la biblioteca para ese formato y contexto.

Pasos genéricos:

1. Generar o abrir **vista previa** del informe (corte, semana o acta según formato).
2. Verificar que los datos son correctos.
3. Pulsar botón **«Registrar firma»** (icono pluma / lápiz) del formato correspondiente.
4. El sistema toma la **imagen de firma del perfil** y la asocia al slot que le corresponde.
5. **Resultado:** el slot aparece como registrado; consultar indicador «firmas registradas» si existe en pantalla.

**Reglas a documentar:**

- Si el usuario no está asignado como Elaboró/Revisó en biblioteca → error indicando revisar desplegables.
- En **CC-SUB**, registro de firma aplica a **Elaboró/Revisó** del contratista; **Aprobó** es del subcontratista en el PDF.
- La **primera firma** de un documento guarda un **snapshot inmutable** de la configuración de firmantes (no cambia firmantes ya sellados si luego se edita biblioteca).

**Figura obligatoria:** barra de herramientas con botones Vista previa / PDF con sello / Registrar firma.

#### E. Procedimiento — Descargar PDF con sello

Pasos:

1. Tras registrar firma(s) necesarias (según procedimiento interno de Infinite Ingeniería SAS), pulsar **«Descargar PDF con sello»** o equivalente (icono documento firmado / hoja con sello).
2. El PDF incluye:
   - Contenido del informe.
   - **Página de sello** con firma del perfil, fecha, referencia al contrato activo (sin nombrar contratos específicos en el procedimiento), **huella SHA-256**.
3. Guardar archivo con nomenclatura interna de archivo.

Diferenciar:

| Acción | Resultado |
|--------|-----------|
| Vista previa PDF | Documento sin sello final |
| PDF con sello | Documento con página de autenticidad |
| Registrar firma | Registro en servidor del slot firmado |
| Excel | Exportación de datos (no equivale a firma) |

**Figura obligatoria:** ejemplo de página de sello (captura anonimizada).

#### F. Procedimientos específicos por contexto (paso a paso, cada uno con ≥1 figura)

Documentar **por separado** con la misma profundidad:

**F.1 Informes por corte de subcontratista (CC-SUB-001 informe de corte, CC-SUB-002 memorias por ítem)**

1. Informes → Formatos Subcontratista → elegir **corte**.
2. Configurar firmantes en biblioteca del formato.
3. Vista previa / generar PDF.
4. Registrar firma (Elaboró/Revisó).
5. Descargar **PDF con sello** (corte completo o memoria por ítem según botón).

**F.2 Informes semanales (CC-SEM-001, CC-SEM-002)**

1. Informes → Formatos Semanales → elegir **semana de obra**.
2. Mismo flujo: biblioteca → vista previa → registrar firma → PDF con sello (por ítem o todos).

**F.3 Informes mensuales / acta RPO (CC-MES-001, CC-MES-002)**

1. Informes → Formatos Mensuales → elegir **acta RPO del período** (concepto genérico).
2. Mismo flujo de firma.

**F.4 Formatos entidad contratante (p. ej. formatos externos configurados, FO-EO-04-V2 si aplica en despliegue)**

1. Informes → Formatos Entidad / Contratante.
2. Parámetros (acta, subsistema, supervisor — genérico).
3. Generación PDF (puede ser progresiva con barra de %).
4. Registrar firma en slots Elaboró/Revisó (1 y 2 si aplica).
5. Descargar PDF con sello.

**No nombrar** entidades ni contratos concretos; hablar de «formato de entidad contratante configurado».

#### G. Tabla resumen permisos — firma

| Acción | Permiso Informes CCD |
|--------|----------------------|
| Ver firmas registradas | Ver |
| Configurar Elaboró/Revisó en biblioteca | Validar |
| Registrar firma | Validar |
| Descargar PDF con sello | Ver / Exportar (según formato) |
| Subir imagen de firma | Cualquier usuario (su perfil) |

#### H. Errores frecuentes (sección dedicada)

- «Configura la imagen de firma en tu perfil» → completar procedimiento B.
- «Tu usuario no coincide con Elaboró ni Revisó» → administrador debe asignar usuario en desplegable biblioteca CCD.
- PDF sin sello vs con sello → usar botón correcto.
- Firmar antes de validar cantidades → recuadro prerrequisito último nivel.

#### I. Figuras mínimas a añadir (contenedores)

Usar el mismo formato de contenedor que el resto del documento:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [INSERTAR CAPTURA — Figura XX]                                          │
│  Título: …                                                               │
│  Qué debe verse: …                                                       │
│  Ruta: ClaraCore > …                                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

**Mínimo 8 figuras nuevas** solo para firma:

1. Acceso Editar perfil desde menú usuario  
2. Sección Imagen de firma — Subir firma  
3. Módulo Informes — biblioteca de formatos  
4. Configuración slots Elaboró/Revisó  
5. Botones Vista previa / Registrar firma / PDF con sello  
6. Mensaje de firma registrada OK  
7. Página de sello en PDF (huella SHA-256)  
8. Flujo completo en un formato (ej. memoria CC-SUB-002 o CC-SEM-002)

---

### Formato y entrega

- Insertar el contenido en **Word**, mismo estilo tipográfico del documento adjunto.
- **No** modificar portada, 7.6.2, ni capítulos ya cerrados salvo encabezado de numeración si es inevitable.
- Entregar archivo Word actualizado + resumen «Solo añadido» al final del mensaje de respuesta.

---

## FIN DEL MENSAJE PARA CLAUDE

---

## Recordatorio para Infinite Ingeniería SAS

- Adjunta el Word **tal como lo dejaste editado**.
- Pega solo el bloque de arriba.
- Revisa que Claude **no haya tocado** párrafos anteriores comparando con tu copia local (Word → Comparar documentos, si hace falta).
