import { useMemo, useState, useEffect } from 'react'
import CcModalBrandHeader from '../../components/CcModalBrandHeader'
import { tFrom, isDarkMode, buildContratoUiTheme } from '../../theme/adminPanelTheme'
import {
  EMPTY_IMPUESTO,
  IMPUESTO_CAMPOS_UI,
  computeValorDespuesAiuIva,
  fmtPctDesdeDecimal,
  fmtSumatoriaAiu,
  inferirTipoImpuesto,
  labelTipoImpuesto,
  tooltipTotalPorcentaje,
} from '../../admin/catalogoInsumosTributos'
import { fmtMoneda } from './subcontratistasDocsHelpers'

/**
 * Modal AIU/IVA para VU Costo M.O. (mismo patrón que Catálogo de Insumos).
 */
export default function PreciosAiuIvaModal({
  open,
  theme,
  title = 'AIU / IVA — VU Costo M.O.',
  subtitle = '',
  vuBase = '',
  showVuBase = true,
  impuesto,
  onClose,
  onSave,
}) {
  const tTok = tFrom(theme)
  const ui = buildContratoUiTheme(theme, tTok)
  const [draft, setDraft] = useState({ ...EMPTY_IMPUESTO })

  useEffect(() => {
    if (!open) return
    setDraft({ ...(impuesto || EMPTY_IMPUESTO) })
  }, [open, impuesto])

  const tipo = useMemo(
    () => inferirTipoImpuesto(draft, { valoresEnDecimal: true }),
    [draft],
  )
  const despues = useMemo(
    () => computeValorDespuesAiuIva(vuBase, draft, { valoresEnDecimal: true }),
    [vuBase, draft],
  )

  if (!open) return null

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${tTok.border}`,
    background: tTok.inputBg,
    color: tTok.text,
    fontSize: 'var(--cc-sm)',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100120,
        background: isDarkMode(theme) ? 'rgba(8, 19, 24, 0.78)' : 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 96vw)',
          background: tTok.bgCard,
          border: `1px solid ${tTok.border}`,
          borderRadius: 12,
          padding: 16,
          color: tTok.text,
          boxShadow: tTok.shadow || '0 16px 40px rgba(0,0,0,0.25)',
          fontSize: 'var(--cc-sm)',
          fontFamily: 'inherit',
        }}
      >
        <CcModalBrandHeader theme={theme} />
        <div style={{ fontWeight: 800, fontSize: 'var(--cc-md)', marginBottom: 8, color: tTok.primary }}>
          {title}
        </div>
        {subtitle ? (
          <div style={{ fontSize: 'var(--cc-caption)', color: tTok.textMuted, marginBottom: 12 }}>
            {subtitle}
          </div>
        ) : null}
        {showVuBase ? (
          <div style={{ fontSize: 'var(--cc-caption)', color: tTok.textMuted, marginBottom: 12 }}>
            VU base (antes): <strong style={{ color: tTok.text }}>{fmtMoneda(vuBase)}</strong>
          </div>
        ) : null}
        <div style={{
          marginBottom: 10,
          padding: '8px 10px',
          borderRadius: 8,
          border: `1px solid ${tipo ? tTok.primary : tTok.border}`,
          background: ui.cardSubtle,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
        >
          <span style={{ fontSize: 'var(--cc-sm)', color: tTok.textMuted, fontWeight: 600 }}>
            Tipo
          </span>
          <span style={{
            fontSize: 'var(--cc-md)',
            fontWeight: 800,
            color: tipo ? tTok.primary : tTok.textMuted,
          }}
          >
            {labelTipoImpuesto(tipo)}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>
          {IMPUESTO_CAMPOS_UI.map(({ key, label }) => (
            <div key={key}>
              <div style={{ fontSize: 'var(--cc-caption)', color: tTok.textMuted, marginBottom: 4, fontWeight: 600 }}>
                {label}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  type="number"
                  min="0"
                  max="1"
                  step="any"
                  inputMode="decimal"
                  placeholder="0.05"
                  title="Decimal (0.05 = 5%)"
                  value={draft[key] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                />
                <span
                  style={{
                    minWidth: 64,
                    textAlign: 'right',
                    fontWeight: 700,
                    fontSize: 'var(--cc-sm)',
                    color: tTok.primary,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                  title="Equivalente %"
                >
                  {fmtPctDesdeDecimal(draft[key])}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 10,
          padding: '8px 10px',
          borderRadius: 8,
          border: `1px solid ${tTok.border}`,
          background: ui.cardSubtle,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
        >
          <span style={{ fontSize: 'var(--cc-sm)', color: tTok.textMuted, fontWeight: 600 }} title={tooltipTotalPorcentaje(draft)}>
            Total
          </span>
          <span style={{ fontSize: 'var(--cc-md)', fontWeight: 800, color: tTok.primary, fontVariantNumeric: 'tabular-nums' }}>
            {fmtSumatoriaAiu(draft)}
          </span>
        </div>

        <div style={{
          marginTop: 8,
          padding: '8px 10px',
          borderRadius: 8,
          border: `1px solid ${tTok.border}`,
          background: ui.cardSubtle,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
        >
          <span style={{ fontSize: 'var(--cc-sm)', color: tTok.textMuted, fontWeight: 600 }}>
            Después
          </span>
          <span style={{ fontSize: 'var(--cc-md)', fontWeight: 800, color: tTok.primary, fontVariantNumeric: 'tabular-nums' }}>
            {showVuBase ? fmtMoneda(despues) : 'Se aplica a cada VU Costo M.O.'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: `1px solid ${tTok.border}`,
              background: tTok.inputBg,
              color: tTok.text,
              cursor: 'pointer',
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onSave?.({ ...draft })}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: tTok.primary,
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 700,
              fontFamily: 'inherit',
            }}
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
