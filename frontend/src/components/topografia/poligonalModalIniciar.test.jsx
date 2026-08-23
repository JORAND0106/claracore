/**
 * Regresión: pantalla en blanco al "Iniciar poligonal".
 *
 * Causa raíz (origin/main): TopoErrorModal se usa en el JSX pero no está importado
 * desde el commit 148efc3a. Cualquier setErrorModal (validación o fallo API) →
 * ReferenceError → pantalla blanca.
 *
 * Ejecutar (desde frontend/):
 *   npx esbuild src/components/topografia/poligonalModalIniciar.test.jsx \
 *     --bundle --platform=node --format=esm --outfile=./poligonal-iniciar.test.mjs \
 *     --external:react --external:react-dom --external:react-dom/client \
 *     --external:react/jsx-runtime --external:jsdom \
 *     --external:node:test --external:node:assert/strict --jsx=automatic \
 *     --define:import.meta.env.DEV=false --define:import.meta.env.PROD=true \
 *     --define:import.meta.env.VITE_API_URL='""' \
 *     --define:import.meta.env.VITE_SUPABASE_URL='""' \
 *     --define:import.meta.env.VITE_SUPABASE_ANON_KEY='""' \
 *     --define:import.meta.env.VITE_SUPABASE_KEY='""' \
 *   && node --test ./poligonal-iniciar.test.mjs && rm ./poligonal-iniciar.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React, { useState, act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import PoligonalModal from './PoligonalModal.jsx'
import { TopoThemeProvider } from './topografiaShared.jsx'

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.HTMLInputElement = dom.window.HTMLInputElement
globalThis.HTMLSelectElement = dom.window.HTMLSelectElement
globalThis.Node = dom.window.Node
globalThis.MutationObserver = dom.window.MutationObserver
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window)
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0)
globalThis.IS_REACT_ACT_ENVIRONMENT = true
try {
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
} catch {
  /* ignore */
}

const theme = {
  primary: '#2563eb',
  border: '#e2e8f0',
  text: '#0f172a',
  textMuted: '#64748b',
  bgCard: '#fff',
  inputBg: '#f8fafc',
}

const mockDetalle = {
  poligonal: {
    id: 'p1',
    nombre: 'Poligonal Test',
    tipo: 'cerrada',
    sentido: 'antihorario',
    estado: 'borrador',
    tolerancia_relativa: 20000,
    tolerancia_cota_mm_km: 12,
    precision_angular_seg: 10,
    longitud_max_delta_m: 300,
    nivel1_estado: 'No Revisado',
    nivel2_estado: 'No Revisado',
    punto_inicial_id: 'pt1',
    punto_visado_id: 'pt2',
    operador: 'Operador Demo',
    fecha_campo: '2026-08-23',
    equipo_marca: 'Leica',
    equipo_referencia: 'TS16',
    equipo_serial: '123',
  },
  estaciones: [],
  armadas: [
    {
      id: 'a1',
      orden: 1,
      estacion_nombre: 'EST-1',
      visado_nombre: 'VIS-1',
      altura_instrumento: null,
      base_azimut_texto: "45°00'00\"",
      base_azimut: 45,
      estacion_coords: { norte: 1000, este: 2000, cota: 100 },
      puntos: [],
    },
  ],
  punto_inicial: { id: 'pt1', nombre: 'EST-1', norte: 1000, este: 2000, cota: 100, verificado: false },
  punto_visado: { id: 'pt2', nombre: 'VIS-1', norte: 1100, este: 2100, cota: 101, verificado: false },
  punto_final: { id: 'pt1', nombre: 'EST-1', norte: 1000, este: 2000, cota: 100, verificado: false },
  base: { azimut_texto: "45°00'00\"", distancia: 141.421 },
  puntos_estacion_disponibles: [{ nombre: 'EST-1', norte: 1000, este: 2000, cota: 100 }],
  puntos_visado_disponibles: [
    { nombre: 'EST-1', norte: 1000, este: 2000, cota: 100 },
    { nombre: 'VIS-1', norte: 1100, este: 2100, cota: 101 },
  ],
  cierre: {
    admisible_lineal: false,
    admisible_angular: null,
    perimetro: 0,
    precision: null,
    tolerancia_relativa: 20000,
    sentido: 'antihorario',
    num_angulos: 0,
    num_vertices: 0,
    suma_observada_texto: '—',
    suma_teorica_texto: '—',
    error_angular_seg: null,
    delta_norte: null,
    delta_este: null,
    delta_cota: null,
    error_lineal: null,
    tipo_pol: 'cerrada',
    cerrado: false,
  },
}

function captureErrors() {
  const errors = []
  const prev = console.error
  console.error = (...args) => {
    errors.push(args.map(String).join(' '))
  }
  return {
    errors,
    restore: () => {
      console.error = prev
    },
    reactCrashes: () =>
      errors.filter((e) => /ReferenceError|TypeError|Cannot read|is not defined|Minified React/i.test(e)),
    topoMissing: () => errors.filter((e) => /TopoErrorModal is not defined/i.test(e)),
  }
}

async function openCerradaSetup(root, api, extraProps = {}) {
  function Harness() {
    const [open] = useState(true)
    return (
      <TopoThemeProvider t={theme}>
        <PoligonalModal
          open={open}
          onClose={() => {}}
          onSaved={() => {}}
          contratoId={1}
          api={api}
          permisos={{ crear: true, editar: true, ver: true }}
          puntosVerificados={[]}
          theme={theme}
          {...extraProps}
        />
      </TopoThemeProvider>
    )
  }

  await act(async () => {
    root.render(<Harness />)
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40))
  })

  if (extraProps.poligonalId || extraProps.initialPoligonalId) return

  const tipoBtn = [...document.querySelectorAll('button')].find((b) => /Poligonal cerrada/i.test(b.textContent || ''))
  assert.ok(tipoBtn, 'botón tipo cerrada visible')
  await act(async () => {
    tipoBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  })
}

describe('PoligonalModal iniciar — regresión pantalla blanca', () => {
  it('validación en Iniciar muestra TopoErrorModal sin ReferenceError', async () => {
    const api = async (path) => {
      if (path === '/operadores') return [{ id: 1, nombre: 'Operador Demo' }]
      return {}
    }
    const cap = captureErrors()
    document.body.innerHTML = '<div id="root"></div>'
    const root = createRoot(document.getElementById('root'))
    await openCerradaSetup(root, api)

    const iniciar = [...document.querySelectorAll('button')].find((b) => /Iniciar poligonal/i.test(b.textContent || ''))
    assert.ok(iniciar, 'botón Iniciar poligonal')
    await act(async () => {
      iniciar.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 50))
    })

    const text = document.body.textContent || ''
    cap.restore()
    console.log('VALIDATION_UI', text.replace(/\s+/g, ' ').slice(0, 400))
    console.log('TOPO_MISSING', cap.topoMissing().length)

    assert.equal(cap.topoMissing().length, 0, `ReferenceError TopoErrorModal: ${cap.topoMissing().join(' | ')}`)
    assert.equal(cap.reactCrashes().length, 0, `crash React: ${cap.reactCrashes().join(' | ')}`)
    assert.ok(/Nombre requerido/i.test(text), 'debe mostrar modal de validación (no pantalla blanca)')
    assert.ok(document.querySelector('[role="alertdialog"]'), 'alertdialog de TopoErrorModal presente')
    root.unmount()
  })

  it('tras cerrar el error de validación el setup sigue usable (no blank)', async () => {
    const api = async (path) => {
      if (path === '/operadores') return [{ id: 1, nombre: 'Operador Demo' }]
      return {}
    }
    const cap = captureErrors()
    document.body.innerHTML = '<div id="root"></div>'
    const root = createRoot(document.getElementById('root'))
    await openCerradaSetup(root, api)

    const iniciar = [...document.querySelectorAll('button')].find((b) => /Iniciar poligonal/i.test(b.textContent || ''))
    await act(async () => {
      iniciar.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 40))
    })
    assert.ok(document.querySelector('[role="alertdialog"]'), 'modal de error visible')

    const entendido = [...document.querySelectorAll('button')].find((b) => /Entendido/i.test(b.textContent || ''))
    assert.ok(entendido, 'botón Entendido')
    await act(async () => {
      entendido.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 40))
    })

    const text = document.body.textContent || ''
    cap.restore()
    assert.equal(cap.reactCrashes().length, 0)
    assert.ok(!document.querySelector('[role="alertdialog"]'), 'modal cerrado')
    assert.ok(/Iniciar poligonal/i.test(text), 'formulario de setup sigue visible')
    assert.ok(/Puntos de amarre/i.test(text), 'campos de amarre siguen visibles')
    root.unmount()
  })

  it('abrir poligonal existente muestra estaciones (sin depender del fill de setup)', async () => {
    const api = async (path) => {
      if (path === '/operadores') return []
      if (String(path).startsWith('/poligonales/p1')) return mockDetalle
      return {}
    }
    const cap = captureErrors()
    document.body.innerHTML = '<div id="root"></div>'
    const root = createRoot(document.getElementById('root'))
    await openCerradaSetup(root, api, {
      poligonalId: 'p1',
      initialPoligonalId: 'p1',
      initialDetalle: mockDetalle,
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80))
    })
    const text = document.body.textContent || ''
    cap.restore()
    assert.equal(cap.reactCrashes().length, 0)
    assert.ok(/EST-1|VIS-1|Agregar punto|Libreta|Cartera/i.test(text), 'detalle de estaciones visible')
    root.unmount()
  })
})
