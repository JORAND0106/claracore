import assert from 'node:assert/strict'
import test from 'node:test'
import { informePeriodicoCaptureFilename } from './informePeriodicoCapture.js'

test('informePeriodicoCaptureFilename uses local date', () => {
  const name = informePeriodicoCaptureFilename(new Date(2026, 6, 18, 15, 0))
  assert.equal(name, 'informe-validacion-2026-07-18.png')
})

test('informePeriodicoCaptureFilename includes month and day padding', () => {
  const name = informePeriodicoCaptureFilename(new Date(2026, 0, 5))
  assert.equal(name, 'informe-validacion-2026-01-05.png')
})
