import { Component } from 'react'

/**
 * Evita que un fallo en el editor de Bitácora deje en blanco
 * el módulo Seguimiento (calendario / listado).
 */
export default class BitacoraEditorErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    try {
      console.error('[Bitácora] Editor crash:', error, info?.componentStack)
    } catch { /* ignore */ }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      const t = this.props.t || {}
      const msg = this.state.error?.message || 'Error inesperado'
      return (
        <div
          role="alert"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100050,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            background: t.overlay || 'rgba(15, 23, 42, 0.48)',
          }}
        >
          <div
            style={{
              maxWidth: 420,
              width: '100%',
              padding: 20,
              borderRadius: 12,
              background: t.bgCard || '#fff',
              border: `1px solid ${t.border || '#e2e8f0'}`,
              color: t.text || '#0f172a',
              fontSize: 'var(--cc-sm, 13px)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 8, color: t.danger || '#b91c1c' }}>
              No se pudo abrir el editor de Bitácora
            </div>
            <p style={{ margin: '0 0 14px', color: t.textMuted || '#64748b', lineHeight: 1.45 }}>
              {msg}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => this.setState({ error: null })}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid ${t.border || '#e2e8f0'}`,
                  background: t.inputBg || '#f8fafc',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Reintentar
              </button>
              {typeof this.props.onClose === 'function' ? (
                <button
                  type="button"
                  onClick={() => {
                    this.setState({ error: null })
                    this.props.onClose()
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: 'none',
                    background: t.primary || '#0077B6',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Cerrar
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
