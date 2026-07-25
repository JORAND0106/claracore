-- Paleta por contrato para exportes PDF/XLSX: Encabezado | Título 1 | Título 2 | Cuerpos (bg + text cada uno).
alter table contratos
  add column if not exists export_palette jsonb not null default '{}'::jsonb;

comment on column contratos.export_palette is
  'Paleta export: encabezado, titulo_1, titulo_2, linea_principal, linea_secundaria — cada uno { bg, text } en hex';
