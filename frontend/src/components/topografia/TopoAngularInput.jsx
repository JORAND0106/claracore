import { useEffect, useState } from 'react'
import { gmsToDecimal, validarGms } from '../../utils/topografia_angular'
import { useTopoTheme } from './topografiaShared'

export default function TopoAngularInput({ value, onChange, label, disabled }) {
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
          ...ui.inputStyle,
          border: `1px solid ${valido ? border : '#ef4444'}`,
          background: valido ? ui.inputStyle.background : 'rgba(220,38,38,0.10)',
          color: ui.text,
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
