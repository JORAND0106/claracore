import { describe, it, mock, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { enviarPruebaResumenJornada } from './tempPruebaResumenJornada.js'

describe('tempPruebaResumenJornada', () => {
  beforeEach(() => {
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        enviado: true,
        destinatario: 'dev@test.local',
        contrato_numero: 'CTO-1',
        acta_rpo: 5,
      }),
    }))
  })

  afterEach(() => {
    mock.restoreAll()
  })

  it('POST al endpoint temp con JWT y periodo manana', async () => {
    const out = await enviarPruebaResumenJornada({
      apiUrl: 'https://api.test',
      getToken: () => 'tok-abc',
      contratoId: 2,
      periodo: 'manana',
    })
    assert.equal(out.destinatario, 'dev@test.local')
    const [url, opts] = globalThis.fetch.mock.calls[0].arguments
    assert.match(url, /prueba-resumen-jornada\?/)
    assert.match(url, /contrato_id=2/)
    assert.match(url, /periodo=manana/)
    assert.equal(opts.method, 'POST')
    assert.equal(opts.headers.Authorization, 'Bearer tok-abc')
  })

  it('error claro si enviado=false', async () => {
    mock.restoreAll()
    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => ({ enviado: false, error: 'smtp_no_configurado' }),
    }))
    await assert.rejects(
      () =>
        enviarPruebaResumenJornada({
          apiUrl: 'https://api.test',
          getToken: () => 't',
          contratoId: 3,
          periodo: 'tarde',
        }),
      /smtp_no_configurado/,
    )
  })
})
