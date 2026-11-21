/**
 * Programación de obra: la barra de iconos vive en el módulo, no en el header global.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const appSrc = readFileSync(join(root, 'App.jsx'), 'utf8')
const modSrc = readFileSync(join(root, 'ModuloProgramacionObra.jsx'), 'utf8')
const ribbonSrc = readFileSync(join(root, 'ProgObraHeaderRibbon.jsx'), 'utf8')

describe('prog-obra ribbon layout', () => {
  it('App no monta el ribbon de programación en el encabezado global', () => {
    assert.doesNotMatch(appSrc, /ProgObraHeaderRibbon/)
    assert.doesNotMatch(appSrc, /progRibbonEnHeader/)
    assert.doesNotMatch(appSrc, /onRibbonChange=\{setProgRibbon\}/)
  })

  it('el módulo renderiza el ribbon en su panel propio', () => {
    assert.match(modSrc, /import ProgObraHeaderRibbon from '\.\/ProgObraHeaderRibbon'/)
    assert.match(modSrc, /<ProgObraHeaderRibbon/)
    assert.match(ribbonSrc, /Acciones de programación de obra/)
  })

  it('el tiempo /mapa no se muestra a usuarios normales', () => {
    assert.match(modSrc, /esDev && mapaResp\?\.tiempo_ms/)
    assert.doesNotMatch(modSrc, /\/mapa \{mapaResp\.tiempo_ms\} ms\s*<\/div>/)
  })

  it('banner de borrador corto y conmutador de mapa solo con iconos', () => {
    assert.match(modSrc, /Borrador nº\{borradorMeta\.numero_version\}/)
    assert.doesNotMatch(modSrc, /el mapa refleja el avance de este borrador\s*<\/div>/)
    assert.match(modSrc, /tip: 'Programación'/)
    assert.match(modSrc, /tip: 'Ejecutado'/)
  })

  it('recuadro de ejecución no usa etiqueta N1 ni «Sin datos de ejecución»', () => {
    assert.doesNotMatch(modSrc, /Ejecución SICOE \(N1\)/)
    assert.doesNotMatch(modSrc, /Sin datos de ejecución/)
    assert.match(modSrc, />\s*Ejecutado\s*</)
  })
})
