import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { textoCompromisoCelda } from './compromisoTextoCelda.js'
import { esEstadoTerminalCompromiso } from './compromisoEstados.js'

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
  it('marca cumplido y cancelado como terminales', () => {
    assert.equal(esEstadoTerminalCompromiso('cumplido'), true)
    assert.equal(esEstadoTerminalCompromiso('Cancelado'), true)
    assert.equal(esEstadoTerminalCompromiso('abierto'), false)
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
