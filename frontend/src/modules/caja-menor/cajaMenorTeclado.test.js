import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { accionTecla, manejarTeclaCajaMenor } from './cajaMenorTeclado.js'

function tecla(key, extra = {}) {
  return { key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, isComposing: false, ...extra }
}

function input(extra = {}) {
  return {
    tagName: 'INPUT',
    type: 'text',
    value: 'abc',
    selectionStart: 0,
    selectionEnd: 0,
    hasAttribute: (nombre) => nombre === 'data-cm-orden',
    ...extra,
  }
}

describe('teclado de caja menor', () => {
  it('Enter, Tab y las flechas recorren un campo de una línea', () => {
    const campo = input()
    assert.equal(accionTecla(tecla('Enter'), campo), 'siguiente')
    assert.equal(accionTecla(tecla('Enter', { shiftKey: true }), campo), 'anterior')
    assert.equal(accionTecla(tecla('Tab'), campo), 'siguiente')
    assert.equal(accionTecla(tecla('Tab', { shiftKey: true }), campo), 'anterior')
    assert.equal(accionTecla(tecla('ArrowDown'), campo), 'siguiente')
    assert.equal(accionTecla(tecla('ArrowUp'), campo), 'anterior')
  })

  it('las flechas horizontales respetan el cursor', () => {
    const medio = input({ selectionStart: 1, selectionEnd: 1 })
    assert.equal(accionTecla(tecla('ArrowLeft'), medio), 'quedarse')
    assert.equal(accionTecla(tecla('ArrowRight'), medio), 'quedarse')
    assert.equal(accionTecla(tecla('ArrowLeft'), input({ selectionStart: 0, selectionEnd: 0 })), 'anterior')
    assert.equal(accionTecla(tecla('ArrowRight'), input({ selectionStart: 3, selectionEnd: 3 })), 'siguiente')
    const todo = input({ selectionStart: 0, selectionEnd: 3 })
    assert.equal(accionTecla(tecla('ArrowRight'), todo), 'siguiente')
    assert.equal(accionTecla(tecla('ArrowLeft'), todo), 'anterior')
    const parcial = input({ selectionStart: 1, selectionEnd: 2 })
    assert.equal(accionTecla(tecla('ArrowRight'), parcial), 'quedarse')
  })

  it('en un texto de varias líneas Enter baja de renglón y las flechas saltan en los extremos', () => {
    const area = input({
      tagName: 'TEXTAREA',
      value: 'uno\ndos',
      selectionStart: 0,
      selectionEnd: 0,
    })
    assert.equal(accionTecla(tecla('Enter'), area), 'quedarse')
    assert.equal(accionTecla(tecla('Tab'), area), 'siguiente')
    assert.equal(accionTecla(tecla('ArrowUp'), area), 'anterior')
    assert.equal(accionTecla(tecla('ArrowDown'), area), 'quedarse')
    const ultima = input({
      tagName: 'TEXTAREA',
      value: 'uno\ndos',
      selectionStart: 6,
      selectionEnd: 6,
    })
    assert.equal(accionTecla(tecla('ArrowDown'), ultima), 'siguiente')
    assert.equal(accionTecla(tecla('ArrowUp'), ultima), 'quedarse')
    const marcado = input({
      tagName: 'TEXTAREA',
      value: 'uno\ndos',
      selectionStart: 0,
      selectionEnd: 7,
    })
    assert.equal(accionTecla(tecla('Enter'), marcado), 'quedarse')
    assert.equal(accionTecla(tecla('ArrowDown'), marcado), 'siguiente')
  })

  it('en la fecha las flechas cambian de campo', () => {
    const fecha = input({ type: 'date', selectionStart: undefined, selectionEnd: undefined })
    assert.equal(accionTecla(tecla('ArrowUp'), fecha), 'anterior')
    assert.equal(accionTecla(tecla('ArrowDown'), fecha), 'siguiente')
    assert.equal(accionTecla(tecla('ArrowLeft'), fecha), 'anterior')
    assert.equal(accionTecla(tecla('ArrowRight'), fecha), 'siguiente')
    assert.equal(accionTecla(tecla('Enter'), fecha), 'siguiente')
  })

  it('no intercepta atajos ni un botón sin orden', () => {
    const campo = input()
    assert.equal(accionTecla(tecla('ArrowDown', { ctrlKey: true }), campo), null)
    assert.equal(accionTecla(tecla('Enter', { isComposing: true }), campo), null)
    const boton = {
      tagName: 'BUTTON',
      hasAttribute: () => false,
    }
    assert.equal(accionTecla(tecla('Enter'), boton), null)
    assert.equal(accionTecla(tecla('ArrowDown'), boton), null)
    const foto = {
      tagName: 'BUTTON',
      hasAttribute: (nombre) => nombre === 'data-cm-orden',
    }
    assert.equal(accionTecla(tecla('Enter'), foto), 'siguiente')
    const guardar = {
      tagName: 'BUTTON',
      hasAttribute: (nombre) => nombre === 'data-cm-orden' || nombre === 'data-cm-guardar',
    }
    assert.equal(accionTecla(tecla('Enter'), guardar), null)
    assert.equal(accionTecla(tecla('ArrowUp'), guardar), 'anterior')
    assert.equal(accionTecla(tecla('Tab'), guardar), 'siguiente')
  })

  it('Enter en soporte no dispara el botón cuando ya no hay un campo adelante', () => {
    const foto = {
      tagName: 'BUTTON',
      disabled: false,
      hidden: false,
      offsetParent: {},
      hasAttribute: (nombre) => nombre === 'data-cm-orden',
      getAttribute: (nombre) => (nombre === 'data-cm-orden' ? '20' : null),
      focus() {},
    }
    const root = {
      contains: () => true,
      querySelectorAll: () => [foto],
    }
    let evitado = false
    manejarTeclaCajaMenor({
      ...tecla('Enter'),
      currentTarget: root,
      target: foto,
      preventDefault() { evitado = true },
    })
    assert.equal(evitado, true)
  })

  it('el formulario marca el recorrido y salta centro de costos y valor neto', () => {
    const dir = new URL('.', import.meta.url)
    const detalle = readFileSync(new URL('./CajaMenorDetalle.jsx', dir), 'utf8')
    assert.equal(detalle.includes('manejarTeclaCajaMenor'), true)
    assert.equal(detalle.includes('data-cm-saltar'), true)
    assert.equal(detalle.includes('data-cm-orden'), true)
    assert.equal(detalle.includes('enterKeyHint="next"'), true)
    assert.equal(detalle.includes('enterKeyHint="enter"'), true)
    assert.equal(detalle.includes('centro_costos'), true)
    assert.equal(detalle.includes('Valor neto'), true)
    const descripcion = detalle.slice(detalle.indexOf('aria-label="Descripción"') - 80, detalle.indexOf('aria-label="Descripción"'))
    assert.equal(descripcion.includes('<textarea'), true)
  })
})
