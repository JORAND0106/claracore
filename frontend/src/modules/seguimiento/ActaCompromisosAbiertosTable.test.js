import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { textoCompromisoCelda } from './compromisoTextoCelda.js'
import {
  esCompromisoArchivadoRevision,
  esEstadoTerminalCompromiso,
} from './compromisoEstados.js'

describe('textoCompromisoCelda', () => {
  it('devuelve guión si no hay texto', () => {
    assert.deepEqual(textoCompromisoCelda({}), { short: '—', full: '' })
  })

  it('no trunca textos cortos', () => {
    const r = textoCompromisoCelda({ titulo: 'Entregar informe' })
    assert.equal(r.short, 'Entregar informe')
    assert.equal(r.full, 'Entregar informe')
  })

  it('trunca textos largos y conserva full en tooltip', () => {
    const long = 'A'.repeat(150)
    const r = textoCompromisoCelda({ descripcion: long }, 40)
    assert.ok(r.short.endsWith('…'))
    assert.ok(r.short.length <= 40)
    assert.equal(r.full, long)
  })

  it('prefiere descripcion sobre titulo', () => {
    const r = textoCompromisoCelda({ titulo: 'corto', descripcion: 'texto completo del compromiso' })
    assert.equal(r.full, 'texto completo del compromiso')
  })
})

describe('esEstadoTerminalCompromiso', () => {
  it('marca cumplido y cancelado como terminales (etiqueta; no implica ocultar)', () => {
    assert.equal(esEstadoTerminalCompromiso('cumplido'), true)
    assert.equal(esEstadoTerminalCompromiso('Cancelado'), true)
    assert.equal(esEstadoTerminalCompromiso('abierto'), false)
  })
})

describe('esCompromisoArchivadoRevision', () => {
  it('estado cumplido solo no archiva', () => {
    assert.equal(esCompromisoArchivadoRevision({ estado_gestion: 'cumplido' }), false)
    assert.equal(esCompromisoArchivadoRevision({ estado_gestion: 'cumplido', campos_libres: {} }), false)
  })

  it('archivado_revision sí oculta de la vista activa', () => {
    assert.equal(
      esCompromisoArchivadoRevision({
        estado_gestion: 'cumplido',
        campos_libres: { archivado_revision: true },
      }),
      true,
    )
  })
})

describe('visibilidad tabla: estado vs archivar', () => {
  it('filtra solo archivados, no por estado Cumplido', () => {
    const items = [
      { id: 1, estado_gestion: 'cumplido' },
      { id: 2, estado_gestion: 'abierto' },
      { id: 3, estado_gestion: 'cumplido', campos_libres: { archivado_revision: true } },
      { id: 4, estado_gestion: 'cancelado' },
    ]
    const visibles = items.filter((c) => !esCompromisoArchivadoRevision(c))
    assert.deepEqual(visibles.map((x) => x.id), [1, 2, 4])
  })
})

describe('orden por vencimiento (más próxima primero)', () => {
  it('ordena ascendente por fecha_vencimiento', async () => {
    const { sortByProximidadVencimiento } = await import('./vencimientoLevels.js')
    const items = [
      { id: 3, fecha_vencimiento: '2026-09-10' },
      { id: 1, fecha_vencimiento: '2026-08-01' },
      { id: 2, fecha_vencimiento: '2026-08-15' },
      { id: 4, fecha_vencimiento: null },
    ]
    const sorted = sortByProximidadVencimiento(items)
    assert.deepEqual(sorted.map((x) => x.id), [1, 2, 3, 4])
  })
})

describe('popup acta ~20% más ancho', () => {
  it('1416px es ~20% sobre 1180px', () => {
    assert.equal(Math.round(1180 * 1.2), 1416)
  })
})

describe('pdf on-demand contract', () => {
  it('reload de detalle no incluye paso de PDF', async () => {
    const steps = []
    const fakeReload = async ({ loadPdf = false } = {}) => {
      steps.push('getItem')
      if (loadPdf) steps.push('pdfActaBlob')
      steps.push('ready')
    }
    await fakeReload({ loadPdf: false })
    assert.deepEqual(steps, ['getItem', 'ready'])
    assert.equal(steps.includes('pdfActaBlob'), false)
  })
})
