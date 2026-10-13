import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  AZURE_STT_SAMPLE_RATE,
  encodeWavPcm16,
  float32Rms,
  mergeTemasGrabacionViva,
  mensajeSttUsuario,
  resampleFloat32Mono,
} from './actaGrabacionLive.js'

describe('mergeTemasGrabacionViva', () => {
  it('inserta temas sintetizados sin tocar compromisos', () => {
    const ideas = [{ _key: 'i1', texto: '<p></p>', titulo: '', quien_dijo: '', imagenes: [] }]
    const next = mergeTemasGrabacionViva(ideas, [
      { clave: 't1', titulo: 'Avance de obra', texto: 'Se revisó el avance del tramo norte.', interviniente: 'Ana' },
    ], { newRowKey: () => 'k2' })
    assert.equal(next.length, 1)
    assert.equal(next[0]._claveGrabacion, 't1')
    assert.equal(next[0].titulo, 'Avance de obra')
    assert.match(next[0].texto, /avance del tramo norte/i)
    assert.equal(next[0].quien_dijo, 'Ana')
  })

  it('actualiza por clave y respeta edición manual', () => {
    const ideas = [{
      _key: 'i1',
      _claveGrabacion: 't1',
      titulo: 'Viejo',
      texto: '<p>Viejo</p>',
      quien_dijo: '',
      imagenes: [],
    }]
    const updated = mergeTemasGrabacionViva(ideas, [
      { clave: 't1', titulo: 'Nuevo', texto: 'Texto nuevo', interviniente: null },
    ])
    assert.equal(updated[0].titulo, 'Nuevo')

    const locked = [{ ...ideas[0], _editadoUsuario: true, titulo: 'Manual' }]
    const kept = mergeTemasGrabacionViva(locked, [
      { clave: 't1', titulo: 'IA', texto: 'No debe pisar', interviniente: null },
    ])
    assert.equal(kept[0].titulo, 'Manual')
  })

  it('agrega tema nuevo sin borrar existentes', () => {
    const ideas = [{
      _key: 'i1',
      _claveGrabacion: 't1',
      titulo: 'Uno',
      texto: '<p>Uno</p>',
      quien_dijo: '',
      imagenes: [],
    }]
    const next = mergeTemasGrabacionViva(ideas, [
      { clave: 't1', titulo: 'Uno', texto: 'Uno', interviniente: null },
      { clave: 't2', titulo: 'Dos', texto: 'Segundo tema', interviniente: null },
    ], { newRowKey: () => 'i2' })
    assert.equal(next.length, 2)
    assert.equal(next[1]._claveGrabacion, 't2')
  })
})

describe('PCM/WAV para Azure Speech', () => {
  it('re-muestrea a 16 kHz preservando duración aproximada', () => {
    const inputRate = 48000
    const seconds = 1
    const input = new Float32Array(inputRate * seconds)
    for (let i = 0; i < input.length; i += 1) input[i] = Math.sin(i / 40)
    const out = resampleFloat32Mono(input, inputRate, AZURE_STT_SAMPLE_RATE)
    assert.equal(out.length, AZURE_STT_SAMPLE_RATE)
  })

  it('encodeWavPcm16 genera cabecera RIFF/WAVE y tamaño coherente', async () => {
    const samples = new Float32Array(AZURE_STT_SAMPLE_RATE) // 1 s
    samples[0] = 0.5
    samples[1] = -0.5
    const blob = encodeWavPcm16(samples, AZURE_STT_SAMPLE_RATE)
    assert.match(String(blob.type), /wav/i)
    const buf = Buffer.from(await blob.arrayBuffer())
    assert.equal(buf.toString('ascii', 0, 4), 'RIFF')
    assert.equal(buf.toString('ascii', 8, 12), 'WAVE')
    assert.equal(buf.length, 44 + samples.length * 2)
  })

  it('float32Rms detecta silencio vs señal', () => {
    assert.equal(float32Rms(new Float32Array(1000)), 0)
    const signal = new Float32Array(1000)
    for (let i = 0; i < signal.length; i += 1) signal[i] = 0.2
    assert.ok(float32Rms(signal) > 0.1)
  })
})

describe('mensajeSttUsuario', () => {
  it('distingue sin audio, auth y sin reconocimiento sin exponer claves', () => {
    assert.match(mensajeSttUsuario({ stt_causa: 'sin_audio' }), /micrófono/i)
    assert.match(mensajeSttUsuario({ stt_causa: 'auth_rechazada' }), /soporte/i)
    assert.match(mensajeSttUsuario({ stt_causa: 'sin_reconocimiento' }), /voz/i)
    const all = ['sin_audio', 'auth_rechazada', 'sin_reconocimiento', 'sin_clave']
      .map((c) => mensajeSttUsuario({ stt_causa: c }))
      .join(' ')
    assert.doesNotMatch(all, /AZURE_SPEECH_KEY|Ocp-Apim|subscription/i)
  })
})
