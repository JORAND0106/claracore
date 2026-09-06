/**
 * Popup nueva solicitud: título automático, grilla Excel y ancho +25%.
 * node --test frontend/src/almacen/solicitudFormExcelUi.test.js
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

describe('SolicitudForm Excel + título automático', () => {
  it('modal ampliado ~25% (1560px)', () => {
    const src = readFileSync(join(dir, 'SolicitudFormModal.jsx'), 'utf8')
    assert.match(src, /MODAL_WIDTH\s*=\s*'min\(1560px, 100%\)'/)
  })

  it('formulario usa título automático y grilla Excel', () => {
    const src = readFileSync(join(dir, 'SolicitudForm.jsx'), 'utf8')
    assert.match(src, /formatSolicitudTituloAuto/)
    assert.match(src, /SolicitudFormExcelTable/)
    assert.doesNotMatch(src, /placeholder="Ej\.: Materiales muro/)
  })

  it('grilla define columnas Capítulo / Ítem / Material / Ubicación / Cantidad / Observación', () => {
    const src = readFileSync(join(dir, 'SolicitudFormExcelTable.jsx'), 'utf8')
    assert.match(src, /Capítulo/)
    assert.match(src, /Ítem/)
    assert.match(src, /Material/)
    assert.match(src, /Ubicación/)
    assert.match(src, /Cantidad/)
    assert.match(src, /Observación/)
    assert.match(src, /SolicitudLineaUbicacionEditor/)
  })
})
