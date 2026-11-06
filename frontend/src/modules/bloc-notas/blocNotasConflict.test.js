import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { conflictTitle, shouldCreateConflictCopy } from './blocNotasConflict.js'
import { isQuotaExceededError, QUOTA_FULL_MESSAGE } from './blocNotasQuota.js'
import { formatColombiaDateTime } from './blocNotasTime.js'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('bloc de notas · conflicto y cuota', () => {
  it('crea copia automática solo si el servidor avanzó', () => {
    assert.deepEqual(
      shouldCreateConflictCopy({ serverRev: 5, baseRev: 3 }),
      { keepServer: true, copyLocal: true },
    )
    assert.deepEqual(
      shouldCreateConflictCopy({ serverRev: 3, baseRev: 3 }),
      { keepServer: false, copyLocal: false },
    )
    assert.deepEqual(
      shouldCreateConflictCopy({ serverRev: 5, baseRev: 3, deleted: true }),
      { keepServer: false, copyLocal: false },
    )
  })

  it('título de copia no pierde el nombre base', () => {
    assert.equal(conflictTitle('Apunte PK 12+340'), 'Apunte PK 12+340 · copia')
    assert.equal(conflictTitle(''), 'Nota · copia')
  })

  it('mensaje de cuota sin jerga técnica', () => {
    assert.ok(!/QuotaExceeded|IndexedDB|navigator/i.test(QUOTA_FULL_MESSAGE))
    assert.equal(isQuotaExceededError({ name: 'QuotaExceededError' }), true)
    assert.equal(isQuotaExceededError({ message: 'ok' }), false)
  })

  it('fecha Colombia formateable', () => {
    const s = formatColombiaDateTime('2026-11-06T04:00:00.000Z')
    assert.ok(s.length > 8)
  })

  it('cuerpo de nota vacío tiene mano, texto, post-its y esquemas', () => {
    const dbSrc = readFileSync(join(__dirname, 'blocNotasDb.js'), 'utf8')
    assert.match(dbSrc, /strokes:\s*\[\]/)
    assert.match(dbSrc, /textBlocks:\s*\[\]/)
    assert.match(dbSrc, /postits:\s*\[\]/)
    assert.match(dbSrc, /esquemas:\s*\[\]/)
  })

  it('módulo invoca EsquemaEditorModal y oculta en celular', () => {
    const mod = join(__dirname, 'ModuloBlocNotas.jsx')
    assert.ok(existsSync(mod))
    const src = readFileSync(mod, 'utf8')
    assert.match(src, /EsquemaEditorModal/)
    assert.match(src, /isEsquemaPhoneViewport|isPhone/)
    assert.match(src, /!isPhone/)
  })

  it('icono búho es SVG a color con tooltip Bloc de notas', () => {
    const btn = readFileSync(join(__dirname, 'BlocNotasHeaderButton.jsx'), 'utf8')
    const owl = readFileSync(join(__dirname, 'BlocNotasOwlIcon.jsx'), 'utf8')
    assert.match(btn, /title = 'Bloc de notas'/)
    assert.match(owl, /<svg/)
    assert.match(owl, /#8B6914|#F4A261|#1E3A5F/)
  })
})
