import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fmtMoneySolicitud as fmtMoney, useAlmacenApi, useAlmacenTheme } from './almacenShared'

/**
 * Proveedor de la cotización a comprar. Por defecto la ganadora.
 * Lista todos los proveedores que cotizaron ese insumo. Las cifras dependen del rol.
 *
 * Causa del bug «sola cotización»: mientras cargaba (ofertas=[]) se trataba como
 * única (`length <= 1`), se marcaba readOnly y se mostraba el mensaje aunque hubiera
 * varias cotizaciones. Ahora se distingue cargando / error / lista real.
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
  const inputRef = useRef(null)
  const [ofertas, setOfertas] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState(null)

  useEffect(() => {
    if (!insumoId) {
      setOfertas([])
      setLoading(false)
      setLoadError('')
      return undefined
    }
    let cancel = false
    setLoading(true)
    setLoadError('')
    api.listOfertasProveedorInsumo(insumoId)
      .then((r) => {
        if (cancel) return
        const list = Array.isArray(r?.ofertas) ? r.ofertas : (Array.isArray(r) ? r : [])
        setOfertas(list)
        setLoading(false)
        const misma = value
          && Number(value.insumo_id) === Number(insumoId)
          && (value.proveedor_id || value.proveedor_nombre)
        if (!misma) {
          const gan = list.find((o) => o.es_ganadora) || list[0] || null
          if (gan) onChange?.({ ...gan, insumo_id: Number(insumoId) })
        }
      })
      .catch((e) => {
        if (cancel) return
        setOfertas([])
        setLoading(false)
        setLoadError(e?.message || 'No se pudieron cargar las cotizaciones.')
      })
    return () => { cancel = true }
    // value/onChange se leen al cambiar el insumo; no deben re-disparar la carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, insumoId])

  useEffect(() => {
    setQ(value?.proveedor_nombre || '')
  }, [value?.proveedor_nombre, value?.numero, value?.proveedor_id])

  const listaLista = !loading && !loadError
  const unica = listaLista && ofertas.length === 1
  const sinOfertas = listaLista && ofertas.length === 0
  const puedeAbrirLista = listaLista && ofertas.length > 1

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

  const updateMenuPos = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const width = Math.max(rect.width, 220)
    const estimated = Math.min(180, 36 + filtradas.length * 44)
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < estimated + 8 && rect.top > estimated + 8
    setMenuPos({
      top: openUp ? Math.max(8, rect.top - estimated - 2) : rect.bottom + 2,
      left: rect.left,
      width,
    })
  }, [filtradas.length])

  useLayoutEffect(() => {
    if (!open || !puedeAbrirLista) {
      setMenuPos(null)
      return undefined
    }
    updateMenuPos()
    window.addEventListener('scroll', updateMenuPos, true)
    window.addEventListener('resize', updateMenuPos)
    return () => {
      window.removeEventListener('scroll', updateMenuPos, true)
      window.removeEventListener('resize', updateMenuPos)
    }
  }, [open, puedeAbrirLista, updateMenuPos])

  const etiquetaValor = (o) => {
    if (!verEconomicos || o?.valor == null || o.valor === '') return null
    return fmtMoney(o.valor)
  }

  let title = 'Proveedores que cotizaron este insumo'
  if (loading) title = 'Cargando cotizaciones…'
  else if (loadError) title = loadError
  else if (unica) title = 'Este insumo tiene una sola cotización'
  else if (sinOfertas) title = 'Este insumo no tiene cotizaciones registradas'

  return (
    <div style={{ position: 'relative', minWidth: 0 }} data-testid="revision-linea-proveedor">
      <input
        ref={inputRef}
        style={{ ...ui.input, width: '100%', boxSizing: 'border-box', padding: '4px 6px', fontSize: 'var(--cc-xs)', height: 30 }}
        value={loading ? (q || 'Cargando…') : q}
        disabled={disabled || !insumoId || loading}
        readOnly={unica || sinOfertas || Boolean(loadError)}
        placeholder={insumoId ? 'Proveedor de la cotización' : 'Primero elija el insumo'}
        aria-label="Proveedor"
        title={title}
        data-unica={unica ? 'true' : 'false'}
        data-loading={loading ? 'true' : 'false'}
        onChange={(e) => {
          if (!puedeAbrirLista) return
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => { if (puedeAbrirLista) setOpen(true) }}
        onBlur={() => { setTimeout(() => setOpen(false), 160) }}
      />
      {(value?.numero || etiquetaValor(value)) && !loading && (
        <div style={{ marginTop: 2, fontSize: 10, color: ui.textMuted, lineHeight: 1.3 }}>
          {[
            value?.numero ? `Cot. ${value.numero}` : null,
            etiquetaValor(value),
          ].filter(Boolean).join(' · ')}
        </div>
      )}
      {unica && (
        <div
          data-testid="revision-linea-proveedor-unica"
          style={{ marginTop: 2, fontSize: 10, color: ui.textMuted, lineHeight: 1.3 }}
        >
          Este insumo tiene una sola cotización
        </div>
      )}
      {open && puedeAbrirLista && menuPos && typeof document !== 'undefined' && createPortal(
        <div
          data-testid="revision-linea-proveedor-lista"
          style={{
            position: 'fixed',
            zIndex: 100080,
            top: menuPos.top,
            left: menuPos.left,
            width: menuPos.width,
            maxHeight: 180,
            overflowY: 'auto',
            background: ui.card?.background || '#fff',
            color: ui.text,
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
                color: ui.text,
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
        </div>,
        document.body,
      )}
    </div>
  )
}
