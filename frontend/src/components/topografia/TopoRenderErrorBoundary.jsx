/**
 * Error boundary para flujos de Topografía (p. ej. Editar poligonal).
 * Evita pantalla en blanco y muestra el error sin depender de F12.
 */
import { Component } from 'react'

export default class TopoRenderErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    try {
      console.error('[TopoRenderErrorBoundary]', error, info?.componentStack)
    } catch {
      /* ignore */
    }
    if (typeof this.props.onError === 'function') {
      try {
        this.props.onError(error, info)
      } catch {
        /* ignore */
      }
    }
  }

  reset = () => {
    this.setState({ error: null })
    if (typeof this.props.onReset === 'function') {
      this.props.onReset()
    }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const titulo = this.props.titulo || 'Error al mostrar este panel'
    const mensaje = error?.message || String(error)
    const theme = this.props.theme || {}
    const bg = theme.bgCard || '#fff'
    const border = theme.border || '#fecaca'
    const text = theme.text || '#0f172a'
    const muted = theme.textMuted || '#64748b'

    return (
      <div
        role="alert"
        data-topo-render-error="1"
        style={{
          margin: '12px 0',
          padding: '14px 16px',
          borderRadius: 10,
          border: `1px solid ${border}`,
          background: 'rgba(220,38,38,0.08)',
          color: text,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 'var(--cc-base)', marginBottom: 6 }}>{titulo}</div>
        <p style={{ margin: '0 0 8px', fontSize: 'var(--cc-sm)', lineHeight: 1.45 }}>
          La interfaz no pudo renderizarse. Puede cerrar e intentar de nuevo; si el problema continúa, copie el detalle siguiente y repórtelo a soporte.
        </p>
        <pre
          style={{
            margin: '0 0 12px',
            padding: 10,
            borderRadius: 8,
            background: bg,
            border: `1px solid ${border}`,
            color: '#991b1b',
            fontSize: 'var(--cc-xs)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 160,
            overflow: 'auto',
          }}
        >
          {mensaje}
        </pre>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={this.reset}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: '#dc2626',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 'var(--cc-sm)',
            }}
          >
            Reintentar
          </button>
          {typeof this.props.onClose === 'function' && (
            <button
              type="button"
              onClick={this.props.onClose}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: `1px solid ${theme.border || '#cbd5e1'}`,
                background: bg,
                color: muted,
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 'var(--cc-sm)',
              }}
            >
              Cerrar
            </button>
          )}
        </div>
      </div>
    )
  }
}
