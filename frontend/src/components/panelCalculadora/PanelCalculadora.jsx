import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import CcModalBrandHeader from '../CcModalBrandHeader'
import { Calculator, X, Delete } from 'lucide-react'
import {
  PANEL_CALC_OPS,
  panelCalcCategoryId,
  panelCalcEvalChain,
  panelCalcFmtNumber,
} from './panelCalculadoraLogic'

const PanelCalculadoraCtx = createContext(null)

export function usePanelCalculadora() {
  return useContext(PanelCalculadoraCtx)
}

export function PanelCalculadoraProvider({ children, t }) {
  const [active, setActive] = useState(false)
  const [category, setCategory] = useState(null)
  const [categoryLabel, setCategoryLabel] = useState('')
  const [kind, setKind] = useState(null) // 'cant' | 'costo' | 'valor'
  const [tokens, setTokens] = useState([])
  const [awaiting, setAwaiting] = useState('value') // 'value' | 'op'
  const [error, setError] = useState(null)

  const resetExpr = useCallback(() => {
    setCategory(null)
    setCategoryLabel('')
    setKind(null)
    setTokens([])
    setAwaiting('value')
    setError(null)
  }, [])

  const close = useCallback(() => {
    setActive(false)
    resetExpr()
  }, [resetExpr])

  const toggle = useCallback(() => {
    setActive((v) => {
      if (v) {
        resetExpr()
        return false
      }
      resetExpr()
      return true
    })
  }, [resetExpr])

  const pickValue = useCallback(
    ({ categoryId, categoryLabel: catLbl, kind: k, value, label }) => {
      if (!active) return false
      const num = Number(value)
      if (!Number.isFinite(num)) return false

      if (category && category !== categoryId) return false
      if (awaiting !== 'value') return false

      setError(null)
      if (!category) {
        setCategory(categoryId)
        setCategoryLabel(catLbl || categoryId)
        setKind(k || 'valor')
      }

      const token = {
        type: 'num',
        value: num,
        label: label || panelCalcFmtNumber(num, { money: (k || kind) === 'costo' }),
      }
      setTokens((prev) => {
        const next = [...prev, token]
        return next
      })
      setAwaiting('op')
      return true
    },
    [active, category, awaiting, kind],
  )

  const pickOp = useCallback(
    (opId) => {
      if (!active || awaiting !== 'op') return false
      if (!PANEL_CALC_OPS.some((o) => o.id === opId)) return false
      setError(null)
      setTokens((prev) => {
        if (!prev.length) return prev
        const last = prev[prev.length - 1]
        if (last?.type === 'op') {
          return [...prev.slice(0, -1), { type: 'op', op: opId }]
        }
        return [...prev, { type: 'op', op: opId }]
      })
      setAwaiting('value')
      return true
    },
    [active, awaiting],
  )

  const result = useMemo(() => {
    const complete = []
    for (const tok of tokens) {
      if (tok.type === 'op' && complete.length && complete[complete.length - 1]?.type === 'op') {
        complete[complete.length - 1] = tok
        continue
      }
      complete.push(tok)
    }
    // Si termina en op, evaluar solo hasta el último número
    const forEval = [...complete]
    if (forEval.length && forEval[forEval.length - 1]?.type === 'op') forEval.pop()
    if (forEval.filter((t) => t.type === 'num').length < 1) return null
    const v = panelCalcEvalChain(forEval)
    if (v == null && forEval.filter((t) => t.type === 'num').length >= 2) {
      return { error: true }
    }
    return v
  }, [tokens])

  const api = useMemo(
    () => ({
      active,
      category,
      categoryLabel,
      kind,
      tokens,
      awaiting,
      result: result && typeof result === 'object' && result.error ? null : result,
      resultError: !!(result && typeof result === 'object' && result.error),
      error,
      toggle,
      close,
      clear: resetExpr,
      pickValue,
      pickOp,
      isCategoryAllowed: (categoryId) => !category || category === categoryId,
      makeCategoryId: panelCalcCategoryId,
      t,
    }),
    [
      active,
      category,
      categoryLabel,
      kind,
      tokens,
      awaiting,
      result,
      error,
      toggle,
      close,
      resetExpr,
      pickValue,
      pickOp,
      t,
    ],
  )

  return (
    <PanelCalculadoraCtx.Provider value={api}>
      {children}
    </PanelCalculadoraCtx.Provider>
  )
}

export function PanelCalculadoraToggle({ style = {}, className = '' }) {
  const calc = usePanelCalculadora()
  if (!calc) return null
  const t = calc.t || {}
  const on = calc.active
  return (
    <button
      type="button"
      data-panel-calc-action
      className={className}
      title="Selecciona campos para sumar, restar, multiplicar o dividir"
      aria-label="Calculadora de campos"
      aria-pressed={on}
      onClick={(e) => {
        e.stopPropagation()
        calc.toggle()
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 34,
        height: 34,
        borderRadius: 8,
        border: on ? 'none' : `1px solid ${t.border || 'rgba(255,255,255,0.25)'}`,
        background: on ? (t.primary || '#0077B6') : 'transparent',
        color: on ? '#fff' : (t.textMuted || '#94A3B8'),
        cursor: 'pointer',
        transition: 'background 180ms ease, color 180ms ease, transform 180ms ease, box-shadow 180ms ease',
        boxShadow: on ? `0 0 0 3px color-mix(in srgb, ${t.primary || '#0077B6'} 28%, transparent)` : 'none',
        flexShrink: 0,
        ...style,
      }}
    >
      <Calculator size={16} strokeWidth={2.25} />
    </button>
  )
}

export function PanelCalcSelectable({
  categoryId,
  categoryLabel,
  kind = 'valor',
  value,
  label,
  children,
  as: Comp = 'button',
  style = {},
  className = '',
  title,
}) {
  const calc = usePanelCalculadora()
  const num = Number(value)
  const finite = Number.isFinite(num)
  if (!calc?.active) {
    return children
  }
  const allowed = calc.isCategoryAllowed(categoryId)
  const canPick = allowed && finite && calc.awaiting === 'value'
  const dimmed = !allowed

  return (
    <Comp
      type={Comp === 'button' ? 'button' : undefined}
      className={`cc-panel-calc-selectable${canPick ? ' is-pickable' : ''}${dimmed ? ' is-dimmed' : ''}${className ? ` ${className}` : ''}`}
      title={
        dimmed
          ? 'No disponible: categoría distinta a la operación en curso'
          : title || (canPick ? 'Incluir en la calculadora' : undefined)
      }
      disabled={Comp === 'button' ? !canPick : undefined}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        if (!canPick) return
        calc.pickValue({ categoryId, categoryLabel, kind, value: num, label })
      }}
      style={{
        ...style,
        opacity: dimmed ? 0.32 : 1,
        filter: dimmed ? 'grayscale(0.35)' : undefined,
        pointerEvents: dimmed ? 'none' : undefined,
        cursor: canPick ? 'pointer' : dimmed ? 'not-allowed' : 'default',
        transition: 'opacity 160ms ease, transform 160ms ease, background 160ms ease, box-shadow 160ms ease',
      }}
    >
      {children}
    </Comp>
  )
}

export function PanelCalculadoraFloat({ anchor = 'panel' }) {
  const calc = usePanelCalculadora()
  if (!calc?.active) return null
  const t = calc.t || {}
  const money = calc.kind === 'costo'
  const ops = PANEL_CALC_OPS
  const resultTxt =
    calc.resultError
      ? 'Error (división por cero)'
      : calc.result == null
        ? '—'
        : panelCalcFmtNumber(calc.result, { money })

  return (
    <div
      className="cc-panel-calc-float"
      role="dialog"
      aria-label="Calculadora"
      style={{
        position: anchor === 'fixed' ? 'fixed' : 'sticky',
        ...(anchor === 'fixed'
          ? { right: 18, bottom: 18, zIndex: 12000 }
          : { top: 8, zIndex: 30, margin: '0 12px 12px auto', float: 'right', clear: 'both' }),
        width: 'min(360px, calc(100% - 24px))',
        background: t.bgCard || '#0F2038',
        border: `1px solid ${t.border || '#1E3A5F'}`,
        borderRadius: 14,
        boxShadow: '0 18px 48px rgba(0,0,0,0.28)',
        overflow: 'hidden',
        animation: 'ccPanelCalcIn 200ms ease',
      }}
      onClick={(e) => e.stopPropagation()}
    >      <CcModalBrandHeader theme={t} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          background: `color-mix(in srgb, ${t.primary || '#0077B6'} 16%, ${t.inputBg || t.bg || '#0A1628'})`,
          borderBottom: `1px solid ${t.border || '#1E3A5F'}`,
        }}
      >
        <Calculator size={15} color={t.primary || '#00B4C6'} strokeWidth={2.4} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: t.text || '#E0F2FE' }}>
            {calc.categoryLabel || 'Elige un valor'}
          </div>
          <div style={{ fontSize: 11, color: t.textMuted || '#7FB3D3', marginTop: 1 }}>
            {calc.awaiting === 'value'
              ? (calc.tokens.length ? 'Selecciona el siguiente valor' : 'Haz clic en un valor de la tabla')
              : 'Elige una operación'}
          </div>
        </div>
        <button
          type="button"
          title="Limpiar"
          onClick={calc.clear}
          style={iconBtn(t)}
        >
          <Delete size={15} />
        </button>
        <button
          type="button"
          title="Cerrar"
          onClick={calc.close}
          style={iconBtn(t)}
        >
          <X size={15} />
        </button>
      </div>

      <div style={{ padding: '12px 12px 8px', minHeight: 64 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            alignItems: 'center',
            minHeight: 28,
          }}
        >
          {calc.tokens.length === 0 ? (
            <span style={{ fontSize: 12, color: t.textMuted || '#7FB3D3', fontStyle: 'italic' }}>
              Expresión vacía
            </span>
          ) : (
            calc.tokens.map((tok, i) => {
              if (tok.type === 'op') {
                const meta = ops.find((o) => o.id === tok.op)
                return (
                  <span
                    key={`op-${i}`}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: t.primary || '#0077B6',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: 14,
                    }}
                  >
                    {meta?.symbol || tok.op}
                  </span>
                )
              }
              return (
                <span
                  key={`n-${i}`}
                  title={tok.label}
                  style={{
                    padding: '5px 9px',
                    borderRadius: 8,
                    background: `color-mix(in srgb, ${t.primary || '#0077B6'} 12%, ${t.inputBg || t.bg || '#0A1628'})`,
                    border: `1px solid ${t.border || '#1E3A5F'}`,
                    color: t.text || '#E0F2FE',
                    fontSize: 12,
                    fontWeight: 700,
                    maxWidth: 140,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    animation: 'ccPanelCalcChip 180ms ease',
                  }}
                >
                  {tok.label}
                </span>
              )
            })
          )}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 12,
            opacity: calc.awaiting === 'op' ? 1 : 0.45,
            pointerEvents: calc.awaiting === 'op' ? 'auto' : 'none',
            transition: 'opacity 160ms ease',
          }}
        >
          {ops.map((op) => (
            <button
              key={op.id}
              type="button"
              title={op.label}
              onClick={() => calc.pickOp(op.id)}
              style={{
                flex: 1,
                height: 36,
                borderRadius: 10,
                border: `1px solid ${t.border || '#1E3A5F'}`,
                background: t.inputBg || t.bg || '#0A1628',
                color: t.text || '#E0F2FE',
                fontWeight: 800,
                fontSize: 16,
                cursor: 'pointer',
                transition: 'transform 120ms ease, background 120ms ease',
              }}
            >
              {op.symbol}
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          padding: '12px 14px 14px',
          borderTop: `1px solid ${t.border || '#1E3A5F'}`,
          background: `color-mix(in srgb, ${t.primary || '#0077B6'} 10%, ${t.bgCard || '#0F2038'})`,
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.textMuted || '#7FB3D3' }}>
          Resultado
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: 22,
            fontWeight: 900,
            color: calc.resultError ? '#EF4444' : (t.text || '#E0F2FE'),
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
            transition: 'color 160ms ease',
          }}
        >
          {resultTxt}
        </div>
      </div>
    </div>
  )
}

function iconBtn(t) {
  return {
    background: 'transparent',
    border: `1px solid ${t.border || 'rgba(148,163,184,0.35)'}`,
    borderRadius: 8,
    width: 30,
    height: 30,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: t.textMuted || '#94A3B8',
    cursor: 'pointer',
  }
}

export { panelCalcCategoryId, panelCalcFmtNumber }
