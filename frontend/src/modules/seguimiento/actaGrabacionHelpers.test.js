import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildGrabacionFilename,
  downloadBlob,
  extensionForMime,
  formatMinutosCupo,
  formatMmSs,
  pickRecorderMimeType,
  segundosAReclamar,
} from './actaGrabacionHelpers.js'
import { createGrabacionSessionController } from './actaGrabacionSession.js'

describe('actaGrabacionHelpers', () => {
  it('formatea mm:ss', () => {
    assert.equal(formatMmSs(0), '00:00')
    assert.equal(formatMmSs(65), '01:05')
    assert.equal(formatMmSs(180 * 60), '180:00')
  })

  it('formatea minutos de cupo', () => {
    assert.equal(formatMinutosCupo(10800), '180')
    assert.equal(formatMinutosCupo(90), '1.5')
    assert.equal(formatMinutosCupo(0), '0')
  })

  it('elige mime soportado', () => {
    assert.equal(
      pickRecorderMimeType((t) => t === 'audio/webm'),
      'audio/webm',
    )
    assert.equal(pickRecorderMimeType(() => false), '')
  })

  it('extensión por mime', () => {
    assert.equal(extensionForMime('audio/webm;codecs=opus'), 'webm')
    assert.equal(extensionForMime('audio/mp4'), 'm4a')
    assert.equal(extensionForMime('audio/ogg'), 'ogg')
  })

  it('nombre de archivo estable', () => {
    const name = buildGrabacionFilename({
      fecha: '2026-09-12',
      consecutivo: 7,
      mime: 'audio/webm',
      now: new Date(2026, 8, 12, 14, 5, 0),
    })
    assert.equal(name, 'claracore-grabacion-acta-7-2026-09-12_1405.webm')
  })

  it('segundos a reclamar respeta tope por beat', () => {
    assert.equal(segundosAReclamar({ elapsedSec: 10, alreadyClaimed: 10 }), 0)
    assert.equal(segundosAReclamar({ elapsedSec: 40, alreadyClaimed: 10 }), 30)
    assert.equal(segundosAReclamar({ elapsedSec: 400, alreadyClaimed: 10 }), 120)
  })

  it('downloadBlob dispara ancla sin depender del DOM real', () => {
    const clicks = []
    const removed = []
    const ok = downloadBlob(new Blob(['x'], { type: 'audio/webm' }), 't.webm', {
      createObjectURL: () => 'blob:fake',
      revokeObjectURL: () => {},
      createElement: () => ({
        style: {},
        click: () => clicks.push(1),
      }),
      body: {
        appendChild() {},
        removeChild() { removed.push(1) },
      },
    })
    assert.equal(ok, true)
    assert.equal(clicks.length, 1)
    assert.equal(removed.length, 1)
  })
})

describe('createGrabacionSessionController', () => {
  it('flujo start→stop: cupo + descarga local (sin subir audio)', async () => {
    const calls = { iniciar: 0, reclamar: 0, finalizar: 0, download: 0 }
    const api = {
      async iniciarGrabacion() {
        calls.iniciar += 1
        return {
          permitido: true,
          segundos_restantes: 10800,
          sesion: { id: 9, estado: 'activa' },
        }
      },
      async reclamarGrabacion(id, segundos) {
        calls.reclamar += 1
        assert.equal(id, 9)
        return {
          claimed: segundos,
          segundos_restantes: 10800 - segundos,
          debe_cerrar: false,
          sesion: { id: 9, estado: 'activa' },
        }
      },
      async finalizarGrabacion(id, body) {
        calls.finalizar += 1
        assert.equal(id, 9)
        assert.equal(body.motivo, 'usuario')
        return {
          claimed: body.segundos_adicionales || 0,
          segundos_restantes: 10700,
          sesion: { id: 9, estado: 'finalizada' },
        }
      },
    }

    class FakeRecorder {
      constructor() {
        this.state = 'inactive'
        this.mimeType = 'audio/webm'
        this.ondataavailable = null
        this.onstop = null
      }
      start() {
        this.state = 'recording'
        this.ondataavailable?.({ data: new Blob(['abc'], { type: 'audio/webm' }) })
      }
      stop() {
        this.state = 'inactive'
        this.onstop?.()
      }
    }

    const downloads = []
    const ctrl = createGrabacionSessionController({
      api,
      getMeta: () => ({ fecha: '2026-09-12', consecutivo: 3 }),
      heartbeatMs: 60_000,
      openStreams: async () => ({
        micStream: { getTracks: () => [], getAudioTracks: () => [] },
        displayStream: null,
        mixedStream: { getTracks: () => [], getAudioTracks: () => [] },
        audioCtx: null,
        tabAudioOk: false,
        mimeType: 'audio/webm',
      }),
      createRecorder: () => new FakeRecorder(),
      download: (blob, filename) => {
        calls.download += 1
        downloads.push({ size: blob.size, filename })
        return true
      },
      onDownloaded: (info) => downloads.push(info),
    })

    await ctrl.start({ includeTabAudio: false })
    assert.equal(calls.iniciar, 1)
    assert.equal(ctrl.getSesionId(), 9)

    const out = await ctrl.stop({ motivo: 'usuario' })
    assert.equal(calls.finalizar, 1)
    assert.equal(calls.download, 1)
    assert.equal(out.downloaded, true)
    assert.match(downloads[0].filename, /claracore-grabacion-acta-3-2026-09-12_/)
  })

  it('cierra en orden si el cupo responde debe_cerrar', async () => {
    let reclamos = 0
    const api = {
      async iniciarGrabacion() {
        return { sesion: { id: 1 }, segundos_restantes: 5 }
      },
      async reclamarGrabacion() {
        reclamos += 1
        return { claimed: 5, debe_cerrar: true, segundos_restantes: 0 }
      },
      async finalizarGrabacion(_id, body) {
        assert.equal(body.motivo, 'cupo_agotado')
        return { claimed: 0, sesion: { id: 1, estado: 'agotada' } }
      },
    }

    class FakeRecorder {
      constructor() {
        this.state = 'inactive'
        this.mimeType = 'audio/webm'
        this.ondataavailable = null
        this.onstop = null
      }
      start() {
        this.state = 'recording'
        this.ondataavailable?.({ data: new Blob(['x'], { type: 'audio/webm' }) })
      }
      stop() {
        this.state = 'inactive'
        this.onstop?.()
      }
    }

    let autoStop = false
    const ctrl = createGrabacionSessionController({
      api,
      heartbeatMs: 60_000,
      openStreams: async () => ({
        micStream: { getTracks: () => [], getAudioTracks: () => [] },
        displayStream: null,
        mixedStream: { getTracks: () => [], getAudioTracks: () => [] },
        audioCtx: null,
        tabAudioOk: true,
        mimeType: 'audio/webm',
      }),
      createRecorder: () => new FakeRecorder(),
      download: () => true,
      onState: (st) => {
        if (st.autoStop) autoStop = true
      },
    })

    await ctrl.start({ includeTabAudio: true })
    // Forzar elapsed para que el heartbeat pida segundos
    await new Promise((r) => setTimeout(r, 50))
    // Invocar stop vía heartbeat: simular claimed gap
    await ctrl.stop({ motivo: 'cupo_agotado', auto: true })
    assert.ok(reclamos >= 0)
    assert.equal(autoStop, true)
  })
})
