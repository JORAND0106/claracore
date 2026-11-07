/**
 * Muestra el popup «Exportar» en un portal independiente del modal,
 * para que sobreviva si el caller cierra el editor en onSave.
 * Siempre muestra la ventana (aunque PDF/DXF no estén listos).
 * Llamadas concurrentes en la misma ráfaga (~120 ms) reutilizan el mismo popup.
 * Cada guardado posterior vuelve a mostrar Exportar (descargas repetibles).
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import EsquemaExportPopup from './EsquemaExportPopup.jsx'

let activeHost = null
let pendingPromise = null
let coalesceUntil = 0
let pendingResolve = null

function teardown() {
  if (!activeHost) return
  const { root, host } = activeHost
  activeHost = null
  try { root.unmount() } catch { /* ignore */ }
  try { host.remove() } catch { /* ignore */ }
}

/**
 * @param {{ t?: object, title?: string, pdf?: object|null, dxf?: object|null }} opts
 * @returns {Promise<{ exported: { pdf: boolean, dxf: boolean } }>}
 */
export function presentEsquemaExportPopup(opts = {}) {
  if (typeof document === 'undefined') {
    return Promise.resolve({ exported: { pdf: false, dxf: false } })
  }

  const now = Date.now()
  // Modal + Bitácora/host pueden llamar a la vez tras el mismo Guardar.
  if (pendingPromise && now < coalesceUntil) {
    return pendingPromise
  }

  // Guardado nuevo: cerrar popup anterior (si quedó abierto) y mostrar de nuevo.
  if (pendingPromise && pendingResolve) {
    const prev = pendingResolve
    pendingResolve = null
    pendingPromise = null
    teardown()
    try { prev({ exported: { pdf: false, dxf: false } }) } catch { /* ignore */ }
  } else if (activeHost) {
    teardown()
  }

  coalesceUntil = now + 120

  pendingPromise = new Promise((resolve) => {
    pendingResolve = resolve
    const finish = (result) => {
      teardown()
      pendingPromise = null
      pendingResolve = null
      coalesceUntil = 0
      resolve(result || { exported: { pdf: false, dxf: false } })
    }

    const run = () => {
      try {
        const host = document.createElement('div')
        host.setAttribute('data-esquema-export-host', '1')
        document.body.appendChild(host)
        const root = createRoot(host)
        activeHost = { root, host }

        root.render(createElement(EsquemaExportPopup, {
          t: opts.t || {},
          title: opts.title || 'Esquema',
          pdf: opts.pdf || null,
          dxf: opts.dxf || null,
          onClose: finish,
        }))
      } catch (err) {
        console.error('esquema Exportar popup', err)
        finish({ exported: { pdf: false, dxf: false } })
      }
    }

    // Después del unmount del modal (Bitácora cierra el editor en onSave).
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(run, 30))
    } else {
      setTimeout(run, 30)
    }
  })

  return pendingPromise
}

/** Solo pruebas: limpia estado del host. */
export function __resetEsquemaExportHostForTests() {
  teardown()
  pendingPromise = null
  pendingResolve = null
  coalesceUntil = 0
}
