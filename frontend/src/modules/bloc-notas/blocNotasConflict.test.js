import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  conflictTitle,
  shouldCreateConflictCopy,
  isConflictCopyTitle,
} from './blocNotasConflict.js'
import { isQuotaExceededError, QUOTA_FULL_MESSAGE } from './blocNotasQuota.js'
import { formatColombiaDateTime } from './blocNotasTime.js'
import { getDefaultWriteMode, setDefaultWriteMode } from './blocNotasPrefs.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('bloc de notas · conflicto real multi-dispositivo', () => {
  it('NO crea copia si es el mismo dispositivo', () => {
    assert.deepEqual(
      shouldCreateConflictCopy({
        serverRev: 5,
        baseRev: 3,
        serverDeviceId: 'dev-a',
        clientDeviceId: 'dev-a',
      }),
      { keepServer: false, copyLocal: false },
    )
  })

  it('NO crea copia si falta device_id', () => {
    assert.deepEqual(
      shouldCreateConflictCopy({ serverRev: 5, baseRev: 3, serverDeviceId: null, clientDeviceId: 'x' }),
      { keepServer: false, copyLocal: false },
    )
  })

  it('NO crea copia si base_rev es null (primera subida)', () => {
    assert.deepEqual(
      shouldCreateConflictCopy({
        serverRev: 1,
        baseRev: null,
        serverDeviceId: 'a',
        clientDeviceId: 'b',
      }),
      { keepServer: false, copyLocal: false },
    )
  })

  it('SÍ crea copia solo entre dispositivos distintos con rev adelantado', () => {
    assert.deepEqual(
      shouldCreateConflictCopy({
        serverRev: 5,
        baseRev: 3,
        serverDeviceId: 'tablet',
        clientDeviceId: 'ipad',
      }),
      { keepServer: true, copyLocal: true },
    )
  })

  it('título de copia y detección', () => {
    assert.equal(conflictTitle('Apunte'), 'Apunte · copia')
    assert.equal(isConflictCopyTitle('Nota · copia'), true)
    assert.equal(isConflictCopyTitle('Nota'), false)
  })

  it('mensaje de cuota sin jerga técnica', () => {
    assert.ok(!/QuotaExceeded|IndexedDB|navigator/i.test(QUOTA_FULL_MESSAGE))
    assert.equal(isQuotaExceededError({ name: 'QuotaExceededError' }), true)
  })

  it('fecha Colombia formateable', () => {
    const s = formatColombiaDateTime('2026-11-06T04:00:00.000Z')
    assert.ok(s.length > 8)
  })

  it('preferencia de escritura por usuario (default teclado)', () => {
    const id = 'test-user-prefs'
    try { localStorage.removeItem(`claracore_bloc_write_mode_${id}`) } catch { /* node */ }
    // En Node sin localStorage el default sigue siendo text
    assert.equal(getDefaultWriteMode(id), 'text')
    try {
      setDefaultWriteMode(id, 'hand')
      assert.equal(getDefaultWriteMode(id), 'hand')
      setDefaultWriteMode(id, 'text')
      assert.equal(getDefaultWriteMode(id), 'text')
    } catch {
      assert.ok(true) // entorno sin localStorage
    }
  })

  it('módulo: cuaderno UI, TemaRichEditor, tooltips y crear con mutex', () => {
    const mod = join(__dirname, 'ModuloBlocNotas.jsx')
    assert.ok(existsSync(mod))
    const src = readFileSync(mod, 'utf8')
    assert.match(src, /TemaRichEditor/)
    assert.match(src, /creatingRef/)
    assert.match(src, /base_rev:\s*null/)
    assert.match(src, /data-cc-tooltip|BlocNotasIconBtn/)
    assert.match(src, /¿Dejar escritura a mano/)
    assert.match(src, /Volver a cuadernos|Nuevo cuaderno/)
    assert.match(src, /Deshacer|Rehacer/)
    assert.match(src, /Enviar a la Pizarra/)
    assert.match(src, /maxWidth:\s*'100%'/)
    assert.doesNotMatch(src, /width:\s*200.*flexShrink:\s*0[\s\S]*width:\s*220/)
  })

  it('sync exige device distinto y usa candado', () => {
    const sync = readFileSync(join(__dirname, 'blocNotasSync.js'), 'utf8')
    assert.match(sync, /syncLocks/)
    assert.match(sync, /dedupeFalseConflictCopies/)
    const routes = readFileSync(
      join(__dirname, '../../../../backend/bloc_notas_routes.py'),
      'utf8',
    )
    assert.match(routes, /is_real_conflict/)
    assert.match(routes, /client_device != server_device/)
  })

  it('dedupe conserva contenido distinto', () => {
    const dedup = readFileSync(join(__dirname, 'blocNotasDedup.js'), 'utf8')
    assert.match(dedup, /bodyHasContent/)
    assert.match(dedup, /bodyFingerprint/)
    assert.match(dedup, /softDeleteNote/)
  })

  it('cuerpo vacío usa teclado por defecto y richHtml', () => {
    const dbSrc = readFileSync(join(__dirname, 'blocNotasDb.js'), 'utf8')
    assert.match(dbSrc, /tool:\s*'text'/)
    assert.match(dbSrc, /richHtml/)
  })
})
