import { useState } from 'react'

/**
 * Campo obligatorio de pie de foto + botón «Redactar con Clara» (one-shot).
 */
export default function PptoPieFotoField({
  t,
  value,
  onChange,
  disabled,
  contratoId,
  token,
  API,
  maxLength = 280,
}) {
  const [claraBusy, setClaraBusy] = useState(false)
  const [claraError, setClaraError] = useState('')

  const texto = value ?? ''
  const len = texto.trim().length

  const mejorarConClara = async () => {
    if (!contratoId || !token) return
    const actual = String(texto || '').trim()
    if (!actual) {
      setClaraError('Escriba un pie de foto antes de pedir a Clara')
      return
    }
    setClaraBusy(true)
    setClaraError('')
    try {
      const res = await fetch(`${API}/presupuesto/${contratoId}/graficos/redaccion-clara`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ texto: actual, modo: 'pie_foto' }),
      })
      if (!res.ok) {
        const msg = await res.text().catch(() => '')
        throw new Error(msg || `Clara no respondió (${res.status})`)
      }
      const data = await res.json()
      const nuevo = String(data?.texto || '').trim()
      if (!nuevo) throw new Error('Clara no devolvió texto')
      onChange?.(nuevo.slice(0, maxLength))
    } catch (err) {
      setClaraError(err?.message || 'Clara no está disponible')
    } finally {
      setClaraBusy(false)
    }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <label style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: t.primary }}>
          Pie de foto <span style={{ color: '#B91C1C' }}>*</span>
        </label>
        <button
          type="button"
          disabled={disabled || claraBusy || !len}
          onClick={() => void mejorarConClara()}
          title="Mejora la redacción del texto ya escrito, sin inventar datos"
          style={{
            background: t.bg,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            padding: '5px 10px',
            fontWeight: 700,
            fontSize: 'var(--cc-caption)',
            color: t.text,
            cursor: disabled || claraBusy || !len ? 'not-allowed' : 'pointer',
            opacity: disabled || claraBusy || !len ? 0.55 : 1,
          }}
        >
          {claraBusy ? 'Clara…' : 'Redactar con Clara'}
        </button>
      </div>
      <textarea
        value={texto}
        disabled={disabled || claraBusy}
        maxLength={maxLength}
        rows={2}
        placeholder="Frase corta que describe el gráfico"
        onChange={(e) => onChange?.(e.target.value)}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          resize: 'vertical',
          minHeight: 52,
          borderRadius: 8,
          border: `1.5px solid ${len ? t.border : '#FCA5A5'}`,
          background: t.bg,
          color: t.text,
          padding: '8px 10px',
          fontSize: 'var(--cc-sm)',
          lineHeight: 1.4,
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 'var(--cc-caption)', color: len ? t.textMuted : '#B91C1C' }}>
          {len ? 'Obligatorio' : 'Requerido para guardar'}
        </span>
        <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted }}>
          {texto.length}/{maxLength}
        </span>
      </div>
      {claraError && (
        <div style={{ color: '#B91C1C', fontSize: 'var(--cc-caption)', marginTop: 4, fontWeight: 600 }}>
          {claraError}
        </div>
      )}
    </div>
  )
}
