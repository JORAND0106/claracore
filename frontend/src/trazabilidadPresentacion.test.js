import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  camposModificados,
  presentarDetalle,
  presentarEvento,
  tablaDesdeValor,
  fmtAuditVal,
  etiquetaCampo,
} from './trazabilidadPresentacion.js'

const dir = dirname(fileURLToPath(import.meta.url))

describe('trazabilidadPresentacion — tablas legibles', () => {
  it('descompone consolidado (CERRAR_AL_APROBAR_N2) en filas Propiedad/Valor', () => {
    const consol = {
      c01_planilla_id: 'abc-123',
      c02_tipo: 'ALCANTARILLA',
      c03_pk_id: 'PK-10',
      c08_longitud_m: 12.5,
      c13_vol_excavacion_m3: 3.2,
      c20_estado: 'validado',
    }
    const { scalarRows, objectTables } = presentarDetalle({
      consolidado: consol,
      estado: 'validado',
    })
    assert.equal(scalarRows.length, 1)
    assert.equal(scalarRows[0].label, 'Estado')
    assert.equal(scalarRows[0].value, 'validado')
    assert.ok(objectTables.length >= 1)
    const cons = objectTables.find((t) => t.title === 'Consolidado')
    assert.ok(cons, 'tabla Consolidado')
    assert.equal(cons.kind, 'kv')
    assert.ok(cons.rows.some((r) => r.key === 'c03_pk_id' && r.value === 'PK-10'))
    assert.ok(cons.rows.some((r) => r.label === 'Longitud (m)'))
    // No debe quedar JSON crudo como único valor
    assert.ok(!cons.rows.every((r) => typeof r.value === 'string' && r.value.startsWith('{')))
  })

  it('EDITAR: diff Campo/Anterior/Nuevo sin JSON crudo', () => {
    const cambios = camposModificados(
      { ancho: 1.2, espesor: 0.1, capitulo: '1' },
      { ancho: 1.5, espesor: 0.1, capitulo: '1' },
    )
    assert.equal(cambios.length, 1)
    assert.equal(cambios[0].key, 'ancho')
    assert.equal(cambios[0].before, 1.2)
    assert.equal(cambios[0].after, 1.5)
    assert.equal(fmtAuditVal(cambios[0].before), '1.2')
  })

  it('diff anidado expande rutas dotted', () => {
    const cambios = camposModificados(
      { meta: { nivel2_estado: 'Pendiente' } },
      { meta: { nivel2_estado: 'Aprobado' } },
    )
    assert.equal(cambios.length, 1)
    assert.equal(cambios[0].key, 'meta.nivel2_estado')
    assert.match(cambios[0].pathLabel, /N2|nivel2/i)
  })

  it('VALIDAR_NIVEL2: presentarEvento arma cabecera + detalle tabular', () => {
    const ev = presentarEvento(
      {
        id: 9,
        accion: 'VALIDAR_NIVEL2',
        usuario_nombre: 'Ana Interventora',
        modulo: 'TOPOGRAFIA',
        tipo_entidad: 'topo_planilla_tuberia',
        severidad: 'INFO',
        created_at: '2026-03-15T15:00:00Z',
        detalle: { nivel: 2, estado: 'Aprobado', comentario: 'OK' },
        valor_anterior: { nivel2_estado: 'Pendiente' },
        valor_nuevo: { nivel2_estado: 'Aprobado' },
      },
      { fmtFecha: () => '15/03/2026, 10:00 a. m.' },
    )
    assert.equal(ev.accion, 'VALIDAR_NIVEL2')
    assert.equal(ev.usuario, 'Ana Interventora')
    assert.equal(ev.ambito, 'topo_planilla_tuberia')
    assert.ok(ev.scalarRows.some((r) => r.key === 'estado'))
    assert.ok(ev.cambios.some((c) => c.key === 'nivel2_estado'))
    assert.equal(ev.fallbackAntes, null)
    assert.equal(ev.beforeTable, null)
  })

  it('CERRAR_AL_APROBAR_N2: consolidado no cae a fallback JSON', () => {
    const ev = presentarEvento({
      id: 11,
      accion: 'CERRAR_AL_APROBAR_N2',
      usuario_nombre: 'Ana',
      modulo: 'TOPOGRAFIA',
      tipo_entidad: 'topo_planilla_tuberia',
      created_at: '2026-09-16T16:27:27.68935+00:00',
      detalle: {
        estado: 'validado',
        consolidado: {
          c01_planilla_id: 'x',
          c04_nombre: 'Tramo A',
          c20_estado: 'validado',
          c21_cerrado_at: '2026-09-16T16:27:27.68935+00:00',
        },
      },
    })
    assert.equal(ev.accion, 'CERRAR_AL_APROBAR_N2')
    assert.ok(ev.objectTables.some((t) => t.title === 'Consolidado' && t.rows.length >= 3))
    assert.equal(ev.fallbackAntes, null)
    assert.equal(ev.fallbackNuevo, null)
    // Cabecera: Colombia UTC−5, sin ISO crudo ni fracciones
    assert.match(ev.fecha, /11:27/)
    assert.ok(!ev.fecha.includes('T'))
    assert.ok(!ev.fecha.includes('.689'))
    // Campo timestamp dentro del consolidado también formateado
    const cons = ev.objectTables.find((t) => t.title === 'Consolidado')
    const cerrado = cons.rows.find((r) => r.key === 'c21_cerrado_at')
    assert.ok(cerrado)
    assert.match(fmtAuditVal(cerrado.value), /11:27/)
  })

  it('por defecto formatea created_at en Colombia aunque no se pase fmtFecha', () => {
    const ev = presentarEvento({
      id: 1,
      accion: 'EDITAR',
      created_at: '2026-09-16T16:27:27.68935+00:00',
    })
    assert.match(ev.fecha, /11:27/)
    assert.ok(!String(ev.fecha).includes('+00:00'))
  })

  it('array de objetos → grilla columnar', () => {
    const table = tablaDesdeValor(
      [
        { codigo: 'EXC', neto: 1.2 },
        { codigo: 'REL', neto: 0.8 },
      ],
      'Netos',
    )
    assert.equal(table.kind, 'grid')
    assert.deepEqual(table.columns, ['codigo', 'neto'])
    assert.equal(table.rows.length, 2)
  })

  it('etiquetas amigables para consolidado tubería', () => {
    assert.equal(etiquetaCampo('c13_vol_excavacion_m3'), 'Vol. excavación (m³)')
    assert.equal(etiquetaCampo('pre_interv_estado'), 'Validación Contratista')
  })
})

describe('TrazabilidadRegistroModal — rediseño compartido', () => {
  it('usa presentación tabular y ancho amplio; consumidores siguen apuntando al mismo modal', () => {
    const modal = readFileSync(join(dir, 'TrazabilidadRegistroModal.jsx'), 'utf8')
    assert.match(modal, /formatFechaHoraColombia/)
    assert.match(modal, /presentarEvento/)
    assert.match(modal, /min\(1280px/)
    assert.match(modal, /Campos modificados/)
    assert.match(modal, /Propiedad/)
    assert.match(modal, /pptoSheetStyles/)
    assert.doesNotMatch(modal, /JSON\.stringify\(v\)/)
    // No debe reaparecer el bug de append ciego de Z
    assert.doesNotMatch(modal, /endsWith\(['\"]Z['\"]\)/)

    const topo = readFileSync(join(dir, 'components/topografia/TopoTrazabilidadButton.jsx'), 'utf8')
    const alm = readFileSync(join(dir, 'almacen/AlmacenTrazabilidadButton.jsx'), 'utf8')
    assert.match(topo, /TrazabilidadRegistroModal/)
    assert.match(alm, /TrazabilidadRegistroModal/)
  })
})
