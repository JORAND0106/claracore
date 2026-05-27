/**
 * Capas de validación (nivel + estado) dentro del modal de filtros SicoeObra.
 */
export default function SicoeFiltroCapasBlock({
  t,
  capas,
  capasOp,
  onCapasChange,
  onCapasOpChange,
  capaTemp,
  onCapaTempChange,
  nivelesDisponibles,
  encabezadoPorNivel,
  estiloChipCapa,
  onPedirCombinacion,
  avisoCapasY,
  nivelMaximo = null,
}) {
  const inp = {
    background: t.inputBg,
    border: `1px solid ${t.border}`,
    borderRadius: 6,
    padding: '6px 10px',
    color: t.text,
    fontSize: 'var(--cc-sm)',
    width: '100%',
    boxSizing: 'border-box',
  }

  const agregarCapa = () => {
    if (!capaTemp.nivel || !capaTemp.estado) return
    const nueva = { nivel: capaTemp.nivel, estado: capaTemp.estado }
    if (capas.length >= 1) {
      onPedirCombinacion?.(nueva)
    } else {
      onCapasChange([...capas, nueva])
      onCapaTempChange({ nivel: '', estado: '' })
    }
  }

  const quitarCapa = (i) => {
    const n = capas.filter((_, j) => j !== i)
    onCapasChange(n)
    if (n.length <= 1) onCapasOpChange('and')
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: 10 }}>
        <div style={{ flex: '1 1 140px', minWidth: 120 }}>
          <label style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: t.text, display: 'block', marginBottom: 6 }}>
            Nivel validación
          </label>
          <select
            value={capaTemp.nivel}
            onChange={(e) => onCapaTempChange({ ...capaTemp, nivel: e.target.value === '' ? '' : parseInt(e.target.value, 10) })}
            style={inp}
          >
            <option value="">—</option>
            {nivelesDisponibles.map((n) => (
              <option key={n} value={n}>{encabezadoPorNivel[n] || `Nivel ${n}`}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: '1 1 140px', minWidth: 120 }}>
          <label style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color: t.text, display: 'block', marginBottom: 6 }}>
            Estado
          </label>
          <select
            value={capaTemp.estado}
            onChange={(e) => onCapaTempChange({ ...capaTemp, estado: e.target.value })}
            style={inp}
          >
            <option value="">—</option>
            {['Aprobado', 'Pendiente', 'Rechazado', 'No Revisado'].map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={!capaTemp.nivel || !capaTemp.estado}
          onClick={agregarCapa}
          style={{
            background: (!capaTemp.nivel || !capaTemp.estado) ? t.border : t.primary,
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '8px 14px',
            fontWeight: 700,
            cursor: (!capaTemp.nivel || !capaTemp.estado) ? 'not-allowed' : 'pointer',
          }}
        >
          ＋ Añadir capa
        </button>
      </div>

      {capas.length >= 2 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, fontWeight: 700 }}>Combinar capas:</span>
          <button
            type="button"
            onClick={() => onCapasOpChange('and')}
            style={{
              fontSize: 'var(--cc-caption)', fontWeight: 800, padding: '2px 8px', borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${capasOp === 'and' ? t.primary : t.border}`,
              background: capasOp === 'and' ? `${t.primary}18` : t.bg,
              color: capasOp === 'and' ? t.primary : t.textMuted,
            }}
          >
            Y (todas)
          </button>
          <button
            type="button"
            onClick={() => onCapasOpChange('or')}
            style={{
              fontSize: 'var(--cc-caption)', fontWeight: 800, padding: '2px 8px', borderRadius: 6, cursor: 'pointer',
              border: `1px solid ${capasOp === 'or' ? t.primary : t.border}`,
              background: capasOp === 'or' ? `${t.primary}18` : t.bg,
              color: capasOp === 'or' ? t.primary : t.textMuted,
            }}
          >
            O (cualquiera)
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {capas.map((c, i) => {
          const st = estiloChipCapa?.(c.estado) || {}
          return (
            <span
              key={`${i}-${c.nivel}-${c.estado}`}
              style={{ ...st, borderRadius: 6, padding: '4px 8px', fontSize: 'var(--cc-caption)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              {(c.nivel != null ? (encabezadoPorNivel[c.nivel] || `N${c.nivel}`) : c.cargo_nombre)}: {c.estado}
              <button
                type="button"
                onClick={() => quitarCapa(i)}
                style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 700, padding: 0 }}
              >
                ×
              </button>
            </span>
          )
        })}
      </div>

      {avisoCapasY ? (
        <div style={{
          fontSize: 'var(--cc-caption)', color: '#92400e', marginTop: 8, lineHeight: 1.45,
          padding: '8px 10px', borderRadius: 8, background: 'rgba(234,179,8,0.16)', border: '1px solid rgba(234,179,8,0.4)',
        }}>
          {avisoCapasY}
        </div>
      ) : null}

      {nivelMaximo != null && capas.some((c) => Number(c.nivel) === Number(nivelMaximo) && c.estado === 'Aprobado') ? (
        <div style={{
          fontSize: 'var(--cc-caption)', color: t.textMuted, marginTop: 8, lineHeight: 1.45,
          padding: '8px 10px', borderRadius: 8, background: `${t.primary}10`, border: `1px solid ${t.primary}33`,
        }}>
          Coincide con el KPI del dashboard (<strong style={{ color: t.primary }}>SICOE nivel máx. aprobado</strong>
          {encabezadoPorNivel[nivelMaximo] ? `: ${encabezadoPorNivel[nivelMaximo]}` : ''}).
        </div>
      ) : null}
    </div>
  )
}
