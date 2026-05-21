-- Nota: `tiene_ruta_critica` por PK se calcula en el backend (GET /prog-obra/{id}/mapa)
-- consultando prog_cpm_resultados.es_ruta_critica para la versión activa (borrador o vigente).
-- No requiere columna nueva en prog_pk_estado ni cambio en prog_mapa_pk_estados.

COMMENT ON TABLE public.prog_cpm_resultados IS
  'Resultados CPM por nodo (capítulo o agrupador WBS). El mapa agrega tiene_ruta_critica por PK en la API.';
