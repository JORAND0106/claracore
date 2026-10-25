/**
 * Popup institucional «Exportar» tras Guardar el PNG en el registro.
 * Casillas PDF y DXF; Exportar descarga lo marcado; Cerrar no descarga.
 */
import { useState } from 'react'
import CcModalBrandHeader from '../CcModalBrandHeader'

function triggerDownload(dataUri, nombre) {
  if (!dataUri) return
  const a = document.createElement('a')
  a.href = dataUri
  a.download = nombre || 'esquema.bin'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export default function EsquemaExportPopup({
  t,
  title = 'Esquema',
  pdf = null, // { dataUri, nombre }
  dxf = null,
  onClose,
}) {
  const [wantPdf, setWantPdf] = useState(false)
  const [wantDxf, setWantDxf] = useState(false)
  const hasPdf = !!(pdf?.dataUri)
  const hasDxf = !!(dxf?.dataUri)
  const canExport = (wantPdf && hasPdf) || (wantDxf && hasDxf)

  const ui = {
    text: t?.text || '#0f172a',
    muted: t?.textMuted || '#64748b',
    border: t?.border || '#e2e8f0',
    primary: t?.primary || '#2563eb',
    bg: t?.bgCard || t?.bg || '#fff',
  }

  const onExport = () => {
    if (wantPdf && hasPdf) {
      triggerDownload(pdf.dataUri, pdf.nombre || `${title}.pdf`)
    }
    if (wantDxf && hasDxf) {
      triggerDownload(dxf.dataUri, dxf.nombre || `${title}.dxf`)
    }
    onClose?.({ exported: { pdf: wantPdf && hasPdf, dxf: wantDxf && hasDxf } })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Exportar"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20050,
        background: 'rgba(15,23,42,0.45)',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          width: 'min(400px, 100%)',
          background: ui.bg,
          borderRadius: 12,
          border: `1px solid ${ui.border}`,
          padding: 16,
          boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        }}
      >
        <CcModalBrandHeader theme={t} />
        <div style={{ fontWeight: 800, color: ui.text, fontSize: 16, margin: '8px 0 4px' }}>
          Exportar
        </div>
        <p style={{ margin: '0 0 14px', color: ui.muted, fontSize: 13, lineHeight: 1.4 }}>
          El esquema ya quedó guardado como PNG en el registro. Elija los formatos
          adicionales para descargar a su dispositivo.
        </p>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 10, color: ui.text, fontSize: 14, cursor: hasPdf ? 'pointer' : 'not-allowed',
          opacity: hasPdf ? 1 : 0.45,
        }}
        >
          <input
            type="checkbox"
            checked={wantPdf}
            disabled={!hasPdf}
            onChange={(e) => setWantPdf(e.target.checked)}
          />
          PDF
        </label>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 16, color: ui.text, fontSize: 14, cursor: hasDxf ? 'pointer' : 'not-allowed',
          opacity: hasDxf ? 1 : 0.45,
        }}
        >
          <input
            type="checkbox"
            checked={wantDxf}
            disabled={!hasDxf}
            onChange={(e) => setWantDxf(e.target.checked)}
          />
          DXF
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={() => onClose?.({ exported: { pdf: false, dxf: false } })}
            style={{
              border: `1px solid ${ui.border}`,
              background: ui.bg,
              color: ui.text,
              borderRadius: 8,
              padding: '8px 14px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Cerrar
          </button>
          <button
            type="button"
            disabled={!canExport}
            onClick={onExport}
            style={{
              border: 'none',
              background: canExport ? ui.primary : '#94a3b8',
              color: '#fff',
              borderRadius: 8,
              padding: '8px 14px',
              cursor: canExport ? 'pointer' : 'default',
              fontWeight: 700,
            }}
          >
            Exportar
          </button>
        </div>
      </div>
    </div>
  )
}
