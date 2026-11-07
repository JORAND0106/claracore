import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  OFFLINE_OK_MODULOS,
  OFFLINE_MODULE_MESSAGE,
  moduloRequiereConexion,
  isBrowserOffline,
} from './offlineModules.js'

describe('PWA · módulos sin conexión', () => {
  it('inicio, bloc_notas y mapa_navegacion están permitidos offline', () => {
    assert.equal(OFFLINE_OK_MODULOS.has('inicio'), true)
    assert.equal(OFFLINE_OK_MODULOS.has('bloc_notas'), true)
    assert.equal(OFFLINE_OK_MODULOS.has('mapa_navegacion'), true)
    assert.equal(moduloRequiereConexion('inicio'), false)
    assert.equal(moduloRequiereConexion('bloc_notas'), false)
    assert.equal(moduloRequiereConexion('mapa_navegacion'), false)
  })

  it('módulos de servidor requieren conexión', () => {
    for (const key of [
      'dashboard',
      'presupuesto',
      'sicoe_obra',
      'informes',
      'almacen',
      'programacion',
      'seguimiento',
      'rrhh',
      'topografia',
      'semaforo',
      'auditor_sst',
    ]) {
      assert.equal(moduloRequiereConexion(key), true, key)
    }
  })

  it('aviso institucional sin jerga técnica', () => {
    assert.match(OFFLINE_MODULE_MESSAGE, /conexión/i)
    assert.doesNotMatch(OFFLINE_MODULE_MESSAGE, /API|HTTP|fetch|JSON|offline|SW|service worker/i)
  })

  it('isBrowserOffline refleja navigator.onLine', () => {
    const prev = globalThis.navigator
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: false },
      configurable: true,
    })
    assert.equal(isBrowserOffline(), true)
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true },
      configurable: true,
    })
    assert.equal(isBrowserOffline(), false)
    if (prev === undefined) {
      delete globalThis.navigator
    } else {
      Object.defineProperty(globalThis, 'navigator', {
        value: prev,
        configurable: true,
      })
    }
  })
})
