import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MAPA_NAVEGACION_MODULOS } from './mapaNavegacionCatalogo.js'
import {
  contenidoEditableCompleto,
  fusionarMapaNavegacion,
  normalizarContenidoMapa,
} from './mapaNavegacionMerge.js'

describe('mapaNavegacionCatalogo', () => {
  it('tiene exactamente 15 módulos con ids únicos', () => {
    assert.equal(MAPA_NAVEGACION_MODULOS.length, 15)
    const ids = MAPA_NAVEGACION_MODULOS.map((m) => m.id)
    assert.equal(new Set(ids).size, 15)
  })
})

describe('normalizarContenidoMapa', () => {
  it('limpia entradas inválidas y conserva caption', () => {
    const n = normalizarContenidoMapa({
      version: 2,
      modulos: {
        actas: {
          descripcion: '  Acta RPO  ',
          imagenes: [
            { url: ' https://x/a.png ', caption: ' Portada ' },
            { url: '', caption: 'vacía' },
            null,
          ],
        },
      },
    })
    assert.equal(n.version, 2)
    assert.equal(n.modulos.actas.descripcion, 'Acta RPO')
    assert.deepEqual(n.modulos.actas.imagenes, [{ url: 'https://x/a.png', caption: 'Portada' }])
  })
})

describe('fusionarMapaNavegacion', () => {
  it('fusiona contenido sobre el catálogo fijo', () => {
    const vista = fusionarMapaNavegacion({
      modulos: {
        dashboard: { descripcion: 'Vista gerencial', imagenes: [{ url: '/a.png' }] },
      },
    })
    assert.equal(vista.modulos.length, 15)
    const dash = vista.modulos.find((m) => m.id === 'dashboard')
    assert.equal(dash.descripcion, 'Vista gerencial')
    assert.equal(dash.contenidoPendiente, false)
    const actas = vista.modulos.find((m) => m.id === 'actas')
    assert.equal(actas.contenidoPendiente, true)
    assert.ok(vista.grupos.length >= 4)
  })
})

describe('contenidoEditableCompleto', () => {
  it('garantiza las 15 claves del catálogo', () => {
    const doc = contenidoEditableCompleto({ modulos: { actas: { descripcion: 'x' } } })
    assert.equal(Object.keys(doc.modulos).length, 15)
    assert.equal(doc.modulos.actas.descripcion, 'x')
    assert.equal(doc.modulos.dashboard.descripcion, '')
  })
})
