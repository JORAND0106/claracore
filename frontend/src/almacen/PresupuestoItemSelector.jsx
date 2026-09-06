import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlmacenFieldLabel, useAlmacenApi, useAlmacenTheme } from './almacenShared'
import { itemLabelFull, sortNatural } from './solicitudFormHelpers'

export function normPptoItem(item) {
  return String(item || '').trim().replace(/\.+$/, '')
}

export default function PresupuestoItemSelector({
  capitulo,
  item,
  onChange,
  disabled,
  /** `excel`: dos celdas <td> (Capítulo / Ítem) para filas tipo hoja de cálculo. */
  variant = 'form',
}) {
  const api = useAlmacenApi()
  const ui = useAlmacenTheme()
  const [capitulos, setCapitulos] = useState([])
  const [itemsCap, setItemsCap] = useState([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [itemQuery, setItemQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState(null)
  const blurTimer = useRef(null)
  const itemWrapRef = useRef(null)
  const excel = variant === 'excel'

  useEffect(() => {
    api.getListadoCapitulos()
      .then((caps) => setCapitulos([...(caps || [])].sort(sortNatural)))
      .catch(() => setCapitulos([]))
  }, [api])

  useEffect(() => {
    if (!capitulo) {
      setItemsCap([])
      setOpen(false)
      return
    }
    let cancelled = false
    setLoadingItems(true)
    setOpen(true)
    api.getListadoItems(capitulo)
      .then((rows) => {
        if (cancelled) return
        setItemsCap([...(rows || [])].sort((a, b) => sortNatural(a.item, b.item)))
      })
      .catch(() => {
        if (!cancelled) setItemsCap([])
      })
      .finally(() => {
        if (!cancelled) setLoadingItems(false)
      })
    return () => { cancelled = true }
  }, [api, capitulo])

  const selectedRow = useMemo(
    () => itemsCap.find((p) => normPptoItem(p.item) === normPptoItem(item)),
    [itemsCap, item],
  )

  const selectedLabel = selectedRow ? itemLabelFull(selectedRow) : (item ? String(item) : '')

  useEffect(() => {
    if (!item) {
      setItemQuery('')
      return
    }
    setItemQuery(selectedLabel)
  }, [item, selectedLabel])

  const filtered = useMemo(() => {
    const q = itemQuery.trim().toLowerCase()
    if (!q) return itemsCap.slice(0, 80)
    return itemsCap.filter((p) => {
      const hay = `${p.item} ${p.descripcion || ''}`.toLowerCase()
      return hay.includes(q)
    }).slice(0, 80)
  }, [itemsCap, itemQuery])

  const updateMenuPos = () => {
    const el = itemWrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setMenuPos({
      top: r.bottom + 2,
      left: r.left,
      width: Math.max(r.width, excel ? 220 : r.width),
    })
  }

  useEffect(() => {
    if (!open || !excel) {
      setMenuPos(null)
      return undefined
    }
    updateMenuPos()
    const onScroll = () => updateMenuPos()
    window.addEventListener('resize', onScroll)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, excel, filtered.length, loadingItems, capitulo])

  const pickItem = (p) => {
    onChange?.({ capitulo, item: p.item })
    setItemQuery(itemLabelFull(p))
    setOpen(false)
  }

  const onCapChange = (cap) => {
    onChange?.({ capitulo: cap, item: '' })
    setItemQuery('')
    setOpen(!!cap)
  }

  const inputStyle = {
    ...ui.input,
    padding: excel ? '4px 6px' : '6px 8px',
    fontSize: excel ? 'var(--cc-xs)' : 'var(--cc-sm)',
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    height: excel ? 28 : undefined,
  }

  const dropdownBody = open && !disabled && capitulo ? (
    filtered.length === 0 && !loadingItems ? (
      <div style={{ padding: '8px 10px', color: ui.textMuted, fontSize: 'var(--cc-xs)' }}>
        No hay ítems de cobro para este capítulo en el listado de precios.
      </div>
    ) : filtered.length > 0 ? (
      filtered.map((p) => {
        const label = itemLabelFull(p)
        return (
          <button
            key={normPptoItem(p.item)}
            type="button"
            title={label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pickItem(p)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '6px 8px',
              border: 'none',
              borderBottom: `1px solid ${ui.textMuted}22`,
              background: normPptoItem(p.item) === normPptoItem(item) ? `${ui.accentSoft}` : 'transparent',
              color: ui.text,
              cursor: 'pointer',
              fontSize: 'var(--cc-xs)',
              whiteSpace: 'normal',
              wordBreak: 'break-word',
            }}
          >
            {label}
          </button>
        )
      })
    ) : loadingItems ? (
      <div style={{ padding: '8px 10px', color: ui.textMuted, fontSize: 'var(--cc-xs)' }}>
        Cargando ítems…
      </div>
    ) : null
  ) : null

  const dropdownPanelStyle = {
    zIndex: 100070,
    maxHeight: 220,
    overflowY: 'auto',
    background: ui.card?.background || 'var(--cc-almacen-bg-card, #fff)',
    color: ui.text,
    border: `1px solid ${ui.textMuted}44`,
    borderRadius: 6,
    boxShadow: '0 8px 24px #0003',
  }

  const dropdown = excel && open && menuPos && typeof document !== 'undefined'
    ? createPortal(
      <div
        style={{
          ...dropdownPanelStyle,
          position: 'fixed',
          top: menuPos.top,
          left: menuPos.left,
          width: menuPos.width,
        }}
        data-testid="presupuesto-item-dropdown"
      >
        {dropdownBody}
      </div>,
      document.body,
    )
    : (!excel && open && !disabled && capitulo ? (
      <div
        style={{
          ...dropdownPanelStyle,
          position: 'absolute',
          left: 0,
          right: 0,
          top: '100%',
          marginTop: 2,
          zIndex: 40,
        }}
      >
        {dropdownBody}
      </div>
    ) : null)

  const capSelect = (
    <select
      style={inputStyle}
      value={capitulo || ''}
      disabled={disabled}
      title={capitulo || 'Seleccione capítulo'}
      onChange={(e) => onCapChange(e.target.value)}
    >
      <option value="">Capítulo…</option>
      {capitulos.map((c) => (
        <option key={c} value={c} title={c}>{c}</option>
      ))}
    </select>
  )

  const itemField = (
    <div ref={itemWrapRef} style={{ position: 'relative', minWidth: 0, width: '100%' }}>
      <input
        style={inputStyle}
        value={itemQuery}
        disabled={disabled || !capitulo || loadingItems}
        placeholder={!capitulo ? 'Elija capítulo' : loadingItems ? 'Cargando…' : 'Buscar ítem…'}
        title={selectedLabel || itemQuery || 'Ítem de cobro'}
        onChange={(e) => {
          setItemQuery(e.target.value)
          setOpen(true)
          if (!e.target.value.trim()) onChange?.({ capitulo, item: '' })
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          clearTimeout(blurTimer.current)
          blurTimer.current = setTimeout(() => setOpen(false), 180)
        }}
      />
      {dropdown}
    </div>
  )

  if (excel) {
    const tdStyle = {
      ...ui.td,
      padding: '4px 6px',
      verticalAlign: 'middle',
      overflow: 'visible',
    }
    return (
      <>
        <td style={tdStyle}>{capSelect}</td>
        <td style={tdStyle}>{itemField}</td>
      </>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) minmax(200px, 2fr)', gap: 8, width: '100%' }}>
      <div style={{ minWidth: 0 }}>
        <AlmacenFieldLabel icon="📂" label="Capítulo" compact />
        {capSelect}
      </div>
      <div style={{ position: 'relative', minWidth: 0 }}>
        <AlmacenFieldLabel icon="📋" label="Ítem de cobro" compact ayuda="Escriba número o descripción del ítem." />
        {itemField}
      </div>
    </div>
  )
}

export function findPresupuestoId(pptoItems, capitulo, item, pkId) {
  if (!capitulo || !item || !pkId) return null
  const want = normPptoItem(item)
  const pkNorm = String(pkId || '').trim()
  const row = (pptoItems || []).find(
    (p) => p.capitulo === capitulo
      && normPptoItem(p.item) === want
      && String(p.pk_id || '').trim() === pkNorm,
  )
  return row?.id ?? null
}
