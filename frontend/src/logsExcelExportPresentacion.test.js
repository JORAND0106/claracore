import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const admin = readFileSync(new URL('./AdminPanel.jsx', import.meta.url), 'utf8')

describe('SeccionLogs — exportación Excel', () => {
  it('usa /logs/export.xlsx y botón Excel (no CSV)', () => {
    const logsFn = admin.indexOf('function SeccionLogs')
    assert.ok(logsFn >= 0)
    const nextFn = admin.indexOf('\nfunction ', logsFn + 10)
    const block = admin.slice(logsFn, nextFn > 0 ? nextFn : undefined)
    assert.match(block, /\/logs\/export\.xlsx/)
    assert.match(block, /⬇ Excel/)
    assert.doesNotMatch(block, /\/logs\/export\.csv/)
    assert.doesNotMatch(block, /claracore_logs\.csv/)
  })

  it('envía contrato_id del usuario activo cuando existe', () => {
    assert.match(admin, /function SeccionLogs\(\{ call, theme, user = null \}/)
    assert.match(admin, /user\?\.contrato_id\) params\.set\("contrato_id"/)
    assert.match(admin, /\{tab === "logs"\s+&& <SeccionLogs\s+call=\{call\} theme=\{activeTheme\} user=\{user\} \/>/)
  })
})
