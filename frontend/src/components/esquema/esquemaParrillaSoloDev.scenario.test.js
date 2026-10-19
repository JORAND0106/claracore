/**
 * Caso 29 · Botón «Dibujar parrilla» solo para rol desarrollador.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { esEsquemaUsuarioDesarrollador } from './esquemaAuth.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('caso 29 · Dibujar parrilla solo desarrollador', () => {
  it('detecta desarrollador por cargo, rol, rol_id y flags', () => {
    assert.equal(esEsquemaUsuarioDesarrollador({ cargo_nombre: 'Desarrollador', id: 1 }), true)
    assert.equal(esEsquemaUsuarioDesarrollador({ rol_nombre: 'desarrollador', id: 2 }), true)
    assert.equal(esEsquemaUsuarioDesarrollador({ rol_id: 1, cargo_nombre: 'Otro', id: 3 }), true)
    assert.equal(esEsquemaUsuarioDesarrollador({ es_desarrollador: true, cargo_nombre: 'Inspector', id: 4 }), true)
    assert.equal(esEsquemaUsuarioDesarrollador({ acceso_total: true, cargo_nombre: 'Admin', id: 5 }), true)
    assert.equal(esEsquemaUsuarioDesarrollador({ cargo: 'desarrollador' }), true)
  })

  it('otros roles no son desarrollador', () => {
    assert.equal(esEsquemaUsuarioDesarrollador({ cargo_nombre: 'Inspector de Obra', rol_nombre: 'usuario', id: 10 }), false)
    assert.equal(esEsquemaUsuarioDesarrollador({ cargo_nombre: 'Administrador', id: 11 }), false)
    assert.equal(esEsquemaUsuarioDesarrollador({ rol_id: 2, cargo_nombre: 'Residente', id: 12 }), false)
    assert.equal(esEsquemaUsuarioDesarrollador(null), false)
    assert.equal(esEsquemaUsuarioDesarrollador(undefined), false)
  })

  it('panel oculta el botón si allowDibujarParrilla es false', () => {
    const panel = readFileSync(join(__dirname, 'esquemaDespiecePanel.jsx'), 'utf8')
    assert.match(panel, /allowDibujarParrilla && typeof onDibujarParrilla/)
    assert.match(panel, /despiece-dibujar-parrilla/)
  })

  it('modal cablea allowDibujarParrilla a esDesarrollador y no solo a !isPhoneLayout', () => {
    const modal = readFileSync(join(__dirname, 'EsquemaEditorModal.jsx'), 'utf8')
    assert.match(modal, /esEsquemaUsuarioDesarrollador/)
    assert.match(modal, /allowDibujarParrilla\s*=\s*esDesarrollador\s*&&\s*!isPhoneLayout/)
    assert.match(modal, /allowDibujarParrilla=\{allowDibujarParrilla\}/)
    assert.match(modal, /if\s*\(\s*!esDesarrolladorRef\.current\s*\)\s*return/)
    assert.doesNotMatch(modal, /allowDibujarParrilla=\{!isPhoneLayout\}/)
  })

  it('contrato C-DES-07 y caso 29 documentan solo desarrollador', () => {
    const md = readFileSync(join(__dirname, 'CONTRATO_ESQUEMA.md'), 'utf8')
    assert.match(md, /C-DES-07/)
    assert.match(md, /solo rol desarrollador/i)
    assert.match(md, /29\.\s*\*\*Parrilla solo desarrollador/)
    assert.match(md, /esquemaParrillaSoloDev/)

    const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8'))
    assert.match(pkg.scripts['test:esquema'], /esquemaParrillaSoloDev\.scenario\.test\.js/)
  })
})
