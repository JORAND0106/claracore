import { Component } from 'react'

/**
 * Aísla fallos de HojaRegistro para que no tumben la tabla Ítems/registros.
 * Si el detalle revienta (p. ej. acceso a campo financiero omitido por rol),
 * la fila de registros sigue visible y se puede reintentar el detalle.
 */
export class SicoeHojaRegistroErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    try {
      console.error('[SicoeObra] HojaRegistro crash en Ítems/registros:', error, info?.componentStack)
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
      return (
        <div
          role="alert"
          style={{
            padding: '14px 16px',
            background: '#FEF2F2',
            color: '#991B1B',
            fontSize: 13,
            borderTop: `2px solid ${t.primary || '#DC2626'}`,
          }}
        >
          No se pudo mostrar el detalle de este registro.
          {' '}
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            style={{
              marginLeft: 8,
              background: 'transparent',
              border: '1px solid #FCA5A5',
              borderRadius: 6,
              color: '#991B1B',
              cursor: 'pointer',
              fontWeight: 700,
              padding: '4px 10px',
            }}
          >
            Reintentar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default SicoeHojaRegistroErrorBoundary
