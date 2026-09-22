/**
 * Regresión: imports de SicoePlanillaTuberiaOrigenTab deben resolver en Vite build.
 * node --test frontend/src/modules/sicoe-obra/sicoePlanillaTuberiaOrigenImports.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'SicoePlanillaTuberiaOrigenTab.jsx'), 'utf8')
const frontendSrc = join(dir, '../..')

describe('SicoePlanillaTuberiaOrigenTab imports', () => {
  it('API_BASE apunta a src/apiBase (no tres niveles arriba)', () => {
    assert.match(src, /from ['"]\.\.\/\.\.\/apiBase['"]/)
    assert.doesNotMatch(src, /from ['"]\.\.\/\.\.\/\.\.\/apiBase['"]/)
    assert.equal(existsSync(join(frontendSrc, 'apiBase.js')), true)
  })

  it('fmtNDash apunta a components/topografia/planillaTuberia', () => {
    assert.match(
      src,
      /from ['"]\.\.\/\.\.\/components\/topografia\/planillaTuberia\/planillaTuberiaUtils['"]/,
    )
    assert.equal(
      existsSync(join(frontendSrc, 'components/topografia/planillaTuberia/planillaTuberiaUtils.js')),
      true,
    )
  })
})
