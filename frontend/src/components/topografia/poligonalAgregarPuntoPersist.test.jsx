/**
 * Regresión: tras «Cambiar armada», los datos de «Agregar punto» se borraban solos.
 *
 * Causa raíz: aplicarDetalle() hacía setEstForm(resetEstForm()) en CADA refresh
 * (sincronizarDetalle tras HI onBlur, o re-aplicación cuando el padre actualiza
 * initialDetalle vía onSaved). El usuario perdía la captura a medias.
 *
 * Ejecutar (desde frontend/):
 *   npx esbuild src/components/topografia/poligonalAgregarPuntoPersist.test.jsx \
 *     --bundle --platform=node --format=esm --outfile=./poligonal-agregar-punto.test.mjs \
 *     --external:react --external:react-dom --external:react-dom/client \
 *     --external:react/jsx-runtime --external:jsdom \
 *     --external:node:test --external:node:assert/strict --jsx=automatic \
 *     --define:import.meta.env.DEV=false --define:import.meta.env.PROD=true \
 *     --define:import.meta.env.VITE_API_URL='""' \
 *     --define:import.meta.env.VITE_SUPABASE_URL='""' \
 *     --define:import.meta.env.VITE_SUPABASE_ANON_KEY='""' \
 *     --define:import.meta.env.VITE_SUPABASE_KEY='""' \
 *   && node --test ./poligonal-agregar-punto.test.mjs && rm ./poligonal-agregar-punto.test.mjs
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

function makeDetalle(hi = null, orden = 3) {
  return {
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
        altura_instrumento: 1.5,
        base_azimut_texto: "45°00'00\"",
        base_azimut: 45,
        estacion_coords: { norte: 1000, este: 2000, cota: 100 },
        puntos: [],
      },
      {
        id: `a${orden}`,
        orden,
        estacion_nombre: 'EST-2',
        visado_nombre: 'EST-1',
        altura_instrumento: hi,
        base_azimut_texto: "90°00'00\"",
        base_azimut: 90,
        estacion_coords: { norte: 1100, este: 2100, cota: 101 },
        puntos: [],
      },
    ],
    punto_inicial: { id: 'pt1', nombre: 'EST-1', norte: 1000, este: 2000, cota: 100, verificado: false },
    punto_visado: { id: 'pt2', nombre: 'VIS-1', norte: 1100, este: 2100, cota: 101, verificado: false },
    punto_final: { id: 'pt1', nombre: 'EST-1', norte: 1000, este: 2000, cota: 100, verificado: false },
    base: { azimut_texto: "45°00'00\"", distancia: 141.421 },
    puntos_estacion_disponibles: [
      { nombre: 'EST-1', norte: 1000, este: 2000, cota: 100 },
      { nombre: 'EST-2', norte: 1100, este: 2100, cota: 101 },
    ],
    puntos_visado_disponibles: [
      { nombre: 'EST-1', norte: 1000, este: 2000, cota: 100 },
      { nombre: 'VIS-1', norte: 1100, este: 2100, cota: 101 },
      { nombre: 'EST-2', norte: 1100, este: 2100, cota: 101 },
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
}

function setNativeValue(el, value) {
  if (!el) throw new Error('setNativeValue: element is null')
  const proto = Object.getPrototypeOf(el)
  let setter = null
  for (let p = proto; p; p = Object.getPrototypeOf(p)) {
    setter = Object.getOwnPropertyDescriptor(p, 'value')?.set
    if (setter) break
  }
  if (setter) setter.call(el, value)
  else el.value = value

  // React 19 guarda onChange en props del nodo; el Event('input') de JSDOM
  // a veces no llega al listener. Invocar el handler garantiza el setState.
  const propKey = Object.keys(el).find((k) => k.startsWith('__reactProps$'))
  const props = propKey ? el[propKey] : null
  if (props?.onChange) {
    props.onChange({ target: el, currentTarget: el, bubbles: true, preventDefault() {}, stopPropagation() {} })
  } else {
    el.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    el.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
  }
}

function blurInput(el) {
  if (!el) return
  const propKey = Object.keys(el).find((k) => k.startsWith('__reactProps$'))
  const props = propKey ? el[propKey] : null
  if (props?.onBlur) {
    props.onBlur({ target: el, currentTarget: el, bubbles: true, preventDefault() {}, stopPropagation() {} })
  } else {
    el.dispatchEvent(new dom.window.FocusEvent('blur', { bubbles: true }))
  }
}

function findPuntoInput() {
  return document.querySelector('[data-testid="agregar-punto-nombre"]')
    || [...document.querySelectorAll('input')].find((el) => el.getAttribute('placeholder') === 'Ej. P1')
}

function findHtInput() {
  return document.querySelector('[data-testid="agregar-punto-ht"]')
    || [...document.querySelectorAll('input')].find((el) => el.getAttribute('title')?.includes('altura del prisma'))
}

function findDistInput() {
  return document.querySelector('[data-testid="agregar-punto-dist"]')
    || [...document.querySelectorAll('input')].find((el) => el.getAttribute('placeholder') === '0.000')
}

function findHiInput() {
  return [...document.querySelectorAll('input')].find((el) => el.getAttribute('title')?.includes('Altura del instrumento'))
}

describe('PoligonalModal — Agregar punto persiste tras sync', () => {
  it('tras diligenciar Agregar punto, actualizar HI (sync) no borra los campos', async () => {
    let detalleActual = makeDetalle(null, 3)
    const api = async (path, opts = {}) => {
      if (path === '/operadores') return []
      if (String(path).startsWith('/poligonales/p1/armadas/') && opts.method === 'PUT') {
        const body = JSON.parse(opts.body || '{}')
        detalleActual = makeDetalle(body.altura_instrumento, 3)
        return { ok: true }
      }
      if (String(path).startsWith('/poligonales/p1')) return detalleActual
      return {}
    }

    document.body.innerHTML = '<div id="root"></div>'
    const root = createRoot(document.getElementById('root'))

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
            poligonalId="p1"
            initialPoligonalId="p1"
            initialDetalle={detalleActual}
          />
        </TopoThemeProvider>
      )
    }

    await act(async () => {
      root.render(<Harness />)
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80))
    })

    const punto = findPuntoInput()
    const ht = findHtInput()
    const dist = findDistInput()
    const hi = findHiInput()
    assert.ok(punto, 'campo Punto')
    assert.ok(ht, 'campo Prisma/HT')
    assert.ok(dist, 'campo Distancia')
    assert.ok(hi, 'campo HI armada')

    await act(async () => {
      setNativeValue(punto, 'P-99')
      await new Promise((r) => setTimeout(r, 20))
      setNativeValue(ht, '1.550')
      await new Promise((r) => setTimeout(r, 20))
      setNativeValue(dist, '25.340')
      await new Promise((r) => setTimeout(r, 20))
      setNativeValue(hi, '1.620')
    })

    assert.equal(findPuntoInput()?.value, 'P-99')
    assert.equal(findHtInput()?.value, '1.550')
    assert.equal(findDistInput()?.value, '25.340')

    // Simula perder foco en HI → PUT + sincronizarDetalle (antes borraba estForm)
    await act(async () => {
      blurInput(hi)
      await new Promise((r) => setTimeout(r, 150))
    })

    // Forzar re-lectura tras reconciliar (evita leer valor nativo stale)
    assert.equal(findPuntoInput()?.value, 'P-99', 'Punto debe persistir tras sync de HI')
    assert.equal(findHtInput()?.value, '1.550', 'HT debe persistir tras sync de HI')
    assert.equal(findDistInput()?.value, '25.340', 'Distancia debe persistir tras sync de HI')
    root.unmount()
  })

  it('refresco de initialDetalle del padre (onSaved) no borra captura en curso', async () => {
    let detalleActual = makeDetalle(null, 3)
    const api = async (path) => {
      if (path === '/operadores') return []
      if (String(path).startsWith('/poligonales/p1')) return detalleActual
      return {}
    }

    document.body.innerHTML = '<div id="root"></div>'
    const root = createRoot(document.getElementById('root'))
    let bumpDetalle = null

    function Harness() {
      const [open] = useState(true)
      const [detalle, setDetalle] = useState(detalleActual)
      bumpDetalle = setDetalle
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
            poligonalId="p1"
            initialPoligonalId="p1"
            initialDetalle={detalle}
          />
        </TopoThemeProvider>
      )
    }

    await act(async () => {
      root.render(<Harness />)
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120))
    })

    await act(async () => {
      setNativeValue(findPuntoInput(), 'RAD-7')
      setNativeValue(findDistInput(), '12.100')
      await new Promise((r) => setTimeout(r, 30))
    })
    assert.equal(findPuntoInput()?.value, 'RAD-7')

    // Padre refresca detalle (nueva referencia) como tras onSaved de Cambiar armada
    detalleActual = makeDetalle(1.5, 3)
    await act(async () => {
      bumpDetalle(detalleActual)
      await new Promise((r) => setTimeout(r, 120))
    })

    assert.equal(findPuntoInput()?.value, 'RAD-7', 'Punto no debe borrarse al refrescar initialDetalle')
    assert.equal(findDistInput()?.value, '12.100', 'Distancia no debe borrarse al refrescar initialDetalle')
    root.unmount()
  })
})
