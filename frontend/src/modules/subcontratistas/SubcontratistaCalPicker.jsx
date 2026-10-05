/**
 * Selector de fecha para modales de Subcontratistas.
 * El panel se renderiza en document.body (portal) para no quedar
 * recortado por overflow:hidden / overflowY:auto del contenedor.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { isDarkMode } from '../../theme/adminPanelTheme'
import {
  SUB_CAL_PANEL_EST_H,
  SUB_CAL_PANEL_MIN_W,
  SUB_CAL_Z_ABOVE_MODAL,
  computeCalPickerPosition,
} from './subcontratistaCalPickerPosition'

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function parseValueDate(value) {
  if (!value) return new Date()
  const d = new Date(`${String(value).slice(0, 10)}T12:00:00`)
  return Number.isNaN(d.getTime()) ? new Date() : d
}

function formatDisplay(value) {
  if (!value) return 'Seleccionar fecha'
  const p = String(value).slice(0, 10).split('-')
  if (p.length < 3) return String(value)
  const mi = parseInt(p[1], 10) - 1
  return `${parseInt(p[2], 10)} ${MESES[mi] || p[1]}, ${p[0]}`
}

/**
 * @param {{
 *   value: string,
 *   onChange: (iso: string) => void,
 *   isOpen: boolean,
 *   onToggle: () => void,
 *   theme: string,
 *   inputStyle: object,
 *   btn: (variant: string, sm?: boolean) => object,
 *   colors: { textPrimary: string, textMuted: string },
 *   tokens: { bgCard: string, border: string, primary: string, text: string },
 *   shadow?: string,
 *   cardSubtle?: string,
 * }} props
 */
export default function SubcontratistaCalPicker({
  value,
  onChange,
  isOpen,
  onToggle,
  theme,
  inputStyle,
  btn,
  colors,
  tokens,
  shadow,
  cardSubtle,
}) {
  const anchorRef = useRef(null)
  const panelRef = useRef(null)
  const [vd, setVd] = useState(() => parseValueDate(value))
  const [pos, setPos] = useState({ top: 0, left: 0, width: SUB_CAL_PANEL_MIN_W })

  useEffect(() => {
    if (isOpen) setVd(parseValueDate(value))
  }, [isOpen, value])

  useLayoutEffect(() => {
    if (!isOpen || !anchorRef.current) return undefined
    const update = () => {
      const rect = anchorRef.current.getBoundingClientRect()
      const panelH = panelRef.current?.offsetHeight || SUB_CAL_PANEL_EST_H
      const panelW = Math.max(SUB_CAL_PANEL_MIN_W, panelRef.current?.offsetWidth || SUB_CAL_PANEL_MIN_W)
      setPos(computeCalPickerPosition(rect, { panelW, panelH }))
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [isOpen, vd])

  useEffect(() => {
    if (!isOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onToggle()
    }
    const onDown = (e) => {
      const t = e.target
      if (anchorRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      onToggle()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, { passive: true })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [isOpen, onToggle])

  const y = vd.getFullYear()
  const m = vd.getMonth()
  const fd = new Date(y, m, 1).getDay()
  const dim = new Date(y, m + 1, 0).getDate()
  const dias = [...Array(fd).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)]
  const iso = (d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const dark = isDarkMode(theme)

  const panel = isOpen && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Selector de fecha"
        data-cc-sub-cal-picker
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          width: pos.width,
          zIndex: SUB_CAL_Z_ABOVE_MODAL,
          background: tokens.bgCard,
          border: `1px solid ${tokens.border}`,
          borderRadius: 10,
          padding: 14,
          boxShadow: shadow || '0 20px 50px rgba(0,0,0,0.45)',
          minWidth: SUB_CAL_PANEL_MIN_W,
          color: tokens.text,
          fontSize: 'var(--cc-sm)',
          fontFamily: 'inherit',
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <button type="button" style={{ ...btn('ghost', true), padding: '4px 10px' }} onClick={() => setVd(new Date(y, m - 1, 1))}>◄</button>
          <span style={{ fontSize: 'var(--cc-md)', fontWeight: 700, color: colors.textPrimary }}>
            {MESES[m]} <span style={{ color: tokens.primary }}>{y}</span>
          </span>
          <button type="button" style={{ ...btn('ghost', true), padding: '4px 10px' }} onClick={() => setVd(new Date(y, m + 1, 1))}>►</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 6 }}>
          {['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'].map((d) => (
            <div key={d} style={{ textAlign: 'center', fontSize: 'var(--cc-caption)', color: colors.textMuted, fontWeight: 700, padding: '2px 0' }}>{d}</div>
          ))}
          {dias.map((d, i) => {
            if (!d) return <div key={`e-${i}`} />
            const hoy = new Date().toISOString().slice(0, 10)
            const diso = iso(d)
            const isSel = diso === value
            const isHoy = diso === hoy
            return (
              <div
                key={diso}
                role="button"
                tabIndex={0}
                onClick={() => { onChange(diso); onToggle() }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onChange(diso)
                    onToggle()
                  }
                }}
                style={{
                  textAlign: 'center',
                  padding: '5px 2px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 'var(--cc-sm)',
                  fontWeight: isSel ? 700 : 400,
                  background: isSel ? tokens.primary : isHoy ? (cardSubtle || 'rgba(0,175,197,0.15)') : 'transparent',
                  color: isSel ? (dark ? '#081318' : '#fff') : colors.textPrimary,
                  border: isHoy && !isSel ? `1px solid ${tokens.primary}66` : '1px solid transparent',
                }}
              >
                {d}
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${tokens.border}`, paddingTop: 8, gap: 6, flexWrap: 'wrap' }}>
          <button type="button" style={btn('ghost', true)} onClick={() => { onChange(new Date().toISOString().slice(0, 10)); onToggle() }}>↖ hoy</button>
          <button type="button" style={btn('danger', true)} onClick={() => { onChange(''); onToggle() }}>— borrar</button>
          <button type="button" style={btn('ghost', true)} onClick={onToggle}>✕ cerrar</button>
        </div>
      </div>,
      document.body,
    )
    : null

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={anchorRef}
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
        style={{
          ...inputStyle,
          cursor: 'pointer',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span aria-hidden>📅</span>
        <span style={{ fontSize: 'var(--cc-sm)', color: value ? colors.textPrimary : colors.textMuted }}>
          {formatDisplay(value)}
        </span>
      </div>
      {panel}
    </div>
  )
}

export { computeCalPickerPosition } from './subcontratistaCalPickerPosition'
