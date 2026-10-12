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
  sicoe_obra: 5,
  informes: 2,
  almacen: 6,
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

  it('agrupa 24 temas temáticos con ids únicos', () => {
    assert.equal(MAPA_NAVEGACION_SUBTEMAS.length, 24)
    const ids = MAPA_NAVEGACION_SUBTEMAS.map((m) => m.id)
    assert.equal(new Set(ids).size, 24)
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
    assert.equal(porId.ppto_edita_consulta, 'Edita, consulta y valida registros')
    assert.equal(porId.sicoe_crear_reporte_registros, 'Crea tu reporte de cantidades')
    assert.equal(porId.sicoe_asigna_item_cobro, 'Asigna el ítem de cobro')
    assert.equal(porId.almacen_solicita_materiales, 'Solicita tus materiales')
    assert.equal(porId.almacen_asigna_insumo_proveedor, 'Asigna el insumo y el proveedor')
    assert.equal(porId.almacen_aprueba_genera_oc, 'Aprueba insumos y genera la orden de compra')
    assert.equal(porId.almacen_mueve_obra, 'Mueve materiales en obra')
    assert.equal(porId.topo_diseno_entrega, 'Del diseño a la entrega')
    assert.equal(MAPA_SUBTEMA_CAPACITACION_RC, 'sicoe_crear_reporte_registros')
  })

  it('coloca Asigna el ítem de cobro en segunda posición de SICOE Obra', () => {
    const sicoe = MAPA_NAVEGACION_SUBTEMAS.filter((m) => m.grupo === 'sicoe_obra')
      .slice()
      .sort((a, b) => a.orden - b.orden)
    assert.equal(sicoe.length, 5)
    assert.deepEqual(
      sicoe.map((m) => m.id),
      [
        'sicoe_crear_reporte_registros',
        'sicoe_asigna_item_cobro',
        'sicoe_visualiza_filtra',
        'sicoe_consulta_valida',
        'sicoe_descarga_plantillas',
      ],
    )
    assert.equal(
      sicoe[1].resumen,
      'Asignación del ítem al registro y alertas de traslapo, vacíos y ubicación.',
    )
    assert.ok(String(sicoe[1].icono || '').trim())
  })

  it('divide Solicita y aprueba materiales en tres temas de Almacén', () => {
    const almacen = MAPA_NAVEGACION_SUBTEMAS.filter((m) => m.grupo === 'almacen')
      .slice()
      .sort((a, b) => a.orden - b.orden)
    assert.equal(almacen.length, 6)
    assert.deepEqual(
      almacen.map((m) => m.id),
      [
        'almacen_catalogo_insumos',
        'almacen_solicita_materiales',
        'almacen_asigna_insumo_proveedor',
        'almacen_aprueba_genera_oc',
        'almacen_mueve_obra',
        'almacen_consulta_inventario',
      ],
    )
    assert.equal(
      almacen[1].resumen,
      'Nueva solicitud por tramo y PK-ID, borrador y solicitud de aprobación.',
    )
    assert.equal(
      almacen[2].resumen,
      'Asignación del insumo del catálogo y elección del proveedor, línea por línea o en bloque.',
    )
    assert.equal(
      almacen[3].resumen,
      'Aprobación de líneas, individual o en bloque, y generación de la OC por proveedor.',
    )
    const iconos = new Set(almacen.map((m) => m.icono))
    assert.equal(iconos.size, 6)
    assert.ok(!MAPA_NAVEGACION_SUBTEMAS.some((m) => m.id === 'almacen_solicita_aprueba'))
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

  it('migra video de almacen_solicita_aprueba a la primera tarjeta nueva', () => {
    const migrado = migrarIdsContenidoMapa({
      almacen_solicita_aprueba: {
        descripcion: 'Solicitud unificada',
        videoUrl: 'https://cdn/almacen-solicita.mp4',
      },
    })
    assert.equal(migrado.almacen_solicita_materiales.videoUrl, 'https://cdn/almacen-solicita.mp4')
    assert.equal(migrado.almacen_solicita_materiales.descripcion, 'Solicitud unificada')
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
    assert.equal(vista.modulos.length, 24)
    assert.equal(vista.grupos.length, 7)
    assert.deepEqual(vista.grupos.map((g) => g.label), NOMBRES_MODULO)
    const dash = vista.modulos.find((m) => m.id === 'dash_leer_indicadores')
    assert.equal(dash.descripcion, 'Indicadores')
    assert.equal(dash.contenidoPendiente, false)
    assert.ok(dash.resumen)
    const sicoe = vista.grupos.find((g) => g.id === 'sicoe_obra')
    assert.equal(sicoe.modulos.length, 5)
    assert.ok(sicoe.modulos.some((m) => m.id === MAPA_SUBTEMA_CAPACITACION_RC))
    assert.equal(sicoe.modulos[1].id, 'sicoe_asigna_item_cobro')
    assert.equal(sicoe.modulos[1].videoUrl, '')
    const almacen = vista.grupos.find((g) => g.id === 'almacen')
    assert.equal(almacen.modulos.length, 6)
    assert.equal(almacen.modulos[1].id, 'almacen_solicita_materiales')
    assert.equal(almacen.modulos[2].id, 'almacen_asigna_insumo_proveedor')
    assert.equal(almacen.modulos[3].id, 'almacen_aprueba_genera_oc')
  })
})

describe('contenidoEditableCompleto', () => {
  it('garantiza las 24 claves del catálogo', () => {
    const doc = contenidoEditableCompleto({
      modulos: {
        seg_constancia_digital: { descripcion: 'x' },
        sicoe_visualiza_filtra: { videoUrl: 'https://cdn/existente.mp4' },
        almacen_solicita_aprueba: { videoUrl: 'https://cdn/legacy-almacen.mp4' },
      },
    })
    assert.equal(Object.keys(doc.modulos).length, 24)
    assert.equal(doc.modulos.seg_constancia_digital.descripcion, 'x')
    assert.equal(doc.modulos.dash_leer_indicadores.descripcion, '')
    assert.equal(doc.modulos.sicoe_crear_reporte_registros.videoUrl, '')
    assert.equal(doc.modulos.sicoe_asigna_item_cobro.videoUrl, '')
    assert.equal(doc.modulos.sicoe_visualiza_filtra.videoUrl, 'https://cdn/existente.mp4')
    assert.equal(doc.modulos.almacen_solicita_materiales.videoUrl, 'https://cdn/legacy-almacen.mp4')
    assert.equal(doc.modulos.almacen_asigna_insumo_proveedor.videoUrl, '')
    assert.equal(doc.modulos.almacen_aprueba_genera_oc.videoUrl, '')
  })
})
