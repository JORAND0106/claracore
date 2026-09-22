import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const __dirname = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(__dirname, 'PlanillaTuberiaForm.jsx'), 'utf8')
const panelSrc = readFileSync(join(__dirname, '../PoligonalValidacionPanel.jsx'), 'utf8')
const modalSrc = readFileSync(join(__dirname, '../PoligonalValidacionComentarioModal.jsx'), 'utf8')

describe('Planilla tubería — panel validación contratista/interventoría', () => {
  it('reutiliza PoligonalValidacionPanel con variante planilla-tuberia', () => {
    assert.match(formSrc, /import PoligonalValidacionPanel/)
    assert.match(formSrc, /variante=["']planilla-tuberia["']/)
    assert.match(formSrc, /validarPathPrefix=\{`\/planillas-tuberia\/\$\{planilla\.id\}`\}/)
  })

  it('panel habilita interventoría solo tras N1 Aprobado y admite planilla cerrada', () => {
    assert.match(panelSrc, /variante === 'planilla-tuberia'/)
    assert.match(panelSrc, /planillas-tuberia/)
    assert.match(panelSrc, /n1Aprobado/)
    assert.match(panelSrc, /habilitadoN2/)
    assert.match(panelSrc, /Requiere aprobación de contratista/)
  })

  it('comentario Pendiente/Rechazado obligatorio (mismo criterio SICOE/topo)', () => {
    assert.match(modalSrc, /estado === 'Pendiente' \|\| estado === 'Rechazado'/)
    assert.match(modalSrc, /El mensaje es obligatorio/)
  })

  it('comentario interventoría visible en la cartera', () => {
    assert.match(formSrc, /data-comentario-interventoria/)
    assert.match(formSrc, /comentarioInterventoria/)
    assert.match(formSrc, /Comentario interventoría/)
    assert.match(formSrc, /comentario_interventoria/)
  })
})
