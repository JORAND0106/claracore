/**
 * Contrato: al entrar / cambiar contrato, ClaraGIS ejecuta la búsqueda con el
 * bundle inicial (No Revisado para validadores) sin pulsar Buscar.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'ModuloPlanoMapaCalor.jsx'), 'utf8')
const tips = readFileSync(join(dir, '../../components/CcTitleTooltips.jsx'), 'utf8')

describe('ClaraGIS auto-búsqueda y tip de iconos', () => {
  it('efecto de entrada llama cargarMapaCalor con el bundle inicial', () => {
    assert.match(src, /void cargarMapaCalorRef\.current\(inicial\)/)
    assert.match(src, /bundleInicialClaraGis\(contratoId/)
    // No debe quedar el effect viejo que dependía del state y se saltaba la 1ª carga.
    assert.equal(
      /if \(autoBusquedaHechaRef\.current \|\| busquedaRealizada \|\| buscando\) return/.test(src),
      false,
    )
  })

  it('iconos de panel cierran el tip al activarse', () => {
    assert.match(src, /data-cc-tip-action="1"/)
    assert.match(src, /cc-title-tooltip-hide/)
  })

  it('CcTitleTooltips no muestra tip táctil en controles accionables', () => {
    assert.match(tips, /isActionableTipTarget/)
    assert.match(tips, /el toque ejecuta la acción/)
  })
})
