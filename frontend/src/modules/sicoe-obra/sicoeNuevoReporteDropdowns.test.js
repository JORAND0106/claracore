/**
 * Generación de reporte: desplegables (capítulo / sub / insp) deben
 * usar listbox anclado en portal, no absolute/fixed sin ancla dentro
 * del modal con overflow:hidden.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const appSrc = readFileSync(join(here, '../../App.jsx'), 'utf8')

/** Extrae el cuerpo de ModalNuevoReporte hasta el siguiente function de nivel. */
function modalNuevoReporteSrc() {
  const start = appSrc.search(/\nfunction ModalNuevoReporte\b/)
  assert.ok(start >= 0, 'ModalNuevoReporte existe')
  const rest = appSrc.slice(start + 1)
  const next = rest.search(/\nfunction [A-Za-z_]/)
  const body = next >= 0 ? rest.slice(0, next) : rest
  return body
}

describe('ModalNuevoReporte · desplegables anclados', () => {
  it('importa CcAnchoredListbox', () => {
    assert.match(appSrc, /import CcAnchoredListbox from ['"]\.\/components\/CcAnchoredListbox/)
  })

  it('capítulo / subcontratista / inspector usan CcAnchoredListbox (portal)', () => {
    const body = modalNuevoReporteSrc()
    assert.match(body, /CAPÍTULO \*/)
    assert.match(body, /SUBCONTRATISTA \*/)
    assert.match(body, /INSPECTOR \*/)
    const n = (body.match(/<CcAnchoredListbox\b/g) || []).length
    assert.ok(n >= 3, `al menos 3 listbox anclados, hay ${n}`)
  })

  it('no deja el listado de capítulo con fixed/auto sin ancla ni absolute top 100% en Info General', () => {
    const body = modalNuevoReporteSrc()
    // Antiguo bug: fixed top/left auto + width fijo, o absolute top 100% bajo overflow.
    assert.doesNotMatch(
      body,
      /CAPÍTULO \*[\s\S]{0,900}position:\s*['"]fixed['"][\s\S]{0,120}top:\s*['"]auto['"]/,
    )
    assert.doesNotMatch(
      body,
      /SUBCONTRATISTA \*[\s\S]{0,700}position:\s*['"]absolute['"][\s\S]{0,80}top:\s*['"]100%['"]/,
    )
    assert.doesNotMatch(
      body,
      /INSPECTOR \*[\s\S]{0,700}position:\s*['"]absolute['"][\s\S]{0,80}top:\s*['"]100%['"]/,
    )
  })

  it('conserva búsqueda y selección de capítulo', () => {
    const body = modalNuevoReporteSrc()
    assert.match(body, /Buscar capítulo/)
    assert.match(body, /setCapituloSel/)
    assert.match(body, /capBusqueda/)
    assert.match(body, /No se encontró el capítulo/)
  })

  it('la búsqueda de ítem en hoja también usa listbox anclado (mismo patrón)', () => {
    assert.match(appSrc, /sicoe-hoja-item-listbox/)
    assert.doesNotMatch(
      appSrc,
      /Buscar por número o descripción[\s\S]{0,900}position:\s*['"]absolute['"][\s\S]{0,80}top:\s*['"]100%['"]/,
    )
  })
})
