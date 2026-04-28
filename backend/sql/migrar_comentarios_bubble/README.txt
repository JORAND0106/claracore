Generado migrar_comentarios_bubble_ndjson.py
contrato_id=2
filas_sql=12716
partes=5
reparto=NUM_LOTES=5 | filas por parte: min 2543, max 2544
dedupe=1
autor_id_todos=47
ndjson=C:\Users\JORAND\Documentos\ClaraCore\Bubble\comentarios.ndjson

mensaje = body & Comentario creado por & creador & migrador desde Bubble

Si autor_id es NOT NULL en la tabla, define MIGRACION_AUTOR_ID con un id válido de usuarios.
Ejecutar partes en orden en SQL Editor.
