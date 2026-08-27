/**
 * Harness ligero: reproduce crash al «Agregar lectura» sin montar NivelacionForm completo.
 * Simula el mismo flujo: validar → setFilas → recalcular vista → render Cartera.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React, { useMemo, useState, act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import NivelacionCarteraTable from './NivelacionCarteraTable.jsx'
import NivelacionIngresoPanel from './NivelacionIngresoPanel.jsx'
import { coloresBloqueNiv, TopoThemeProvider } from './topografiaShared.jsx'
import { topoSheetStyles } from './topoSheetStyles.js'
import {
  calcularVistaNivelacion,
  carteraVplusSinVista,
  cotasDesdePuntos,
  prepararBorradorBmInicial,
  prepararBorradorSiguiente,
  validarBorradorParaAgregar,
  MSG_VPLUS_SIN_VISTA,
} from '../../utils/topografia_nivelacion.js'

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.HTMLInputElement = dom.window.HTMLInputElement
globalThis.HTMLButtonElement = dom.window.HTMLButtonElement
globalThis.Node = dom.window.Node
globalThis.MutationObserver = dom.window.MutationObserver
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window)
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0)
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const theme = {
  primary: '#2563eb',
  border: '#e2e8f0',
  text: '#0f172a',
  textMuted: '#64748b',
  bgCard: '#fff',
  inputBg: '#f8fafc',
  success: '#16a34a',
  warn: '#f97316',
}

const cotasBib = cotasDesdePuntos([{ nombre: 'BM-INI', cota: 801.4, verificado: true }])

function captureErrors() {
  const errors = []
  const orig = console.error
  console.error = (...a) => {
    errors.push(a.map(String).join(' '))
    orig(...a)
  }
  return {
    errors,
    restore: () => { console.error = orig },
    fatal: () => errors.filter((e) => /ReferenceError|TypeError|Cannot read|is not defined/i.test(e)),
  }
}

function Harness({ tipoNivel = 'automatico', borradorInicial, inconsistente = false }) {
  const ui = {
    t: theme,
    text: theme.text,
    textMuted: theme.textMuted,
    accent: theme.primary,
    border: theme.border,
    compactInput: { border: `1px solid ${theme.border}`, borderRadius: 6, padding: '2px 6px', background: theme.inputBg },
    btnPrimary: { background: theme.primary, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px' },
    btnSecondary: { background: theme.inputBg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 8, padding: '4px 8px' },
  }
  const bloques = useMemo(() => coloresBloqueNiv(theme), [])
  const sheet = useMemo(() => topoSheetStyles(theme), [])
  const [filas, setFilas] = useState([])
  const [borrador, setBorrador] = useState(borradorInicial)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const vista = useMemo(
    () => calcularVistaNivelacion(filas, tipoNivel, cotasBib, { distMax: 50 }),
    [filas, tipoNivel],
  )
  const carteraIncompleta = carteraVplusSinVista(filas, tipoNivel)

  const onAgregar = () => {
    const gate = validarBorradorParaAgregar(borrador, filas, tipoNivel, 'BM-INI', {
      modoApertura: true,
      circuitoAbierto: true,
    })
    if (!gate.ok) {
      setError(gate.msg)
      return
    }
    if (gate.avisosHilos?.length) setOkMsg(`Lectura agregada con aviso: ${gate.avisosHilos[0]}`)
    else setOkMsg('Lectura agregada a la cartera.')
    setError('')
    setFilas((rows) => {
      const next = [...rows, { ...gate.fila, orden: rows.length + 1 }]
      setBorrador(prepararBorradorSiguiente(next.length))
      return next
    })
  }

  return (
    <div>
      {error ? <div data-testid="error">{error}</div> : null}
      {okMsg ? <div data-testid="ok">{okMsg}</div> : null}
      <NivelacionIngresoPanel
        borrador={borrador}
        onChange={setBorrador}
        onAgregar={onAgregar}
        onElegirPk={() => {}}
        esAutomatico={tipoNivel === 'automatico'}
        disabled={false}
        ui={ui}
        bloques={bloques}
        sheet={sheet}
        isCompact={false}
        bmInicialNombre="BM-INI"
        esPrimeraFila={filas.length === 0}
        puedeAgregar
        tituloHint={inconsistente ? 'test inconsistente' : 'test'}
      />
      <NivelacionCarteraTable
        filas={filas}
        filasVista={vista.filasVista}
        tipoNivel={tipoNivel}
        ui={ui}
        bloques={bloques}
        isCompact={false}
        bmInicialNombre="BM-INI"
        editable
        onEditar={() => {}}
        onEliminar={() => {}}
      />
      {carteraIncompleta ? <p data-testid="aviso-vplus">{MSG_VPLUS_SIN_VISTA}</p> : null}
      <div data-testid="nfilas">{filas.length}</div>
      <div data-testid="hi">{vista.filasVista[0]?.altura_instrumento ?? ''}</div>
    </div>
  )
}

describe('Agregar lectura — harness cartera+panel', () => {
  it('agrega lectura válida sin TypeError/ReferenceError', async () => {
    const cap = captureErrors()
    const rootEl = document.getElementById('root')
    const root = createRoot(rootEl)
    const borrador = {
      ...prepararBorradorBmInicial('BM-INI'),
      abscisa: '0',
      ubicacion_pk_id: 'pk-0',
      ubicacion_pk: '525250',
      descripcion_punto: 'Amarre BM',
      vplus: { hS: '1.450', hM: '1.250', hI: '1.050', lectura: '' },
    }
    await act(async () => {
      root.render(
        <TopoThemeProvider t={theme}>
          <Harness borradorInicial={borrador} />
        </TopoThemeProvider>,
      )
    })
    const btn = [...rootEl.querySelectorAll('button')].find((b) => /Agregar lectura/i.test(b.textContent || ''))
    assert.ok(btn)
    await act(async () => { btn.click() })
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })

    const fatals = cap.fatal()
    const n = rootEl.querySelector('[data-testid="nfilas"]')?.textContent
    const hi = rootEl.querySelector('[data-testid="hi"]')?.textContent
    const ok = rootEl.querySelector('[data-testid="ok"]')?.textContent
    const aviso = rootEl.querySelector('[data-testid="aviso-vplus"]')?.textContent
    const htmlLen = rootEl.innerHTML.length
    cap.restore()
    await act(async () => root.unmount())

    assert.equal(n, '1', 'debe haber 1 fila en cartera')
    assert.ok(Number(hi) > 800, `HI calculada, got ${hi}`)
    assert.match(ok || '', /Lectura agregada/)
    assert.ok(aviso, 'debe mostrar aviso V+ sin vista (no ReferenceError)')
    assert.ok(htmlLen > 200, 'no pantalla en blanco')
    assert.equal(fatals.length, 0, fatals.join('\n'))
  })

  it('hilos inconsistentes: alerta/aviso sin romper pantalla', async () => {
    const cap = captureErrors()
    const rootEl = document.getElementById('root')
    const root = createRoot(rootEl)
    const borrador = {
      ...prepararBorradorBmInicial('BM-INI'),
      abscisa: '0',
      ubicacion_pk_id: 'pk-0',
      ubicacion_pk: '525250',
      descripcion_punto: 'Amarre BM',
      // |S-M|≠|M-I|
      vplus: { hS: '1.500', hM: '1.250', hI: '1.050', lectura: '' },
    }
    await act(async () => {
      root.render(
        <TopoThemeProvider t={theme}>
          <Harness borradorInicial={borrador} inconsistente />
        </TopoThemeProvider>,
      )
    })
    const btn = [...rootEl.querySelectorAll('button')].find((b) => /Agregar lectura/i.test(b.textContent || ''))
    await act(async () => { btn.click() })
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })

    const fatals = cap.fatal()
    const ok = rootEl.querySelector('[data-testid="ok"]')?.textContent || ''
    const n = rootEl.querySelector('[data-testid="nfilas"]')?.textContent
    const htmlLen = rootEl.innerHTML.length
    cap.restore()
    await act(async () => root.unmount())

    assert.equal(n, '1')
    assert.match(ok, /aviso|Separación|incongruen|hilos/i)
    assert.ok(htmlLen > 200)
    assert.equal(fatals.length, 0, fatals.join('\n'))
  })

  it('distancia V+ > 50 m (alerta fila) no crashea', async () => {
    const cap = captureErrors()
    const rootEl = document.getElementById('root')
    const root = createRoot(rootEl)
    // dist taqui = 100*(1.900-1.100)=80 > 50 → bloques.alerta.row
    const borrador = {
      ...prepararBorradorBmInicial('BM-INI'),
      abscisa: '0',
      ubicacion_pk_id: 'pk-0',
      ubicacion_pk: '525250',
      descripcion_punto: 'Amarre BM',
      vplus: { hS: '1.900', hM: '1.500', hI: '1.100', lectura: '' },
    }
    await act(async () => {
      root.render(
        <TopoThemeProvider t={theme}>
          <Harness borradorInicial={borrador} />
        </TopoThemeProvider>,
      )
    })
    const btn = [...rootEl.querySelectorAll('button')].find((b) => /Agregar lectura/i.test(b.textContent || ''))
    await act(async () => { btn.click() })
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    const fatals = cap.fatal()
    const n = rootEl.querySelector('[data-testid="nfilas"]')?.textContent
    cap.restore()
    await act(async () => root.unmount())
    assert.equal(n, '1')
    assert.equal(fatals.length, 0, fatals.join('\n'))
  })
})

describe('Agregar lectura — MSG_VPLUS_SIN_VISTA', () => {
  it('tras V+ solo, carteraIncompleta es true y el mensaje está definido (no ReferenceError)', async () => {
    const { carteraVplusSinVista, MSG_VPLUS_SIN_VISTA } = await import('../../utils/topografia_nivelacion.js')
    assert.equal(typeof MSG_VPLUS_SIN_VISTA, 'string')
    assert.ok(MSG_VPLUS_SIN_VISTA.length > 10)

    const borrador = {
      ...prepararBorradorBmInicial('BM-INI'),
      abscisa: '0',
      ubicacion_pk_id: 'pk-0',
      ubicacion_pk: '525250',
      descripcion_punto: 'Amarre BM',
      vplus: { hS: '1.450', hM: '1.250', hI: '1.050', lectura: '' },
    }
    const g = validarBorradorParaAgregar(borrador, [], 'automatico', 'BM-INI', {
      modoApertura: true,
      circuitoAbierto: true,
    })
    assert.equal(g.ok, true, g.msg)
    const filas = [{ ...g.fila, orden: 1 }]
    assert.equal(carteraVplusSinVista(filas, 'automatico'), true, 'V+ solo debe marcar cartera incompleta')

    // Render mínimo del aviso (misma expresión que NivelacionForm)
    const cap = captureErrors()
    const rootEl = document.getElementById('root')
    const root = createRoot(rootEl)
    await act(async () => {
      root.render(<p>{MSG_VPLUS_SIN_VISTA}</p>)
    })
    assert.match(rootEl.textContent || '', /V\+|Vi|V−/)
    assert.equal(cap.fatal().length, 0, cap.fatal().join('\n'))
    cap.restore()
    await act(async () => root.unmount())
  })
})
