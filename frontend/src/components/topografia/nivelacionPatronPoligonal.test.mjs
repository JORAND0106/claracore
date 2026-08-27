/**
 * Regresión: Circuito de Nivelación sigue el patrón Poligonal
 * (panel compacto + cartera consolidada + edición por clic + deshacer).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const read = (name) => readFileSync(join(dir, name), 'utf8')

describe('Nivelación — patrón Poligonal (estructura)', () => {
  it('Form integra panel, cartera, popup y undo toast', () => {
    const src = read('NivelacionForm.jsx')
    assert.match(src, /NivelacionIngresoPanel/)
    assert.match(src, /NivelacionCarteraTable/)
    assert.match(src, /NivelacionLecturaEditModal/)
    assert.match(src, /PoligonalUndoToast/)
    assert.match(src, /Agregar lectura|agregarLectura/)
    assert.match(src, /editableCartera/)
    assert.match(src, /esDesarrolladorTopo/)
    assert.match(src, /confirmEliminarFila|solicitarEliminarFila/)
  })

  it('importa PanelColapsable (evita pantalla en blanco al abrir circuito)', () => {
    // Tras el merge al patrón Poligonal se eliminó el helper local PanelColapsable
    // y quedó el JSX sin import → ReferenceError al montar detalle existente.
    const src = read('NivelacionForm.jsx')
    assert.match(
      src,
      /import\s*\{[^}]*\bPanelColapsable\b[^}]*\}\s*from\s*['"]\.\/topografiaShared['"]/s,
    )
    assert.match(src, /<PanelColapsable[\s>]/)
    assert.doesNotMatch(src, /^function PanelColapsable\b/m)
  })

  it('panel de ingreso expone V+/Vi/V− y Agregar lectura', () => {
    const src = read('NivelacionIngresoPanel.jsx')
    assert.match(src, /V\+ \(vista atrás\)/)
    assert.match(src, /Vi \(intermedia\)/)
    assert.match(src, /V− \(vista adelante\)/)
    assert.match(src, /Agregar lectura/)
    assert.match(src, /Elegir PK/)
  })

  it('cartera es de solo lectura con clic para editar', () => {
    const src = read('NivelacionCarteraTable.jsx')
    assert.match(src, /Clic para editar|Toque para editar/)
    assert.match(src, /onEditar/)
    assert.match(src, /Cartera consolidada|Sin lecturas en la cartera/)
  })

  it('popup de edición cubre los tres hilos', () => {
    const src = read('NivelacionLecturaEditModal.jsx')
    assert.match(src, /Editar lectura/)
    assert.match(src, /vplus/)
    assert.match(src, /vminus/)
    assert.match(src, /Guardar cambios/)
  })
})
