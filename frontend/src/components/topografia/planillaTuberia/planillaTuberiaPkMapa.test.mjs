/**
 * Cabecera planilla tubería: PK / ID vía selector de mapa (mismo modal que Nivelación / Bitácora).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const formSrc = readFileSync(join(dir, 'PlanillaTuberiaForm.jsx'), 'utf8')

describe('Planilla tubería — PK / ID por mapa', () => {
  it('reutiliza BitacoraMaterialUbicacionModal (mapa PptoFiltroMapaPk)', () => {
    assert.match(formSrc, /BitacoraMaterialUbicacionModal/)
    assert.match(formSrc, /setPkMapOpen/)
    assert.match(formSrc, /Elegir PK/)
  })

  it('al confirmar diligencia pk_id y costado desde ubicacion_*', () => {
    assert.match(formSrc, /pk_id:\s*loc\?\.ubicacion_pk/)
    assert.match(formSrc, /costado:\s*loc\?\.ubicacion_costado/)
  })

  it('abre el selector de mapa por encima del popup de edición de la planilla', () => {
    assert.match(formSrc, /zIndex:\s*100030/)
    assert.match(formSrc, /zIndex=\{100050\}/)
    const modalSrc = readFileSync(
      join(dir, '../../../modules/seguimiento/BitacoraMaterialUbicacionModal.jsx'),
      'utf8',
    )
    assert.match(modalSrc, /zIndex\s*=\s*5600/)
    assert.match(modalSrc, /zIndex,\s*background:/)
  })

  it('ya no usa input de texto libre para PK / ID', () => {
    assert.doesNotMatch(
      formSrc,
      /key="pk"[^>]*value=\{params\.pk_id\}[^>]*onChange=\{[^}]*pk_id:\s*e\.target\.value/,
    )
    assert.match(formSrc, /onClick=\{\(\)\s*=>\s*setPkMapOpen\(true\)\}/)
  })
})
