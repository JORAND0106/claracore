import { useEffect, useState } from 'react'

/**
 * Popup: ¿exportar Excel de Precios con o sin VU Cobro?
 * Por defecto: sin VU Cobro (seguro para entregar al subcontratista).
 */
export default function PreciosExportVuCobroModal({
  open,
  theme,
  procesando = false,
  onCancel,
  onConfirm,
}) {
  const t = theme || {}
  const [incluir, setIncluir] = useState(false)

  useEffect(() => {
    if (open) setIncluir(false)
  }, [open])

  if (!open) return null

  const surface = t.bgCard || '#ffffff'
  const text = t.text || '#0f172a'
  const border = t.border || '#e2e8f0'
  const primary = t.primary || '#0077B6'
  const muted = t.textMuted || '#64748b'
  const warn = t.warn || '#D97706'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10070,
        background: t.overlay || 'rgba(15, 23, 42, 0.48)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={() => !procesando && onCancel?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="precios-export-vu-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 460,
          background: surface,
          border: `1px solid ${border}`,
          borderRadius: 14,
          boxShadow: t.shadow || '0 24px 64px rgba(0,0,0,0.28)',
          overflow: 'hidden',
          color: text,
        }}
      >
        <div style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${border}`,
          background: `color-mix(in srgb, ${primary} 12%, ${surface})`,
        }}
        >
          <div
            id="precios-export-vu-title"
            style={{
              fontSize: 'var(--cc-body)',
              fontWeight: 800,
              color: primary,
            }}
          >
            Exportar Excel de Precios
          </div>
          <div style={{ fontSize: 'var(--cc-caption)', color: muted, marginTop: 4, lineHeight: 1.4 }}>
            Elija si el archivo incluye el VU Cobro (información interna del contrato).
          </div>
        </div>

        <div style={{ padding: '16px 18px', fontSize: 'var(--cc-sm)', lineHeight: 1.45 }}>
          <label style={{
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
            padding: '10px 12px',
            borderRadius: 8,
            border: `1px solid ${!incluir ? primary : border}`,
            background: !incluir ? `color-mix(in srgb, ${primary} 8%, ${surface})` : 'transparent',
            marginBottom: 8,
            cursor: 'pointer',
          }}
          >
            <input
              type="radio"
              name="export-vu-cobro"
              checked={!incluir}
              onChange={() => setIncluir(false)}
              disabled={procesando}
              style={{ marginTop: 3 }}
            />
            <span>
              <strong>Sin VU Cobro</strong>
              <span style={{ display: 'block', color: muted, fontSize: 'var(--cc-caption)', marginTop: 2 }}>
                Opción recomendada para entregar al subcontratista. Igual al soporte contractual.
              </span>
            </span>
          </label>

          <label style={{
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
            padding: '10px 12px',
            borderRadius: 8,
            border: `1px solid ${incluir ? primary : border}`,
            background: incluir ? `color-mix(in srgb, ${primary} 8%, ${surface})` : 'transparent',
            cursor: 'pointer',
          }}
          >
            <input
              type="radio"
              name="export-vu-cobro"
              checked={incluir}
              onChange={() => setIncluir(true)}
              disabled={procesando}
              style={{ marginTop: 3 }}
            />
            <span>
              <strong>Con VU Cobro y comparativo</strong>
              <span style={{ display: 'block', color: muted, fontSize: 'var(--cc-caption)', marginTop: 2 }}>
                Agrega VU Cobro, total a VU Cobro y diferencia (▲) frente al VU Costo M.O.
              </span>
            </span>
          </label>

          {incluir && (
            <div style={{
              marginTop: 12,
              padding: '10px 12px',
              borderRadius: 8,
              background: `color-mix(in srgb, ${warn} 14%, ${surface})`,
              border: `1px solid color-mix(in srgb, ${warn} 40%, ${border})`,
              color: warn,
              fontSize: 'var(--cc-caption)',
              fontWeight: 600,
              lineHeight: 1.4,
            }}
            >
              Incluir el VU Cobro hace que el archivo contenga información que el
              subcontratista no debe ver. Úselo solo para uso interno.
            </div>
          )}
        </div>

        <div style={{
          padding: '12px 18px 16px',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          borderTop: `1px solid ${border}`,
        }}
        >
          <button
            type="button"
            disabled={procesando}
            onClick={onCancel}
            style={{
              background: 'transparent',
              color: muted,
              border: `1px solid ${border}`,
              borderRadius: 8,
              padding: '8px 14px',
              fontSize: 'var(--cc-sm)',
              fontWeight: 600,
              cursor: procesando ? 'wait' : 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={procesando}
            onClick={() => onConfirm?.({ incluirVuCobro: incluir })}
            style={{
              background: primary,
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 'var(--cc-sm)',
              fontWeight: 700,
              cursor: procesando ? 'wait' : 'pointer',
              opacity: procesando ? 0.75 : 1,
            }}
          >
            {procesando ? 'Exportando…' : 'Exportar'}
          </button>
        </div>
      </div>
    </div>
  )
}
