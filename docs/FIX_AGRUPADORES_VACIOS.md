# Fix agrupadores vacíos (Listado de Precios / WBS)

## Causa
Tras #1178/#1179 el backend escribe ítems en `listado_precios_agrupador_items` (N:N).
En producción **esa tabla no existía** (solo se había aplicado `es_transversal`).
Al crear un AG (sobre todo transversal) la fila del agrupador quedaba creada y la
asignación de ítems fallaba → al abrirlo aparecía vacío.

## Qué hacer
1. Ejecutar en Supabase SQL Editor:
   `backend/sql/migration_listado_multi_agrupador_transversales_fix.sql`
   (o dejar que el deploy la aplique vía `schema_migrations_runner` si hay `SUPABASE_DB_URL`).
2. Desplegar el backend/frontend de este fix.
3. `POST /listado-precios/{contrato_id}/agrupadores/restaurar-vacios` para intentar
   recuperar ítems desde logs; revisar `GET .../agrupadores/vacios` los no recuperables.

## Control Silvania
Crear AG de capítulo (2 ítems) + transversal (2 capítulos); abrir ambos; programar PK.
