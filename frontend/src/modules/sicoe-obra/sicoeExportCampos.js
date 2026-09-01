/**
 * Catálogo de campos virtuales / etiquetas para export Excel de registros SICOE.
 * Espejo de la lógica del popup en App.jsx (ModuloSicoeObra).
 */

export const SICOE_CAMPOS_VIRTUALES_EXPORT = Object.freeze([
  'reporte_numero',
  'acta_rpo_numero',
  'semana_numero',
  'corte_numero',
  'pk_id_valor',
  'subcontratista_nombre',
])

export const SICOE_LABELS_EXPORT = Object.freeze({
  reporte_numero: 'Reporte',
  acta_rpo_numero: 'Acta RPO',
  semana_numero: 'Semana',
  corte_numero: 'Numero de Corte',
  pk_id_valor: 'PK_ID',
  subcontratista_nombre: 'Subcontratista',
  vlr_unitario: 'Valor unitario',
  cantidad_total: 'Cantidad total',
  item_numero: 'Item',
  item_descripcion: 'Descripcion',
  nivel1_estado: 'Estado nivel 1',
  nivel2_estado: 'Estado nivel 2',
  nivel3_estado: 'Estado nivel 3',
  nivel4_estado: 'Estado nivel 4',
  nivel5_estado: 'Estado nivel 5',
  nivel6_estado: 'Estado nivel 6',
  sub_estado: 'Estado sub',
})

/** Selección por defecto al abrir el popup de exportación. */
export const SICOE_EXPORT_CAMPOS_DEFAULT = Object.freeze([
  'reporte_numero',
  'acta_rpo_numero',
  'semana_numero',
  'corte_numero',
  'numero_registro',
  'capitulo',
  'item_numero',
  'item_descripcion',
  'unidad',
  'vlr_unitario',
  'longitud',
  'ancho',
  'espesor',
  'cantidad_total',
  'costo_directo',
  'pk_id_valor',
  'tramo',
  'margen',
  'nivel1_estado',
  'nivel2_estado',
  'nivel3_estado',
])

export function sicoePrettyCampoExport(c, labels = SICOE_LABELS_EXPORT) {
  return labels[c] || String(c || '').replace(/_/g, ' ').replace(/\bid\b/gi, 'ID').toUpperCase()
}
