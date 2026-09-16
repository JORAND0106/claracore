/**
 * Inventario de superficie UI — Panel Admin › Actas (SeccionActasRpo).
 * Sirve como checklist de no-regresión tras reorganización visual Excel.
 * No importa AdminPanel (archivo enorme); documenta el contrato de UI.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

/** Inventario grilla de listado (desktop table + mobile cards). */
export const ACTAS_GRID_INVENTORY = {
  columns: [
    'Tipo',
    'RPO',
    'Período',
    'Consec.',
    'Tipo doc. / uso',
    'Costo (validación)',
    'Estado / Notas',
    'Acción',
  ],
  filters: ['todos', 'rpo', 'admin'],
  actions: [
    'Crear acta',
    'Editar',
    'Cerrar acta (RPO en período)',
    'Ver detalle RPO (#número enlace)',
    'Ver detalle (card móvil)',
  ],
  behaviors: [
    'Selector contrato (solo desarrollador)',
    'Carga lista + sync vencimiento en background',
    'Badge En período / Historial',
    'Badge cobro en tipo documental',
    'Catálogo tipos administrativas (toggle, nuevo tipo, tabla Nombre/Es cobro/Usos)',
    'Cards móvil con mismas acciones',
  ],
}

/** Inventario popup crear/editar acta. */
export const ACTAS_FORM_INVENTORY = {
  fieldsAlways: [
    'tipo_grupo (RPO | administrativa)',
    'consecutivo',
    'tipo_acta_id (catálogo, si hay tipos)',
    'observacion',
    'asignado_a (si hay usuarios)',
    'fecha_asignacion',
    'enlace',
  ],
  fieldsRpoOnly: [
    'numero_rpo',
    'fecha_inicio',
    'fecha_fin',
    'valor_comp_ambiental',
    'calificacion_ambiental',
    'valor_comp_social',
    'calificacion_social',
    'valor_comp_pmt',
    'calificacion_pmt',
    'valor_cobrado_adicional',
    'ajuste_iccp',
    'ajuste_icociv',
    'ajuste_ipc',
    'pct_proyectado_ajustes',
  ],
  actions: ['Cancelar', 'Guardar cambios / Crear acta', 'Cerrar (✕)'],
  validations: [
    'Consecutivo inválido',
    'Número RPO obligatorio (RPO)',
    'Fecha inicio/fin obligatorias (RPO)',
    'Fecha fin ≥ fecha inicio',
  ],
}

describe('Actas admin UI inventory', () => {
  it('grilla conserva 8 columnas', () => {
    assert.equal(ACTAS_GRID_INVENTORY.columns.length, 8)
    assert.ok(ACTAS_GRID_INVENTORY.columns.includes('Acción'))
    assert.ok(ACTAS_GRID_INVENTORY.filters.includes('rpo'))
  })

  it('formulario conserva campos RPO y acciones de guardado', () => {
    assert.ok(ACTAS_FORM_INVENTORY.fieldsAlways.includes('consecutivo'))
    assert.equal(ACTAS_FORM_INVENTORY.fieldsRpoOnly.length, 14)
    assert.ok(ACTAS_FORM_INVENTORY.actions.some((a) => /Guardar/.test(a)))
  })
})
