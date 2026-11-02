/**
 * Galería de la plataforma: solo soportes ya cargados en Almacén (no dispositivo).
 * Hoy todas las imágenes de entradas están asociadas → se marcan «En uso · Ent-…».
 */
import { useEffect, useState } from 'react'
import { estiloAvisoAlmacen } from './almacenContraste'
import { useAlmacenApi, useAlmacenTheme } from './almacenShared'

export default function EntradaSoporteGaleriaModal({
  open,
  kind, // remision | material
  contraste,
  onClose,
  onPickUsed,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isRemision = kind === 'remision'

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    setLoading(true)
    setError('')
    api.listEntradaSoportesGaleria(kind)
      .then((data) => {
        if (cancelled) return
        setRows(Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []))
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'No se pudo cargar la galería del módulo.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [api, kind, open])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="entrada-soporte-galeria-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100060,
        background: 'var(--cc-almacen-overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div
        style={{
          width: 'min(560px, 96%)',
          maxHeight: 'min(70dvh, 520px)',
          background: 'var(--cc-almacen-bg-card)',
          color: 'var(--cc-almacen-text)',
          borderRadius: 14,
          border: '1px solid var(--cc-almacen-border)',
          boxShadow: 'var(--cc-almacen-shadow-modal)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          borderBottom: '1px solid var(--cc-almacen-border)',
          gap: 8,
        }}
        >
          <div style={{ fontWeight: 800 }}>
            🖼 Galería del módulo · {isRemision ? 'Remisión' : 'Descargue'}
          </div>
          <button type="button" style={{ ...ui.btnSecondary, minHeight: 40 }} onClick={() => onClose?.()}>
            Cerrar
          </button>
        </div>
        <div style={{ padding: 12, overflow: 'auto', display: 'grid', gap: 8 }}>
          <div style={{ ...estiloAvisoAlmacen(contraste, 'info'), fontWeight: 600, fontSize: '0.85rem' }}>
            Solo imágenes de Almacén. Las ya usadas en una entrada no se pueden volver a cargar
            (regla de duplicados). Use Archivo o Cámara para un soporte nuevo.
          </div>
          {error && (
            <div style={{ color: 'var(--cc-almacen-danger-text)', fontWeight: 700 }}>{error}</div>
          )}
          {loading && <div style={{ fontWeight: 700 }}>Cargando…</div>}
          {!loading && !rows.length && !error && (
            <div
              data-testid="entrada-soporte-galeria-vacia"
              style={{ fontWeight: 700, color: 'var(--cc-almacen-text-muted)' }}
            >
              No hay soportes reutilizables en el módulo. Las imágenes guardadas ya están
              asociadas a una entrada.
            </div>
          )}
          {rows.map((row) => {
            const codigo = row.codigo_entrada || row.codigo || `Ent-#${row.entrada_id}`
            const used = row.en_uso !== false
            return (
              <button
                key={`${row.entrada_id}-${row.tipo_soporte || kind}`}
                type="button"
                data-testid="entrada-soporte-galeria-item"
                disabled={!used && false}
                style={{
                  ...ui.btnSecondary,
                  minHeight: 52,
                  justifyContent: 'flex-start',
                  gap: 10,
                  textAlign: 'left',
                  opacity: used ? 0.95 : 1,
                }}
                onClick={() => {
                  if (used) {
                    onPickUsed?.(codigo, row)
                    return
                  }
                  onClose?.()
                }}
                title={used ? `En uso en ${codigo}` : 'Usar'}
              >
                <span aria-hidden style={{ fontSize: '1.2rem' }}>{isRemision ? '📄' : '📷'}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800 }}>{row.nombre || 'soporte'}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--cc-almacen-text-muted)' }}>
                    {used ? `En uso · ${codigo}` : codigo}
                  </div>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
