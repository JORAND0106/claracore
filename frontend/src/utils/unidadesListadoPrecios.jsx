/** Unidades del listado de precios (AdminPanel — SeccionListadoPrecios). Fuente única para catálogo de insumos. */
export const UNIDADES_LISTADO_PRECIOS = [
  'CM', 'GL', 'HORA', 'KG', 'KM-CARRIL', 'LT', 'M', 'M2', 'M3', 'M3-KM', 'ML', 'TON', 'TRAMO', 'UN', 'UN/ME', 'UND',
]

export function UnidadSelector({
  value,
  onChange,
  selectStyle,
  inputStyle,
  btnPrimary,
  btnSecondary,
  modoCustom,
  setModoCustom,
  uCustom,
  setUCustom,
}) {
  const sel = selectStyle || {}
  const inp = inputStyle || {}
  const btnP = btnPrimary || { padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer' }
  const btnG = btnSecondary || { ...btnP, background: 'transparent', border: '1px solid #ccc' }

  return (
    <div>
      {!modoCustom ? (
        <select
          style={{ ...sel, width: '100%' }}
          value={UNIDADES_LISTADO_PRECIOS.includes(value) ? value : (value ? '__prev__' : '')}
          onChange={(e) => {
            if (e.target.value === '__custom__') {
              setModoCustom(true)
              setUCustom('')
              onChange('')
            } else if (e.target.value === '__prev__') {
              /* mantiene valor */
            } else {
              onChange(e.target.value)
            }
          }}
        >
          <option value="">-- Selecciona --</option>
          {UNIDADES_LISTADO_PRECIOS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
          {value && !UNIDADES_LISTADO_PRECIOS.includes(value) && (
            <option value="__prev__">{value}</option>
          )}
          <option value="__custom__">+ Agregar unidad...</option>
        </select>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            style={{ ...inp, padding: '5px 8px', fontSize: 'var(--cc-xs)' }}
            placeholder="Nueva unidad"
            value={uCustom}
            onChange={(e) => setUCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && uCustom.trim()) {
                onChange(uCustom.trim().toUpperCase())
                setModoCustom(false)
              }
            }}
          />
          <button
            type="button"
            style={btnP}
            onClick={() => {
              if (uCustom.trim()) {
                onChange(uCustom.trim().toUpperCase())
                setModoCustom(false)
              }
            }}
          >
            +
          </button>
          <button type="button" style={btnG} onClick={() => setModoCustom(false)}>✕</button>
        </div>
      )}
    </div>
  )
}
