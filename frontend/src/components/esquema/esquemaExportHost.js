/**
 * Muestra el popup «Exportar» en un portal independiente del modal,
 * para que sobreviva si el caller cierra el editor en onSave.
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import EsquemaExportPopup from './EsquemaExportPopup.jsx'

/**
 * @param {{ t: object, title?: string, pdf?: object|null, dxf?: object|null }} opts
 * @returns {Promise<{ exported: { pdf: boolean, dxf: boolean } }>}
 */
export function presentEsquemaExportPopup(opts = {}) {
  const hasPdf = !!(opts.pdf?.dataUri)
  const hasDxf = !!(opts.dxf?.dataUri)
  if (!hasPdf && !hasDxf) {
    return Promise.resolve({ exported: { pdf: false, dxf: false } })
  }
  if (typeof document === 'undefined') {
    return Promise.resolve({ exported: { pdf: false, dxf: false } })
  }

  return new Promise((resolve) => {
    const host = document.createElement('div')
    host.setAttribute('data-esquema-export-host', '1')
    document.body.appendChild(host)
    const root = createRoot(host)

    const finish = (result) => {
      try { root.unmount() } catch { /* ignore */ }
      try { host.remove() } catch { /* ignore */ }
      resolve(result || { exported: { pdf: false, dxf: false } })
    }

    root.render(createElement(EsquemaExportPopup, {
      t: opts.t,
      title: opts.title || 'Esquema',
      pdf: opts.pdf || null,
      dxf: opts.dxf || null,
      onClose: finish,
    }))
  })
}
