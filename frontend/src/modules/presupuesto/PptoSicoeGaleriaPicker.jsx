import { useEffect, useState } from 'react'

/**
 * Selector de imágenes de la galería SicoeObra del contrato
 * (misma API que GaleriaFotos en App.jsx).
 */
export default function PptoSicoeGaleriaPicker({
  open,
  onClose,
  t,
  contratoId,
  token,
  API,
  tipo = 'foto',
  onSelect,
}) {
  const [fotos, setFotos] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tipoActivo, setTipoActivo] = useState(tipo)

  useEffect(() => {
    if (!open) return
    setTipoActivo(tipo)
  }, [open, tipo])

  useEffect(() => {
    if (!open || !contratoId || !token) return undefined
    let cancelled = false
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ tipo: tipoActivo })
    fetch(`${API}/sicoe-obra/${contratoId}/galeria?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text().catch(() => `Error ${r.status}`))
        return r.json()
      })
      .then((d) => {
        if (!cancelled) setFotos(Array.isArray(d) ? d : [])
      })
      .catch((err) => {
        if (!cancelled) {
          setFotos([])
          setError(err?.message || 'No se pudo cargar la galería')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [open, contratoId, token, API, tipoActivo])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 2200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Galería del contrato"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          width: 640,
          maxWidth: '96vw',
          maxHeight: '88vh',
          overflow: 'auto',
          padding: 18,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)', color: t.text }}>Galería del contrato</div>
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

        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {[
            { k: 'foto', label: 'Fotos' },
            { k: 'grafico', label: 'Gráficos' },
          ].map((opt) => (
            <button
              key={opt.k}
              type="button"
              onClick={() => setTipoActivo(opt.k)}
              style={{
                border: `1px solid ${tipoActivo === opt.k ? t.primary : t.border}`,
                background: tipoActivo === opt.k ? t.primary + '18' : t.bg,
                color: tipoActivo === opt.k ? t.primary : t.textMuted,
                borderRadius: 8,
                padding: '6px 12px',
                fontWeight: 700,
                fontSize: 'var(--cc-sm)',
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: 24, color: t.textMuted }}>Cargando galería…</div>
        )}
        {!loading && error && (
          <div style={{ color: '#B91C1C', fontSize: 'var(--cc-sm)', marginBottom: 8 }}>{error}</div>
        )}
        {!loading && !error && fotos.length === 0 && (
          <div style={{ textAlign: 'center', padding: 24, color: t.textMuted }}>
            No hay imágenes en la galería de {tipoActivo === 'foto' ? 'fotos' : 'gráficos'}.
          </div>
        )}
        {!loading && fotos.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {fotos.map((f, i) => (
              <button
                key={`${f.numero}-${i}`}
                type="button"
                onClick={() => onSelect?.({ url: f.url, numero: f.numero, descripcion: f.descripcion || '', tipo: tipoActivo })}
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
                <img src={f.url} alt="" style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }} />
                <div style={{ padding: '4px 6px', fontSize: 'var(--cc-caption)', color: t.textMuted }}>
                  #{String(f.numero ?? '').padStart(4, '0')}
                  {f.descripcion ? ` — ${f.descripcion}` : ''}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
