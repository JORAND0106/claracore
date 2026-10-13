import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  AZURE_STT_SAMPLE_RATE,
  clasificarAvisoSttVacio,
  encodeWavPcm16,
  esCausaSttCritica,
  float32Rms,
  hayPistaAudioViva,
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

  it('fusiona síntesis tN en el tema OD del mismo título (no crea fila aparte)', () => {
    const ideas = [
      {
        _key: 'od1',
        _claveGrabacion: 'od-1',
        _desdeOrdenDia: true,
        titulo: 'Avance de obra',
        texto: '',
        quien_dijo: 'Ana',
        imagenes: [],
      },
      {
        _key: 'od2',
        _claveGrabacion: 'od-2',
        _desdeOrdenDia: true,
        titulo: 'Videos',
        texto: '',
        quien_dijo: 'Ana',
        imagenes: [],
      },
    ]
    const next = mergeTemasGrabacionViva(ideas, [
      { clave: 't2', titulo: 'Videos', texto: 'Resumen del punto de videos.', interviniente: null },
    ], { newRowKey: () => 'x' })
    assert.equal(next.length, 2)
    assert.equal(next[1]._claveGrabacion, 'od-2')
    assert.match(next[1].texto, /Resumen del punto de videos/)
    assert.equal(next[1].titulo, 'Videos')
  })

  it('sin clave ni tema abierto crea idea general (suelta), no tN', () => {
    const ideas = [{
      _key: 'od1',
      _claveGrabacion: 'od-1',
      _desdeOrdenDia: true,
      titulo: 'OD',
      texto: '',
      quien_dijo: '',
      imagenes: [],
    }]
    const next = mergeTemasGrabacionViva(ideas, [
      { titulo: 'Algo distinto', texto: 'Comentario libre', interviniente: null },
    ], { newRowKey: () => 's1' })
    assert.equal(next.length, 2)
    assert.match(next[1]._claveGrabacion, /^suelta-/)
    assert.equal(next[1].titulo, 'Algo distinto')
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
    assert.match(mensajeSttUsuario({ stt_causa: 'sin_permiso' }), /permiso/i)
    const all = ['sin_audio', 'auth_rechazada', 'sin_reconocimiento', 'sin_clave', 'sin_permiso']
      .map((c) => mensajeSttUsuario({ stt_causa: c }))
      .join(' ')
    assert.doesNotMatch(all, /AZURE_SPEECH_KEY|Ocp-Apim|subscription/i)
  })
})

describe('esCausaSttCritica / hayPistaAudioViva', () => {
  it('distingue críticas de silencio', () => {
    assert.equal(esCausaSttCritica('auth_rechazada'), true)
    assert.equal(esCausaSttCritica('sin_audio'), false)
    assert.equal(esCausaSttCritica('sin_reconocimiento'), false)
  })

  it('detecta pistas de audio vivas', () => {
    assert.equal(hayPistaAudioViva({
      micStream: { getAudioTracks: () => [{ readyState: 'live', enabled: true }] },
    }), true)
    assert.equal(hayPistaAudioViva({
      micStream: { getAudioTracks: () => [{ readyState: 'ended', enabled: true }] },
    }), false)
  })
})

describe('clasificarAvisoSttVacio', () => {
  it('no marca silencio como error si ya hubo caracteres o el mic sigue vivo', () => {
    const conChars = clasificarAvisoSttVacio({
      causa: 'sin_audio',
      rms: 0,
      charsAcumulados: 978,
      micVivo: true,
    })
    assert.equal(conChars.nivel, 'neutro')
    assert.match(conChars.mensaje, /Sin voz/i)

    const micVivoSinChars = clasificarAvisoSttVacio({
      causa: 'sin_audio',
      rms: 0.001,
      charsAcumulados: 0,
      micVivo: true,
    })
    assert.equal(micVivoSinChars.nivel, 'neutro')

    const sinRecon = clasificarAvisoSttVacio({
      causa: 'sin_reconocimiento',
      rms: 0.05,
      charsAcumulados: 100,
      micVivo: true,
    })
    assert.equal(sinRecon.nivel, 'neutro')
  })

  it('sí marca error si el mic está muerto y no hubo transcripción', () => {
    const muerto = clasificarAvisoSttVacio({
      causa: 'sin_audio',
      rms: 0,
      charsAcumulados: 0,
      micVivo: false,
    })
    assert.equal(muerto.nivel, 'error')
    assert.match(muerto.mensaje, /micrófono/i)
  })

  it('marca críticas auth/clave como error', () => {
    assert.equal(
      clasificarAvisoSttVacio({ causa: 'auth_rechazada', micVivo: true }).nivel,
      'error',
    )
    assert.equal(
      clasificarAvisoSttVacio({ causa: 'sin_clave', micVivo: true }).nivel,
      'error',
    )
  })
})
