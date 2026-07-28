import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  FO_EO04_POLL_MAX_CONSEC_FAIL,
  FO_EO04_POLL_MAX_MS,
  decidirPollEstadoJobPdf,
  intervaloPollJobPdfMs,
  mensajeJobPdfNoEncontrado,
} from './informesPdfJobPoll.js'

describe('intervaloPollJobPdfMs', () => {
  it('es agresivo al inicio y hace backoff después', () => {
    assert.equal(intervaloPollJobPdfMs(0), 1200)
    assert.equal(intervaloPollJobPdfMs(60_000), 2000)
    assert.equal(intervaloPollJobPdfMs(200_000), 3500)
    assert.equal(intervaloPollJobPdfMs(400_000), 5000)
  })
})

describe('decidirPollEstadoJobPdf', () => {
  it('detiene de inmediato ante 404 (job inexistente/expirado)', () => {
    const d = decidirPollEstadoJobPdf({
      httpStatus: 404,
      ok: false,
      elapsedMs: 5_000,
      consecFails: 0,
    })
    assert.equal(d.action, 'stop')
    assert.equal(d.reason, 'not_found')
    assert.match(d.message, /ya no existe|expir/i)
    assert.equal(d.message, mensajeJobPdfNoEncontrado())
  })

  it('detiene ante 410 (expirado)', () => {
    const d = decidirPollEstadoJobPdf({ httpStatus: 410, ok: false, elapsedMs: 1000 })
    assert.equal(d.action, 'stop')
    assert.equal(d.reason, 'not_found')
  })

  it('reintenta fallos transitorios y corta tras el máximo', () => {
    let fails = 0
    for (let i = 0; i < FO_EO04_POLL_MAX_CONSEC_FAIL - 1; i++) {
      const d = decidirPollEstadoJobPdf({
        httpStatus: 503,
        ok: false,
        elapsedMs: 10_000,
        consecFails: fails,
      })
      assert.equal(d.action, 'retry')
      fails = d.consecFails
    }
    const stop = decidirPollEstadoJobPdf({
      httpStatus: 503,
      ok: false,
      elapsedMs: 10_000,
      consecFails: fails,
    })
    assert.equal(stop.action, 'stop')
    assert.equal(stop.reason, 'unreachable')
  })

  it('corta por timeout absoluto aunque la respuesta sea ok', () => {
    const d = decidirPollEstadoJobPdf({
      httpStatus: 200,
      ok: true,
      elapsedMs: FO_EO04_POLL_MAX_MS,
      consecFails: 0,
    })
    assert.equal(d.action, 'stop')
    assert.equal(d.reason, 'timeout')
  })

  it('continúa cuando el estado HTTP es ok', () => {
    const d = decidirPollEstadoJobPdf({
      httpStatus: 200,
      ok: true,
      elapsedMs: 40_000,
      consecFails: 2,
    })
    assert.equal(d.action, 'ok')
    assert.equal(d.consecFails, 0)
    assert.equal(d.delayMs, 2000)
  })
})
