import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MAPA_NAVEGACION_SECCIONES,
  MAPA_NAVEGACION_SUBTEMAS,
  MAPA_SUBTEMA_CAPACITACION_RC,
} from './mapaNavegacionCatalogo.js'
import {
  contenidoEditableCompleto,
  fusionarMapaNavegacion,
  migrarIdsContenidoMapa,
  normalizarContenidoMapa,
} from './mapaNavegacionMerge.js'

const NOMBRES_SECCION = [
  'Dashboard',
  'Presupuesto',
  'SICOE Obra',
  'Informes',
  'Almacén',
  'Seguimiento',
  'Topografía',
]

describe('mapaNavegacionCatalogo', () => {
  it('tiene 7 secciones en el orden de producto', () => {
    assert.equal(MAPA_NAVEGACION_SECCIONES.length, 7)
    assert.deepEqual(
      MAPA_NAVEGACION_SECCIONES.map((s) => s.label),
      NOMBRES_SECCION,
    )
  })

  it('tiene 46 subtemas con ids únicos y grupos válidos', () => {
    assert.equal(MAPA_NAVEGACION_SUBTEMAS.length, 46)
    const ids = MAPA_NAVEGACION_SUBTEMAS.map((m) => m.id)
    assert.equal(new Set(ids).size, 46)
    const seccionIds = new Set(MAPA_NAVEGACION_SECCIONES.map((s) => s.id))
    for (const m of MAPA_NAVEGACION_SUBTEMAS) {
      assert.ok(seccionIds.has(m.grupo), `${m.id} grupo inválido`)
      assert.ok(String(m.nombre).trim().length > 0)
    }
  })

  it('conserva nombres exactos de subtemas clave', () => {
    const porId = Object.fromEntries(MAPA_NAVEGACION_SUBTEMAS.map((m) => [m.id, m.nombre]))
    assert.equal(porId.dash_obra_ejecutada_presupuesto, 'Qué es obra ejecutada y qué es presupuesto de obra')
    assert.equal(porId.ppto_panel_dinamico, 'Panel dinámico ClaraCore')
    assert.equal(porId.sicoe_crear_reporte_registros, 'Crear Reporte - Registros')
    assert.equal(porId.almacen_despachador, 'Despachador: recibo de materiales | disposición de materiales')
    assert.equal(porId.topo_carteras_via, 'Carteras de topografía que entregan estructura de vía')
    assert.equal(MAPA_SUBTEMA_CAPACITACION_RC, 'sicoe_crear_reporte_registros')
  })
})

describe('normalizarContenidoMapa', () => {
  it('limpia entradas inválidas, conserva caption y videoUrl', () => {
    const n = normalizarContenidoMapa({
      version: 2,
      modulos: {
        seg_nueva_acta: {
          descripcion: '  Acta RPO  ',
          imagenes: [
            { url: ' https://x/a.png ', caption: ' Portada ' },
            { url: '', caption: 'vacía' },
            null,
          ],
          videoUrl: ' https://cdn/video.mp4 ',
        },
      },
    })
    assert.equal(n.version, 2)
    assert.equal(n.modulos.seg_nueva_acta.descripcion, 'Acta RPO')
    assert.deepEqual(n.modulos.seg_nueva_acta.imagenes, [{ url: 'https://x/a.png', caption: 'Portada' }])
    assert.equal(n.modulos.seg_nueva_acta.videoUrl, 'https://cdn/video.mp4')
  })

  it('migra contenido legacy de reporte_cantidades', () => {
    const migrado = migrarIdsContenidoMapa({
      reporte_cantidades: { descripcion: 'RC legacy', imagenes: [{ url: '/rc.png' }] },
    })
    assert.equal(migrado.sicoe_crear_reporte_registros.descripcion, 'RC legacy')
  })
})

describe('fusionarMapaNavegacion', () => {
  it('fusiona contenido sobre el catálogo de 7 secciones', () => {
    const vista = fusionarMapaNavegacion({
      modulos: {
        dash_obra_ejecutada_presupuesto: {
          descripcion: 'Vista gerencial',
          imagenes: [{ url: '/a.png' }],
        },
      },
    })
    assert.equal(vista.modulos.length, 46)
    assert.equal(vista.grupos.length, 7)
    assert.deepEqual(vista.grupos.map((g) => g.label), NOMBRES_SECCION)
    const dash = vista.modulos.find((m) => m.id === 'dash_obra_ejecutada_presupuesto')
    assert.equal(dash.descripcion, 'Vista gerencial')
    assert.equal(dash.contenidoPendiente, false)
    const sicoe = vista.grupos.find((g) => g.id === 'sicoe_obra')
    assert.equal(sicoe.modulos.length, 7)
    assert.ok(sicoe.modulos.some((m) => m.id === MAPA_SUBTEMA_CAPACITACION_RC))
  })
})

describe('contenidoEditableCompleto', () => {
  it('garantiza las 46 claves del catálogo', () => {
    const doc = contenidoEditableCompleto({
      modulos: { seg_nueva_acta: { descripcion: 'x' } },
    })
    assert.equal(Object.keys(doc.modulos).length, 46)
    assert.equal(doc.modulos.seg_nueva_acta.descripcion, 'x')
    assert.equal(doc.modulos.dash_obra_ejecutada_presupuesto.descripcion, '')
    assert.equal(doc.modulos.sicoe_crear_reporte_registros.videoUrl, '')
  })
})
