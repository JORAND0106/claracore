/**
 * Prueba de punta a punta C-OUT-14 / C-OUT-18 (bloquea despliegue).
 * crear → guardar → asignar sellados/no sellados → reabrir → editar →
 * guardar → cambiar asignación → verificar registros, cantidades y log.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  mensajeErrorEsquemaUsuario,
  necesitaReuploadPng,
  patchSoloCamposGrafico,
  resolverEscenaGuardado,
  simularFlujoEsquemasE2E,
} from './sicoeEsquemasFlujo.js'
import { registroTieneEsquemaAsignado } from './sicoeEsquemasReporte.js'
import { listaGraficosRegistro } from './sicoeGraficosHelpers.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcRoot = join(__dirname, '../..')

function read(rel) {
  return readFileSync(join(srcRoot, rel), 'utf8')
}

/** Fixture tipo reporte #57: sellados 440,442,443,624,625 + no sellado 439. */
function regsReporte57() {
  const mk = (id, numero_registro, sellado, cantidad_total) => ({
    id,
    numero_registro,
    reporte_id: 57,
    cantidad_total,
    longitud: 1,
    ancho: 1,
    espesor: 0.2,
    item: `I-${numero_registro}`,
    graficos_historial: [],
    _sellado: sellado,
  })
  return [
    mk(1, 440, true, 0.2),
    mk(2, 442, true, 0.4),
    mk(3, 443, true, 0.6),
    mk(4, 624, true, 1.1),
    mk(5, 625, true, 0.9),
    mk(6, 439, false, 0.15),
  ]
}

describe('sicoeEsquemasFlujo · punta a punta (#57)', () => {
  it('flujo completo: guardar → asignar → reabrir → editar → reasignar + log', () => {
    const regs = regsReporte57()
    const isSellado = (r) => !!r._sellado
    const r = simularFlujoEsquemasE2E({
      registrosIniciales: regs,
      isSellado,
      reporteId: 57,
    })
    assert.equal(r.ok, true, r.error || 'flujo falló')
    assert.ok(r.patchesAsignar.length >= 5, 'asignó a varios registros')
    assert.ok(r.patchesEditar.length >= 1, 'edición generó patches')
    assert.ok(r.patchesReasignar.length >= 1, 'reasignar generó patches')
    assert.equal(r.sceneReabierta?.solids?.[0]?.height, 1.25)
    // Log con antes/después en cada cambio de asignación/edición
    const acciones = r.log.map((x) => x.accion)
    assert.deepEqual(
      acciones,
      ['guardar_sin_asignar', 'asignar', 'reabrir', 'editar_guardar', 'reasignar'],
    )
    assert.ok(r.log.find((x) => x.accion === 'asignar')?.antes)
    assert.ok(r.log.find((x) => x.accion === 'asignar')?.despues)
    assert.ok(r.log.find((x) => x.accion === 'editar_guardar')?.antes)
    assert.ok(r.log.find((x) => x.accion === 'reasignar')?.quitado === 439
      || Number(r.log.find((x) => x.accion === 'reasignar')?.quitado) === 439)

    // Patches nunca llevan cantidades
    for (const p of [...r.patchesAsignar, ...r.patchesEditar, ...r.patchesReasignar]) {
      assert.equal(patchSoloCamposGrafico(p.body), true)
      assert.equal(p.body.cantidad_total, undefined)
    }

    const fila = r.lista.find((x) => x.esquema_id === 'esq-e2e-174')
    assert.ok(fila)
    assert.equal(fila.sinAsignar, false)
    const nums = fila.registros.map((x) => x.numero_registro).sort((a, b) => a - b)
    assert.deepEqual(nums, [440, 442, 443, 624, 625])
    // El esquema asignado aparece dentro de cada registro marcado (gráficos).
    const despuesAsignar = r.log.find((x) => x.accion === 'asignar')?.despues || []
    assert.ok(despuesAsignar.length >= 5)
    for (const reg of despuesAsignar) {
      assert.equal(
        registroTieneEsquemaAsignado(reg, { esquemaId: 'esq-e2e-174', numero: 174 }),
        true,
        `#${reg.numero_registro} debe tener el esquema en sus gráficos`,
      )
      assert.ok(listaGraficosRegistro(reg).some((g) => Number(g.numero) === 174))
    }
  })

  it('escena del editor prevalece sobre la del target (regresión Guardar)', () => {
    const stale = { solids: [{ id: 's1', height: 0.1 }] }
    const fresh = { solids: [{ id: 's1', height: 0.63 }, { id: 's2', height: 1.2 }] }
    assert.equal(
      resolverEscenaGuardado({ scene: fresh }, stale).solids[0].height,
      0.63,
    )
    assert.equal(
      resolverEscenaGuardado({}, stale).solids[0].height,
      0.1,
    )
  })

  it('reasignar no exige re-upload si ya hay URL', () => {
    assert.equal(necesitaReuploadPng({ url: 'https://cdn/x.png' }), false)
    assert.equal(necesitaReuploadPng({}), true)
    assert.equal(necesitaReuploadPng(null), true)
  })

  it('mensajes de error son breves y no técnicos', () => {
    assert.equal(
      mensajeErrorEsquemaUsuario(new Error('No se pudo convertir el esquema'), 'asignar'),
      'No se pudo asignar el esquema',
    )
    assert.equal(
      mensajeErrorEsquemaUsuario(new Error('HTTP 503 Azure Blob'), 'guardar'),
      'No se pudo guardar el esquema',
    )
    assert.equal(
      mensajeErrorEsquemaUsuario(new Error('Seleccione al menos un registro'), 'asignar'),
      'Seleccione al menos un registro',
    )
    assert.doesNotMatch(
      mensajeErrorEsquemaUsuario(new Error('TypeError: Failed to fetch'), 'asignar'),
      /TypeError|fetch|Azure|HTTP|convertir/i,
    )
  })
})

describe('sicoeEsquemasFlujo · cableado modal estable', () => {
  it('modal: escena extras primero; reasignar sin convertir; error en popup', () => {
    const modal = read('modules/sicoe-obra/SicoeEsquemasReporteModal.jsx')
    assert.match(modal, /resolverEscenaGuardado/)
    assert.match(modal, /entradaDesdeFilaLista/)
    assert.match(modal, /mensajeErrorEsquemaUsuario/)
    assert.match(modal, /hostError=\{assignErr\}/)
    assert.match(modal, /NUNCA re-sube PNG|reasignar[\s\S]*entradaDesdeFilaLista/)
    assert.doesNotMatch(modal, /sceneIn:\s*target\?\.scene/)
    assert.match(modal, /keepDraft/)
    assert.match(modal, /upsertEsquemaSinAsignar/)
  })

  it('popup muestra hostError delante y completo', () => {
    const popup = read('modules/sicoe-obra/SicoeEsquemaAsignarPopup.jsx')
    assert.match(popup, /hostError/)
    assert.match(popup, /sicoe-esquema-asignar-error/)
    assert.match(popup, /role="alert"/)
  })

  it('contrato documenta E2E y errores visibles', () => {
    const md = read('components/esquema/CONTRATO_ESQUEMA.md')
    assert.match(md, /punta a punta|sicoeEsquemasFlujo\.e2e/i)
    assert.match(md, /No se pudo asignar el esquema/)
    assert.match(md, /Sin asignar/)
  })

  it('cableado en test:esquema', () => {
    const pkg = JSON.parse(readFileSync(join(srcRoot, '../package.json'), 'utf8'))
    assert.match(pkg.scripts['test:esquema'], /sicoeEsquemasFlujo\.e2e\.test\.js/)
  })
})
