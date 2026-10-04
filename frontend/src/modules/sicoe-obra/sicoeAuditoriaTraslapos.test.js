import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  analizarCandidatoContraPares,
  analizarVarios,
  coloresMapaDesdeHallazgos,
  esTraslapoMismoReporte,
  fmtAbscisaK,
  justificacionesParaTipo,
  medidaTraslapo,
  normalizarToleranciaM,
  resumenAmbienteDesdeFilas,
  sectoresSeparan,
  SICOE_AUDITORIA_JUSTIFICACIONES_VACIO,
  usuarioVeAuditoriaTraslapos,
} from './sicoeAuditoriaTraslapos.js'

describe('sicoeAuditoriaTraslapos', () => {
  it('normaliza tolerancia con mínimo 0.10', () => {
    assert.equal(normalizarToleranciaM(0.5), 0.5)
    assert.equal(normalizarToleranciaM(0.01), 0.1)
    assert.equal(normalizarToleranciaM(null), 0.5)
  })

  it('detecta traslapo lineal y calcula valor proporcional', () => {
    const cand = {
      id: 10,
      numero_registro: 100,
      item_numero: '1.1',
      tramo: 'T1',
      infraestructura: 'Calzada',
      calzada: 'Derecha',
      abs_inicio: 100,
      abs_final: 200,
      cantidad_total: 100,
      vlr_unitario: 1000,
    }
    const peer = {
      id: 11,
      numero_registro: 101,
      item_numero: '1.1',
      tramo: 'T1',
      infraestructura: 'Calzada',
      calzada: 'Derecha',
      abs_inicio: 150,
      abs_final: 250,
      cantidad_total: 50,
      vlr_unitario: 1000,
    }
    const r = analizarCandidatoContraPares(cand, [peer], 0.5)
    assert.equal(r.semaforo, 'rojo')
    assert.equal(r.hallazgos.length, 1)
    assert.equal(r.hallazgos[0].tipo, 'traslapo')
    assert.equal(r.hallazgos[0].medida_m, 50)
    // 50/100 * 100 * 1000 = 50000
    assert.equal(r.hallazgos[0].valor_en_juego, 50000)
    assert.match(r.hallazgos[0].texto, /Traslapo 50 m/)
    assert.match(r.hallazgos[0].texto, /Reg\. 101/)
  })

  it('respeta tolerancia: traslapo pequeño no alerta', () => {
    const cand = {
      id: 1, item_numero: '2', tramo: 'A', infraestructura: 'X', calzada: 'Izq',
      abs_inicio: 0, abs_final: 10, cantidad_total: 1, vlr_unitario: 1,
    }
    const peer = {
      id: 2, item_numero: '2', tramo: 'A', infraestructura: 'X', calzada: 'Izq',
      abs_inicio: 9.7, abs_final: 20,
    }
    assert.ok(medidaTraslapo(0, 10, 9.7, 20) < 0.5)
    const r = analizarCandidatoContraPares(cand, [peer], 0.5)
    assert.equal(r.semaforo, 'verde')
  })

  it('sectores distintos no generan traslapo', () => {
    assert.equal(
      sectoresSeparan({ sector: 'Norte' }, { sector: 'Sur' }),
      true,
    )
    const cand = {
      id: 1, item_numero: '2', tramo: 'A', infraestructura: 'X', calzada: 'Izq', sector: 'Norte',
      abs_inicio: 0, abs_final: 100, cantidad_total: 1, vlr_unitario: 1,
    }
    const peer = {
      id: 2, item_numero: '2', tramo: 'A', infraestructura: 'X', calzada: 'Izq', sector: 'Sur',
      abs_inicio: 50, abs_final: 150,
    }
    const r = analizarCandidatoContraPares(cand, [peer], 0.5)
    assert.equal(r.semaforo, 'verde')
  })

  it('detecta vacío entre vecinos del mismo grupo', () => {
    const cand = {
      id: 2, numero_registro: 2, item_numero: '3', tramo: 'T', infraestructura: 'I', margen: 'Der',
      abs_inicio: 70, abs_final: 100, cantidad_total: 1, vlr_unitario: 1,
    }
    const peer = {
      id: 1, numero_registro: 1, item_numero: '3', tramo: 'T', infraestructura: 'I', margen: 'Der',
      abs_inicio: 0, abs_final: 50,
    }
    const r = analizarCandidatoContraPares(cand, [peer], 0.5)
    assert.equal(r.semaforo, 'amarillo')
    assert.equal(r.hallazgos[0].tipo, 'vacio')
    assert.equal(r.hallazgos[0].medida_m, 20)
  })

  it('no auditable sin ubicación', () => {
    const r = analizarCandidatoContraPares(
      { id: 1, item_numero: '1.1', cantidad_total: 1, vlr_unitario: 1 },
      [],
      0.5,
    )
    assert.equal(r.semaforo, 'amarillo')
    assert.equal(r.hallazgos[0].tipo, 'no_auditable')
  })

  it('puntual: mismo pk_id es traslapo', () => {
    const cand = {
      id: 1, numero_registro: 9, item_numero: '5', pk_id_id: 44,
      cantidad_total: 2, vlr_unitario: 5000,
    }
    const peer = { id: 2, numero_registro: 8, item_numero: '5', pk_id_id: 44 }
    const r = analizarCandidatoContraPares(cand, [peer], 0.5)
    assert.equal(r.semaforo, 'rojo')
    assert.match(r.hallazgos[0].texto, /puntual/)
    assert.equal(r.hallazgos[0].valor_en_juego, 10000)
  })

  it('mismo reporte no genera traslapo; reportes distintos sí', () => {
    const base = {
      item_numero: '1.1', tramo: 'T1', infraestructura: 'Calzada', calzada: 'Derecha',
      abs_inicio: 100, abs_final: 200, cantidad_total: 100, vlr_unitario: 1000,
    }
    const cand = { ...base, id: 10, reporte_id: 7 }
    const peerMismo = { ...base, id: 11, reporte_id: 7, abs_inicio: 150, abs_final: 250 }
    const peerOtro = { ...base, id: 12, reporte_id: 8, abs_inicio: 150, abs_final: 250 }
    assert.equal(analizarCandidatoContraPares(cand, [peerMismo], 0.5).semaforo, 'verde')
    assert.equal(analizarCandidatoContraPares(cand, [peerOtro], 0.5).semaforo, 'rojo')
    assert.equal(esTraslapoMismoReporte({
      tipo: 'traslapo',
      registros_involucrados: [{ id: 1, reporte_id: 5 }, { id: 2, reporte_id: 5 }],
    }), true)
    assert.equal(esTraslapoMismoReporte({
      tipo: 'traslapo',
      registros_involucrados: [{ id: 1, reporte_id: 5 }, { id: 2, reporte_id: 9 }],
    }), false)
  })

  it('lote: resumen por semáforo', () => {
    const out = analizarVarios(
      [
        { id: 1, item_numero: '1', tramo: 'T', infraestructura: 'I', calzada: 'C', abs_inicio: 0, abs_final: 10, cantidad_total: 1, vlr_unitario: 1 },
        { id: 2, item_numero: '1', tramo: 'T', infraestructura: 'I', calzada: 'C', abs_inicio: 5, abs_final: 15, cantidad_total: 1, vlr_unitario: 1 },
      ],
      {},
      0.5,
    )
    assert.equal(out.semaforo, 'rojo')
    assert.ok(out.resumen.rojo >= 1)
  })

  it('fmt abscisa y filtro interventoría', () => {
    assert.equal(fmtAbscisaK(112.5), 'K0+112,5')
    assert.equal(usuarioVeAuditoriaTraslapos({ rol_nombre: 'Contratista' }), true)
    assert.equal(usuarioVeAuditoriaTraslapos({ rol_nombre: 'Interventoría' }), false)
  })

  it('justificaciones de vacío y resumen del ambiente', () => {
    assert.ok(SICOE_AUDITORIA_JUSTIFICACIONES_VACIO.includes('No ejecutado aún'))
    assert.deepEqual(justificacionesParaTipo('vacio'), SICOE_AUDITORIA_JUSTIFICACIONES_VACIO)
    assert.ok(justificacionesParaTipo('traslapo').includes('Sector diferente'))

    const res = resumenAmbienteDesdeFilas([
      { tipo: 'traslapo', estado: 'pendiente', valor_en_juego: 1000 },
      { tipo: 'vacio', estado: 'pendiente', valor_en_juego: 0 },
      { tipo: 'no_auditable', estado: 'pendiente', valor_en_juego: 50 },
      { tipo: 'ubicacion_inconsistente', estado: 'pendiente', valor_en_juego: 0 },
      { tipo: 'traslapo', estado: 'justificado', valor_en_juego: 200 },
      { tipo: 'vacio', estado: 'corregido', valor_en_juego: 0 },
    ])
    assert.equal(res.traslapos_sin_justificar.cantidad, 1)
    assert.equal(res.traslapos_sin_justificar.valor, 1000)
    assert.equal(res.vacios_sin_justificar.cantidad, 1)
    assert.equal(res.no_auditables.cantidad, 1)
    assert.equal(res.inconsistencias.cantidad, 1)
    assert.equal(res.justificados.cantidad, 1)
    assert.equal(res.justificados.valor, 200)
  })

  it('colores mapa desde hallazgos (capa por PK / selección)', () => {
    const colores = coloresMapaDesdeHallazgos(
      [
        {
          id: 9,
          tipo: 'traslapo',
          item_numero: '1.1',
          registros_involucrados: [{ id: 1, pk_id_id: 100 }, { id: 2, pk_id_id: 101 }],
        },
        {
          id: 10,
          tipo: 'vacio',
          item_numero: '1.1',
          registros_involucrados: [{ id: 3, pk_id_id: 102 }],
        },
      ],
      { seleccionadoId: 9 },
    )
    assert.equal(colores['100'].sobrecosto, true)
    assert.ok(colores['100'].pct >= 100)
    assert.equal(colores['102'].pct, 80)
  })
})
