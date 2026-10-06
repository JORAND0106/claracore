import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const admin = readFileSync(new URL('./AdminPanel.jsx', import.meta.url), 'utf8')
const logs = readFileSync(new URL('./admin/SeccionLogs.jsx', import.meta.url), 'utf8')

describe('SeccionLogs — exportación Excel', () => {
  it('el panel abre la vista de modificaciones y esa vista exporta xlsx', () => {
    assert.match(admin, /import SeccionLogs from "\.\/admin\/SeccionLogs"/)
    assert.match(admin, /\{tab === "logs"\s+&& <SeccionLogs\s+call=\{call\} theme=\{activeTheme\} t=\{t\} user=\{user\} \/>/)
    assert.match(logs, /\/logs\/export\.xlsx/)
    assert.match(logs, /user\?\.contrato_id\) params\.set\('contrato_id'/)
    assert.doesNotMatch(logs, /\/logs\/export\.csv/)
    assert.doesNotMatch(logs, /claracore_logs\.csv/)
  })
})
