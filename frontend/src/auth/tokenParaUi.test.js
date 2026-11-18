import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { idSesion, olvidarTokenUi, tokenParaUi } from './tokenParaUi.js'
import { leerPantalla, olvidarPantalla, recordarPantalla } from '../workspace/pantallaSesion.js'
import { datosPersistibles } from '../modules/caja-menor/cajaMenorBorrador.js'

function memoria() {
  const datos = new Map()
  return {
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => datos.set(k, String(v)),
    removeItem: (k) => datos.delete(k),
  }
}

function jwt(sub) {
  const cuerpo = Buffer.from(JSON.stringify({ sub })).toString('base64url')
  return `aaa.${cuerpo}.zzz`
}

describe('sesión que sobrevive al cambio de ventana', () => {
  it('mantiene el mismo token de interfaz mientras la sesión no cambia', () => {
    const store = memoria()
    global.localStorage = store
    global.sessionStorage = memoria()
    olvidarTokenUi()
    const primero = tokenParaUi()
    store.setItem('cc_token', jwt('42'))
    const visible = tokenParaUi()
    store.setItem('cc_token', jwt('42'))
    assert.equal(tokenParaUi(), visible)
    store.setItem('cc_token', jwt('99'))
    assert.notEqual(tokenParaUi(), visible)
    assert.equal(idSesion(primero), '')
    olvidarTokenUi()
  })

  it('recuerda el módulo del mismo usuario y contrato', () => {
    const store = memoria()
    recordarPantalla('7', 3, 'caja_menor', store)
    assert.equal(leerPantalla('7', 3, store), 'caja_menor')
    assert.equal(leerPantalla('7', 4, store), '')
    assert.equal(leerPantalla('8', 3, store), '')
    olvidarPantalla(store)
    assert.equal(leerPantalla('7', 3, store), '')
  })

  it('guarda el borrador sin el archivo binario suelto', () => {
    const limpio = datosPersistibles({
      cajaId: 4,
      gasto: { descripcion: 'Tornillos', file: { name: 'recibo.jpg' } },
    })
    assert.equal(limpio.cajaId, 4)
    assert.equal(limpio.gasto.descripcion, 'Tornillos')
    assert.equal('file' in limpio.gasto, false)
  })
})
