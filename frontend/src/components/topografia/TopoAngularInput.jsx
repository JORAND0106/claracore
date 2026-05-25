import { useEffect, useState } from 'react'
import { gmsToDecimal, validarGms } from '../../utils/topografia_angular'

export default function TopoAngularInput({ value, onChange, label, disabled }) {
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

  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      {label && <span style={{ display: 'block', fontSize: 'var(--cc-sm)', marginBottom: 4 }}>{label}</span>}
      <input
        type="number"
        step="0.0001"
        value={local}
        disabled={disabled}
        onChange={handleChange}
        placeholder="GG.MMSS"
        style={{
          width: '100%',
          padding: '8px 10px',
          borderRadius: 6,
          border: `1px solid ${valido ? '#cbd5e1' : '#ef4444'}`,
          background: valido ? '#fff' : '#fef2f2',
        }}
      />
      {!valido && <span style={{ color: '#dc2626', fontSize: 'var(--cc-xs)' }}>Formato GG.MMSS invalido (MM y SS &lt; 60)</span>}
    </label>
  )
}
