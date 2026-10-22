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
  permitirCustom = true,
  selectTestId,
  unidades,
  onConfirmar,
  confirmando = false,
}) {
  const sel = selectStyle || {}
  const inp = inputStyle || {}
  const btnP = btnPrimary || { padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer' }
  const btnG = btnSecondary || { ...btnP, background: 'transparent', border: '1px solid #ccc' }
  const lista = Array.isArray(unidades) && unidades.length ? unidades : UNIDADES_LISTADO_PRECIOS

  const confirmar = () => {
    if (confirmando) return
    const texto = String(uCustom || '')
    if (onConfirmar) {
      onConfirmar(texto)
      return
    }
    if (!texto.trim()) return
    onChange(texto.trim().toUpperCase())
    setModoCustom(false)
  }

  return (
    <div>
      {!modoCustom ? (
        <select
          data-testid={selectTestId}
          style={{ ...sel, width: '100%' }}
          value={lista.includes(value) ? value : (value ? '__prev__' : '')}
          onChange={(e) => {
            if (e.target.value === '__custom__') {
              setModoCustom(true)
              setUCustom('')
            } else if (e.target.value === '__prev__') {
              /* mantiene valor */
            } else {
              onChange(e.target.value)
            }
          }}
        >
          <option value="">-- Selecciona --</option>
          {lista.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
          {value && !lista.includes(value) && (
            <option value="__prev__">{value}</option>
          )}
          {permitirCustom && <option value="__custom__">Otra unidad</option>}
        </select>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input
            data-testid="otra-unidad-texto"
            style={{ ...inp, padding: '5px 8px', fontSize: 'var(--cc-xs)', flex: '1 1 80px', minWidth: 0 }}
            placeholder="Nueva unidad"
            value={uCustom}
            disabled={confirmando}
            onChange={(e) => setUCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                confirmar()
              }
            }}
          />
          <button
            type="button"
            data-testid="confirmar-otra-unidad"
            style={btnP}
            disabled={confirmando}
            onClick={confirmar}
          >
            {confirmando ? 'Guardando…' : 'Confirmar'}
          </button>
          <button type="button" style={btnG} disabled={confirmando} onClick={() => setModoCustom(false)}>✕</button>
        </div>
      )}
    </div>
  )
}
