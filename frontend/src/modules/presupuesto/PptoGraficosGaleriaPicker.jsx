import { useEffect, useState } from 'react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { aplanarImagenesGaleriaGraficos } from './pptoGraficosGaleria.js'

/**
 * Galería de gráficos ya cargados en Presupuesto (grupos con imagen).
 * No usa la galería de fotos de SicoeObra.
 */
export default function PptoGraficosGaleriaPicker({
  open,
  onClose,
  t,
  contratoId,
  token,
  API,
  onSelect,
  /** Por encima del modal ClaraCAD (4100). */
  zIndex = 4200,
}) {
  const [imagenes, setImagenes] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !contratoId || !token) return undefined
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`${API}/presupuesto/${contratoId}/graficos/grupos`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text().catch(() => `Error ${r.status}`))
        return r.json()
      })
      .then((d) => {
        if (cancelled) return
        setImagenes(aplanarImagenesGaleriaGraficos(d?.grupos))
      })
      .catch((err) => {
        if (!cancelled) {
          setImagenes([])
          setError(err?.message || 'No se pudo cargar la galería de gráficos')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [open, contratoId, token, API])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Galería de gráficos de Presupuesto"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          width: 680,
          maxWidth: '96vw',
          maxHeight: '88vh',
          overflow: 'auto',
          padding: 18,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <CcModalBrandHeader theme={t} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)', color: t.text }}>
              Galería de gráficos · Presupuesto
            </div>
            <div style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, marginTop: 2 }}>
              Gráficos ya asociados a grupos de este contrato
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              padding: '4px 10px',
              cursor: 'pointer',
              color: t.textMuted,
              fontWeight: 700,
            }}
          >
            ✕
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: 24, color: t.textMuted }}>Cargando gráficos…</div>
        )}
        {!loading && error && (
          <div style={{ color: '#B91C1C', fontSize: 'var(--cc-sm)', marginBottom: 8 }}>{error}</div>
        )}
        {!loading && !error && imagenes.length === 0 && (
          <div style={{ textAlign: 'center', padding: 24, color: t.textMuted }}>
            No hay gráficos cargados en Presupuesto todavía.
          </div>
        )}
        {!loading && imagenes.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {imagenes.map((f) => (
              <button
                key={String(f.id)}
                type="button"
                onClick={() => onSelect?.({
                  url: f.url,
                  blob_path: f.blob_path,
                  descripcion: f.descripcion,
                  origen: 'galeria',
                  grupo_id: f.grupo_id,
                  pie_foto: f.pie_foto,
                })}
                style={{
                  cursor: 'pointer',
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: `2px solid ${t.border}`,
                  background: t.bg,
                  padding: 0,
                  textAlign: 'left',
                }}
              >
                <img src={f.url} alt="" style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block' }} />
                <div style={{ padding: '4px 6px', fontSize: 'var(--cc-caption)', color: t.textMuted }}>
                  {f.descripcion || f.pie_foto || 'Gráfico'}
                  {f.items_label ? ` · ${f.items_label}` : ''}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
