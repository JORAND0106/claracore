import { useState } from 'react'
import { verifyDevPanelKey, unlockDevPanel, devPanelConfigured, devPanelConfigHint } from './devPanelConfig'

const S = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 100010,
    background: 'rgba(0,0,0,0.72)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  box: {
    width: '100%',
    maxWidth: 360,
    background: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: 8,
    padding: '20px 22px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    color: '#c9d1d9',
    boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 6,
    padding: '10px 12px',
    color: '#e6edf3',
    fontSize: 13,
    outline: 'none',
    marginTop: 12,
    marginBottom: 12,
  },
  btn: {
    flex: 1,
    border: '1px solid #30363d',
    borderRadius: 6,
    padding: '9px 12px',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
}

export default function DevPanelGate({ onUnlock, onClose }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function submit(e) {
    e?.preventDefault()
    setError('')
    if (!devPanelConfigured()) {
      setError(`Build sin config: ${devPanelConfigHint().join(', ')}`)
      return
    }
    setLoading(true)
    window.setTimeout(() => {
      if (verifyDevPanelKey(key)) {
        unlockDevPanel()
        onUnlock()
      } else {
        setError('Clave incorrecta')
      }
      setLoading(false)
    }, 120)
  }

  return (
    <div style={S.overlay} onClick={onClose} role="presentation">
      <form
        style={S.box}
        onClick={e => e.stopPropagation()}
        onSubmit={submit}
        aria-label="Acceso panel diagnóstico"
      >
        <div style={{ fontSize: 11, color: '#8b949e', letterSpacing: '0.08em' }}>DIAGNOSTIC ACCESS</div>
        <div style={{ fontSize: 14, color: '#58a6ff', marginTop: 6, fontWeight: 600 }}>Clave de desarrollador</div>
        <input
          type="password"
          autoComplete="off"
          autoFocus
          placeholder="••••••••••••"
          value={key}
          onChange={e => setKey(e.target.value)}
          style={S.input}
        />
        {error && (
          <div style={{ fontSize: 11, color: '#f85149', marginBottom: 10, lineHeight: 1.45 }}>{error}</div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onClose} style={{ ...S.btn, background: 'transparent', color: '#8b949e' }}>
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading || !key}
            style={{ ...S.btn, background: '#238636', borderColor: '#238636', color: '#fff', opacity: loading ? 0.6 : 1 }}
          >
            {loading ? '…' : 'Entrar'}
          </button>
        </div>
      </form>
    </div>
  )
}
