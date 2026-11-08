import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MODO_ACTUALIZADO,
  MODO_RETROACTIVO,
  marcaRetroactivoVisible,
  resolverModoInicial,
} from './retroactivoModo.js'

const dir = dirname(fileURLToPath(import.meta.url))

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (e) {
    console.error(`not ok - ${name}`)
    throw e
  }
}

test('marca visible solo pendiente', () => {
  assert.equal(marcaRetroactivoVisible({ es_retroactivo: true }), true)
  assert.equal(marcaRetroactivoVisible({
    es_retroactivo: true,
    retroactivo_validado_at: '2026-01-01',
  }), false)
  assert.equal(marcaRetroactivoVisible({ es_retroactivo: false }), false)
})

test('resolver modo sin habilitación → actualizado', () => {
  assert.equal(resolverModoInicial({ puede_usar_modo: false }, 1, 2), MODO_ACTUALIZADO)
})

test('UI y API incluyen endpoints retroactivo', () => {
  const api = readFileSync(join(dir, 'almacenApi.js'), 'utf8')
  assert.match(api, /retroactivo\/estado/)
  assert.match(api, /validarRetroactivo/)
  const panel = readFileSync(join(dir, 'EntradasPanel.jsx'), 'utf8')
  assert.match(panel, /RetroactivoModoBar/)
  assert.match(panel, /BadgeRetroactivo/)
  const tablet = readFileSync(join(dir, 'EntradaRegistroTablet.jsx'), 'utf8')
  assert.match(tablet, /es_retroactivo/)
  assert.match(tablet, /fecha-hecho/)
  const salio = readFileSync(join(dir, 'SalioMaterialPopup.jsx'), 'utf8')
  assert.match(salio, /es_retroactivo/)
  assert.equal(MODO_RETROACTIVO, 'retroactivo')
})

console.log('retroactivoModo.test.js passed')
