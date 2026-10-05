import { useEffect, useRef, useState } from 'react'
import CcTipChrome from './components/CcTipChrome'

const NO_PERM_MSG =
  'Para asignar agrupadores WBS contacta al administrador del sistema o a quien tenga acceso al Listado de Precios.'

/**
 * Ícono ⚠ compacto en encabezado de capítulo (programación de obra).
 */
export default function ProgSinAgrupadorCapIcon({
  count,
  puedeEditarListadoPrecios = false,
  onIrListadoPrecios = null,
}) {
  const n = Number(count) || 0
  const ref = useRef(null)
  const [popoverOpen, setPopoverOpen] = useState(false)

  useEffect(() => {
    if (!popoverOpen) return undefined
    const onDoc = (ev) => {
      if (ref.current && !ref.current.contains(ev.target)) setPopoverOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [popoverOpen])

  if (n <= 0) return null

  const hoverTitle = puedeEditarListadoPrecios
    ? `${n} ítem${n === 1 ? '' : 's'} sin agrupador — clic para ir al Listado de Precios`
    : `${n} ítem${n === 1 ? '' : 's'} sin agrupador — sin permiso de edición`

  const handleClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (puedeEditarListadoPrecios) {
      setPopoverOpen(false)
      onIrListadoPrecios?.()
      return
    }
    setPopoverOpen((v) => !v)
  }

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <button
        type="button"
        onClick={handleClick}
        title={hoverTitle}
        aria-label={hoverTitle}
        style={{
          border: 'none',
          background: 'transparent',
          padding: '0 2px',
          margin: 0,
          lineHeight: 1,
          fontSize: '0.95em',
          color: '#b45309',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '0.75'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '1'
        }}
      >
        ⚠
      </button>
      {popoverOpen && !puedeEditarListadoPrecios && (
        <CcTipChrome
          variant="help"
          style={{
            position: 'absolute',
            left: 0,
            top: 'calc(100% + 6px)',
            zIndex: 50,
            minWidth: 220,
            maxWidth: 280,
            pointerEvents: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {NO_PERM_MSG}
        </CcTipChrome>
      )}
    </span>
  )
}
