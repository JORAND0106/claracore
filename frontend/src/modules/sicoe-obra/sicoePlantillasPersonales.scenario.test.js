/**
 * Plantillas de reporte personales + eliminación con confirmación.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const main = readFileSync(join(here, '../../../../backend/main.py'), 'utf8')
const app = readFileSync(join(here, '../../App.jsx'), 'utf8')
const cache = readFileSync(join(here, 'sicoeCatalogoCache.js'), 'utf8')

describe('Sicoe — plantillas personales', () => {
  it('listar filtra por creado_por del usuario', () => {
    assert.match(main, /def listar_plantillas/)
    assert.match(main, /\.eq\("creado_por", uid\)/)
  })

  it('DELETE solo del dueño', () => {
    assert.match(main, /def eliminar_plantilla/)
    assert.match(main, /Solo puede eliminar sus propias plantillas/)
  })

  it('UI: icono eliminar + CcConfirmModal', () => {
    assert.match(app, /title="Eliminar plantilla"/)
    assert.match(app, /plantillaAEliminar/)
    assert.match(app, /¿Eliminar la plantilla/)
    assert.match(app, /Trash2/)
  })

  it('caché de plantillas es por usuario', () => {
    assert.match(cache, /cacheKey\(\['plantillas', contratoId, cap, usuarioId/)
    assert.match(cache, /invalidateSicoePlantillasCache/)
  })
})
