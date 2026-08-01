import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PPTO_SEMAFORO_ESTADOS, pptoEstadoValidacionColor } from './pptoEstadosValidacion'

/**
 * Ícono compacto de validación con popover para cambiar estado.
 * El menú se renderiza en portal (position: fixed) para no quedar
 * atrapado bajo contenedores con overflow (grilla / scroll móvil).
 * @param {'depuracion'|'interventoria'} eje
 */
export default function PptoValidacionIcon({
  eje = 'interventoria',
  estado = 'No Revisado',
  puedeSeleccionar,
  onSeleccionar,
  tituloBloqueo = '',
  esSellado = false,
  esLegado = false,
  t,
  compact = false,
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0, placeAbove: false })
  const btnRef = useRef(null)
  const menuRef = useRef(null)
  const color = pptoEstadoValidacionColor(estado)
  const labelEje = eje === 'depuracion' ? 'Depuración' : 'Interventoría'

  const updatePosition = useCallback(() => {
    const btn = btnRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const menuW = 200
    const gap = 6
    const vh = window.innerHeight || 800
    const vw = window.innerWidth || 1200
    const spaceBelow = vh - rect.bottom
    const placeAbove = spaceBelow < 220 && rect.top > spaceBelow
    let left = rect.right - menuW
    left = Math.max(8, Math.min(left, vw - menuW - 8))
    setCoords({
      top: placeAbove ? rect.top - gap : rect.bottom + gap,
      left,
      placeAbove,
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return
    const onDoc = (ev) => {
      const tEl = ev.target
      if (btnRef.current?.contains(tEl)) return
      if (menuRef.current?.contains(tEl)) return
      setOpen(false)
    }
    const onKey = (ev) => { if (ev.key === 'Escape') setOpen(false) }
    const onRepos = () => updatePosition()
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc, { passive: true })
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onRepos)
    window.addEventListener('scroll', onRepos, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('touchstart', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onRepos)
      window.removeEventListener('scroll', onRepos, true)
    }
  }, [open, updatePosition])

  const size = compact ? 28 : 32
  const puedeAbrir = !esSellado

  const pick = (valor) => {
    if (valor === estado) {
      setOpen(false)
      return
    }
    if (typeof puedeSeleccionar === 'function' && !puedeSeleccionar(valor)) return
    setOpen(false)
    onSeleccionar?.(valor)
  }

  const menu = open && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={menuRef}
        role="dialog"
        aria-label={`Cambiar estado de ${labelEje}`}
        style={{
          position: 'fixed',
          zIndex: 12050,
          top: coords.top,
          left: coords.left,
          transform: coords.placeAbove ? 'translateY(-100%)' : undefined,
          width: 200,
          maxWidth: 'calc(100vw - 16px)',
          background: t.bgCard,
          border: `1px solid ${t.border}`,
          borderRadius: 10,
          boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
          padding: '10px 10px 8px',
          boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 'var(--cc-caption)', fontWeight: 800, color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
          {labelEje}
        </div>
        <div style={{ fontSize: 'var(--cc-sm)', fontWeight: 700, color, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
          {estado}
          {esLegado && eje === 'depuracion' ? (
            <span style={{ fontSize: 'var(--cc-caption)', color: t.textMuted, fontWeight: 500 }}>(legado)</span>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {PPTO_SEMAFORO_ESTADOS.map((s) => {
            const activo = estado === s.valor
            const habilitado = !activo && !esSellado && (typeof puedeSeleccionar !== 'function' || puedeSeleccionar(s.valor))
            return (
              <button
                key={s.valor}
                type="button"
                disabled={!habilitado}
                onClick={() => pick(s.valor)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  textAlign: 'left',
                  padding: '7px 8px',
                  borderRadius: 8,
                  border: `1px solid ${activo ? s.color : t.border}`,
                  background: activo ? `${s.color}18` : t.bg,
                  color: activo ? s.color : t.text,
                  fontSize: 'var(--cc-sm)',
                  fontWeight: activo ? 700 : 500,
                  cursor: habilitado ? 'pointer' : 'default',
                  opacity: habilitado || activo ? 1 : 0.45,
                  minHeight: 40,
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                {s.valor}
              </button>
            )
          })}
        </div>
        {tituloBloqueo ? (
          <div style={{ marginTop: 8, fontSize: 'var(--cc-caption)', color: t.textMuted, lineHeight: 1.35 }}>
            {tituloBloqueo}
          </div>
        ) : null}
      </div>,
      document.body,
    )
    : null

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }} onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        type="button"
        aria-label={`${labelEje}: ${estado}`}
        aria-expanded={open}
        title={tituloBloqueo || `${labelEje}: ${estado}`}
        disabled={!puedeAbrir}
        onClick={() => puedeAbrir && setOpen((v) => !v)}
        style={{
          width: size,
          height: size,
          minWidth: size,
          minHeight: size,
          borderRadius: 8,
          border: `2px solid ${color}`,
          background: `${color}22`,
          color,
          cursor: puedeAbrir ? 'pointer' : 'default',
          opacity: esSellado ? 0.5 : (esLegado ? 0.85 : 1),
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          boxShadow: open ? `0 0 0 2px ${color}44` : 'none',
          transition: 'box-shadow 0.15s',
        }}
      >
        <svg width={compact ? 14 : 16} height={compact ? 14 : 16} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 2l7 3v6c0 5-3.5 9.2-7 11-3.5-1.8-7-6-7-11V5l7-3z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M9 12l2 2 4-4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {menu}
    </div>
  )
}
