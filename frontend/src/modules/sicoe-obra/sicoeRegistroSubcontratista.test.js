import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  sicoeCorteNumeroDeRegistro,
  sicoeNombreSubcontratistaRegistro,
  sicoeSubcontratistaIdDeRegistro,
} from './sicoeRegistroSubcontratista.js'

describe('sicoeRegistroSubcontratista', () => {
  const lista = [
    { id: 1, razon_social: 'ISLAN INGENIERÍA' },
    { id: 2, nombre: 'JAVIER OLIVEROS' },
  ]

  it('prioriza subcontratista_id del registro sobre el del reporte', () => {
    assert.equal(
      sicoeSubcontratistaIdDeRegistro(
        { subcontratista_id: 2 },
        { subcontratista_id: 1, subcontratista_nombre: 'ISLAN INGENIERÍA' },
      ),
      2,
    )
  })

  it('tras masivo-corte no muestra el nombre del reporte si el id del registro es otro', () => {
    const nombre = sicoeNombreSubcontratistaRegistro({
      registro: { subcontratista_id: 2 },
      reporte: { subcontratista_id: 1, subcontratista_nombre: 'ISLAN INGENIERÍA' },
      listaSubs: lista,
    })
    assert.equal(nombre, 'JAVIER OLIVEROS')
  })

  it('read-only: resuelve por listaSubs aunque el reporte diga otro nombre', () => {
    const nombre = sicoeNombreSubcontratistaRegistro({
      registro: { subcontratista_id: 1 },
      reporte: { subcontratista_nombre: 'NOMBRE VIEJO DEL REPORTE', subcontratista_id: 9 },
      listaSubs: lista,
    })
    assert.equal(nombre, 'ISLAN INGENIERÍA')
  })

  it('sin id en registro, cae al nombre del reporte', () => {
    assert.equal(
      sicoeNombreSubcontratistaRegistro({
        registro: {},
        reporte: { subcontratista_id: 1, subcontratista_nombre: 'ISLAN INGENIERÍA' },
        listaSubs: [],
      }),
      'ISLAN INGENIERÍA',
    )
  })

  it('corte: prioriza corte_id del registro', () => {
    assert.equal(
      sicoeCorteNumeroDeRegistro({
        registro: { corte_id: 55 },
        reporte: { corte_numero: 3 },
        listaCortes: [{ id: 55, consecutivo: 7 }],
      }),
      7,
    )
    assert.equal(
      sicoeCorteNumeroDeRegistro({
        registro: { corte_id: 55 },
        reporte: { corte_numero: 3 },
        listaCortes: [],
      }),
      55,
    )
  })
})
