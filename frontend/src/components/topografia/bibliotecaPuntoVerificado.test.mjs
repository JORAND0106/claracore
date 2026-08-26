/**
 * Regresión: guardar BM con «Marcar como verificado» debe enviar verificado=true.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'BibliiotecaPuntos.jsx'), 'utf8')

describe('Biblioteca — Marcar como verificado', () => {
  it('incluye verificado en el payload de guardado para BM', () => {
    assert.match(src, /verificado:\s*form\.tipo === 'BM' \? Boolean\(form\.verificado\) : false/)
    assert.match(src, /Marcar como verificado \(solo BM iniciales\)/)
    assert.match(src, /method:\s*'PUT'/)
  })

  it('tras verificar un pendiente, cambia el filtro a verificados', () => {
    assert.match(src, /filtroVerificado === 'pendiente'/)
    assert.match(src, /setFiltroVerificado\('verificado'\)/)
  })
})
