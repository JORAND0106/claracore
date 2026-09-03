import CcModalBrandHeader from '../components/CcModalBrandHeader'
/**
 * Shell compartido para modales de filtros de Almacén.
 */
export default function AlmacenFiltrosModal({
  theme,
  titulo = 'Filtros',
  children,
  onClose,
  onApply,
  onClear,
  zIndex = 100030,
}) {
  const t = theme || {}
  const surface = t.bgCard || '#ffffff'
  const text = t.text || '#0F172A'
  const border = t.border || '#E2E8F0'
  const overlay = t.overlay || 'rgba(15, 23, 42, 0.48)'
  const primary = t.primary || '#0077B6'
  const muted = t.textMuted || '#64748B'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        background: overlay,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cc-almacen-filtros-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          background: surface,
          border: `1px solid ${border}`,
          borderRadius: 14,
          boxShadow: t.shadow || '0 24px 64px rgba(0,0,0,0.28)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: text,
        }}
      >
        <CcModalBrandHeader theme={theme} />
        <div
          style={{
            padding: '14px 18px',
            borderBottom: `1px solid ${border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div id="cc-almacen-filtros-title" style={{ fontSize: 'var(--cc-body)', fontWeight: 800 }}>
            {titulo}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: 'transparent',
              border: 'none',
              color: muted,
              fontSize: 'var(--cc-lg)',
              cursor: 'pointer',
              lineHeight: 1,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        <div
          style={{
            padding: '14px 18px',
            overflowY: 'auto',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {children}
        </div>

        <div
          style={{
            padding: '12px 18px 16px',
            borderTop: `1px solid ${border}`,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={onClear}
            style={{
              background: 'transparent',
              color: muted,
              border: `1px solid ${border}`,
              borderRadius: 8,
              padding: '8px 14px',
              fontSize: 'var(--cc-sm)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Limpiar filtros
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                color: muted,
                border: `1px solid ${border}`,
                borderRadius: 8,
                padding: '8px 14px',
                fontSize: 'var(--cc-sm)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onApply}
              style={{
                background: primary,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '8px 16px',
                fontSize: 'var(--cc-sm)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Campo de formulario compacto para filtros. */
export function FiltroCampo({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--cc-sm)' }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  )
}

export function filtroInputStyle(theme) {
  const t = theme || {}
  return {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 6,
    border: `1px solid ${t.inputBorder || t.border || '#E2E8F0'}`,
    background: t.inputBg || '#f8fafc',
    color: t.text || '#0F172A',
    fontSize: 'var(--cc-sm)',
    boxSizing: 'border-box',
  }
}
