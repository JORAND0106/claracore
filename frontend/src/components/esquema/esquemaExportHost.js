/**
 * Muestra el popup «Exportar» en un portal independiente del modal,
 * para que sobreviva si el caller cierra el editor en onSave.
 * Siempre muestra la ventana (aunque PDF/DXF no estén listos).
 * Llamadas concurrentes reutilizan el mismo popup (sin duplicar).
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import EsquemaExportPopup from './EsquemaExportPopup.jsx'

let activeHost = null
let pendingPromise = null

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

  // Modal + Bitácora pueden llamar a la vez: un solo popup.
  if (pendingPromise) return pendingPromise

  pendingPromise = new Promise((resolve) => {
    const finish = (result) => {
      teardown()
      pendingPromise = null
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
