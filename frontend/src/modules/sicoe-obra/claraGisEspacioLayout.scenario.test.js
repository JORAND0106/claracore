/**
 * Contrato: ClaraGIS maximiza el plano — sin franja de contrato ni barra de filtros fija.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const mapaSrc = readFileSync(join(dir, 'ModuloPlanoMapaCalor.jsx'), 'utf8')
const filtroVistaSrc = readFileSync(join(dir, 'SicoeFiltroObraVista.jsx'), 'utf8')
const appSrc = readFileSync(join(dir, '../../App.jsx'), 'utf8')

describe('ClaraGIS espacio layout', () => {
  it('consolida filtros en popup flotante (sin barra fija sobre el plano)', () => {
    assert.match(mapaSrc, /cc-claragis-filtro-popup/)
    assert.match(mapaSrc, /nFiltrosActivos/)
    assert.match(mapaSrc, /compactBar/)
    assert.match(mapaSrc, /iconBtn\('filtros'/)
    // Ya no monta la barra de filtros fuera del mapa en escritorio.
    assert.doesNotMatch(mapaSrc, /\{!panelsAsIcons && \(\s*<SicoeFiltroObraVista/)
  })

  it('título va como overlay mínimo sobre el plano', () => {
    assert.match(mapaSrc, /cc-claragis-titulo-overlay/)
    assert.match(mapaSrc, /height: 'calc\(100dvh - 72px\)'/)
  })

  it('SicoeFiltroObraVista soporta popup compacto y hideChips', () => {
    assert.match(filtroVistaSrc, /hideChips = false/)
    assert.match(filtroVistaSrc, /compactBar = false/)
    assert.match(filtroVistaSrc, /cc-sicoe-filtro-bar--popup/)
  })

  it('selector de contrato vive en la barra superior, no en franja de módulo', () => {
    assert.match(appSrc, /selectorContratoHeader/)
    assert.match(appSrc, /aria-label="Contrato activo"/)
    // Franja topBar de contrato eliminada (el selector ya no se renderiza ahí).
    assert.doesNotMatch(
      appSrc,
      /moduloActivo !== 'dashboard' && !progRibbonEnHeader && !esContador && !viewportNavDrawer/,
    )
  })
})
