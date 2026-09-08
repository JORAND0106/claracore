/**
 * Smoke — Quién recibe en obra (Salidas): portal + roles sin gerencial/interventoría.
 * node --test frontend/src/almacen/receptorObraSelector.test.js
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

describe('ReceptorObraSelector', () => {
  it('usa createPortal para no quedar recortado por el modal', () => {
    const src = readFileSync(join(dir, 'ReceptorObraSelector.jsx'), 'utf8')
    assert.match(src, /createPortal/)
    assert.match(src, /data-testid="receptor-obra-dropdown"/)
    assert.match(src, /zIndex:\s*100080/)
    assert.match(src, /searchUsuariosReceptorObra/)
  })
})

describe('es_rol_receptor_obra — sin gerencial ni interventoría', () => {
  it('backend excluye contratista gerencial e interventoría', () => {
    const src = readFileSync(join(dir, '../../../backend/almacen_permissions.py'), 'utf8')
    assert.match(src, /_ROLES_RECEPTOR_OBRA_IDS = frozenset\(\{3, 5\}\)/)
    assert.match(src, /if "gerencial" in rol:\s*\n\s*return False/)
    assert.match(src, /if "intervent" in rol:\s*\n\s*return False/)
    assert.doesNotMatch(src, /_ROLES_RECEPTOR_OBRA_IDS = frozenset\(\{3, 5, 7\}\)/)
  })
})
