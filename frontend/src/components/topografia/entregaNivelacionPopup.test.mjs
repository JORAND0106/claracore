/**
 * Contrato UI: popup de entrega estable + tabla solo resultados + nivelación por lecturas.
 * node --test src/components/topografia/entregaNivelacionPopup.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hiDesdeCotaVplus, resolveHiEntrega } from '../../utils/entrega_dg_bloques.js'

const dir = dirname(fileURLToPath(import.meta.url))

describe('Vías — popup de entrega y nivelación por lecturas', () => {
  it('el popup de entrega no hace scroll horizontal en el overlay', () => {
    const src = readFileSync(join(dir, 'EntregaDgObraForm.jsx'), 'utf8')
    assert.match(src, /overflow:\s*['"]hidden['"]/)
    assert.match(src, /alignItems:\s*['"]center['"]/)
    assert.match(src, /cerrarEntregaPopup/)
    assert.match(src, /carteraSinGuardar\(\)/)
    assert.match(src, /EntregaNivelacionLecturasModal/)
    assert.match(src, /soloResultados=\{modoCartera === ['"]lecturas['"]\}/)
  })

  it('la matriz principal puede ocultar Vi y columnas de amarre', () => {
    const src = readFileSync(join(dir, 'EntregaVerificacionMatriz.jsx'), 'utf8')
    assert.match(src, /soloResultados/)
    assert.match(src, /muestraFilaEntrada/)
    assert.doesNotMatch(src, /th\(\{ background: instBg \}\).*Punto/)
    assert.match(src, /cc-topo-table-scroll/)
  })

  it('el popup de nivelación divide cartera | resultados y guarda tras backend', () => {
    const src = readFileSync(join(dir, 'EntregaNivelacionLecturasModal.jsx'), 'utf8')
    assert.match(src, /Cartera de lecturas/)
    assert.match(src, /Resultados/)
    assert.match(src, /gridTemplateColumns/)
    assert.match(src, /Insertar amarre/)
    assert.match(src, /EntregaCarteraCargaModal/)
    assert.match(src, /setDirty\(false\)/)
    assert.match(src, /await onGuardar/)
  })

  it('HI = cota + V+ y cota campo = HI − Vi', () => {
    assert.equal(hiDesdeCotaVplus(100, 1.25), 101.25)
    const hi = resolveHiEntrega({
      bloques: [{ id: 'b1', orden: 1, abscisa_inicio: 0, cota_punto: 100, v_mas: 1.4 }],
      matriz: [{ abscisa: 0 }, { abscisa: 20 }],
      abscisa: 20,
      abscisaDesde: 0,
      instDraft: {},
    })
    assert.equal(hi, 101.4)
    assert.equal(Number((hi - 1.205).toFixed(3)), 100.195)
  })
})
