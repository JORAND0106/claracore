import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

/**
 * Mirror of esUsuarioDesarrollador rules (App.jsx) for unit coverage.
 * Kept in sync with the gate that shows the portada «Dibujar» button.
 */
function esUsuarioDesarrollador(usuario) {
  if (!usuario) return false
  try {
    if (Number(usuario.rol_id) === 1) return true
  } catch { /* ignore */ }
  const norm = (txt) =>
    String(txt || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
  const cargo = norm(usuario?.cargo_nombre || usuario?.cargo || '')
  const rol = norm(usuario?.rol_nombre || usuario?.rol || '')
  if (cargo === 'desarrollador' || rol === 'desarrollador') return true
  if (usuario?.es_desarrollador === true || usuario?.acceso_total === true) return true
  return false
}

describe('esUsuarioDesarrollador (botón Dibujar)', () => {
  it('acepta rol_id=1', () => {
    assert.equal(esUsuarioDesarrollador({ rol_id: 1 }), true)
  })
  it('acepta cargo/rol Desarrollador', () => {
    assert.equal(esUsuarioDesarrollador({ cargo_nombre: 'Desarrollador' }), true)
    assert.equal(esUsuarioDesarrollador({ rol_nombre: 'Desarrollador' }), true)
  })
  it('rechaza otros roles', () => {
    assert.equal(esUsuarioDesarrollador({ rol_id: 3, rol_nombre: 'Contratista' }), false)
    assert.equal(esUsuarioDesarrollador({ cargo_nombre: 'Inspector de Obra' }), false)
    assert.equal(esUsuarioDesarrollador(null), false)
  })
})
