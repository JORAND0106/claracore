import { useEffect, useState } from 'react'

/**
 * Ventana de redacción asistida con Clara.
 * Acciones finales: enviar texto al cuerpo del acta, o generar compromiso.
 */
export default function IdeaClaraModal({
  t,
  api,
  textoInicial = '',
  onClose,
  onEnviarAlActa,
  onGenerarCompromiso,
}) {
  const [texto, setTexto] = useState(textoInicial || '')
  const [instruccion, setInstruccion] = useState('')
  const [historial, setHistorial] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setTexto(textoInicial || '')
  }, [textoInicial])

  const pedirAjuste = async () => {
    if (!instruccion.trim()) return
    setBusy(true)
    setError('')
    try {
      const r = await api.redaccionClara({
        texto,
        instruccion: instruccion.trim(),
        historial,
      })
      const nuevo = r.texto || texto
      setHistorial((h) => [
        ...h,
        { role: 'user', content: instruccion.trim() },
        { role: 'assistant', content: nuevo },
      ])
      setTexto(nuevo)
      setInstruccion('')
    } catch (e) {
      setError(e.message || 'Clara no respondió')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 12000,
        background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          width: 'min(720px, 100%)',
          maxHeight: '90vh',
          overflow: 'auto',
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          boxShadow: t.shadow || '0 12px 40px rgba(0,0,0,0.2)',
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 'var(--cc-title)', fontWeight: 700, color: t.text }}>Redacción con Clara</div>
            <div style={{ fontSize: 'var(--cc-sm)', color: t.textMuted }}>
              Ajuste la idea de forma iterativa. Al finalizar, envíela al acta o genere un compromiso.
            </div>
          </div>
          <button type="button" onClick={onClose} style={btnGhost(t)}>✕</button>
        </div>

        <label style={labelStyle(t)}>Texto de la idea</label>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={8}
          style={inputStyle(t)}
        />

        <label style={{ ...labelStyle(t), marginTop: 12 }}>Pedir ajuste a Clara</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={instruccion}
            onChange={(e) => setInstruccion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pedirAjuste() } }}
            placeholder="Ej.: hazlo más formal y concreto"
            style={{ ...inputStyle(t), flex: 1 }}
          />
          <button type="button" disabled={busy || !instruccion.trim()} onClick={pedirAjuste} style={btnPrimary(t)}>
            {busy ? '…' : 'Ajustar'}
          </button>
        </div>
        {error && <div style={{ color: 'var(--cc-color-danger, #b91c1c)', fontSize: 'var(--cc-sm)', marginTop: 8 }}>{error}</div>}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={btnGhost(t)}>Cancelar</button>
          <button
            type="button"
            onClick={() => onEnviarAlActa?.(texto)}
            disabled={!texto.trim()}
            style={btnPrimary(t)}
          >
            Enviar al acta
          </button>
          <button
            type="button"
            onClick={() => onGenerarCompromiso?.(texto)}
            disabled={!texto.trim()}
            style={{ ...btnPrimary(t), background: 'var(--cc-color-positive, #0f766e)' }}
          >
            Generar compromiso
          </button>
        </div>
      </div>
    </div>
  )
}

function labelStyle(t) {
  return { display: 'block', fontSize: 'var(--cc-label)', color: t.textMuted, fontWeight: 600, marginBottom: 4 }
}
function inputStyle(t) {
  return {
    width: '100%', boxSizing: 'border-box',
    fontSize: 'var(--cc-input)',
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${t.border}`,
    background: t.bg || t.bgCard,
    color: t.text,
    resize: 'vertical',
  }
}
function btnPrimary(t) {
  return {
    border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
    background: t.primary, color: '#fff', fontWeight: 700, fontSize: 'var(--cc-sm)',
  }
}
function btnGhost(t) {
  return {
    border: `1px solid ${t.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
    background: 'transparent', color: t.text, fontSize: 'var(--cc-sm)',
  }
}
