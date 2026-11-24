/**
 * C-OUT-14 · estado de guardado en el ícono (sin texto que mueva la barra).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (name) => readFileSync(join(__dirname, name), 'utf8')

describe('caso · ícono de guardado estable (C-OUT-14)', () => {
  it('no hay texto Guardado/Guardando junto al título; estado en el ícono', () => {
    const modal = read('EsquemaEditorModal.jsx')
    // Título sin span de estado al lado.
    assert.doesNotMatch(
      modal,
      /\{title\}<\/div>\s*<span[\s\S]{0,400}?Guardando…/,
    )
    assert.doesNotMatch(
      modal,
      /data-testid="esquema-draft-status"[\s\S]{0,200}?\{draftSaveStatus === 'saving' \? 'Guardando…'/,
    )

    assert.match(modal, /esquema-guardar-borrador/)
    assert.match(modal, /draftSaveIconColor/)
    assert.match(modal, /draftSaveIconTooltip/)
    assert.match(modal, /#d97706/) // ámbar Guardando
    assert.match(modal, /#dc2626/) // rojo Sin guardar / offline
    assert.match(modal, /Guardando — Guardar borrador/)
    assert.match(modal, /Guardado — Guardar borrador/)
    assert.match(modal, /Sin guardar — Guardar borrador/)
  })

  it('cambio de estado no altera tamaño del botón (solo color)', () => {
    const modal = read('EsquemaEditorModal.jsx')
    const btn = modal.match(
      /data-testid="esquema-guardar-borrador"[\s\S]{0,900}?<\/button>/,
    )
    assert.ok(btn, 'botón de guardar borrador')
    assert.match(btn[0], /draftSaveIconColor/)
    assert.match(btn[0], /IconGuardarBorrador/)
    // No minWidth/width dinámicos según status.
    assert.doesNotMatch(btn[0], /minWidth:\s*draftSaveStatus|width:\s*draftSaveStatus/)
    assert.doesNotMatch(btn[0], /Guardando…\s*<\/span>/)
  })

  it('contrato y test:esquema', () => {
    const md = read('CONTRATO_ESQUEMA.md')
    assert.match(md, /solo en el ícono de guardar borrador/)
    assert.match(md, /ámbar/)
    assert.match(md, /esquemaIconoGuardado/)
    assert.match(md, /38b\./)

    const pkg = JSON.parse(readFileSync(join(__dirname, '../../../package.json'), 'utf8'))
    assert.match(pkg.scripts['test:esquema'], /esquemaIconoGuardado\.scenario\.test\.js/)
  })
})
