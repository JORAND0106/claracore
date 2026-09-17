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

const NOMBRES_MODULO = [
  'Dashboard',
  'Presupuesto',
  'SICOE Obra',
  'Informes',
  'Almacén',
  'Seguimiento',
  'Topografía',
]

const CONTEO_POR_MODULO = {
  dashboard: 1,
  presupuesto: 5,
  sicoe_obra: 4,
  informes: 2,
  almacen: 4,
  seguimiento: 2,
  topografia: 3,
}

describe('mapaNavegacionCatalogo', () => {
  it('tiene 7 módulos en el orden de producto', () => {
    assert.equal(MAPA_NAVEGACION_SECCIONES.length, 7)
    assert.deepEqual(
      MAPA_NAVEGACION_SECCIONES.map((s) => s.label),
      NOMBRES_MODULO,
    )
  })

  it('agrupa 21 temas temáticos con ids únicos', () => {
    assert.equal(MAPA_NAVEGACION_SUBTEMAS.length, 21)
    const ids = MAPA_NAVEGACION_SUBTEMAS.map((m) => m.id)
    assert.equal(new Set(ids).size, 21)
    const seccionIds = new Set(MAPA_NAVEGACION_SECCIONES.map((s) => s.id))
    for (const m of MAPA_NAVEGACION_SUBTEMAS) {
      assert.ok(seccionIds.has(m.grupo), `${m.id} grupo inválido`)
      assert.ok(String(m.nombre).trim().length > 0)
    }
    for (const [gid, n] of Object.entries(CONTEO_POR_MODULO)) {
      assert.equal(
        MAPA_NAVEGACION_SUBTEMAS.filter((m) => m.grupo === gid).length,
        n,
        `${gid} debe tener ${n} temas`,
      )
    }
  })

  it('conserva nombres exactos de grupos temáticos clave', () => {
    const porId = Object.fromEntries(MAPA_NAVEGACION_SUBTEMAS.map((m) => [m.id, m.nombre]))
    assert.equal(porId.dash_leer_indicadores, 'Cómo leer tus indicadores')
    assert.equal(porId.ppto_arranca_versiona, 'Arranca y versiona tu presupuesto')
    assert.equal(porId.sicoe_crear_reporte_registros, 'Crea tu reporte de cantidades')
    assert.equal(porId.almacen_mueve_obra, 'Mueve materiales en obra')
    assert.equal(porId.topo_diseno_entrega, 'Del diseño a la entrega')
    assert.equal(MAPA_SUBTEMA_CAPACITACION_RC, 'sicoe_crear_reporte_registros')
  })
})

describe('normalizarContenidoMapa', () => {
  it('limpia entradas inválidas, conserva caption y videoUrl', () => {
    const n = normalizarContenidoMapa({
      version: 2,
      modulos: {
        seg_constancia_digital: {
          descripcion: '  Actas  ',
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
    assert.equal(n.modulos.seg_constancia_digital.descripcion, 'Actas')
    assert.deepEqual(n.modulos.seg_constancia_digital.imagenes, [
      { url: 'https://x/a.png', caption: 'Portada' },
    ])
    assert.equal(n.modulos.seg_constancia_digital.videoUrl, 'https://cdn/video.mp4')
  })

  it('migra contenido legacy de subtemas sueltos a grupos temáticos', () => {
    const migrado = migrarIdsContenidoMapa({
      reporte_cantidades: { descripcion: 'RC legacy', imagenes: [{ url: '/rc.png' }] },
      dash_resumen_desviaciones: { descripcion: 'Dash legacy' },
    })
    assert.equal(migrado.sicoe_crear_reporte_registros.descripcion, 'RC legacy')
    assert.equal(migrado.dash_leer_indicadores.descripcion, 'Dash legacy')
  })
})

describe('fusionarMapaNavegacion', () => {
  it('fusiona contenido sobre 7 módulos colapsables', () => {
    const vista = fusionarMapaNavegacion({
      modulos: {
        dash_leer_indicadores: {
          descripcion: 'Indicadores',
          imagenes: [{ url: '/a.png' }],
        },
      },
    })
    assert.equal(vista.modulos.length, 21)
    assert.equal(vista.grupos.length, 7)
    assert.deepEqual(vista.grupos.map((g) => g.label), NOMBRES_MODULO)
    const dash = vista.modulos.find((m) => m.id === 'dash_leer_indicadores')
    assert.equal(dash.descripcion, 'Indicadores')
    assert.equal(dash.contenidoPendiente, false)
    assert.ok(dash.resumen)
    const sicoe = vista.grupos.find((g) => g.id === 'sicoe_obra')
    assert.equal(sicoe.modulos.length, 4)
    assert.ok(sicoe.modulos.some((m) => m.id === MAPA_SUBTEMA_CAPACITACION_RC))
  })
})

describe('contenidoEditableCompleto', () => {
  it('garantiza las 21 claves del catálogo', () => {
    const doc = contenidoEditableCompleto({
      modulos: { seg_constancia_digital: { descripcion: 'x' } },
    })
    assert.equal(Object.keys(doc.modulos).length, 21)
    assert.equal(doc.modulos.seg_constancia_digital.descripcion, 'x')
    assert.equal(doc.modulos.dash_leer_indicadores.descripcion, '')
    assert.equal(doc.modulos.sicoe_crear_reporte_registros.videoUrl, '')
  })
})
