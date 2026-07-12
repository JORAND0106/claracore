import { useCallback, useRef, useState } from 'react'
import {
  AlmacenFieldLabel,
  formatNombrePropio,
  formatPlacaVehiculo,
  useAlmacenApi,
  useAlmacenTheme,
} from './almacenShared'

export default function PlacaTransportadorFields({
  placa,
  transportador,
  setPlaca,
  setTransportador,
  onClearMsg,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [options, setOptions] = useState([])
  const [open, setOpen] = useState(false)
  const timer = useRef(null)

  const search = useCallback((q) => {
    api.searchTransportadores(q).then(setOptions).catch(() => setOptions([]))
  }, [api])

  const pick = (row) => {
    setPlaca(formatPlacaVehiculo(row.placa))
    setTransportador(formatNombrePropio(row.nombre))
    onClearMsg?.()
    setOpen(false)
  }

  const onPlacaInput = (e) => {
    const v = formatPlacaVehiculo(e.target.value)
    setPlaca(v)
    onClearMsg?.()
    setOpen(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => search(v), 220)
  }

  const onPlacaFocus = () => {
    setOpen(true)
    search(placa)
  }

  const onPlacaBlur = () => {
    setTimeout(async () => {
      setOpen(false)
      const fmt = formatPlacaVehiculo(placa)
      setPlaca(fmt)
      const exact = options.find((o) => formatPlacaVehiculo(o.placa) === fmt)
      if (exact) {
        pick(exact)
        return
      }
      if (!/^[A-Z]{3}-\d{3}$/.test(fmt)) return
      try {
        const r = await api.getTransportadorPorPlaca(fmt)
        if (r?.encontrado && r?.nombre) {
          setTransportador(formatNombrePropio(r.nombre))
        }
      } catch {
        /* búsqueda opcional */
      }
    }, 180)
  }

  return (
    <>
      <div style={{ position: 'relative' }}>
        <AlmacenFieldLabel
          icon="🚛"
          label="Placa"
          ayuda="Formato AAA-000. Al escribir, se sugieren placas ya registradas en el directorio."
        />
        <input
          style={ui.input}
          value={placa}
          placeholder="ABC-123"
          maxLength={7}
          onChange={onPlacaInput}
          onFocus={onPlacaFocus}
          onBlur={onPlacaBlur}
        />
        {open && options.length > 0 && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: '100%',
              zIndex: 20,
              marginTop: 4,
              border: `1px solid ${ui.textMuted}44`,
              borderRadius: 8,
              background: '#fff',
              maxHeight: 160,
              overflowY: 'auto',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            }}
          >
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  border: 'none',
                  borderBottom: '1px solid #eee',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: 'var(--cc-sm)',
                }}
              >
                <div style={{ fontWeight: 600 }}>{formatPlacaVehiculo(o.placa)}</div>
                <div style={{ fontSize: 'var(--cc-xs)', color: ui.textMuted }}>{o.nombre}</div>
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <AlmacenFieldLabel icon="👤" label="Transportador" />
        <input
          style={ui.input}
          value={transportador}
          onChange={(e) => setTransportador(e.target.value)}
          onBlur={() => setTransportador(formatNombrePropio(transportador))}
        />
      </div>
    </>
  )
}
