import { useEffect, useState } from 'react'
import { gmsToDecimal, validarGms } from '../../utils/topografia_angular'
import { useTopoTheme } from './topografiaShared'

export default function TopoAngularInput({ value, onChange, label, disabled, inputStyle }) {
  const ui = useTopoTheme()
  const [local, setLocal] = useState(value ?? '')
  const [valido, setValido] = useState(true)

  useEffect(() => {
    setLocal(value ?? '')
  }, [value])

  const handleChange = (e) => {
    const v = e.target.value
    setLocal(v)
    if (v === '' || v === '-') {
      setValido(true)
      onChange?.(null, v)
      return
    }
    const num = Number(v)
    const ok = Number.isFinite(num) && validarGms(num)
    setValido(ok)
    onChange?.(ok ? gmsToDecimal(num) : null, v, ok)
  }

  const border = ui.t?.border || '#e2e8f0'
  const baseInput = inputStyle || ui.inputStyle

  return (
    <label style={{ display: 'block', marginBottom: label ? 8 : 0 }}>
      {label && (
        <span style={{ display: 'block', fontSize: 'var(--cc-sm)', marginBottom: 4, color: ui.textMuted }}>
          {label}
        </span>
      )}
      <input
        type="number"
        step="0.0001"
        value={local}
        disabled={disabled}
        onChange={handleChange}
        placeholder="GG.MMSS"
        style={{
          ...baseInput,
          border: inputStyle ? 'none' : `1px solid ${valido ? border : '#ef4444'}`,
          outline: inputStyle ? 'none' : undefined,
          background: valido
            ? (inputStyle ? 'transparent' : baseInput.background)
            : 'rgba(220,38,38,0.10)',
          color: ui.text,
          width: '100%',
          boxSizing: 'border-box',
        }}
      />
      {!valido && (
        <span style={{ color: '#dc2626', fontSize: 'var(--cc-xs)' }}>
          Formato GG.MMSS invalido (MM y SS &lt; 60)
        </span>
      )}
    </label>
  )
}
