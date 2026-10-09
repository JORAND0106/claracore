import { useEffect, useMemo, useState } from 'react'
import { fmtMoney, useAlmacenApi, useAlmacenTheme } from './almacenShared'

/**
 * Proveedor de la cotización a comprar. Por defecto la ganadora.
 * Lista solo proveedores que cotizaron ese insumo. Las cifras dependen del rol.
 */
export default function ProveedorOfertaField({
  insumoId,
  value,
  onChange,
  disabled,
  verEconomicos = false,
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [ofertas, setOfertas] = useState([])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!insumoId) {
      setOfertas([])
      return undefined
    }
    let cancel = false
    api.listOfertasProveedorInsumo(insumoId)
      .then((r) => {
        if (cancel) return
        const list = Array.isArray(r?.ofertas) ? r.ofertas : []
        setOfertas(list)
        const misma = value
          && Number(value.insumo_id) === Number(insumoId)
          && (value.proveedor_id || value.proveedor_nombre)
        if (!misma) {
          const gan = list.find((o) => o.es_ganadora) || list[0] || null
          if (gan) onChange?.({ ...gan, insumo_id: Number(insumoId) })
        }
      })
      .catch(() => {
        if (!cancel) setOfertas([])
      })
    return () => { cancel = true }
    // value/onChange se leen al cambiar el insumo; no deben re-disparar la carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, insumoId])

  useEffect(() => {
    setQ(value?.proveedor_nombre || '')
  }, [value?.proveedor_nombre, value?.numero, value?.proveedor_id])

  const unica = ofertas.length <= 1
  const filtradas = useMemo(() => {
    const n = q.trim().toLowerCase()
    const actual = String(value?.proveedor_nombre || '').trim().toLowerCase()
    if (!n || n === actual) return ofertas
    return ofertas.filter((o) => String(o.proveedor_nombre || '').toLowerCase().includes(n))
  }, [ofertas, q, value?.proveedor_nombre])

  const elegir = (o) => {
    onChange?.({ ...o, insumo_id: Number(insumoId) })
    setQ(o.proveedor_nombre || '')
    setOpen(false)
  }

  const etiquetaValor = (o) => {
    if (!verEconomicos || o?.valor == null || o.valor === '') return null
    return fmtMoney(o.valor)
  }

  return (
    <div style={{ position: 'relative', minWidth: 0 }} data-testid="revision-linea-proveedor">
      <input
        style={{ ...ui.input, width: '100%', boxSizing: 'border-box', padding: '4px 6px', fontSize: 'var(--cc-xs)', height: 30 }}
        value={q}
        disabled={disabled || !insumoId}
        readOnly={unica}
        placeholder={insumoId ? 'Proveedor de la cotización' : 'Primero elija el insumo'}
        aria-label="Proveedor"
        title={unica ? 'Este insumo tiene una sola cotización' : 'Proveedores que cotizaron este insumo'}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => { if (!unica) setOpen(true) }}
        onBlur={() => { setTimeout(() => setOpen(false), 160) }}
      />
      {(value?.numero || etiquetaValor(value)) && (
        <div style={{ marginTop: 2, fontSize: 10, color: ui.textMuted, lineHeight: 1.3 }}>
          {[
            value?.numero ? `Cot. ${value.numero}` : null,
            etiquetaValor(value),
          ].filter(Boolean).join(' · ')}
        </div>
      )}
      {open && !unica && (
        <div
          style={{
            position: 'absolute',
            zIndex: 5,
            left: 0,
            right: 0,
            top: 32,
            maxHeight: 180,
            overflowY: 'auto',
            background: '#fff',
            border: `1px solid ${ui.textMuted}44`,
            borderRadius: 6,
            boxShadow: '0 8px 20px #0002',
          }}
        >
          {filtradas.length === 0 ? (
            <div style={{ padding: 8, fontSize: 'var(--cc-xs)', color: ui.textMuted }}>Sin coincidencias</div>
          ) : filtradas.map((o, i) => (
            <button
              key={`${o.proveedor_id || o.proveedor_nombre}-${o.numero || i}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => elegir(o)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 8px',
                border: 'none',
                borderBottom: `1px solid ${ui.textMuted}22`,
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 'var(--cc-xs)',
              }}
            >
              <div style={{ fontWeight: 600 }}>{o.proveedor_nombre}</div>
              <div style={{ color: ui.textMuted }}>
                {[
                  o.numero ? `Cot. ${o.numero}` : null,
                  o.es_ganadora ? 'Cotización ganadora' : null,
                  etiquetaValor(o),
                ].filter(Boolean).join(' · ')}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
