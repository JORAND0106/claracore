import { useEffect, useRef, useState } from 'react'
import { PPTO_SEMAFORO_ESTADOS, pptoEstadoValidacionColor } from './pptoEstadosValidacion'

/**
 * Ícono compacto de validación con popover para cambiar estado.
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
  const rootRef = useRef(null)
  const color = pptoEstadoValidacionColor(estado)
  const labelEje = eje === 'depuracion' ? 'Depuración' : 'Interventoría'

  useEffect(() => {
    if (!open) return
    const onDoc = (ev) => {
      if (rootRef.current && !rootRef.current.contains(ev.target)) setOpen(false)
    }
    const onKey = (ev) => { if (ev.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

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

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={`${labelEje}: ${estado}`}
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

      {open && (
        <div
          role="dialog"
          style={{
            position: 'absolute',
            zIndex: 4200,
            top: '100%',
            right: 0,
            marginTop: 6,
            minWidth: 188,
            background: t.bgCard,
            border: `1px solid ${t.border}`,
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
            padding: '10px 10px 8px',
          }}
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
        </div>
      )}
    </div>
  )
}
